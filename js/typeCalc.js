'use strict';

/**
 * typeCalc.js — Calculadora de efetividade de tipos
 * --------------------------------------------------
 * Calcula fraquezas e resistências defensivas de um Pokémon (ou combinação
 * de tipos manual) com suporte a Terastalização.
 *
 * Lógica: usa typeEff() de data.js para calcular o multiplicador de cada
 * um dos 18 tipos atacantes contra os tipos defensores selecionados.
 * Com Tera, o tipo do Pokémon é substituído por um único tipo puro.
 *
 * Dependências: data.js (TYPES, TYPE_CHART, POKEMON_DB, typeEff).
 */

const TypeCalc = (() => {
  let pokemonSelected = false;

  // Estado do último cálculo para o toggle Tera poder re-renderizar sem recalcular
  let _profile     = null;
  let _teraProfile = null;
  let _defTypes    = null;
  let _tera        = null;

  // ── Sprite state helpers ──────────────────────────────────────
  function showSprite(id, name) {
    const ph  = document.getElementById('tc-sprite-placeholder');
    const img = document.getElementById('tc-sprite-img');
    ph.classList.add('hidden');
    ph.classList.remove('missingno');
    img.src = PokeAPI.spriteUrl(id, true);
    img.alt = name;
    img.classList.remove('hidden');
  }

  function showPlaceholder() {
    const ph  = document.getElementById('tc-sprite-placeholder');
    const img = document.getElementById('tc-sprite-img');
    img.classList.add('hidden');
    ph.classList.remove('hidden');
  }

  function hideSprite() {
    document.getElementById('tc-sprite-placeholder').classList.add('hidden');
    document.getElementById('tc-sprite-img').classList.add('hidden');
  }

  // ── Autocomplete ──────────────────────────────────────────────
  function initAutocomplete() {
    const inputEl   = document.getElementById('tc-pkmn-input');
    const suggestEl = document.getElementById('tc-pkmn-suggestions');
    let debounce = null;

    inputEl.addEventListener('input', () => {
      pokemonSelected = false;
      clearTimeout(debounce);
      showPlaceholder();
      const fsEl = document.getElementById('tc-form-switcher');
      if (fsEl) fsEl.innerHTML = '';

      const q = inputEl.value.trim();
      if (!q) { suggestEl.classList.add('hidden'); return; }

      debounce = setTimeout(() => {
        const ql = q.toLowerCase();
        const t1 = document.getElementById('tc-type1').value;
        const t2 = document.getElementById('tc-type2').value;

        let matches = Object.entries(POKEMON_DB).filter(([name]) =>
          !FORM_VARIANTS.has(name) && name.toLowerCase().startsWith(ql)
        );
        if (t1 || t2) {
          matches = matches.filter(([, types]) => {
            if (t1 && t2) return types[0] === t1 && types[1] === t2;
            if (t1)       return types[0] === t1 || types[1] === t1;
            return        types[0] === t2 || types[1] === t2;
          });
        }

        if (!matches.length) { suggestEl.classList.add('hidden'); return; }

        suggestEl.innerHTML = matches.slice(0, 15).map(([name, types]) => {
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

    // mousedown em vez de click: dispara antes do blur do input,
    // evitando que o dropdown feche antes da seleção ser registrada
    suggestEl.addEventListener('mousedown', e => {
      const li = e.target.closest('li');
      if (!li) return;
      e.preventDefault();
      selectPokemon(li.dataset.name);
    });

    // Blur: apenas fecha sugestões, sem limpar o campo
    inputEl.addEventListener('blur', () => {
      setTimeout(() => suggestEl.classList.add('hidden'), 150);
    });

    document.addEventListener('click', e => {
      if (!inputEl.contains(e.target) && !suggestEl.contains(e.target))
        suggestEl.classList.add('hidden');
    });

    document.getElementById('tc-form-switcher').addEventListener('click', e => {
      const navBtn = e.target.closest('.form-nav-btn');
      if (!navBtn) return;
      const currentName = document.getElementById('tc-pkmn-input').value;
      const base = FORM_BASE[currentName];
      if (!base) return;
      const forms = POKEMON_FORMS[base];
      if (!forms) return;
      const idx = forms.indexOf(currentName);
      const formName = forms[(idx + parseInt(navBtn.dataset.dir) + forms.length) % forms.length];
      if (POKEMON_DB[formName]) selectPokemon(formName);
    });
  }

  function selectPokemon(name) {
    pokemonSelected = true;
    const inputEl   = document.getElementById('tc-pkmn-input');
    const suggestEl = document.getElementById('tc-pkmn-suggestions');
    inputEl.value = name;
    suggestEl.classList.add('hidden');

    const types = POKEMON_DB[name];
    if (types) {
      document.getElementById('tc-type1').value = types[0] || '';
      document.getElementById('tc-type2').value = types[1] || '';
      const teraEl = document.getElementById('tc-tera');
      if (!teraEl.value) {
        teraEl.value = types[0] || '';
        teraEl.dispatchEvent(new Event('change'));
      }
    }

    const fsEl = document.getElementById('tc-form-switcher');
    if (fsEl) fsEl.innerHTML = buildFormNavHTML(name);

    const resolved = spriteApiName(name);
    PokeAPI.getPokemon(resolved)
      .then(data => showSprite(data.id, name))
      .catch(() => resolved !== name
        ? PokeAPI.getPokemon(name).then(data => showSprite(data.id, name)).catch(showPlaceholder)
        : showPlaceholder());
  }

  // ── Populate selects ──────────────────────────────────────────
  function initSelects() {
    const sorted = TYPES.slice().sort();

    document.getElementById('tc-type1').innerHTML =
      `<option value="">— Selecionar —</option>` +
      sorted.map(t => `<option value="${t}">${t}</option>`).join('');

    document.getElementById('tc-type2').innerHTML =
      `<option value="">— Nenhum —</option>` +
      sorted.map(t => `<option value="${t}">${t}</option>`).join('');

    document.getElementById('tc-tera').innerHTML =
      `<option value="">— Sem Tera —</option>` +
      sorted.map(t => `<option value="${t}">${t}</option>`).join('');
  }

  // ── Result rendering ──────────────────────────────────────────
  function typeBadge(t) {
    return `<span class="tpill t-${t}">${t}</span>`;
  }

  function renderSummary(profile, containerId) {
    const cats = [
      { key: 'immune',    cls: 's-immune',  label: 'Imune' },
      { key: 'quarter',   cls: 's-quarter', label: '¼×'    },
      { key: 'half',      cls: 's-half',    label: '½×'    },
      { key: 'double',    cls: 's-double',  label: '2×'    },
      { key: 'quadruple', cls: 's-quad',    label: '4×'    },
    ];
    document.getElementById(containerId).innerHTML = cats.map(c => `
      <div class="summary-item ${c.cls}">
        <div class="count">${profile[c.key].length}</div>
        <div class="label">${c.label}</div>
      </div>`).join('');
  }

  function cellStyle(m) {
    if (m === 0)    return { cls: 'tc-cell-imm',  txt: '0×' };
    if (m === 0.25) return { cls: 'tc-cell-qrt',  txt: '¼×' };
    if (m === 0.5)  return { cls: 'tc-cell-hlf',  txt: '½×' };
    if (m === 2)    return { cls: 'tc-cell-dbl',  txt: '2×' };
    if (m === 4)    return { cls: 'tc-cell-quad', txt: '4×' };
    return                 { cls: 'tc-cell-neu',  txt: '1×' };
  }

  function renderGrid(profile, containerId) {
    const ORDER = [4, 2, 1, 0.5, 0.25, 0];
    const keyOf = m => m === 0 ? 'immune' : m === 0.25 ? 'quarter' : m === 0.5 ? 'half'
                     : m === 1 ? 'neutral' : m === 2 ? 'double' : 'quadruple';
    const flat = [];
    ORDER.forEach(m => (profile[keyOf(m)] || []).forEach(t => flat.push({ t, m })));

    document.getElementById(containerId).innerHTML = flat.map(({ t, m }) => {
      const { cls, txt } = cellStyle(m);
      return `<div class="tc-cell ${cls}">
        <span class="tpill t-${t}">${t}</span>
        <span class="tc-cell-mult">${txt}</span>
      </div>`;
    }).join('');
  }

  function calcProfile(defTypes) {
    const p = { immune: [], quarter: [], half: [], neutral: [], double: [], quadruple: [] };
    getActiveTypes().forEach(atk => {
      const m = typeEff(atk, defTypes);
      if      (m === 0)    p.immune.push(atk);
      else if (m === 0.25) p.quarter.push(atk);
      else if (m === 0.5)  p.half.push(atk);
      else if (m === 1)    p.neutral.push(atk);
      else if (m === 2)    p.double.push(atk);
      else if (m === 4)    p.quadruple.push(atk);
    });
    return p;
  }

  // Para cada tipo defensor, pega o melhor multiplicador entre os tipos atacantes do Pokémon
  function calcOffensiveProfile(atkTypes) {
    const p = { immune: [], quarter: [], half: [], neutral: [], double: [], quadruple: [] };
    getActiveTypes().forEach(defType => {
      const m = Math.max(...atkTypes.map(atk => typeEff(atk, [defType])));
      if      (m === 0)    p.immune.push(defType);
      else if (m === 0.25) p.quarter.push(defType);
      else if (m === 0.5)  p.half.push(defType);
      else if (m === 1)    p.neutral.push(defType);
      else if (m === 2)    p.double.push(defType);
      else if (m === 4)    p.quadruple.push(defType);
    });
    return p;
  }

  // ── Panel renders (reusados pelo toggle Tera) ────────────────
  function renderDefensive(useTera) {
    const profile   = (useTera && _teraProfile) ? _teraProfile : _profile;
    const showTypes = (useTera && _teraProfile) ? [_tera] : _defTypes;
    if (!profile) return;

    const title = useTera && _teraProfile
      ? `// terastalizado: ${_defTypes.join('/')} → ${_tera} puro`
      : _defTypes.length > 1
        ? `// dual type — ${_defTypes.join(' / ')}`
        : `// monotype — ${_defTypes[0]}`;

    document.getElementById('tc-tab-original').textContent =
      useTera && _teraProfile ? `Defensivo (Tera ${_tera})` : 'Defensivo';
    document.getElementById('tc-original-title').textContent = title;
    document.getElementById('tc-original-badges').innerHTML  = showTypes.map(typeBadge).join('');
    renderSummary(profile, 'tc-original-summary');
    renderGrid(profile, 'tc-original-grid');
  }

  function renderOffensive(useTera) {
    if (!_defTypes) return;
    // Com Tera, adiciona o Tera Type como terceiro tipo atacante (deduplicado)
    const atkTypes = (useTera && _tera)
      ? [...new Set([..._defTypes, _tera])]
      : _defTypes;

    const offProfile = calcOffensiveProfile(atkTypes);

    const title = useTera && _tera
      ? `// cobertura ofensiva com Tera — ${atkTypes.join(' / ')}`
      : atkTypes.length > 1
        ? `// cobertura ofensiva — melhor entre ${atkTypes.join(' / ')}`
        : `// cobertura ofensiva — tipo ${atkTypes[0]}`;

    document.getElementById('tc-tab-offensive').textContent =
      useTera && _tera ? `Ofensivo (Tera ${_tera})` : 'Ofensivo';
    document.getElementById('tc-offensive-title').textContent = title;
    document.getElementById('tc-offensive-badges').innerHTML  = atkTypes.map(typeBadge).join('');
    renderSummary(offProfile, 'tc-offensive-summary');
    renderGrid(offProfile, 'tc-offensive-grid');
  }

  // ── Calculate ─────────────────────────────────────────────────
  function calculate() {
    const t1   = document.getElementById('tc-type1').value;
    const t2   = document.getElementById('tc-type2').value;
    const tera = document.getElementById('tc-tera').value;

    if (!t1) { alert('Selecione ao menos o Tipo Primário.'); return; }

    _defTypes    = (t2 && t2 !== t1) ? [t1, t2] : [t1];
    _tera        = tera || null;
    _profile     = calcProfile(_defTypes);
    _teraProfile = tera ? calcProfile([tera]) : null;

    const useTera = document.getElementById('tc-tera-toggle').checked && !!_teraProfile;
    renderDefensive(useTera);
    renderOffensive(useTera);

    document.getElementById('tc-results').classList.remove('hidden');
    document.getElementById('tc-results').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ── Init ─────────────────────────────────────────────────────
  function init() {
    initSelects();
    initAutocomplete();
    showPlaceholder();

    // Habilita/desabilita o wrapper do toggle conforme Tera Type selecionado
    function setTeraToggleEnabled(enabled) {
      const wrap = document.getElementById('tc-tera-toggle-wrap');
      wrap.style.opacity       = enabled ? '1' : '0.35';
      wrap.style.pointerEvents = enabled ? '' : 'none';
      if (!enabled) {
        document.getElementById('tc-tera-toggle').checked = false;
      }
    }

    document.getElementById('tc-tera').addEventListener('change', () => {
      const hasTera = !!document.getElementById('tc-tera').value;
      setTeraToggleEnabled(hasTera);
      if (!hasTera) {
        renderDefensive(false);
        renderOffensive(false);
      }
    });

    // Toggle Tera: atualiza defensivo e ofensivo simultaneamente
    document.getElementById('tc-tera-toggle').addEventListener('change', () => {
      const toggle  = document.getElementById('tc-tera-toggle');
      const teraVal = document.getElementById('tc-tera').value;
      if (!teraVal) { toggle.checked = false; return; }
      _tera        = teraVal;
      _teraProfile = calcProfile([teraVal]);
      renderDefensive(toggle.checked);
      renderOffensive(toggle.checked);
    });

    document.getElementById('tc-calc-btn').addEventListener('click', calculate);
  }

  function rerender() {
    if (!_defTypes) return;
    _profile     = calcProfile(_defTypes);
    _teraProfile = _tera ? calcProfile([_tera]) : null;
    const useTera = document.getElementById('tc-tera-toggle').checked && !!_teraProfile;
    renderDefensive(useTera);
    renderOffensive(useTera);
  }

  return { init, rerender };
})();
