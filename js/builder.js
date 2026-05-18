'use strict';

/**
 * builder.js — Montador de times com validação via PokéAPI
 * ---------------------------------------------------------
 * Permite montar um time completo de 6 Pokémon (ou 3 no modo Champions)
 * com habilidade, item, natureza, EVs, IVs e 4 golpes cada.
 *
 * Antes de salvar, valida contra a PokéAPI:
 *   - Habilidade: deve ser possível para o Pokémon
 *   - Golpes: devem ser aprendiveis no jogo/formato selecionado
 *
 * Autocomplete de golpes filtra pela lista de moves do Pokémon selecionado
 * (via getLearnableMoves) ou pela lista completa se nenhum Pokémon estiver escolhido.
 * Ao selecionar um golpe, a borda do input recebe a cor do tipo via TYPE_COLORS.
 *
 * Modo Champions (Pokémon Champions TCG/VGC):
 *   - 3 membros (não 6)
 *   - EVs substituídos por SPs (max 32 cada, 66 total, sem divisão por 4)
 *   - IVs não configuráveis (sempre 31)
 *   - Sem restricao de jogo nos golpes
 *
 * Dependências: data.js (TYPES, NATURES, STAT_KEYS, STAT_LABELS, GAME_VERSIONS,
 *   ITEMS, TYPE_COLORS, calcStat),
 *   generation.js (GenerationRules), ui.js (PokeBuildUI),
 *   api.js (PokeAPI — inclui ensureAbilityList), storage.js (TeamStorage), app.js (App).
 */

const Builder = (() => {
  const SLOTS = 6;
  let slots = [];
  let isChampions = false;
  let editingTeamId = null; // ID do time sendo editado; null = novo time
  const BUILDER_DRAFT_KEY = 'pokebuild_builder_draft_v1';
  let dirty = false;
  let draftTimer = null;

  function esc(s) {
    return PokeBuildUI.escapeHtml(s);
  }

  // ── Slot data model ───────────────────────────────────────────
  /**
   * Retorna um objeto de slot vazio com todos os campos no estado padrão.
   * Cada slot representa um Pokémon no time com sua build completa.
   */
  function emptySlot() {
    return {
      name: '', sprite: '', ability: '', item: '', nature: 'Hardy',
      teraType: '',
      moves: ['', '', '', ''],
      evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
      ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
      level: 50,
      shiny: false,
      gender: 'male'
    };
  }

  function genderControlHTML(i) {
    const gender = slots[i].gender || 'male';
    return `<span class="bld-gender-ctrl" id="bld-gender-${i}"><button class="bld-gender-btn${gender === 'male' ? ' active' : ''}" data-slot="${i}" data-gender="male" title="Macho">♂</button><button class="bld-gender-btn${gender === 'female' ? ' active' : ''}" data-slot="${i}" data-gender="female" title="Fêmea">♀</button></span>`;
  }

  function refreshTypeBadges(i, name) {
    const el = document.getElementById(`bld-types-${i}`);
    if (!el) return;
    const types = POKEMON_DB[name] || [];
    el.innerHTML = types.filter(Boolean).map(t => `<span class="tpill t-${t}">${t}</span>`).join('');
  }

  function refreshGenderControl(i, hasFemale) {
    const ctrl = document.querySelector(`.bld-sprite-controls[data-slot="${i}"]`);
    if (!ctrl) return;
    const existing = document.getElementById(`bld-gender-${i}`);
    if (!hasFemale) { if (existing) existing.remove(); return; }
    const newHtml = genderControlHTML(i);
    if (existing) existing.outerHTML = newHtml;
    else ctrl.insertAdjacentHTML('beforeend', newHtml);
  }

  function refreshShinyBtn(i) {
    const btn = document.querySelector(`.bld-shiny-btn[data-slot="${i}"]`);
    if (btn) btn.classList.add('hidden');
  }

  function refreshFormSwitcher(i, name) {
    const el = document.getElementById(`bld-forms-${i}`);
    if (el) el.innerHTML = buildFormNavHTML(name, i);
  }

  function effectiveName(slot) {
    if (slot.gender === 'female' && GENDER_VARIANTS[slot.name])
      return GENDER_VARIANTS[slot.name];
    if (slot.name.endsWith('-Gmax')) return FORM_BASE[slot.name] || slot.name;
    return slot.name;
  }

  // ── Build slot HTML ───────────────────────────────────────────
  function hasTera() {
    const fmt = document.getElementById('bld-format')?.value;
    return GenerationRules.capabilitiesForGame(fmt, isChampions).tera;
  }

  function builderGen() {
    const fmt = document.getElementById('bld-format')?.value;
    return GenerationRules.capabilitiesForGame(fmt, isChampions).gen;
  }
  function hasAbility() { return GenerationRules.capabilitiesForGame(document.getElementById('bld-format')?.value, isChampions).ability; }
  function hasNature()  { return GenerationRules.capabilitiesForGame(document.getElementById('bld-format')?.value, isChampions).nature; }
  function hasItem()    { return GenerationRules.capabilitiesForGame(document.getElementById('bld-format')?.value, isChampions).item; }

  function populateFormatSelect(preferredKey) {
    const formatSel = document.getElementById('bld-format');
    if (!formatSel) return '';
    const gen = (typeof App !== 'undefined' && App.getGen) ? App.getGen() : GenerationRules.activeGen();
    const versions = GenerationRules.gameVersions(gen);
    const current = preferredKey || formatSel.value;
    const next = versions.some(v => v.key === current) ? current : GenerationRules.defaultGameVersion(gen);
    formatSel.innerHTML = versions.map(v => `<option value="${v.key}">${v.label}</option>`).join('');
    formatSel.value = next;
    return next;
  }

  function syncWithGlobalGen(preferredKey) {
    const formatSel = document.getElementById('bld-format');
    const before = formatSel?.value || '';
    const next = populateFormatSelect(preferredKey || before);
    if (before !== next) renderSlots();
  }

  function buildSlotHTML(i) {
    const slot = slots[i];
    const typeOpts = TYPES.map(t => `<option value="${t}">${t}</option>`).join('');
    const natureOpts = Object.keys(NATURES).map(n => `<option value="${n}"${n === slot.nature ? ' selected' : ''}>${n}</option>`).join('');
    const evLabel = isChampions ? 'SP' : 'EV';
    const evMax   = isChampions ? 32 : 252;
    const ivSummaryText = (() => {
      const non31 = STAT_KEYS.filter(k => slot.ivs[k] !== 31);
      return non31.length ? non31.map(k => `${slot.ivs[k]} ${STAT_LABELS[k]}`).join(' / ') : 'todos 31';
    })();
    const ivSection = isChampions ? '' : `
      <div class="iv-collapse">
        <button class="iv-toggle-btn" data-slot="${i}" type="button">
          <span class="ev-section-title" style="margin:0">IVs</span>
          <span class="iv-summary" id="bld-iv-summary-${i}">${ivSummaryText}</span>
          <span class="iv-toggle-icon">▶</span>
        </button>
        <div class="iv-body hidden" id="bld-iv-body-${i}">
          ${STAT_KEYS.map(k => `
            <div class="ev-row">
              <span class="ev-stat-label">${STAT_LABELS[k]}</span>
              <input type="number" class="ev-input bld-iv" data-slot="${i}" data-stat="${k}"
                value="${slot.ivs[k]}" min="0" max="31" step="1">
            </div>`).join('')}
        </div>
      </div>`;

    return `<div class="builder-slot" id="bld-slot-${i}">
      <div class="bld-slot-header">
        <div style="display:flex;gap:10px;align-items:center;flex:1">
          <div class="bld-sprite-col">
            <div class="bld-sprite-controls" data-slot="${i}"></div>
            <div class="bld-form-switcher" id="bld-forms-${i}">${buildFormNavHTML(slot.name, i)}</div>
            <div style="display:flex;align-items:center;gap:4px">
              <div id="bld-sprite-${i}" class="bld-sprite-wrap">
                <div class="bld-sprite-ph" id="bld-sprite-ph-${i}">?</div>
                <img class="bld-sprite-img hidden" id="bld-sprite-img-${i}" alt="">
              </div>
              <button class="bld-shiny-btn${slot.shiny ? ' active' : ''} hidden" data-slot="${i}" title="Shiny">✨</button>
            </div>
          </div>
          <div class="autocomplete-wrap" style="flex:1">
            <input type="text" class="text-input bld-pkmn-input" data-slot="${i}"
              placeholder="Pokémon #${i+1}" value="${slot.name}" autocomplete="off">
            <ul class="suggestions hidden bld-suggestions" data-slot="${i}"></ul>
            <div class="bld-type-badges" id="bld-types-${i}">
              ${(POKEMON_DB[slot.name] || []).filter(Boolean).map(t => `<span class="tpill t-${t}">${t}</span>`).join('')}
            </div>
          </div>
        </div>
        ${hasNature() ? `<div style="display:flex;align-items:center;gap:6px">
          <select class="select-input bld-nature" data-slot="${i}" style="width:130px">${natureOpts}</select>
          <span class="nature-indicator" id="bld-nat-ind-${i}">${natureIndicatorHTML(slot.nature)}</span>
        </div>` : ''}
      </div>

      ${hasTera() ? `
      <div class="field-group" style="margin-bottom:8px">
        <label class="field-label">✦ Tera Type</label>
        <select class="select-input bld-tera" data-slot="${i}">
          <option value="">— Selecione um tipo —</option>
          ${TYPES.map(t => `<option value="${t}"${slot.teraType === t ? ' selected' : ''}>${t}</option>`).join('')}
        </select>
      </div>` : ''}

      <div class="bld-fields">
        ${hasAbility() ? `<div class="field-group">
          <label class="field-label">Habilidade</label>
          <div class="autocomplete-wrap">
            <input type="text" class="text-input bld-ability" data-slot="${i}"
              placeholder="Habilidade" value="${slot.ability}" autocomplete="off">
            <ul class="suggestions hidden bld-ability-sug" data-slot="${i}"></ul>
          </div>
          <em class="ability-hidden-tag hidden" id="bld-ability-hidden-${i}">(oculta)</em>
        </div>` : ''}
        ${hasItem() ? `<div class="field-group">
          <label class="field-label">Item</label>
          <div style="display:flex;align-items:center;gap:6px">
            <img id="bld-item-img-${i}" class="bld-item-img${slot.item ? '' : ' hidden'}"
              src="${slot.item ? `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/${PokeAPI.apiName(slot.item)}.png` : ''}"
              onerror="this.classList.add('hidden')" alt="">
            <div class="autocomplete-wrap" style="flex:1">
              <input type="text" class="text-input bld-item" data-slot="${i}"
                placeholder="Item" value="${slot.item}" autocomplete="off">
              <ul class="suggestions hidden bld-item-sug" data-slot="${i}"></ul>
            </div>
          </div>
        </div>` : ''}
      </div>

      <div class="section-divider">Moves</div>
      <div class="moves-grid">
        ${[0,1,2,3].map(m => `
          <div class="autocomplete-wrap">
            <input type="text" class="text-input bld-move" data-slot="${i}" data-move="${m}"
              placeholder="Move ${m+1}" value="${slot.moves[m]}" autocomplete="off">
            <ul class="suggestions hidden bld-move-sug" data-slot="${i}" data-move="${m}"></ul>
          </div>`).join('')}
      </div>

      <div class="section-divider">${evLabel}s</div>
      <div class="ev-grid">
        ${STAT_KEYS.map(k => {
          const val = slot.evs[k];
          const pct = isChampions ? (val / 32) * 100 : (val / 252) * 100;
          return `<div class="ev-row">
            <span class="ev-stat-label">${STAT_LABELS[k]}</span>
            <input type="number" class="ev-input bld-ev" data-slot="${i}" data-stat="${k}"
              value="${val}" min="0" max="${evMax}" step="1">
            <div class="ev-bar-wrap">
              <div class="ev-bar-fill" id="bld-evbar-${i}-${k}" style="width:${pct}%"></div>
            </div>
            <span class="ev-total-disp" id="bld-ev-disp-${i}-${k}">${val}</span>
          </div>`;
        }).join('')}
        <div class="ev-total-row">
          <span>Total ${evLabel}s:</span>
          <span id="bld-ev-total-${i}" class="${evTotalClass(i)}">${evTotal(i)} / ${isChampions ? 66 : 510}</span>
        </div>
      </div>

      ${ivSection}
    </div>`;
  }

  function evTotal(i) {
    return STAT_KEYS.reduce((s, k) => s + (slots[i]?.evs[k] || 0), 0);
  }

  function evTotalClass(i) {
    const tot = evTotal(i);
    const max = isChampions ? 66 : 510;
    if (tot > max)  return 'ev-total-over';
    if (tot === max) return 'ev-total-ok';
    return 'ev-total-under';
  }

  function refreshButtons() {
    const filled = slots.filter(s => s.name.trim());
    const hasAny  = filled.length > 0;
    const minFull = isChampions ? 3 : 6;
    const isComplete = filled.length >= minFull;
    document.getElementById('bld-clear-btn').disabled  = !hasAny;
    document.getElementById('bld-export-btn').disabled = !isComplete;
  }

  function slotHasContent(slot) {
    if (!slot) return false;
    if ([slot.name, slot.item, slot.ability, slot.teraType].some(v => String(v || '').trim())) return true;
    if ((slot.moves || []).some(v => String(v || '').trim())) return true;
    if (slot.shiny || slot.gender === 'female') return true;
    if (STAT_KEYS.some(k => (slot.evs?.[k] || 0) !== 0)) return true;
    if (STAT_KEYS.some(k => (slot.ivs?.[k] ?? 31) !== 31)) return true;
    return false;
  }

  function hasBuilderContent() {
    const teamName = document.getElementById('bld-team-name')?.value.trim() || '';
    return !!teamName || slots.some(slotHasContent);
  }

  function setDraftStatus(text, kind = 'info') {
    const el = document.getElementById('bld-draft-status');
    if (!el) return;
    el.className = `bld-draft-status ${kind}`;
    el.textContent = text || '';
  }

  function currentDraftPayload() {
    return {
      savedAt: Date.now(),
      teamName: document.getElementById('bld-team-name')?.value || '',
      format: document.getElementById('bld-format')?.value || '',
      isChampions,
      editingTeamId,
      slots: slots.map(slot => ({ ...slot, moves: [...slot.moves], evs: { ...slot.evs }, ivs: { ...slot.ivs } }))
    };
  }

  function clearBuilderDraft() {
    localStorage.removeItem(BUILDER_DRAFT_KEY);
    clearTimeout(draftTimer);
    draftTimer = null;
  }

  function saveBuilderDraft() {
    if (!hasBuilderContent()) {
      clearBuilderDraft();
      setDraftStatus('');
      return;
    }
    try {
      localStorage.setItem(BUILDER_DRAFT_KEY, JSON.stringify(currentDraftPayload()));
      const time = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      setDraftStatus(`Rascunho salvo automaticamente ${time}`, 'saved');
    } catch {
      setDraftStatus('Nao foi possivel salvar o rascunho local.', 'error');
    }
  }

  function markDirty() {
    dirty = true;
    setDraftStatus('Alteracoes ainda nao salvas no My Teams.', 'dirty');
    clearTimeout(draftTimer);
    draftTimer = setTimeout(saveBuilderDraft, 500);
  }

  function markClean(message = '') {
    dirty = false;
    clearTimeout(draftTimer);
    draftTimer = null;
    setDraftStatus(message, message ? 'saved' : 'info');
  }

  function restoreBuilderDraft() {
    const raw = localStorage.getItem(BUILDER_DRAFT_KEY);
    if (!raw) return false;
    try {
      const draft = JSON.parse(raw);
      if (!draft || !Array.isArray(draft.slots)) return false;
      isChampions = !!draft.isChampions;
      editingTeamId = draft.editingTeamId ?? null;

      const champToggle = document.getElementById('bld-champions-toggle');
      if (champToggle) {
        champToggle.setAttribute('aria-pressed', isChampions);
        champToggle.classList.toggle('active', isChampions);
      }

      if (draft.format && !isChampions) {
        const targetGen = GenerationRules.genGroupForGame(draft.format);
        if (targetGen && typeof App !== 'undefined' && App.getGen && App.getGen() !== targetGen) App.setGen(targetGen);
        populateFormatSelect(draft.format);
      }

      const nameInput = document.getElementById('bld-team-name');
      if (nameInput) nameInput.value = draft.teamName || '';

      slots = Array.from({ length: SLOTS }, emptySlot);
      draft.slots.slice(0, SLOTS).forEach((slot, i) => {
        slots[i] = { ...emptySlot(), ...slot };
        slots[i].moves = (slot.moves || []).concat(['', '', '', '']).slice(0, 4);
        slots[i].evs = { ...emptySlot().evs, ...(slot.evs || {}) };
        slots[i].ivs = { ...emptySlot().ivs, ...(slot.ivs || {}) };
      });
      renderSlots();
      dirty = hasBuilderContent();
      setDraftStatus('Rascunho local restaurado.', dirty ? 'dirty' : 'info');
      return true;
    } catch {
      localStorage.removeItem(BUILDER_DRAFT_KEY);
      return false;
    }
  }

  function refreshEvBar(i, stat) {
    const val = slots[i].evs[stat];
    const max = isChampions ? 32 : 252;
    const pct = Math.min((val / max) * 100, 100);
    const barEl = document.getElementById(`bld-evbar-${i}-${stat}`);
    const dispEl = document.getElementById(`bld-ev-disp-${i}-${stat}`);
    const totalEl = document.getElementById(`bld-ev-total-${i}`);
    if (barEl) barEl.style.width = pct + '%';
    if (dispEl) dispEl.textContent = val;
    if (totalEl) {
      const tot = evTotal(i);
      const tmax = isChampions ? 66 : 510;
      totalEl.textContent = `${tot} / ${tmax}`;
      totalEl.className = tot > tmax ? 'ev-total-over' : 'ev-total-ok';
    }
  }

  // ── Render all slots ──────────────────────────────────────────
  function renderSlots() {
    const container = document.getElementById('bld-slots');
    container.innerHTML = slots.map((_, i) => buildSlotHTML(i)).join('');
    attachSlotListeners();
    slots.forEach((slot, i) => { if (slot.name) loadSprite(i, slot.name); });
    colorizeAllMoves();
    refreshButtons();
  }

  function bindBuilderGlobalListeners() {
    if (document.body.dataset.builderGlobalListeners === 'true') return;
    document.body.dataset.builderGlobalListeners = 'true';
    PokeBuildUI.enableAutocompleteAutoClose('#view-builder');
  }

  function loadSprite(i, name, keepCurrent = false) {
    const phEl  = document.getElementById(`bld-sprite-ph-${i}`);
    const imgEl = document.getElementById(`bld-sprite-img-${i}`);
    if (!phEl || !imgEl) return;

    if (!keepCurrent) {
      imgEl.classList.add('hidden');
      phEl.classList.remove('hidden');
    }

    const gender       = slots[i].gender || 'male';
    const femaleApi    = GENDER_VARIANTS[name];
    const useFemaleApi = gender === 'female' && !!femaleApi;
    const resolved     = useFemaleApi ? femaleApi : spriteApiName(name);
    const needFallback = !useFemaleApi && resolved !== name;

    function applySprite(data) {
      const sp = data.sprites;
      const src = PokeAPI.pixelSpriteUrl(data, slots[i].shiny, gender === 'female');
      const shinyBtn = document.querySelector(`.bld-shiny-btn[data-slot="${i}"]`);
      if (shinyBtn) shinyBtn.classList.remove('hidden');
      refreshGenderControl(i, !!(femaleApi) || !!(sp.front_female));
      if (keepCurrent) {
        const tmp = new Image();
        tmp.onload = () => {
          imgEl.src = src;
          imgEl.alt = name;
          imgEl.classList.remove('hidden');
          phEl.classList.add('hidden');
        };
        tmp.src = src;
      } else {
        imgEl.src = src;
        imgEl.alt = name;
        imgEl.classList.remove('hidden');
        phEl.classList.add('hidden');
      }
    }

    function onFail() {
      if (!keepCurrent) phEl.classList.remove('hidden');
      const sb = document.querySelector(`.bld-shiny-btn[data-slot="${i}"]`);
      if (sb) sb.classList.remove('hidden');
    }

    PokeAPI.getPokemon(resolved).then(applySprite).catch(() => {
      if (needFallback) {
        PokeAPI.getPokemon(name).then(applySprite).catch(onFail);
      } else {
        onFail();
      }
    });
  }

  // ── Nature indicator ──────────────────────────────────────────
  function natureIndicatorHTML(name) {
    const n = NATURES[name];
    if (!n || !n.up) return '<span class="nat-neutral">—</span>';
    return `<span class="nat-up">↑${STAT_LABELS[n.up]}</span><span class="nat-down">↓${STAT_LABELS[n.down]}</span>`;
  }

  // ── Move type coloring ────────────────────────────────────────
  /**
   * Aplica a cor do tipo como borda e glow sutil no input de golpe.
   * Usa inline style (não classe CSS) porque a cor é dinâmica por golpe.
   */
  function applyMoveTypeColor(input, type) {
    const c = TYPE_COLORS[type];
    if (!c) return;
    input.style.borderColor = c;
    input.style.boxShadow = `0 0 0 1px ${c}15`;
  }

  function clearMoveTypeColor(input) {
    input.style.borderColor = '';
    input.style.boxShadow = '';
  }

  /**
   * Colore as bordas de todos os inputs de golpe preenchidos.
   * Chamado após renderSlots() para restaurar cores ao carregar um time salvo ou rascunho.
   * getMoveInfo() usa cache, então é rápido para golpes já consultados.
   */
  function colorizeAllMoves() {
    for (let i = 0; i < SLOTS; i++) {
      for (let mi = 0; mi < 4; mi++) {
        const name = slots[i].moves[mi];
        if (!name) continue;
        const inputEl = document.querySelector(`.bld-move[data-slot="${i}"][data-move="${mi}"]`);
        if (!inputEl) continue;
        PokeAPI.getMoveInfo(name).then(info => {
          if (info) applyMoveTypeColor(inputEl, info.type);
        }).catch(() => {});
      }
    }
  }

  // ── Item autocomplete ─────────────────────────────────────────
  function setupItemAutocomplete(i) {
    const inputEl   = document.querySelector(`.bld-item[data-slot="${i}"]`);
    const suggestEl = document.querySelector(`.bld-item-sug[data-slot="${i}"]`);
    if (!inputEl || !suggestEl) return;

    let debounce = null;
    inputEl.addEventListener('input', () => {
      slots[i].item = inputEl.value;
      if (!inputEl.value.trim()) {
        const itemImg = document.getElementById(`bld-item-img-${i}`);
        if (itemImg) itemImg.classList.add('hidden');
      }
      clearTimeout(debounce);
      debounce = setTimeout(() => {
        const q = inputEl.value.trim().toLowerCase();
        if (q.length < 1) { suggestEl.classList.add('hidden'); return; }
        const matches = ITEMS.filter(n => n.toLowerCase().includes(q)).slice(0, 8);
        if (!matches.length) { suggestEl.classList.add('hidden'); return; }
        suggestEl.innerHTML = matches.map(it => {
          const slug = PokeAPI.apiName(it);
          return `<li data-value="${it}">
            <img src="https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/${slug}.png"
                 class="sug-item-sprite" onerror="this.style.display='none'">
            ${it}
          </li>`;
        }).join('');
        suggestEl.classList.remove('hidden');
      }, 150);
    });

    suggestEl.addEventListener('click', e => {
      const li = e.target.closest('li');
      if (!li) return;
      const value = li.dataset.value;
      inputEl.value = value;
      slots[i].item = value;
      suggestEl.classList.add('hidden');
      const itemImg = document.getElementById(`bld-item-img-${i}`);
      if (itemImg) {
        itemImg.src = `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/${PokeAPI.apiName(value)}.png`;
        itemImg.classList.remove('hidden');
        itemImg.onerror = () => itemImg.classList.add('hidden');
      }
      markDirty();
      // Auto-switch para Mega Evolução quando a Mega Stone corresponde ao Pokémon atual
      const megaForm = MEGA_STONE_MAP[value];
      if (megaForm) {
        const megaBase    = FORM_BASE[megaForm];
        const currentBase = FORM_BASE[slots[i].name] || slots[i].name;
        if (megaBase && megaBase === currentBase && POKEMON_DB[megaForm]) {
          slots[i].name = megaForm;
          const pkInput = document.querySelector(`.bld-pkmn-input[data-slot="${i}"]`);
          if (pkInput) pkInput.value = megaForm;
          refreshFormSwitcher(i, megaForm);
          refreshTypeBadges(i, megaForm);
          loadSprite(i, megaForm, true);
        }
      }
    });

    PokeBuildUI.bindAutocomplete(inputEl, suggestEl, { onPick: li => li.click() });

  }

  // ── Ability autocomplete ───────────────────────────────────────
  function setupAbilityAutocomplete(i) {
    const inputEl   = document.querySelector(`.bld-ability[data-slot="${i}"]`);
    const suggestEl = document.querySelector(`.bld-ability-sug[data-slot="${i}"]`);
    if (!inputEl || !suggestEl) return;
    const hiddenTag = document.getElementById(`bld-ability-hidden-${i}`);

    function abilityItem(name, hidden) {
      return `<li data-value="${name}" data-hidden="${hidden}">
        ${name}${hidden ? ' <em style="color:var(--text-dim);font-size:0.85em">(oculta)</em>' : ''}
      </li>`;
    }

    // Ao focar: pré-aquece cache ou exibe habilidades do Pokémon
    inputEl.addEventListener('focus', () => {
      const pkmnName = effectiveName(slots[i]);
      if (pkmnName) {
        PokeAPI.getPokemonAbilities(pkmnName).then(abilities => {
          const q = inputEl.value.trim().toLowerCase();
          const filtered = q ? abilities.filter(a => a.name.toLowerCase().startsWith(q)) : abilities;
          if (!filtered.length) return;
          suggestEl.innerHTML = filtered.map(a => abilityItem(a.name, a.hidden)).join('');
          suggestEl.classList.remove('hidden');
        }).catch(() => {});
      } else {
        PokeAPI.ensureAbilityList().catch(() => {});
      }
    });

    let debounce = null;
    inputEl.addEventListener('input', () => {
      slots[i].ability = inputEl.value;
      if (hiddenTag) hiddenTag.classList.add('hidden');
      clearTimeout(debounce);
      debounce = setTimeout(() => {
        const q = inputEl.value.trim().toLowerCase();
        if (q.length < 2) { suggestEl.classList.add('hidden'); return; }

        const pkmnName = effectiveName(slots[i]);
        if (pkmnName) {
          // Pokémon selecionado: filtra apenas as habilidades dele
          PokeAPI.getPokemonAbilities(pkmnName).then(abilities => {
            const filtered = abilities.filter(a => a.name.toLowerCase().startsWith(q));
            if (!filtered.length) { suggestEl.classList.add('hidden'); return; }
            suggestEl.innerHTML = filtered.map(a => abilityItem(a.name, a.hidden)).join('');
            suggestEl.classList.remove('hidden');
          }).catch(() => {});
        } else {
          // Sem Pokémon: busca na lista completa de habilidades
          PokeAPI.ensureAbilityList().then(list => {
            const currentQ = inputEl.value.trim().toLowerCase();
            if (currentQ.length < 2) { suggestEl.classList.add('hidden'); return; }
            const matches = list.filter(n => n.toLowerCase().startsWith(currentQ)).slice(0, 8);
            if (!matches.length) { suggestEl.classList.add('hidden'); return; }
            suggestEl.innerHTML = matches.map(n => abilityItem(n, false)).join('');
            suggestEl.classList.remove('hidden');
          }).catch(() => {});
        }
      }, 150);
    });

    suggestEl.addEventListener('click', e => {
      const li = e.target.closest('li');
      if (!li) return;
      inputEl.value = li.dataset.value;
      slots[i].ability = li.dataset.value;
      suggestEl.classList.add('hidden');
      if (hiddenTag) hiddenTag.classList.toggle('hidden', li.dataset.hidden !== 'true');
      markDirty();
    });

    PokeBuildUI.bindAutocomplete(inputEl, suggestEl, { onPick: li => li.click() });

  }

  // ── Move autocomplete ─────────────────────────────────────────
  function setupMoveAutocomplete(i, mi) {
    const moveInput = document.querySelector(`.bld-move[data-slot="${i}"][data-move="${mi}"]`);
    const moveSug   = document.querySelector(`.bld-move-sug[data-slot="${i}"][data-move="${mi}"]`);
    if (!moveInput || !moveSug) return;

    function renderMoveItems(matches, typesMap) {
      return matches.map(n => {
        const info = typesMap[n];
        const badge = info ? `<span class="tc t-${info.type} tc-dim">${info.type}</span>` : '';
        const cat = info?.category ? `<span class="tc tc-dim">${categoryShort(info.category)}</span>` : '';
        return `<li data-name="${n}">${n} ${badge} ${cat}</li>`;
      }).join('');
    }

    function categoryShort(category) {
      if (category === 'physical') return 'Physical';
      if (category === 'special') return 'Special';
      return 'Status';
    }

    /**
     * Retorna Promise com a lista de golpes adequada para o slot atual:
     * - Com Pokemon selecionado: getLearnableMoves (filtrado por Pokemon e jogo)
     * - Sem Pokémon: ensureMoveList (lista completa, ~900 golpes)
     * getLearnableMoves é praticamente instantâneo pois getPokemon() já está cacheado.
     */
    function getMoveSource() {
      const pkName = slots[i].name;
      if (pkName) {
        const formatKey = document.getElementById('bld-format').value;
        const vgKeys = isChampions ? null : GenerationRules.moveVersionGroups(formatKey);
        return PokeAPI.getLearnableMoves(pkName, vgKeys);
      }
      return PokeAPI.ensureMoveList().then(list => { MOVE_NAMES = list; return list; });
    }

    function parseMoveFlagQuery(value) {
      const raw = value.trim().toLowerCase();
      if (!raw.startsWith(':')) return null;
      if (raw === ':') return { pending: true };

      const parts = raw.slice(1).split('::');
      if (parts.length > 2 || parts.some(part => !part)) {
        return { error: 'Use :ice ou :ice::physical' };
      }

      const type = TYPES.find(t => t.toLowerCase() === parts[0]);
      if (!type) return { error: 'Tipo invalido. Ex: :ice' };

      let category = '';
      if (parts[1]) {
        const categories = {
          physical: 'physical',
          special: 'special',
          status: 'status',
        };
        category = categories[parts[1]];
        if (!category) return { error: 'Categoria invalida. Use physical, special ou status.' };
      }

      return { type, category };
    }

    function getFlagMoveMatches(flags) {
      const sourcePromise = slots[i].name ? getMoveSource() : Promise.resolve(null);
      return Promise.all([sourcePromise, PokeAPI.getMovesByType(flags.type, flags.category)])
        .then(([source, typedMoves]) => {
          if (!source) return typedMoves.slice(0, 8);
          const sourceSet = new Set(source);
          return typedMoves.filter(name => sourceSet.has(name)).slice(0, 8);
        });
    }

    // Pré-aquece o cache ao focar
    moveInput.addEventListener('focus', () => {
      getMoveSource().catch(() => {});
    });

    let debounce = null;
    moveInput.addEventListener('input', () => {
      const rawValue = moveInput.value.trim();
      slots[i].moves[mi] = rawValue.startsWith(':') ? '' : moveInput.value;
      if (!rawValue || rawValue.startsWith(':')) clearMoveTypeColor(moveInput);
      clearTimeout(debounce);
      debounce = setTimeout(() => {
        const currentRaw = moveInput.value.trim();
        const flags = parseMoveFlagQuery(currentRaw);
        if (flags) {
          if (flags.pending) { moveSug.classList.add('hidden'); return; }
          if (flags.error) {
            moveSug.innerHTML = `<li class="sug-error">${esc(flags.error)}</li>`;
            moveSug.classList.remove('hidden');
            return;
          }

          moveSug.innerHTML = '<li class="sug-loading">Filtrando golpes...</li>';
          moveSug.classList.remove('hidden');
          getFlagMoveMatches(flags)
            .then(matches => {
              if (moveInput.value.trim() !== currentRaw) return;
              if (!matches.length) {
                moveSug.innerHTML = '<li class="sug-error">Nenhum golpe para esse filtro.</li>';
                moveSug.classList.remove('hidden');
                return;
              }
              moveSug.innerHTML = renderMoveItems(matches, {});
              moveSug.classList.remove('hidden');
              PokeAPI.getMovesInfo(matches)
                .then(typesMap => {
                  if (!moveSug.classList.contains('hidden') && moveInput.value.trim() === currentRaw)
                    moveSug.innerHTML = renderMoveItems(matches, typesMap);
                })
                .catch(() => {});
            })
            .catch(err => {
              console.error('[MoveFlag] falha ao filtrar:', err);
              moveSug.innerHTML = `<li class="sug-error">Erro: ${err?.message || 'falha'}</li>`;
              moveSug.classList.remove('hidden');
            });
          return;
        }

        const q = currentRaw.toLowerCase();
        if (q.length < 2) { moveSug.classList.add('hidden'); return; }

        // Loading só quando não há Pokémon selecionado (fetch pode demorar)
        if (!slots[i].name) {
          moveSug.innerHTML = '<li class="sug-loading">Carregando golpes…</li>';
          moveSug.classList.remove('hidden');
        }

        getMoveSource()
          .then(list => {
            const currentQ = moveInput.value.trim().toLowerCase();
            if (currentQ.length < 2) { moveSug.classList.add('hidden'); return; }
            const matches = list.filter(n => n.toLowerCase().startsWith(currentQ)).slice(0, 8);
            if (!matches.length) { moveSug.classList.add('hidden'); return; }
            moveSug.innerHTML = renderMoveItems(matches, {});
            moveSug.classList.remove('hidden');
            PokeAPI.getMovesInfo(matches)
              .then(typesMap => {
                if (!moveSug.classList.contains('hidden'))
                  moveSug.innerHTML = renderMoveItems(matches, typesMap);
              })
              .catch(() => {});
          })
          .catch(err => {
            console.error('[MoveList] falha ao carregar:', err);
            const msg = err?.name === 'AbortError' ? 'Tempo esgotado (API lenta)' : (err?.message || 'Erro desconhecido');
            moveSug.innerHTML = `<li class="sug-error">Erro: ${msg}</li>`;
          });
      }, 150);
    });

    moveSug.addEventListener('click', e => {
      const li = e.target.closest('li');
      if (!li || !li.dataset.name) return;
      moveInput.value = li.dataset.name;
      slots[i].moves[mi] = li.dataset.name;
      moveSug.classList.add('hidden');
      markDirty();
      PokeAPI.getMoveInfo(li.dataset.name).then(info => {
        if (info) applyMoveTypeColor(moveInput, info.type);
      }).catch(() => {});
    });

    PokeBuildUI.bindAutocomplete(moveInput, moveSug, { onPick: li => li.click() });

  }

  // ── Attach all slot event listeners ───────────────────────────
  function attachSlotListeners() {
    for (let i = 0; i < SLOTS; i++) {
      // Autocomplete de Pokémon
      const inputEl = document.querySelector(`.bld-pkmn-input[data-slot="${i}"]`);
      const suggestEl = document.querySelector(`.bld-suggestions[data-slot="${i}"]`);
      if (inputEl && suggestEl) {
        let debounce = null;
        inputEl.addEventListener('input', () => {
          slots[i].name = inputEl.value;
          slots[i].gender = 'male';
          refreshButtons();
          refreshGenderControl(i, false);
          refreshShinyBtn(i);
          refreshFormSwitcher(i, inputEl.value);
          refreshTypeBadges(i, '');
          clearTimeout(debounce);
          debounce = setTimeout(() => {
            const q = inputEl.value.trim().toLowerCase();
            if (q.length < 2) { suggestEl.classList.add('hidden'); return; }
            const matches = Object.entries(POKEMON_DB)
              .filter(([name]) => !FORM_VARIANTS.has(name) && name.toLowerCase().startsWith(q))
              .slice(0, 10);
            if (!matches.length) { suggestEl.classList.add('hidden'); return; }
            suggestEl.innerHTML = matches.map(([name, types]) => {
              const pills = types.filter(Boolean).map(t => `<span class="tpill t-${t}">${t}</span>`).join('');
              return `<li data-name="${name}" class="ac-item-rich"><span>${name}</span><span class="ac-types">${pills}</span></li>`;
            }).join('');
            suggestEl.classList.remove('hidden');
          }, 150);
        });
        suggestEl.addEventListener('click', e => {
          const li = e.target.closest('li');
          if (!li) return;
          const name = li.dataset.name;
          inputEl.value = name;
          slots[i].name = name;
          slots[i].gender = 'male';
          suggestEl.classList.add('hidden');
          refreshButtons();
          refreshShinyBtn(i);
          refreshFormSwitcher(i, name);
          refreshTypeBadges(i, name);
          loadSprite(i, name);
          PokeAPI.getPokemonAbilities(name).catch(() => {});
          if (hasTera()) {
            const type1 = (POKEMON_DB[name] || [])[0] || '';
            slots[i].teraType = type1;
            const teraSel = document.querySelector(`.bld-tera[data-slot="${i}"]`);
            if (teraSel) teraSel.value = type1;
          }
          markDirty();
        });
        PokeBuildUI.bindAutocomplete(inputEl, suggestEl, { onPick: li => li.click() });
      }

      setupAbilityAutocomplete(i);
      setupItemAutocomplete(i);
      for (let mi = 0; mi < 4; mi++) setupMoveAutocomplete(i, mi);
    }

    // EV inputs
    document.querySelectorAll('.bld-ev').forEach(input => {
      input.addEventListener('input', () => {
        const i = parseInt(input.dataset.slot);
        const stat = input.dataset.stat;
        const max = isChampions ? 32 : 252;
        let val = parseInt(input.value) || 0;
        if (val < 0) val = 0;
        if (val > max) { val = max; input.value = max; }
        slots[i].evs[stat] = val;
        refreshEvBar(i, stat);
      });
    });

    // IV inputs
    document.querySelectorAll('.bld-iv').forEach(input => {
      input.addEventListener('input', () => {
        const i = parseInt(input.dataset.slot);
        const stat = input.dataset.stat;
        let val = parseInt(input.value) || 0;
        if (val < 0) val = 0;
        if (val > 31) { val = 31; input.value = 31; }
        slots[i].ivs[stat] = val;
        const sumEl = document.getElementById(`bld-iv-summary-${i}`);
        if (sumEl) {
          const non31 = STAT_KEYS.filter(k => slots[i].ivs[k] !== 31);
          sumEl.textContent = non31.length ? non31.map(k => `${slots[i].ivs[k]} ${STAT_LABELS[k]}`).join(' / ') : 'todos 31';
        }
      });
    });

    // IV toggle collapse
    document.querySelectorAll('.iv-toggle-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const i = parseInt(btn.dataset.slot);
        const body = document.getElementById(`bld-iv-body-${i}`);
        const icon = btn.querySelector('.iv-toggle-icon');
        if (!body) return;
        const isNowHidden = body.classList.toggle('hidden');
        if (icon) icon.textContent = isNowHidden ? '▶' : '▼';
      });
    });

    // Natureza
    document.querySelectorAll('.bld-nature').forEach(sel => {
      sel.addEventListener('change', () => {
        const i = parseInt(sel.dataset.slot);
        slots[i].nature = sel.value;
        const ind = document.getElementById(`bld-nat-ind-${i}`);
        if (ind) ind.innerHTML = natureIndicatorHTML(sel.value);
      });
    });

    // Habilidade
    document.querySelectorAll('.bld-ability').forEach(input => {
      input.addEventListener('input', () => {
        slots[parseInt(input.dataset.slot)].ability = input.value;
      });
    });

    // Tera Type
    document.querySelectorAll('.bld-tera').forEach(sel => {
      sel.addEventListener('change', () => {
        slots[parseInt(sel.dataset.slot)].teraType = sel.value;
      });
    });

    // Shiny e gender — event delegation para suportar botões inseridos dinamicamente
    const slotContainer = document.getElementById('bld-slots');
    if (!slotContainer.dataset.delegateBound) {
      slotContainer.dataset.delegateBound = 'true';
      slotContainer.addEventListener('click', e => {
      const shinyBtn = e.target.closest('.bld-shiny-btn');
      if (shinyBtn) {
        const i = parseInt(shinyBtn.dataset.slot);
        slots[i].shiny = !slots[i].shiny;
        shinyBtn.classList.toggle('active', slots[i].shiny);
        if (slots[i].name) loadSprite(i, slots[i].name, true);
        markDirty();
        return;
      }
      const genderBtn = e.target.closest('.bld-gender-btn');
      if (genderBtn) {
        const i = parseInt(genderBtn.dataset.slot);
        const gender = genderBtn.dataset.gender;
        slots[i].gender = gender;
        document.querySelectorAll(`.bld-gender-btn[data-slot="${i}"]`).forEach(b => {
          b.classList.toggle('active', b.dataset.gender === gender);
        });
        if (slots[i].name) loadSprite(i, slots[i].name, true);
        markDirty();
        return;
      }
      const navBtn = e.target.closest('.form-nav-btn');
      if (navBtn) {
        const i = parseInt(navBtn.dataset.slot);
        const dir = parseInt(navBtn.dataset.dir);
        const base = FORM_BASE[slots[i].name];
        if (!base) return;
        const forms = POKEMON_FORMS[base];
        if (!forms) return;
        const idx = forms.indexOf(slots[i].name);
        const newIdx = (idx + dir + forms.length) % forms.length;
        const formName = forms[newIdx];
        slots[i].name = formName;
        slots[i].gender = 'male';
        const inputEl = document.querySelector(`.bld-pkmn-input[data-slot="${i}"]`);
        if (inputEl) inputEl.value = formName;
        if (hasTera()) {
          const type1 = (POKEMON_DB[formName] || [])[0] || '';
          slots[i].teraType = type1;
          const teraSel = document.querySelector(`.bld-tera[data-slot="${i}"]`);
          if (teraSel) teraSel.value = type1;
        }
        refreshFormSwitcher(i, formName);
        refreshTypeBadges(i, formName);
        refreshShinyBtn(i);
        refreshGenderControl(i, false);
        loadSprite(i, formName, true);
        markDirty();
      }
      });
    }
  }

  // ── Validation ────────────────────────────────────────────────
  async function validateAndSave() {
    const teamName = document.getElementById('bld-team-name').value.trim();
    const formatKey = document.getElementById('bld-format').value;
    const versionGroup = GAME_VERSIONS.find(v => v.key === formatKey);
    const valBox = document.getElementById('bld-validation-box');

    if (!teamName) { alert('Dê um nome ao time.'); return; }

    const activeSlots = slots.filter(s => s.name.trim());
    if (!activeSlots.length) { alert('Adicione pelo menos um Pokémon.'); return; }

    valBox.innerHTML = '<div class="val-loading">Validando com PokéAPI…</div>';
    valBox.classList.remove('hidden');

    const allErrors = [];
    const evStatMax   = isChampions ? 32  : 252;
    const evTotalMax  = isChampions ? 66  : 510;
    const evLabel     = isChampions ? 'SP' : 'EV';

    for (let i = 0; i < SLOTS; i++) {
      const slot = slots[i];
      if (!slot.name.trim()) continue;
      const slotErrors = [];

      // Validação local de EVs/SPs
      STAT_KEYS.forEach(k => {
        if (slot.evs[k] > evStatMax)
          slotErrors.push(`${STAT_LABELS[k]}: ${evLabel} ${slot.evs[k]} excede o máximo de ${evStatMax}`);
      });
      const tot = STAT_KEYS.reduce((s, k) => s + slot.evs[k], 0);
      if (tot > evTotalMax)
        slotErrors.push(`Total de ${evLabel}s (${tot}) excede o limite de ${evTotalMax}`);

      // Validação via PokéAPI (habilidade e golpes)
      const moveNames = slot.moves.filter(m => m.trim());
      const vgKey = isChampions ? null : GenerationRules.moveVersionGroups(formatKey);
      const apiErrors = await PokeAPI.validatePokemonForVersion(
        effectiveName(slot), moveNames, slot.ability, vgKey, versionGroup?.label
      );
      slotErrors.push(...apiErrors);

      if (slotErrors.length) allErrors.push({ slot: i, name: slot.name, errors: slotErrors });
    }

    if (allErrors.length) {
      valBox.innerHTML = `
        <div class="val-header">Erros de validação encontrados:</div>
        ${allErrors.map(({ name, errors }) => `
          <div class="val-pokemon">
            <strong>${name}</strong>
            ${errors.map(err => `<div class="val-error">✗ ${err}</div>`).join('')}
          </div>`).join('')}
      `;
      return;
    }

    // Sem erros — salva o time
    const teamData = {
      name: teamName,
      format: formatKey,
      isChampions,
      members: slots.filter(s => s.name.trim()).map(s => ({ ...s }))
    };

    try {
      const existing = await TeamStorage.getTeams();
      const duplicate = existing.find(t =>
        t.name.trim().toLowerCase() === teamName.toLowerCase() &&
        t.id !== editingTeamId
      );
      if (duplicate) {
        valBox.innerHTML = `<div class="val-error">Já existe um time com o nome "${teamName}". Escolha outro nome.</div>`;
        return;
      }

      if (editingTeamId !== null) {
        await TeamStorage.updateTeam(editingTeamId, teamData);
        editingTeamId = null;
        valBox.innerHTML = '<div class="val-success">✓ Time atualizado com sucesso! <button type="button" class="btn-secondary btn-sm" id="bld-open-teams-btn">Abrir My Teams</button></div>';
      } else {
        await TeamStorage.saveTeam(teamData);
        valBox.innerHTML = '<div class="val-success">✓ Time salvo com sucesso! <button type="button" class="btn-secondary btn-sm" id="bld-open-teams-btn">Abrir My Teams</button></div>';
      }
      clearBuilderDraft();
      markClean('Salvo no My Teams.');
      document.getElementById('bld-open-teams-btn')?.addEventListener('click', () => App.navigate('my-teams'));
    } catch (err) {
      valBox.innerHTML = `<div class="val-error">Erro ao salvar: ${err.message}</div>`;
    }
  }

  // ── Export ────────────────────────────────────────────────────
  function exportText() {
    const text = smogonTeamText(slots, { isChampions, gen: builderGen() });
    if (!text) { alert('Nenhum Pokemon configurado para exportar.'); return; }
    const exportTeamName = document.getElementById('bld-team-name').value.trim() || 'time';
    App.showExportModal(text, exportTeamName);
  }

  // ── Saved teams list (modal do Builder) ───────────────────────
  async function renderBuilderSavedList() {
    const listEl = document.getElementById('bld-saved-list');
    listEl.innerHTML = '<p style="color:var(--text2);font-size:0.85rem">Carregando…</p>';
    let teams;
    try { teams = await TeamStorage.getTeams(); } catch { teams = []; }
    if (!teams.length) {
      listEl.innerHTML = '<p style="color:var(--text2);font-size:0.85rem">Nenhum time salvo encontrado.</p>';
      return;
    }
    const formatLabel = key => GAME_VERSIONS.find(v => v.key === key)?.label || key || '—';
    listEl.innerHTML = teams.map((team, idx) => {
      const date = team.created ? new Date(team.created).toLocaleDateString('pt-BR') : '';
      const sprites = (team.members || []).slice(0, 6).map(m =>
        `<img src="https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/0.png"
          class="tc-sprite" data-name="${esc(m.name)}" alt="${esc(m.name)}" loading="lazy">`
      ).join('');
      return `<div class="saved-team-item">
        <div class="saved-team-info">
          <span class="saved-team-name">${esc(team.name || `Time ${idx + 1}`)}</span>
          <span class="saved-team-date">${esc(formatLabel(team.format))} · ${date}</span>
        </div>
        <div class="team-card-sprites" id="bld-imp-spr-${team.id}">${sprites}</div>
        <button class="btn-secondary btn-sm" data-load="${idx}">Carregar</button>
      </div>`;
    }).join('');

    teams.forEach(team => {
      (team.members || []).slice(0, 6).forEach(m => {
        if (!m.name) return;
        PokeAPI.getPokemon(m.name).then(data => {
          const wrap = document.getElementById(`bld-imp-spr-${team.id}`);
          if (!wrap) return;
          const img = wrap.querySelector(`[data-name="${m.name}"]`);
          if (img) img.src = PokeAPI.pixelSpriteUrl(data, !!m.shiny, m.gender === 'female');
        }).catch(() => {});
      });
    });

    listEl.querySelectorAll('[data-load]').forEach(btn => {
      btn.addEventListener('click', () => {
        const team = teams[parseInt(btn.dataset.load)];
        loadTeam(team, false);
        document.getElementById('bld-import-modal').classList.add('hidden');
      });
    });
  }

  // ── Smogon import ─────────────────────────────────────────────
  function parseSmogonForBuilder(text) {
    const normalizeType = raw => TYPES.find(t => t.toLowerCase() === String(raw || '').trim().toLowerCase()) || '';

    text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const maxSlots = isChampions ? 3 : SLOTS;
    return text.trim().split(/\n[ \t]*\n/).filter(b => b.trim()).slice(0, maxSlots).map(block => {
      const lines = block.trim().split('\n').map(l => l.trim()).filter(Boolean);
      if (!lines.length) return null;
      const header = parseSmogonHeader(lines[0]);
      let ability = '', teraType = '', nature = 'Hardy', evsStr = '', ivsStr = '', spStr = '';
      let shiny = false, gmax = false, gender = header.gender || 'male';
      const moves = [];

      for (let i = 1; i < lines.length; i++) {
        const l = lines[i];
        const moveLine = l.match(/^(?:-|•)\s*(.+)$/);
        if (moveLine && moves.length < 4) {
          moves.push(moveLine[1].trim());
          continue;
        }

        const [rawKey, ...rest] = l.split(':');
        const key = rawKey.trim().toLowerCase();
        const value = cleanSmogonValue(rest.join(':'));
        if      (key === 'ability')    ability  = value;
        else if (key === 'tera type')  teraType = normalizeType(value);
        else if (key === 'shiny')      shiny    = value.toLowerCase() === 'yes';
        else if (key === 'gigantamax') gmax     = value.toLowerCase() === 'yes';
        else if (key === 'gender')     gender   = value.toLowerCase().startsWith('f') ? 'female' : value.toLowerCase().startsWith('m') ? 'male' : gender;
        else if (key === 'evs')        evsStr   = value;
        else if (key === 'sp spread')  spStr    = value;
        else if (key === 'ivs')        ivsStr   = value;
        else if (key === 'nature')     nature   = value;
        else if (/\s+nature$/i.test(l)) nature  = l.replace(/\s+nature$/i, '').trim();
      }

      return {
        name: header.species,
        item: header.item,
        ability,
        teraType,
        shiny,
        gmax,
        gender,
        level: 50,
        nature: normalizeNature(nature),
        evs: parseStatSpread(isChampions ? (spStr || evsStr) : evsStr, 0, isChampions ? 32 : 252),
        ivs: parseStatSpread(ivsStr, 31, 31),
        moves
      };
    }).filter(Boolean);
  }

  function applySmogonImport(parsed) {
    slots = Array.from({ length: SLOTS }, emptySlot);
    parsed.forEach((p, i) => {
      if (i >= SLOTS) return;
      let name = p.name;
      if (p.gmax) {
        const gmaxForm = name + '-Gmax';
        if (POKEMON_DB[gmaxForm]) name = gmaxForm;
      }
      slots[i].name     = name;
      slots[i].item     = cleanSmogonValue(p.item);
      slots[i].ability  = cleanSmogonValue(p.ability);
      slots[i].teraType = p.teraType;
      slots[i].shiny    = p.shiny || false;
      slots[i].gender   = p.gender || 'male';
      slots[i].level    = 50;
      slots[i].nature   = p.nature;
      slots[i].evs      = p.evs;
      slots[i].ivs      = p.ivs;
      slots[i].moves    = p.moves.concat(['', '', '', '']).slice(0, 4);
    });
    renderSlots();
    markDirty();
    const unknown = parsed.map(p => p.name).filter(name => !POKEMON_DB[name]);
    const valBox = document.getElementById('bld-validation-box');
    if (valBox) {
      valBox.innerHTML = unknown.length
        ? `<div class="val-error">Importado com avisos: nao reconheci ${unknown.map(esc).join(', ')}. Ajuste antes de validar.</div>`
        : '<div class="val-success">Importado com sucesso. Level foi normalizado para 50.</div>';
      valBox.classList.remove('hidden');
    }
  }

  function renderImportPreview() {
    const previewEl = document.getElementById('bld-import-preview');
    const text = document.getElementById('bld-smogon-text')?.value.trim() || '';
    if (!previewEl) return;
    if (!text) {
      previewEl.classList.add('hidden');
      previewEl.innerHTML = '';
      return;
    }
    const parsed = parseSmogonForBuilder(text);
    if (!parsed.length) {
      previewEl.classList.remove('hidden');
      previewEl.innerHTML = '<div class="import-preview-warning">Nenhum Pokemon reconhecido ainda.</div>';
      return;
    }
    const unknown = parsed.map(p => p.name).filter(name => !POKEMON_DB[name]);
    const rows = parsed.map((p, idx) => {
      const moves = p.moves.filter(Boolean).length;
      const status = POKEMON_DB[p.name] ? `${moves}/4 moves` : 'nao reconhecido';
      return `<div class="import-preview-row"><strong>${idx + 1}. ${esc(p.name || '?')}</strong><span>${esc(status)}</span></div>`;
    }).join('');
    previewEl.classList.remove('hidden');
    previewEl.innerHTML = `
      <div class="import-preview-title">Preview: ${parsed.length} Pokemon${isChampions ? ' (Champions)' : ''}</div>
      ${rows}
      ${unknown.length ? `<div class="import-preview-warning">Ajustar depois: ${unknown.map(esc).join(', ')}</div>` : ''}
    `;
  }

  function clearAll() {
    editingTeamId = null;
    slots = Array.from({ length: SLOTS }, emptySlot);
    document.getElementById('bld-team-name').value = '';
    document.getElementById('bld-validation-box').classList.add('hidden');
    clearBuilderDraft();
    markClean('Rascunho limpo.');
    renderSlots();
  }

  function loadDraft() {
    if (editingTeamId !== null) return false;
    const draftRaw = localStorage.getItem('az_team_draft');
    if (!draftRaw) return false;
    try {
      const draft = JSON.parse(draftRaw);
      slots = Array.from({ length: SLOTS }, emptySlot);
      draft.forEach((d, i) => {
        if (i >= SLOTS) return;
        if (d.species) slots[i].name = d.species;
        if (d.tera) slots[i].teraType = d.tera;
        if (Array.isArray(d.moves))
          slots[i].moves = d.moves.concat(['', '', '', '']).slice(0, 4);
      });
      localStorage.removeItem('az_team_draft');
      renderSlots();
      markDirty();
      return true;
    } catch { return false; }
  }

  function loadTeam(team, editMode = true) {
    editingTeamId = editMode ? team.id : null;
    const teamFormat = team.format === 'brilliant-diamond-and-shining-pearl'
      ? 'brilliant-diamond-shining-pearl'
      : team.format;
    isChampions = !!(team.isChampions || teamFormat === 'champions');

    const champToggle = document.getElementById('bld-champions-toggle');
    if (champToggle) {
      champToggle.setAttribute('aria-pressed', isChampions);
      champToggle.classList.toggle('active', isChampions);
    }

    const formatSel = document.getElementById('bld-format');
    if (formatSel && teamFormat && teamFormat !== 'champions') {
      const targetGen = GenerationRules.genGroupForGame(teamFormat);
      if (targetGen && typeof App !== 'undefined' && App.getGen && App.getGen() !== targetGen) {
        App.setGen(targetGen);
      }
      populateFormatSelect(teamFormat);
    }

    const nameInput = document.getElementById('bld-team-name');
    if (nameInput) nameInput.value = team.name || '';

    slots = Array.from({ length: SLOTS }, emptySlot);
    (team.members || []).forEach((m, i) => {
      if (i >= SLOTS) return;
      slots[i] = { ...emptySlot(), ...m };
      slots[i].moves = (m.moves || []).concat(['', '', '', '']).slice(0, 4);
    });

    renderSlots();

    const valBox = document.getElementById('bld-validation-box');
    if (valBox && editMode) {
      valBox.innerHTML = `<div style="color:var(--gold);font-size:0.92em;padding:4px 0">✎ Editando "${esc(team.name)}" — salve para atualizar.</div>`;
      valBox.classList.remove('hidden');
    } else if (valBox) {
      valBox.classList.add('hidden');
    }

    if (editMode) markClean('Editando time salvo.');
    else markDirty();
  }

  function init() {
    slots = Array.from({ length: SLOTS }, emptySlot);
    bindBuilderGlobalListeners();

    // Preenche o select de formato (Champions excluído — gerenciado pelo toggle)
    const formatSel = document.getElementById('bld-format');
    populateFormatSelect();

    formatSel.addEventListener('change', () => { renderSlots(); markDirty(); });

    // Toggle do modo Champions
    const champToggle = document.getElementById('bld-champions-toggle');
    champToggle.addEventListener('click', () => {
      isChampions = !isChampions;
      champToggle.setAttribute('aria-pressed', isChampions);
      champToggle.classList.toggle('active', isChampions);
      slots.forEach(s => {
        if (isChampions) {
          // EV → SP: proporção em relação aos limites de cada escala
          STAT_KEYS.forEach(k => {
            s.evs[k] = Math.min(Math.round(s.evs[k] * 32 / 252), 32);
          });
          s.ivs = { hp:31, atk:31, def:31, spa:31, spd:31, spe:31 };
        } else {
          // SP → EV: proporção inversa
          STAT_KEYS.forEach(k => {
            s.evs[k] = Math.min(Math.round(s.evs[k] * 252 / 32), 252);
          });
          s.ivs = { hp:31, atk:31, def:31, spa:31, spd:31, spe:31 };
        }
      });
      renderSlots();
      markDirty();
    });

    const builderView = document.getElementById('view-builder');
    const markFromUserEdit = e => {
      if (e.target.closest('#bld-import-modal')) return;
      markDirty();
    };
    builderView.addEventListener('input', markFromUserEdit);
    builderView.addEventListener('change', markFromUserEdit);

    if (!restoreBuilderDraft()) renderSlots();

    document.getElementById('bld-validate-btn').addEventListener('click', validateAndSave);
    document.getElementById('bld-export-btn').addEventListener('click', exportText);
    document.getElementById('bld-clear-btn').addEventListener('click', () => {
      if (dirty && hasBuilderContent()) App.showConfirm('Descartar alteracoes nao salvas do Builder?', clearAll);
      else clearAll();
    });

    document.getElementById('bld-import-btn').addEventListener('click', () => {
      document.getElementById('bld-smogon-text').value = '';
      document.getElementById('bld-smogon-file').value = '';
      renderImportPreview();
      // Volta sempre para aba Smogon ao abrir
      document.querySelectorAll('.modal-tab-sm[data-bitab]').forEach(b => b.classList.remove('active'));
      document.querySelector('.modal-tab-sm[data-bitab="smogon"]').classList.add('active');
      document.getElementById('bld-itab-smogon').classList.remove('hidden');
      document.getElementById('bld-itab-saved').classList.add('hidden');
      document.getElementById('bld-import-modal').classList.remove('hidden');
    });

    document.querySelectorAll('.modal-tab-sm[data-bitab]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.modal-tab-sm[data-bitab]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const tab = btn.dataset.bitab;
        document.getElementById('bld-itab-smogon').classList.toggle('hidden', tab !== 'smogon');
        document.getElementById('bld-itab-saved').classList.toggle('hidden', tab !== 'saved');
        if (tab === 'saved') renderBuilderSavedList();
      });
    });

    document.getElementById('bld-import-cancel').addEventListener('click', () => {
      document.getElementById('bld-import-modal').classList.add('hidden');
    });
    document.getElementById('bld-import-cancel2').addEventListener('click', () => {
      document.getElementById('bld-import-modal').classList.add('hidden');
    });
    document.getElementById('bld-smogon-import').addEventListener('click', () => {
      const text = document.getElementById('bld-smogon-text').value.trim();
      if (!text) return;
      const parsed = parseSmogonForBuilder(text);
      if (!parsed.length) { alert('Nenhum Pokémon encontrado no texto.'); return; }
      applySmogonImport(parsed);
      document.getElementById('bld-import-modal').classList.add('hidden');
    });
    document.getElementById('bld-smogon-file').addEventListener('change', e => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = ev => {
        document.getElementById('bld-smogon-text').value = ev.target.result;
        renderImportPreview();
      };
      reader.readAsText(file);
    });
    document.getElementById('bld-smogon-text').addEventListener('input', renderImportPreview);

    window.addEventListener('beforeunload', e => {
      if (!dirty || !hasBuilderContent()) return;
      e.preventDefault();
      e.returnValue = '';
    });
  }

  return { init, loadDraft, loadTeam, syncWithGlobalGen, hasUnsavedChanges: () => dirty && hasBuilderContent(), slots: () => slots, isChampions: () => isChampions };
})();
