'use strict';

/**
 * builder.js — Montador de times com validação via PokéAPI
 * ---------------------------------------------------------
 * Permite montar um time completo de 6 Pokémon (ou 3 no modo Champions)
 * com habilidade, item, natureza, EVs, IVs e 4 golpes cada.
 *
 * Antes de salvar, valida contra a PokéAPI:
 *   - Habilidade: deve ser possível para o Pokémon
 *   - Golpes: devem ser aprendíveis na geração do jogo selecionado
 *
 * Autocomplete de golpes filtra pela lista de moves do Pokémon selecionado
 * (via getLearnableMoves) ou pela lista completa se nenhum Pokémon estiver escolhido.
 * Ao selecionar um golpe, a borda do input recebe a cor do tipo via TYPE_COLORS.
 *
 * Modo Champions (Pokémon Champions TCG/VGC):
 *   - 3 membros (não 6)
 *   - EVs substituídos por SPs (max 32 cada, 66 total, sem divisão por 4)
 *   - IVs não configuráveis (sempre 31)
 *   - Sem restrição de geração nos golpes
 *
 * Dependências: data.js (TYPES, NATURES, STAT_KEYS, STAT_LABELS, GAME_VERSIONS,
 *   ITEMS, TYPE_COLORS, calcStat),
 *   api.js (PokeAPI — inclui ensureAbilityList), storage.js (TeamStorage), app.js (App).
 */

const Builder = (() => {
  const SLOTS = 6;
  let slots = [];
  let isChampions = false;
  let editingTeamId = null; // ID do time sendo editado; null = novo time

  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
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
    return slot.name;
  }

  // ── Build slot HTML ───────────────────────────────────────────
  function hasTera() {
    if (isChampions) return true;
    const fmt = document.getElementById('bld-format')?.value;
    return GAME_VERSIONS.find(v => v.key === fmt)?.gen === 9;
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
        <div style="display:flex;align-items:center;gap:6px">
          <select class="select-input bld-nature" data-slot="${i}" style="width:130px">${natureOpts}</select>
          <span class="nature-indicator" id="bld-nat-ind-${i}">${natureIndicatorHTML(slot.nature)}</span>
        </div>
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
        <div class="field-group">
          <label class="field-label">Habilidade</label>
          <div class="autocomplete-wrap">
            <input type="text" class="text-input bld-ability" data-slot="${i}"
              placeholder="Habilidade" value="${slot.ability}" autocomplete="off">
            <ul class="suggestions hidden bld-ability-sug" data-slot="${i}"></ul>
          </div>
          <em class="ability-hidden-tag hidden" id="bld-ability-hidden-${i}">(oculta)</em>
        </div>
        <div class="field-group">
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
        </div>
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
      let src;
      if (useFemaleApi) {
        src = slots[i].shiny
          ? (sp.front_shiny   || PokeAPI.spriteUrl(data.id, false, true))
          : (sp.front_default || PokeAPI.spriteUrl(data.id, false, false));
      } else {
        const hasFemaleSprite = gender === 'female' && !!(sp.front_female);
        if (slots[i].shiny) {
          src = (hasFemaleSprite && sp.front_shiny_female)
            ? sp.front_shiny_female
            : (sp.front_shiny || PokeAPI.spriteUrl(data.id, false, true));
        } else {
          src = (hasFemaleSprite && sp.front_female)
            ? sp.front_female
            : (sp.front_default || PokeAPI.spriteUrl(data.id, false, false));
        }
      }
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
    });

    document.addEventListener('click', e => {
      if (!inputEl.contains(e.target) && !suggestEl.contains(e.target))
        suggestEl.classList.add('hidden');
    });
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
    });

    document.addEventListener('click', e => {
      if (!inputEl.contains(e.target) && !suggestEl.contains(e.target))
        suggestEl.classList.add('hidden');
    });
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
        return `<li data-name="${n}">${n} ${badge}</li>`;
      }).join('');
    }

    /**
     * Retorna Promise com a lista de golpes adequada para o slot atual:
     * - Com Pokémon selecionado: getLearnableMoves (filtrado por Pokémon e geração)
     * - Sem Pokémon: ensureMoveList (lista completa, ~900 golpes)
     * getLearnableMoves é praticamente instantâneo pois getPokemon() já está cacheado.
     */
    function getMoveSource() {
      const pkName = slots[i].name;
      if (pkName) {
        const vgKey = isChampions ? null : document.getElementById('bld-format').value;
        return PokeAPI.getLearnableMoves(pkName, vgKey);
      }
      return PokeAPI.ensureMoveList().then(list => { MOVE_NAMES = list; return list; });
    }

    // Pré-aquece o cache ao focar
    moveInput.addEventListener('focus', () => {
      getMoveSource().catch(() => {});
    });

    let debounce = null;
    moveInput.addEventListener('input', () => {
      slots[i].moves[mi] = moveInput.value;
      if (!moveInput.value.trim()) clearMoveTypeColor(moveInput);
      clearTimeout(debounce);
      debounce = setTimeout(() => {
        const q = moveInput.value.trim().toLowerCase();
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
      PokeAPI.getMoveInfo(li.dataset.name).then(info => {
        if (info) applyMoveTypeColor(moveInput, info.type);
      }).catch(() => {});
    });

    document.addEventListener('click', e => {
      if (!moveInput.contains(e.target) && !moveSug.contains(e.target))
        moveSug.classList.add('hidden');
    });
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
        });
        document.addEventListener('click', e => {
          if (!inputEl.contains(e.target) && !suggestEl.contains(e.target))
            suggestEl.classList.add('hidden');
        });
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
    document.getElementById('bld-slots').addEventListener('click', e => {
      const shinyBtn = e.target.closest('.bld-shiny-btn');
      if (shinyBtn) {
        const i = parseInt(shinyBtn.dataset.slot);
        slots[i].shiny = !slots[i].shiny;
        shinyBtn.classList.toggle('active', slots[i].shiny);
        if (slots[i].name) loadSprite(i, slots[i].name, true);
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
      }
    });
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
      const vgKey = isChampions ? null : formatKey;
      const apiErrors = await PokeAPI.validatePokemonForVersion(
        effectiveName(slot), moveNames, slot.ability, vgKey
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
        valBox.innerHTML = '<div class="val-success">✓ Time atualizado com sucesso!</div>';
      } else {
        await TeamStorage.saveTeam(teamData);
        valBox.innerHTML = '<div class="val-success">✓ Time salvo com sucesso!</div>';
      }
      setTimeout(() => valBox.classList.add('hidden'), 2500);
    } catch (err) {
      valBox.innerHTML = `<div class="val-error">Erro ao salvar: ${err.message}</div>`;
    }
  }

  // ── Export ────────────────────────────────────────────────────
  function exportText() {
    const formatKey = document.getElementById('bld-format').value;
    const lines = [];
    slots.forEach(slot => {
      if (!slot.name.trim()) return;
      if (isChampions) {
        lines.push(`${slot.name} @ ${slot.item || '(sem item)'}`);
        lines.push(`Ability: ${slot.ability || '(sem habilidade)'}`);
        if (slot.shiny) lines.push('Shiny: Yes');
        if (slot.teraType) lines.push(`Tera Type: ${slot.teraType}`);
        lines.push(`Nature: ${slot.nature}`);
        lines.push(`SP Spread: ${STAT_KEYS.map(k => `${STAT_LABELS[k]} ${slot.evs[k]}`).join(' / ')}`);
        slot.moves.filter(m => m).forEach(m => lines.push(`- ${m}`));
      } else {
        lines.push(`${slot.name} @ ${slot.item || '(sem item)'}`);
        lines.push(`Ability: ${slot.ability || '(sem habilidade)'}`);
        if (slot.shiny) lines.push('Shiny: Yes');
        if (slot.teraType) lines.push(`Tera Type: ${slot.teraType}`);
        lines.push(`Level: ${slot.level}`);
        const evParts = STAT_KEYS.filter(k => slot.evs[k] > 0).map(k => `${slot.evs[k]} ${STAT_LABELS[k]}`);
        if (evParts.length) lines.push(`EVs: ${evParts.join(' / ')}`);
        lines.push(`${slot.nature} Nature`);
        const ivParts = STAT_KEYS.filter(k => slot.ivs[k] !== 31).map(k => `${slot.ivs[k]} ${STAT_LABELS[k]}`);
        if (ivParts.length) lines.push(`IVs: ${ivParts.join(' / ')}`);
        slot.moves.filter(m => m).forEach(m => lines.push(`- ${m}`));
      }
      lines.push('');
    });
    if (!lines.length) { alert('Nenhum Pokémon configurado para exportar.'); return; }
    const teamName = document.getElementById('bld-team-name').value.trim() || 'time';
    App.showExportModal(lines.join('\n'), teamName);
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
          if (img) img.src = PokeAPI.spriteUrl(data.id);
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
    const STAT_MAP = { 'HP':'hp', 'Atk':'atk', 'Def':'def', 'SpA':'spa', 'SpD':'spd', 'Spe':'spe' };

    function parseStatStr(str, defaultVal, statMax) {
      const result = { hp:defaultVal, atk:defaultVal, def:defaultVal, spa:defaultVal, spd:defaultVal, spe:defaultVal };
      if (!str) return result;
      str.split('/').forEach(part => {
        const m = part.trim().match(/^(\d+)\s+(\S+)$/);
        if (!m) return;
        const key = STAT_MAP[m[2]];
        if (key) result[key] = statMax !== undefined ? Math.min(parseInt(m[1]), statMax) : parseInt(m[1]);
      });
      return result;
    }

    text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const maxSlots = isChampions ? 3 : SLOTS;
    return text.trim().split(/\n[ \t]*\n/).filter(b => b.trim()).slice(0, maxSlots).map(block => {
      const lines = block.trim().split('\n').map(l => l.trim()).filter(Boolean);
      if (!lines.length) return null;
      const header = lines[0];
      const inParen = header.match(/\(([^)]+)\)/);
      const rawName = inParen ? inParen[1].trim() : (header.split('@')[0]).trim();
      const itemM = header.match(/@\s*(.+)$/);
      const item = itemM ? itemM[1].trim() : '';
      let ability = '', teraType = '', nature = 'Hardy', evsStr = '', ivsStr = '', shiny = false;
      const moves = [];
      for (let i = 1; i < lines.length; i++) {
        const l = lines[i];
        if      (l.startsWith('Ability:'))   ability  = l.slice(8).trim();
        else if (l.startsWith('Tera Type:')) teraType = l.slice(10).trim();
        else if (l.startsWith('Shiny:'))     shiny    = l.slice(6).trim().toLowerCase() === 'yes';
        else if (l.startsWith('EVs:'))       evsStr   = l.slice(4).trim();
        else if (l.startsWith('IVs:'))       ivsStr   = l.slice(4).trim();
        else if (l.endsWith('Nature'))       nature   = l.split(' ')[0];
        else if (l.startsWith('- ') && moves.length < 4) moves.push(l.slice(2).trim());
      }
      return {
        name: rawName,
        item,
        ability,
        teraType,
        shiny,
        nature: Object.keys(NATURES).includes(nature) ? nature : 'Hardy',
        evs: parseStatStr(evsStr, 0, isChampions ? 32 : 252),
        ivs: parseStatStr(ivsStr, 31, 31),
        moves
      };
    }).filter(Boolean);
  }

  function applySmogonImport(parsed) {
    slots = Array.from({ length: SLOTS }, emptySlot);
    parsed.forEach((p, i) => {
      if (i >= SLOTS) return;
      slots[i].name     = p.name;
      slots[i].item     = p.item;
      slots[i].ability  = p.ability;
      slots[i].teraType = p.teraType;
      slots[i].shiny    = p.shiny || false;
      slots[i].nature   = p.nature;
      slots[i].evs      = p.evs;
      slots[i].ivs      = p.ivs;
      slots[i].moves    = p.moves.concat(['', '', '', '']).slice(0, 4);
    });
    renderSlots();
  }

  function clearAll() {
    editingTeamId = null;
    slots = Array.from({ length: SLOTS }, emptySlot);
    document.getElementById('bld-team-name').value = '';
    document.getElementById('bld-validation-box').classList.add('hidden');
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
      return true;
    } catch { return false; }
  }

  function loadTeam(team, editMode = true) {
    editingTeamId = editMode ? team.id : null;
    isChampions = !!(team.isChampions || team.format === 'champions');

    const champToggle = document.getElementById('bld-champions-toggle');
    if (champToggle) {
      champToggle.setAttribute('aria-pressed', isChampions);
      champToggle.classList.toggle('active', isChampions);
    }

    const formatSel = document.getElementById('bld-format');
    if (formatSel && team.format && team.format !== 'champions') formatSel.value = team.format;

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
  }

  function init() {
    slots = Array.from({ length: SLOTS }, emptySlot);

    // Preenche o select de formato (Champions excluído — gerenciado pelo toggle)
    const formatSel = document.getElementById('bld-format');
    formatSel.innerHTML = GAME_VERSIONS
      .filter(v => v.key !== 'champions')
      .map(v => `<option value="${v.key}">${v.label}</option>`)
      .join('');

    formatSel.addEventListener('change', () => { renderSlots(); });

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
    });

    renderSlots();

    document.getElementById('bld-validate-btn').addEventListener('click', validateAndSave);
    document.getElementById('bld-export-btn').addEventListener('click', exportText);
    document.getElementById('bld-clear-btn').addEventListener('click', clearAll);

    document.getElementById('bld-import-btn').addEventListener('click', () => {
      document.getElementById('bld-smogon-text').value = '';
      document.getElementById('bld-smogon-file').value = '';
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
      reader.onload = ev => { document.getElementById('bld-smogon-text').value = ev.target.result; };
      reader.readAsText(file);
    });
  }

  return { init, loadDraft, loadTeam, slots: () => slots, isChampions: () => isChampions };
})();
