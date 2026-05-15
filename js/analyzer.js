'use strict';

/**
 * analyzer.js — Analisador de cobertura e matchup de times
 * ----------------------------------------------------------
 * Ferramenta genérica: o usuário monta um time de até 6 Pokémon manualmente
 * ou importa via texto no formato Smogon. Calcula cobertura ofensiva (quais
 * tipos o time consegue atingir com efetividade) e matchup defensivo (quais
 * tipos ameaçam o time).
 *
 * Golpes sem nome são aceitos — o que importa para os cálculos é o tipo.
 * Autocomplete de golpes preenche o tipo automaticamente via PokéAPI,
 * mas o usuário pode ajustar manualmente via select.
 *
 * Fluxo de importação Smogon:
 *   texto → parseSmogon() → applyParsedToSlots() → fetchMoveTypesAsync()
 *   O fetch de tipos é assíncrono para não bloquear a renderização.
 *
 * Dependências: data.js (TYPES, POKEMON_DB, typeEff),
 *   api.js (PokeAPI), app.js (App.navigate).
 */

const Analyzer = (() => {
  const SLOTS = 6;
  // Cada slot: { name, type1, type2, tera, moves:[{mtype,status}] }
  let slots = [];

  // ── Build slot HTML ───────────────────────────────────────────
  function buildSlotHTML(i) {
    const typeOpts = TYPES.map(t => `<option value="${t}">${t}</option>`).join('');
    const movePills = [0,1,2,3].map(m => `
      <div class="move-row" data-slot="${i}" data-move="${m}">
        <div class="autocomplete-wrap">
          <input type="text" class="az-movename" placeholder="golpe ${m+1}" data-slot="${i}" data-move="${m}" autocomplete="off">
          <ul class="suggestions hidden az-move-sug" data-slot="${i}" data-move="${m}"></ul>
        </div>
        <div class="move-type-row">
          <select class="select-input az-mtype" data-slot="${i}" data-move="${m}">
            <option value="">— Tipo —</option>
            ${typeOpts}
          </select>
          <button class="status-btn${slots[i]?.moves[m]?.status ? ' active' : ''}" data-slot="${i}" data-move="${m}">Status</button>
        </div>
      </div>`).join('');

    return `<div class="pkmn-card" id="az-slot-${i}">
      <div class="pkmn-header">
        <div class="az-sprite-wrap" id="az-sprite-${i}">
          <div class="az-sprite-ph">?</div>
          <img class="az-sprite-img hidden" alt="">
        </div>
        <div class="autocomplete-wrap" style="flex:1">
          <input type="text" class="text-input az-pkmn-input" data-slot="${i}" placeholder="Pokémon #${i+1}" autocomplete="off">
          <ul class="suggestions hidden az-suggestions" data-slot="${i}"></ul>
          <div class="az-form-switcher" id="az-forms-${i}"></div>
        </div>
      </div>
      <div class="types-row" id="az-types-row-${i}">
        <select class="select-input az-type1" data-slot="${i}">
          <option value="">Tipo 1</option>${typeOpts}
        </select>
        <select class="select-input az-type2" data-slot="${i}">
          <option value="">Tipo 2</option>${typeOpts}
        </select>
        <select class="select-input az-tera" data-slot="${i}">
          <option value="">Tera</option>${typeOpts}
        </select>
      </div>
      <div class="divider-moves">Golpes (por tipo)</div>
      <div class="moves-grid">
        ${movePills}
      </div>
    </div>`;
  }

  function initSlots() {
    slots = Array.from({ length: SLOTS }, () => ({
      name: '', type1: '', type2: '', tera: '',
      moves: [0,1,2,3].map(() => ({ mtype: '', status: false, moveName: '' }))
    }));

    const grid = document.getElementById('az-team-grid');
    grid.innerHTML = Array.from({ length: SLOTS }, (_, i) => buildSlotHTML(i)).join('');

    // Configura autocomplete de Pokémon e golpes para cada slot
    for (let i = 0; i < SLOTS; i++) {
      const inputEl = grid.querySelector(`.az-pkmn-input[data-slot="${i}"]`);
      const suggestEl = grid.querySelector(`.az-suggestions[data-slot="${i}"]`);
      setupSlotAutocomplete(i, inputEl, suggestEl);
      for (let mi = 0; mi < 4; mi++) setupMoveAutocomplete(i, mi, grid);
    }

    // Selects de tipo e golpe
    grid.addEventListener('change', e => {
      const el = e.target;
      const si = parseInt(el.dataset.slot);
      if (isNaN(si)) return;
      if (el.classList.contains('az-type1')) slots[si].type1 = el.value;
      if (el.classList.contains('az-type2')) slots[si].type2 = el.value;
      if (el.classList.contains('az-tera'))  slots[si].tera  = el.value;
      if (el.classList.contains('az-mtype')) {
        const mi = parseInt(el.dataset.move);
        slots[si].moves[mi].mtype = el.value;
      }
      updateActionButtons();
    });

    // Inputs de nome de golpe
    grid.addEventListener('input', e => {
      const el = e.target;
      if (!el.classList.contains('az-movename')) return;
      const si = parseInt(el.dataset.slot);
      const mi = parseInt(el.dataset.move);
      if (!isNaN(si) && !isNaN(mi)) {
        slots[si].moves[mi].moveName = el.value;
        updateActionButtons();
      }
    });

    // Form navigator
    grid.addEventListener('click', e => {
      const navBtn = e.target.closest('.form-nav-btn');
      if (!navBtn) return;
      const si = parseInt(navBtn.dataset.slot);
      const dir = parseInt(navBtn.dataset.dir);
      const currentName = slots[si]?.name || grid.querySelector(`.az-pkmn-input[data-slot="${si}"]`)?.value || '';
      const base = FORM_BASE[currentName];
      if (!base) return;
      const forms = POKEMON_FORMS[base];
      if (!forms) return;
      const idx = forms.indexOf(currentName);
      const formName = forms[(idx + dir + forms.length) % forms.length];
      if (!POKEMON_DB[formName]) return;
      const inputEl = grid.querySelector(`.az-pkmn-input[data-slot="${si}"]`);
      if (inputEl) inputEl.value = formName;
      onSlotPokemonSelected(si, formName);
    });

    // Toggle de status do golpe
    grid.addEventListener('click', e => {
      const btn = e.target.closest('.status-btn');
      if (!btn) return;
      const si = parseInt(btn.dataset.slot);
      const mi = parseInt(btn.dataset.move);
      slots[si].moves[mi].status = !slots[si].moves[mi].status;
      const isStatus = slots[si].moves[mi].status;
      btn.classList.toggle('active', isStatus);
      const moveRow = btn.closest('.move-row');
      if (moveRow) {
        const nameInput  = moveRow.querySelector('.az-movename');
        const typeSelect = moveRow.querySelector('.az-mtype');
        if (nameInput)  nameInput.disabled  = isStatus;
        if (typeSelect) typeSelect.disabled = isStatus;
      }
    });
  }

  function showSlotSprite(si, id, name) {
    const wrap = document.getElementById(`az-sprite-${si}`);
    wrap.querySelector('.az-sprite-ph').classList.add('hidden');
    const img = wrap.querySelector('.az-sprite-img');
    img.src = PokeAPI.spriteUrl(id);
    img.alt = name;
    img.classList.remove('hidden');
  }

  function showSlotPlaceholder(si) {
    const wrap = document.getElementById(`az-sprite-${si}`);
    wrap.querySelector('.az-sprite-ph').classList.remove('hidden');
    wrap.querySelector('.az-sprite-img').classList.add('hidden');
  }

  function setupSlotAutocomplete(si, inputEl, suggestEl) {
    let debounce = null;

    inputEl.addEventListener('input', () => {
      clearTimeout(debounce);
      showSlotPlaceholder(si);
      refreshAzFormSwitcher(si, '');

      const q = inputEl.value.trim();
      if (!q) { suggestEl.classList.add('hidden'); return; }

      debounce = setTimeout(() => {
        const ql = q.toLowerCase();
        const matches = Object.entries(POKEMON_DB)
          .filter(([name]) => !FORM_VARIANTS.has(name) && name.toLowerCase().startsWith(ql))
          .slice(0, 12);

        if (!matches.length) { suggestEl.classList.add('hidden'); return; }

        suggestEl.innerHTML = matches.map(([name, types]) => {
          const pills = types.filter(Boolean)
            .map(t => `<span class="tpill t-${t}">${t}</span>`).join('');
          return `<li data-name="${name}" class="ac-item-rich">
            <span>${name}</span>
            <span class="ac-types">${pills}</span>
          </li>`;
        }).join('');
        suggestEl.classList.remove('hidden');
      }, 120);
    });

    suggestEl.addEventListener('mousedown', e => {
      const li = e.target.closest('li');
      if (!li) return;
      e.preventDefault();
      inputEl.value = li.dataset.name;
      suggestEl.classList.add('hidden');
      onSlotPokemonSelected(si, li.dataset.name);
    });

    inputEl.addEventListener('blur', () => {
      setTimeout(() => suggestEl.classList.add('hidden'), 150);
    });

    document.addEventListener('click', e => {
      if (!inputEl.contains(e.target) && !suggestEl.contains(e.target))
        suggestEl.classList.add('hidden');
    });
  }

  function setupMoveAutocomplete(si, mi, grid) {
    const moveInput = grid.querySelector(`.az-movename[data-slot="${si}"][data-move="${mi}"]`);
    const moveSug   = grid.querySelector(`.az-move-sug[data-slot="${si}"][data-move="${mi}"]`);
    if (!moveInput || !moveSug) return;

    moveInput.addEventListener('focus', () => {
      PokeAPI.ensureMoveList().catch(() => {});
    });

    let debounce = null;
    moveInput.addEventListener('input', () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => {
        const q = moveInput.value.trim().toLowerCase();
        if (q.length < 2) { moveSug.classList.add('hidden'); return; }
        moveSug.innerHTML = '<li class="sug-loading">Carregando golpes…</li>';
        moveSug.classList.remove('hidden');
        PokeAPI.ensureMoveList()
          .then(list => {
            const currentQ = moveInput.value.trim().toLowerCase();
            if (currentQ.length < 2) { moveSug.classList.add('hidden'); return; }
            const matches = list.filter(n => n.toLowerCase().startsWith(currentQ)).slice(0, 8);
            if (!matches.length) { moveSug.classList.add('hidden'); return; }
            moveSug.innerHTML = matches.map(n => `<li data-name="${n}">${n}</li>`).join('');
            moveSug.classList.remove('hidden');
            PokeAPI.getMovesInfo(matches)
              .then(typesMap => {
                if (moveSug.classList.contains('hidden')) return;
                moveSug.innerHTML = matches.map(n => {
                  const info = typesMap[n];
                  const badge = info ? ` <span class="tc t-${info.type} tc-dim">${info.type}</span>` : '';
                  return `<li data-name="${n}">${n}${badge}</li>`;
                }).join('');
              })
              .catch(() => {});
          })
          .catch(err => {
            console.error('[MoveList] falha ao carregar:', err);
            moveSug.innerHTML = `<li class="sug-error">Erro: ${err?.message || 'falha'}</li>`;
          });
      }, 150);
    });

    // mousedown + preventDefault: evita que o blur do input feche o dropdown
    // antes que o clique na sugestão seja registrado
    moveSug.addEventListener('mousedown', e => {
      const li = e.target.closest('li[data-name]');
      if (!li) return;
      e.preventDefault();
      const name = li.dataset.name;
      moveInput.value = name;
      slots[si].moves[mi].moveName = name;
      moveSug.classList.add('hidden');
      updateActionButtons();
      PokeAPI.getMoveInfo(name).then(info => {
        if (!info) return;
        const card = document.getElementById(`az-slot-${si}`);
        if (!card) return;
        slots[si].moves[mi].mtype  = info.type;
        slots[si].moves[mi].status = info.status;
        const typeEl   = card.querySelector(`.az-mtype[data-slot="${si}"][data-move="${mi}"]`);
        const statusEl = card.querySelector(`.status-btn[data-slot="${si}"][data-move="${mi}"]`);
        if (typeEl)   { typeEl.value = info.type; typeEl.disabled = info.status; }
        if (statusEl) statusEl.classList.toggle('active', info.status);
        if (info.status) moveInput.disabled = true;
      }).catch(() => {});
    });

    moveInput.addEventListener('blur', () => {
      setTimeout(() => moveSug.classList.add('hidden'), 150);
    });

    document.addEventListener('click', e => {
      if (!moveInput.contains(e.target) && !moveSug.contains(e.target))
        moveSug.classList.add('hidden');
    });
  }

  function refreshAzFormSwitcher(si, name) {
    const el = document.getElementById(`az-forms-${si}`);
    if (el) el.innerHTML = buildFormNavHTML(name, si);
  }

  function onSlotPokemonSelected(si, name) {
    const entry = POKEMON_DB[name];
    slots[si].name = name;
    if (entry) {
      slots[si].type1 = entry[0] || '';
      slots[si].type2 = entry[1] || '';
      const card = document.getElementById(`az-slot-${si}`);
      card.querySelector(`.az-type1[data-slot="${si}"]`).value = slots[si].type1;
      card.querySelector(`.az-type2[data-slot="${si}"]`).value = slots[si].type2;
    }
    refreshAzFormSwitcher(si, name);
    const _res = spriteApiName(name);
    PokeAPI.getPokemon(_res)
      .then(data => showSlotSprite(si, data.id, name))
      .catch(() => _res !== name
        ? PokeAPI.getPokemon(name).then(data => showSlotSprite(si, data.id, name)).catch(() => showSlotPlaceholder(si))
        : showSlotPlaceholder(si));
    updateActionButtons();
  }

  // ── Import / Transfer ─────────────────────────────────────────

  function normalizePokeName(raw) {
    if (!raw) return '';
    if (POKEMON_DB[raw]) return raw;
    const cap = raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
    if (POKEMON_DB[cap]) return cap;
    const lower = raw.toLowerCase();
    return Object.keys(POKEMON_DB).find(k => k.toLowerCase() === lower) || '';
  }

  function parseSmogon(text) {
    text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    return text.trim().split(/\n[ \t]*\n/).filter(b => b.trim()).slice(0, SLOTS).map(block => {
      const lines = block.trim().split('\n').map(l => l.trim()).filter(Boolean);
      if (!lines.length) return null;

      // Cabeçalho: "Espécie @ Item" ou "Apelido (Espécie) @ Item"
      const header = lines[0];
      const inParen = header.match(/\(([^)]+)\)/);
      const rawName = inParen ? inParen[1].trim() : (header.split('@')[0]).trim();

      const itemM = header.match(/@\s*(.+)$/);
      const item = itemM ? itemM[1].trim() : '';

      let ability = '', tera = '', nature = '', evs = '', ivs = '';
      const moves = [];

      for (let i = 1; i < lines.length; i++) {
        const l = lines[i];
        if      (l.startsWith('Ability:'))   ability = l.slice(8).trim();
        else if (l.startsWith('Tera Type:')) tera    = l.slice(10).trim();
        else if (l.startsWith('EVs:'))       evs     = l.slice(4).trim();
        else if (l.startsWith('IVs:'))       ivs     = l.slice(4).trim();
        else if (l.endsWith('Nature'))       nature  = l.split(' ')[0];
        else if (l.startsWith('- ') && moves.length < 4) moves.push(l.slice(2).trim());
      }

      return { species: rawName, item, ability, tera, nature, evs, ivs, moves };
    }).filter(Boolean);
  }

  function applyParsedToSlots(parsed) {
    initSlots();

    parsed.slice(0, SLOTS).forEach((p, i) => {
      const name = normalizePokeName(p.species);
      slots[i].name  = name || p.species;
      slots[i].tera  = TYPES.includes(p.tera) ? p.tera : '';

      const entry = POKEMON_DB[name] || POKEMON_DB[p.species] || null;
      if (entry) {
        slots[i].type1 = entry[0] || '';
        slots[i].type2 = entry[1] || '';
      }

      p.moves.forEach((moveName, mi) => {
        if (mi >= 4) return;
        slots[i].moves[mi].moveName = moveName;
      });

      const card = document.getElementById(`az-slot-${i}`);
      if (!card) return;

      card.querySelector(`.az-pkmn-input[data-slot="${i}"]`).value = slots[i].name;
      card.querySelector(`.az-type1[data-slot="${i}"]`).value = slots[i].type1;
      card.querySelector(`.az-type2[data-slot="${i}"]`).value = slots[i].type2;
      card.querySelector(`.az-tera[data-slot="${i}"]`).value  = slots[i].tera;

      slots[i].moves.forEach((mv, mi) => {
        const nameEl   = card.querySelector(`.az-movename[data-slot="${i}"][data-move="${mi}"]`);
        const typeEl   = card.querySelector(`.az-mtype[data-slot="${i}"][data-move="${mi}"]`);
        const statusEl = card.querySelector(`.status-btn[data-slot="${i}"][data-move="${mi}"]`);
        if (nameEl)   { nameEl.value = mv.moveName; nameEl.disabled = mv.status; }
        if (typeEl)   { typeEl.value = mv.mtype; typeEl.disabled = mv.status; }
        if (statusEl)   statusEl.classList.toggle('active', mv.status);
      });

      if (name) {
        const _resI = spriteApiName(name);
        PokeAPI.getPokemon(_resI)
          .then(data => showSlotSprite(i, data.id, name))
          .catch(() => _resI !== name
            ? PokeAPI.getPokemon(name).then(data => showSlotSprite(i, data.id, name)).catch(() => showSlotPlaceholder(i))
            : showSlotPlaceholder(i));
      }
    });

    updateActionButtons();
    fetchMoveTypesAsync(parsed);
  }

  /**
   * Busca tipos de todos os golpes importados em paralelo e atualiza a UI.
   * Chamado após applyParsedToSlots() para não bloquear a renderização inicial.
   * Re-renderiza cobertura e matchup ao terminar se os resultados já estiverem visíveis.
   */
  async function fetchMoveTypesAsync(parsed) {
    const allNames = [];
    parsed.slice(0, SLOTS).forEach(p =>
      p.moves.forEach(name => { if (name) allNames.push(name); })
    );
    if (!allNames.length) return;

    const infoMap = await PokeAPI.getMovesInfo(allNames);

    parsed.slice(0, SLOTS).forEach((p, i) => {
      const card = document.getElementById(`az-slot-${i}`);
      if (!card) return;
      p.moves.forEach((moveName, mi) => {
        if (mi >= 4 || !moveName) return;
        const info = infoMap[moveName];
        if (!info) return;
        slots[i].moves[mi].mtype  = info.type;
        slots[i].moves[mi].status = info.status;
        const typeEl   = card.querySelector(`.az-mtype[data-slot="${i}"][data-move="${mi}"]`);
        const nameEl   = card.querySelector(`.az-movename[data-slot="${i}"][data-move="${mi}"]`);
        const statusEl = card.querySelector(`.status-btn[data-slot="${i}"][data-move="${mi}"]`);
        if (typeEl)   { typeEl.value = info.type; typeEl.disabled = info.status; }
        if (nameEl)   nameEl.disabled = info.status;
        if (statusEl) statusEl.classList.toggle('active', info.status);
      });
    });

    // Re-renderiza cobertura e matchup após tipos dos golpes carregarem
    const resultsEl = document.getElementById('az-results');
    if (!resultsEl?.classList.contains('hidden')) {
      const covTera = document.getElementById('az-cov-tera-toggle')?.getAttribute('aria-pressed') === 'true';
      renderCoverage(covTera,
        document.getElementById('az-cov-sum'),
        document.getElementById('az-cov-grid')
      );
      renderMatchup();
    }
  }

  async function renderSavedList() {
    const listEl = document.getElementById('az-saved-list');
    listEl.innerHTML = '<p style="color:var(--text2);font-size:0.85rem">Carregando…</p>';
    let teams;
    try { teams = await TeamStorage.getTeams(); } catch { teams = []; }
    if (!teams.length) {
      listEl.innerHTML = '<p style="color:var(--text2);font-size:0.85rem">Nenhum time salvo encontrado.</p>';
      return;
    }
    listEl.innerHTML = teams.map((team, idx) => {
      const date = team.created ? new Date(team.created).toLocaleDateString('pt-BR') : '';
      const sprites = (team.members || []).slice(0, 6).map(m =>
        `<img src="https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/0.png"
          class="tc-sprite" data-name="${m.name}" alt="${m.name}" loading="lazy">`
      ).join('');
      return `<div class="saved-team-item">
        <div class="saved-team-info">
          <span class="saved-team-name">${team.name || `Time ${idx + 1}`}</span>
          <span class="saved-team-date">${date}</span>
        </div>
        <div class="team-card-sprites" id="az-imp-spr-${team.id}">${sprites}</div>
        <button class="btn-secondary btn-sm" data-load="${idx}">Carregar</button>
      </div>`;
    }).join('');

    teams.forEach(team => {
      (team.members || []).slice(0, 6).forEach(m => {
        if (!m.name) return;
        PokeAPI.getPokemon(m.name).then(data => {
          const wrap = document.getElementById(`az-imp-spr-${team.id}`);
          if (!wrap) return;
          const img = wrap.querySelector(`[data-name="${m.name}"]`);
          if (img) img.src = PokeAPI.spriteUrl(data.id);
        }).catch(() => {});
      });
    });

    listEl.querySelectorAll('[data-load]').forEach(btn => {
      btn.addEventListener('click', () => {
        const team = teams[parseInt(btn.dataset.load)];
        const parsed = (team.members || []).map(m => ({
          species: m.name || '',
          tera: m.teraType || '',
          moves: m.moves || []
        }));
        applyParsedToSlots(parsed);
        closeImportModal();
      });
    });
  }

  function openImportModal() {
    document.getElementById('az-import-modal').classList.remove('hidden');
    switchImportTab('smogon');
    renderSavedList();
  }

  function closeImportModal() {
    document.getElementById('az-import-modal').classList.add('hidden');
    document.getElementById('az-smogon-text').value = '';
  }

  function switchImportTab(tab) {
    document.querySelectorAll('.modal-tab-sm').forEach(t =>
      t.classList.toggle('active', t.dataset.itab === tab));
    document.getElementById('az-itab-smogon').classList.toggle('hidden', tab !== 'smogon');
    document.getElementById('az-itab-saved').classList.toggle('hidden', tab !== 'saved');
  }

  function updateActionButtons() {
    const hasAnything = slots.some(s =>
      s.name || s.type1 || s.type2 || s.tera ||
      s.moves.some(m => m.mtype || m.moveName)
    );
    const hasFullPokemon = slots.some(s => s.name);
    document.getElementById('az-clear-btn').disabled      = !hasAnything;
    document.getElementById('az-to-builder-btn').disabled = !hasFullPokemon;
  }

  function transferToBuilder() {
    const hasAny = slots.some(s => s.name || s.type1 || s.type2);
    if (!hasAny) { alert('Preencha ao menos um Pokémon antes de transferir.'); return; }

    const draft = slots.map(s => ({
      species: s.name,
      type1: s.type1,
      type2: s.type2,
      tera: s.tera,
      moves: s.moves.map(m => m.moveName)
    }));

    try { localStorage.setItem('az_team_draft', JSON.stringify(draft)); } catch {}

    const btn = document.querySelector('.nav-btn[data-view="builder"]');
    if (btn) btn.click();
  }

  // ── Analysis logic ────────────────────────────────────────────

  // Regra padrão SV: sem Tera selecionado, o tipo Tera é o Tipo 1
  function effectiveTera(slot) {
    return slot.tera || slot.type1;
  }

  // Retorna os tipos defensivos do slot (com ou sem Terastalização)
  function defTypes(slot, useTera) {
    if (useTera && slot.tera) return [slot.tera];
    return [slot.type1, slot.type2].filter(Boolean);
  }

  // Retorna os tipos de golpe que contam como STAB para o slot
  // useTera: whether we consider Tera Blast
  function getEffectiveMoves(slot, useTera) {
    return slot.moves
      .filter(m => m.mtype && !m.status)
      .map(m => {
        let mult = 1;
        if (useTera) {
          const tera = effectiveTera(slot);
          if (tera) {
            // Com Tera: STAB apenas para o tipo Tera
            if (m.mtype === tera) {
              const originalTypes = [slot.type1, slot.type2].filter(Boolean);
              mult = originalTypes.includes(tera) ? 2.0 : 1.5;
            }
            // Golpes de outros tipos: sem STAB com Tera ativo
          }
        } else {
          // STAB normal (sem Tera)
          const origTypes = [slot.type1, slot.type2].filter(Boolean);
          if (origTypes.includes(m.mtype)) mult = 1.5;
        }
        return { mtype: m.mtype, stab: mult };
      });
  }

  // Coverage: efetividade de tipo pura (sem STAB no mult). STAB é indicador separado.
  // Com Tera: Tera type é terceiro tipo ofensivo — nunca remove cobertura existente.
  function computeCoverage(useTera) {
    const result = {};
    TYPES.forEach(def => { result[def] = { mult: 0, contribs: [] }; });

    for (let si = 0; si < slots.length; si++) {
      const slot = slots[si];
      if (![slot.type1, slot.type2].some(Boolean)) continue;
      const name = slot.name || `Slot ${si + 1}`;
      const origTypes = [slot.type1, slot.type2].filter(Boolean);
      const movesToCheck = slot.moves
        .filter(m => m.mtype && !m.status)
        .map(m => ({ mtype: m.mtype, isStab: origTypes.includes(m.mtype) }));
      if (useTera && slot.tera) {
        const existing = movesToCheck.find(m => m.mtype === slot.tera);
        if (existing) existing.isStab = true;
        else movesToCheck.push({ mtype: slot.tera, isStab: true });
      }
      for (const { mtype, isStab } of movesToCheck) {
        for (const defT of TYPES) {
          const eff = typeEff(mtype, [defT]);
          if (eff < result[defT].mult) continue;
          if (eff > result[defT].mult) result[defT] = { mult: eff, contribs: [] };
          if (eff > 0 && !result[defT].contribs.find(c => c.si === si && c.mtype === mtype))
            result[defT].contribs.push({ si, name, mtype, isStab });
        }
      }
    }
    return result;
  }

  // Fraqueza do time: por tipo atacante, quantos membros são fracos?
  function computeTeamWeakness(useTera) {
    return TYPES.map(atkType => {
      const row = { atkType, slots: [] };
      for (const slot of slots) {
        const dt = defTypes(slot, useTera);
        if (!dt.length) { row.slots.push(null); continue; }
        const m = typeEff(atkType, dt);
        row.slots.push(m);
      }
      row.weakCount = row.slots.filter(m => m !== null && m >= 2).length;
      return row;
    }).sort((a, b) => a.atkType.localeCompare(b.atkType));
  }

  // Matchup ofensivo: por tipo defensor, quem tem SE e quem tem neutro + nome do golpe
  function computeOffensiveMatchup(useTera) {
    return TYPES.map(defT => {
      const se = [], neutral = [];
      for (let si = 0; si < slots.length; si++) {
        const slot = slots[si];
        if (![slot.type1, slot.type2].some(Boolean)) continue;
        const name = slot.name || `Slot ${si + 1}`;
        const origTypes = [slot.type1, slot.type2].filter(Boolean);

        // Candidatos: moves reais + Tera Blast virtual se useTera
        const candidates = slot.moves
          .filter(m => m.mtype && !m.status)
          .map(m => ({ mtype: m.mtype, moveName: m.moveName || '', isStab: origTypes.includes(m.mtype) }));
        if (useTera && slot.tera) {
          const existing = candidates.find(c => c.mtype === slot.tera);
          if (existing) existing.isStab = true;
          else candidates.push({ mtype: slot.tera, moveName: 'Tera Blast', isStab: true });
        }

        let bestEff = 0, bestEntry = null;
        for (const c of candidates) {
          const eff = typeEff(c.mtype, [defT]);
          if (eff > bestEff || (eff === bestEff && c.isStab && bestEntry && !bestEntry.isStab)) {
            bestEff = eff;
            bestEntry = c;
          }
        }

        if (!bestEntry) continue;
        const defEff = typeEff(defT, origTypes);
        const entry = { name, ...bestEntry, defEff };
        if (bestEff >= 2)       se.push({ ...entry, eff: bestEff });
        else if (bestEff === 1) neutral.push({ ...entry, eff: bestEff });
      }
      return { type: defT, se, neutral };
    });
  }


  // ── Render helpers ────────────────────────────────────────────
  function slotLabel(si) {
    const s = slots[si];
    return s.name || `Slot ${si + 1}`;
  }

  function coverageCellClass(mult) {
    if (mult === 0) return 'cell-imm';
    if (mult < 1) return 'cell-res';
    if (mult >= 4) return 'cell-qd';
    if (mult >= 2) return 'cell-dbl';
    return 'cell-neu';
  }

  function renderCoverage(useTera, sumEl, gridEl) {
    const result = computeCoverage(useTera);

    const se = [], neu = [], gap = [];
    TYPES.forEach(t => {
      const m = result[t].mult;
      if (m >= 2)    se.push(t);
      else if (m >= 1) neu.push(t);
      else           gap.push(t);
    });
    se.sort();  neu.sort();  gap.sort();

    // Resumo: 3 contadores (SE, neutro, sem cobertura)
    sumEl.innerHTML = `
      <div class="sum-item s-g"><span class="cnt">${se.length}</span><span class="lbl">Super Efetivo</span></div>
      <div class="sum-item s-y"><span class="cnt">${neu.length}</span><span class="lbl">Neutro</span></div>
      <div class="sum-item s-r"><span class="cnt">${gap.length}</span><span class="lbl">Sem Cobertura</span></div>
      <div class="note-bar" style="margin-top:12px;grid-column:1/-1">★ = STAB — ao menos um Pokémon do time cobre esse tipo com um golpe do mesmo tipo que o dele, recebendo bônus de dano.</div>
    `;

    // Grade em 3 seções
    const chip = (t, hasStab) =>
      `<span class="tc t-${t}">${t}${hasStab ? '<span class="stab-star">★</span>' : ''}</span>`;

    gridEl.innerHTML = `
      <div class="cov-section cov-g">
        <h3>✓ Super Efetivo (${se.length})</h3>
        <div class="type-list">${se.length
          ? se.map(t => chip(t, result[t].contribs.some(c => c.isStab))).join('')
          : '<span class="empty">nenhum</span>'}</div>
      </div>
      <div class="cov-section cov-y">
        <h3>◎ Neutro (${neu.length})</h3>
        <div class="type-list">${neu.length
          ? neu.map(t => chip(t, result[t].contribs.some(c => c.isStab))).join('')
          : '<span class="empty">nenhum</span>'}</div>
      </div>
      <div class="cov-section cov-r">
        <h3>✗ Gap (${gap.length})</h3>
        <div class="type-list">${gap.length
          ? gap.map(t => `<span class="tc t-${t}">${t}</span>`).join('')
          : '<span class="empty">cobertura perfeita!</span>'}</div>
      </div>
    `;

  }

  function renderMatchup() {
    const content = document.getElementById('az-matchup-content');
    const toggleBtn = document.getElementById('az-om-tera-toggle');
    const useTera = toggleBtn?.getAttribute('aria-pressed') === 'true';
    const omData = computeOffensiveMatchup(useTera);

    const hasAny = slots.some(s => s.type1 || s.type2);
    if (!hasAny) { content.innerHTML = '<p style="color:var(--text-dim)">Nenhum Pokémon configurado.</p>'; return; }

    const seCount  = omData.filter(d => d.se.length > 0).length;
    const neuCount = omData.filter(d => d.se.length === 0 && d.neutral.length > 0).length;
    const gapCount = omData.filter(d => d.se.length === 0 && d.neutral.length === 0).length;

    const titleCase = s => s.replace(/[-_]+/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());

    // Score composto: efetividade ofensiva × segurança defensiva
    // offVal: SE+STAB=3, SE=2, Neutro=1
    // defVal: imune=4, ¼×=3, ½×=2, 1×=1, 2×=-1, 4×=-3
    const entryScore = e => {
      const offVal = e.eff >= 2 ? (e.isStab ? 3 : 2) : 1;
      const defVal = e.defEff === 0 ? 4 : e.defEff <= 0.25 ? 3 : e.defEff <= 0.5 ? 2 : e.defEff === 1 ? 1 : e.defEff === 2 ? -1 : -3;
      return offVal * 2 + defVal;
    };

    // Linha única com todos os contribuidores separados por vírgula
    const makeContribs = entries =>
      entries.map(({ name, moveName, mtype, isStab, eff }) => {
        const isSE = eff >= 2;
        const isTop = isSE && isStab;
        const chipCls = isTop ? 'om-chip-stab' : isSE ? 'om-chip-se' : 'om-chip-neu';
        const effLabel = eff >= 2 ? '2×' : '1×';
        const effStr = `${effLabel}${isStab ? '★' : ''}`;
        const move = titleCase(moveName || mtype);
        return `<span class="om-chip ${chipCls}">${name} <span class="om-eff">${effStr}</span></span> (<span class="tc t-${mtype} tc-dim">${move}</span>)`;
      }).join(', ');

    // Ordenação: gaps primeiro, só-neutro, depois SE
    const sorted = [...omData].sort((a, b) => {
      const score = x => x.se.length > 0 ? 2 : x.neutral.length > 0 ? 1 : 0;
      return score(a) - score(b);
    });

    const rows = sorted.map(({ type, se, neutral }) => {
      const all = [...se, ...neutral];
      const isGap = all.length === 0;
      let cell;
      if (isGap) {
        cell = `<span class="om-badge om-badge-gap">⚠ sem cobertura</span>`;
      } else {
        const maxScore = Math.max(...all.map(entryScore));
        cell = makeContribs(all.filter(e => entryScore(e) === maxScore));
      }
      return `<tr class="${isGap ? 'row-warn' : ''}">
        <td style="white-space:nowrap"><span class="tpill t-${type}">${type}</span></td>
        <td>${cell}</td>
      </tr>`;
    }).join('');

    content.innerHTML = `
      <div class="sum-bar s3" style="margin-bottom:16px">
        <div class="sum-item s-g"><span class="cnt">${seCount}</span><span class="lbl">Super Efetivo</span></div>
        <div class="sum-item s-y"><span class="cnt">${neuCount}</span><span class="lbl">Neutro</span></div>
        <div class="sum-item s-r"><span class="cnt">${gapCount}</span><span class="lbl">Sem Cobertura</span></div>
      </div>
      <div class="note-bar">Melhor resposta por tipo adversário. SE = super efetivo. ★ = STAB. <span style="color:var(--red)">Vermelho</span> = SE+STAB. <span style="color:var(--yellow)">Amarelo</span> = SE s/ STAB. Sugestão considera o tipo defensivo do atacante.</div>
      <div style="overflow-x:auto;">
        <table class="dtable">
          <thead><tr><th>Tipo Alvo</th><th>Melhor Resposta</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  }

  function renderWeakness(useTera) {
    const content = document.getElementById('az-weakness-content');
    const rows = computeTeamWeakness(useTera);
    const activeSlots = slots.filter(s => s.type1 || s.type2);

    if (!activeSlots.length) { content.innerHTML = '<p style="color:var(--text-dim)">Nenhum Pokémon configurado.</p>'; return; }

    // Contagem total por célula (slot × tipo): fiel ao dado real de cada Pokémon
    let immTotal = 0, resTotal = 0, neuTotal = 0, dblTotal = 0, qdTotal = 0;
    rows.forEach(row => row.slots.forEach(m => {
      if (m === null) return;
      if (m === 0)       immTotal++;
      else if (m <= 0.5) resTotal++;
      else if (m === 1)  neuTotal++;
      else if (m === 2)  dblTotal++;
      else               qdTotal++;
    }));
    const n = activeSlots.length || 1;
    const avg = v => (v / n).toFixed(1);

    const slotNames = slots.map((s, i) => slotLabel(i));
    const tableRows = rows.map(row => {
      const immCount = row.slots.filter(m => m === 0).length;
      const rowClass = row.weakCount >= 3 ? 'row-warn' : immCount >= 2 ? 'row-ok' : '';
      return `<tr class="${rowClass}">
        <td class="td-type"><span class="tpill t-${row.atkType}">${row.atkType}</span></td>
        ${row.slots.map(m => {
          if (m === null) return '<td style="text-align:center"><span class="cell-neu">—</span></td>';
          if (m === 0)    return '<td style="text-align:center"><span class="cell-imm">0×</span></td>';
          if (m <= 0.25)  return '<td style="text-align:center"><span class="cell-res">¼×</span></td>';
          if (m <= 0.5)   return '<td style="text-align:center"><span class="cell-res">½×</span></td>';
          if (m === 1)    return '<td style="text-align:center"><span class="cell-neu">1×</span></td>';
          if (m === 2)    return '<td style="text-align:center"><span class="cell-dbl">2×</span></td>';
          return               '<td style="text-align:center"><span class="cell-qd">4×</span></td>';
        }).join('')}
      </tr>`;
    }).join('');

    content.innerHTML = `
      <div class="sum-bar s4" style="margin-bottom:16px">
        <div class="sum-item s-imm"><span class="cnt">${immTotal}</span><span class="lbl">Imune</span><span class="sum-sub">(${avg(immTotal)} / mbr)</span></div>
        <div class="sum-item s-hlf"><span class="cnt">${resTotal}</span><span class="lbl">Resiste</span><span class="sum-sub">(${avg(resTotal)} / mbr)</span></div>
        <div class="sum-item s-dbl"><span class="cnt">${dblTotal}</span><span class="lbl">2×</span><span class="sum-sub">(${avg(dblTotal)} / mbr)</span></div>
        <div class="sum-item s-qd"><span class="cnt">${qdTotal}</span><span class="lbl">4×</span><span class="sum-sub">(${avg(qdTotal)} / mbr)</span></div>
      </div>
      <div class="note-bar" style="margin-bottom:12px">mbr = média por membro. Referência: Imune ≥2 ótimo, &lt;1 fraco. Resiste ≥4 ótimo, &lt;2 fraco. 2× &lt;2 bom, &gt;3 crítico. 4× &lt;0.5 aceitável, ≥1 crítico.<br>Linha <span style="color:var(--red)">Vermelha</span>: 3+ membros expostos ao mesmo tipo. Linha <span style="color:var(--green)">Verde</span>: 2+ membros imunes.</div>
      <div style="overflow-x:auto;">
        <table class="wtable">
          <thead>
            <tr>
              <th class="th-type">Tipo Atk</th>
              ${slotNames.map(n => `<th>${n.length > 8 ? n.slice(0, 7) + '…' : n}</th>`).join('')}
            </tr>
          </thead>
          <tbody>${tableRows}</tbody>
        </table>
      </div>
    `;
  }

  function renderSynergy() {
    const content = document.getElementById('az-synergy-content');
    const useTera = document.getElementById('az-tera-toggle').checked;

    // Coleta fraquezas usando tipos base (sem tera)
    const byType = {};
    for (let si = 0; si < slots.length; si++) {
      const slot = slots[si];
      const dt = [slot.type1, slot.type2].filter(Boolean);
      if (!dt.length) continue;
      const name = slot.name || `Slot ${si + 1}`;
      getActiveTypes().forEach(atk => {
        const m = typeEff(atk, dt);
        if (m >= 2) {
          if (!byType[atk]) byType[atk] = { weakMembers: [], covers: [] };
          if (!byType[atk].weakMembers.find(w => w.name === name))
            byType[atk].weakMembers.push({ name, mult: m });
        }
      });
    }

    // Encontra quem cobre cada fraqueza (resiste ou imune), excluindo quem é fraco
    Object.keys(byType).forEach(atk => {
      const weakNames = new Set(byType[atk].weakMembers.map(m => m.name));
      for (let si = 0; si < slots.length; si++) {
        const slot = slots[si];
        const slotName = slot.name || `Slot ${si + 1}`;
        if (weakNames.has(slotName)) continue;
        const dt = useTera && slot.tera ? [slot.tera] : [slot.type1, slot.type2].filter(Boolean);
        if (!dt.length) continue;
        const m = typeEff(atk, dt);
        if (m < 1) {
          const baseDt = [slot.type1, slot.type2].filter(Boolean);
          const isTera = useTera && !!slot.tera && baseDt.length > 0 && typeEff(atk, baseDt) >= 1;
          byType[atk].covers.push({ name: slotName, m, isTera });
        }
      }
    });

    // Monta lista com tipos válidos na geração ativa
    const entries = getActiveTypes().map(atk => {
      const data = byType[atk] || { weakMembers: [], covers: [] };
      return [atk, data];
    }).sort((a, b) => {
      const [, da] = a; const [, db] = b;
      const safeA = da.weakMembers.length === 0 ? 1 : 0;
      const safeB = db.weakMembers.length === 0 ? 1 : 0;
      if (safeA !== safeB) return safeA - safeB; // seguros por último
      const gapA = da.covers.length === 0 ? 1 : 0;
      const gapB = db.covers.length === 0 ? 1 : 0;
      if (gapA !== gapB) return gapB - gapA; // buracos primeiro
      return db.weakMembers.length - da.weakMembers.length;
    });

    content.innerHTML = entries.map(([atk, { weakMembers, covers }]) => {
      const isSafe = weakMembers.length === 0;
      const isGap  = !isSafe && covers.length === 0;
      if (isSafe) {
        return `<div class="syn-item syn-safe">
          <div class="syn-header">
            <span class="tpill t-${atk}">${atk}</span>
            <span class="syn-safe-label">✓ ninguém é fraco</span>
          </div>
        </div>`;
      }
      const coverChips = covers.map(c =>
        `<span class="who-chip ${c.m === 0 ? 'immune' : 'resist'}">${c.name} <span class="mult ${c.m === 0 ? 'm-immune' : 'm-half'}">${c.m === 0 ? '0×' : c.m <= 0.25 ? '¼×' : '½×'}</span>${c.isTera ? '<span style="color:var(--tera);font-size:0.7rem"> ✦</span>' : ''}</span>`
      ).join('');
      return `<div class="syn-item ${isGap ? 'syn-gap' : 'syn-ok'}">
        <div class="syn-header">
          <span class="tpill t-${atk}">${atk}</span>
          <span class="syn-who">fraco: ${weakMembers.map(m => `${m.name} <span class="mult ${m.mult >= 4 ? 'm-quad' : 'm-double'}">${m.mult}×</span>`).join(', ')}</span>
          ${isGap ? '<span class="gap-label">⚠ sem cobertura</span>' : ''}
        </div>
        <div class="syn-covers">
          ${covers.length ? coverChips : '<span class="who-chip gap">⚠ sem cobertura</span>'}
        </div>
      </div>`;
    }).join('');
  }

  // ── Main analyze ──────────────────────────────────────────────
  function analyze() {
    const hasAny = slots.some(s => s.type1 || s.type2 || s.name);
    if (!hasAny) { alert('Configure pelo menos um Pokémon.'); return; }

    const resultsEl = document.getElementById('az-results');
    resultsEl.classList.remove('hidden');

    const covTera = document.getElementById('az-cov-tera-toggle')?.getAttribute('aria-pressed') === 'true';
    renderCoverage(covTera,
      document.getElementById('az-cov-sum'),
      document.getElementById('az-cov-grid')
    );
    renderMatchup();
    const useTera = document.getElementById('az-tera-toggle').checked;
    renderWeakness(useTera);
    renderSynergy();

    resultsEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function clearAll() {
    initSlots();
    document.getElementById('az-results').classList.add('hidden');
    updateActionButtons();
  }

  function init() {
    initSlots();

    document.getElementById('az-analyze-btn').addEventListener('click', analyze);
    document.getElementById('az-clear-btn').addEventListener('click', clearAll);
    document.getElementById('az-import-btn').addEventListener('click', openImportModal);
    document.getElementById('az-to-builder-btn').addEventListener('click', transferToBuilder);

    // Controles do modal de importação
    document.getElementById('az-import-cancel').addEventListener('click', closeImportModal);
    document.getElementById('az-import-cancel2').addEventListener('click', closeImportModal);
    document.getElementById('az-import-modal').addEventListener('click', e => {
      if (e.target === e.currentTarget) closeImportModal();
    });

    // Troca de abas dentro do modal
    document.querySelectorAll('.modal-tab-sm').forEach(btn => {
      btn.addEventListener('click', () => switchImportTab(btn.dataset.itab));
    });

    // Importação por texto Smogon
    document.getElementById('az-smogon-import').addEventListener('click', () => {
      const text = document.getElementById('az-smogon-text').value.trim();
      if (!text) { alert('Cole o texto Smogon antes de importar.'); return; }
      const parsed = parseSmogon(text);
      if (!parsed.length) { alert('Nenhum Pokémon detectado no texto. Verifique o formato.'); return; }
      applyParsedToSlots(parsed);
      closeImportModal();
    });

    // Upload de arquivo
    document.getElementById('az-smogon-file').addEventListener('change', e => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = ev => {
        document.getElementById('az-smogon-text').value = ev.target.result;
      };
      reader.readAsText(file, 'utf-8');
      e.target.value = '';
    });

    document.getElementById('az-tera-toggle').checked = false;

    document.getElementById('az-tera-toggle').addEventListener('change', () => {
      const resultsEl = document.getElementById('az-results');
      if (!resultsEl.classList.contains('hidden')) {
        const useTera = document.getElementById('az-tera-toggle').checked;
        renderWeakness(useTera);
        renderSynergy();
      }
    });

    document.getElementById('az-cov-tera-toggle').addEventListener('click', () => {
      const btn = document.getElementById('az-cov-tera-toggle');
      const next = btn.getAttribute('aria-pressed') !== 'true';
      btn.setAttribute('aria-pressed', next);
      btn.classList.toggle('active', next);
      const resultsEl = document.getElementById('az-results');
      if (!resultsEl.classList.contains('hidden'))
        renderCoverage(next, document.getElementById('az-cov-sum'), document.getElementById('az-cov-grid'));
    });

    document.getElementById('az-om-tera-toggle').addEventListener('click', () => {
      const btn = document.getElementById('az-om-tera-toggle');
      const next = btn.getAttribute('aria-pressed') !== 'true';
      btn.setAttribute('aria-pressed', next);
      btn.classList.toggle('active', next);
      const resultsEl = document.getElementById('az-results');
      if (!resultsEl.classList.contains('hidden')) renderMatchup();
    });

    updateActionButtons();
  }

  function rerender() {
    const resultsEl = document.getElementById('az-results');
    if (!resultsEl || resultsEl.classList.contains('hidden')) return;
    // Re-executa analyze sem alert de validação
    const hasAny = slots.some(s => s.type1 || s.type2 || s.name);
    if (hasAny) analyze();
  }

  return { init, effectiveTera, rerender };
})();
