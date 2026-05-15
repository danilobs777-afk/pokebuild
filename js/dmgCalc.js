'use strict';

/**
 * dmgCalc.js — Calculadora de dano
 * ---------------------------------
 * Simula o dano de um golpe entre dois Pokémon usando a fórmula oficial Gen 5+.
 * Gera 16 valores de roll (multiplicadores 85–100) para mostrar o range real.
 *
 * Fórmula: floor(floor(floor(2*Lv/5+2) * Pow * Atk/Def) / 50 + 2) * mods
 * Mods aplicados em ordem: weather → crit → STAB → typeEff → burn
 *
 * Dependências: data.js (STAT_KEYS, STAT_LABELS, NATURES, POKEMON_DB, calcStat),
 *   api.js (PokeAPI.getPokemon, PokeAPI.getMove).
 */

const DmgCalc = (() => {
  // ── Mini build form (attacker / defender) ────────────────────
  function buildForm(prefix, label) {
    const natureOpts = Object.keys(NATURES).map(n => `<option value="${n}"${n==='Hardy'?' selected':''}>${n}</option>`).join('');
    return `
      <div class="field-group">
        <label class="field-label">Pokémon</label>
        <div class="autocomplete-wrap">
          <input type="text" class="text-input" id="${prefix}-name" placeholder="${label}" autocomplete="off">
          <ul class="suggestions hidden" id="${prefix}-sug"></ul>
        </div>
        <div id="${prefix}-sprite" style="margin-top:6px;"></div>
      </div>
      <div id="${prefix}-base-stats" class="hidden">
        <div class="field-group">
          <label class="field-label">Base Stats (auto)</label>
          <div id="${prefix}-stats-row" style="display:flex;gap:6px;flex-wrap:wrap;font-size:12px;color:var(--text2);"></div>
        </div>
      </div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;">
        <div class="field-group" style="flex:1;min-width:110px;">
          <label class="field-label">Nature</label>
          <select class="select-input" id="${prefix}-nature">${natureOpts}</select>
        </div>
        <div class="field-group" style="flex:1;min-width:80px;">
          <label class="field-label">Level</label>
          <input type="number" class="text-input" id="${prefix}-level" value="50" min="1" max="100" style="width:70px">
        </div>
        <div class="field-group" style="flex:1;min-width:80px;">
          <label class="field-label">HP atual %</label>
          <input type="number" class="text-input" id="${prefix}-hp-pct" value="100" min="1" max="100" style="width:70px">
        </div>
      </div>
      <div class="field-group">
        <label class="field-label">Habilidade</label>
        <div class="autocomplete-wrap">
          <input type="text" class="text-input" id="${prefix}-ability" placeholder="Buscar habilidade..." autocomplete="off">
          <ul class="suggestions hidden" id="${prefix}-ability-sug"></ul>
        </div>
      </div>
      <div class="field-group">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
          <label class="field-label" style="margin:0">IVs</label>
          <button type="button" class="btn-iv-toggle" id="${prefix}-iv-toggle" data-active="false">todos 31 ▶ personalizar</button>
        </div>
        <div id="${prefix}-iv-grid" class="dmg-ev-grid hidden">
          ${STAT_KEYS.map(k => `
            <div class="dmg-ev-cell">
              <span style="font-size:11px;color:var(--text2)">${STAT_LABELS[k]}</span>
              <input type="number" class="ev-input" id="${prefix}-iv-${k}" value="31" min="0" max="31" step="1">
            </div>`).join('')}
        </div>
      </div>
      <div class="field-group">
        <label class="field-label">EVs por Stat</label>
        <div class="dmg-ev-grid">
          ${STAT_KEYS.map(k => `
            <div class="dmg-ev-cell">
              <span style="font-size:11px;color:var(--text2)">${STAT_LABELS[k]}</span>
              <input type="number" class="ev-input" id="${prefix}-ev-${k}" value="0" min="0" max="252" step="4">
            </div>`).join('')}
        </div>
      </div>
      <div class="field-group">
        <label class="field-label">Stat Stages</label>
        <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:center;">
          ${(() => {
            const stageOpts = [-6,-5,-4,-3,-2,-1,0,1,2,3,4,5,6]
              .map(s => `<option value="${s}"${s===0?' selected':''}>${s>0?'+':''}${s}</option>`).join('');
            const offLabel = prefix.includes('atk') ? 'Atk/SpA' : 'Def/SpD';
            return `
              <div style="display:flex;align-items:center;gap:5px;">
                <span style="font-size:12px;color:var(--text2)">${offLabel}</span>
                <select class="select-input" id="${prefix}-stage-off" style="width:68px">${stageOpts}</select>
              </div>
              <div style="display:flex;align-items:center;gap:5px;">
                <span style="font-size:12px;color:var(--text2)">Speed</span>
                <select class="select-input" id="${prefix}-stage-spe" style="width:68px">${stageOpts}</select>
              </div>`;
          })()}
        </div>
      </div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;">
        <div class="field-group" style="flex:1">
          <label class="field-label">Item</label>
          <div style="display:flex;align-items:center;gap:6px;">
            <img id="${prefix}-item-icon" class="bld-item-img hidden" src="" alt="">
            <div class="autocomplete-wrap" style="flex:1">
              <input type="text" class="text-input" id="${prefix}-item" placeholder="Buscar item..." autocomplete="off">
              <ul class="suggestions hidden" id="${prefix}-item-sug"></ul>
            </div>
          </div>
        </div>
      </div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:6px;">
        <label class="check-label" style="font-size:12px">
          <input type="checkbox" id="${prefix}-grounded" checked> No chão (afeta terrain)
        </label>
        <label class="check-label" style="font-size:12px">
          <input type="checkbox" id="${prefix}-tailwind"> Tailwind (Speed ×2)
        </label>
        <label class="check-label" style="font-size:12px">
          <input type="checkbox" id="${prefix}-paralyzed"> Paralisia (Speed ×0.5)
        </label>
      </div>
    `;
  }

  // ── Autocomplete helper ───────────────────────────────────────
  function setupAutocomplete(prefix) {
    const inputEl  = document.getElementById(`${prefix}-name`);
    const suggestEl = document.getElementById(`${prefix}-sug`);
    let debounce = null;

    inputEl.addEventListener('input', () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => {
        const q = inputEl.value.trim().toLowerCase();
        if (q.length < 2) { suggestEl.classList.add('hidden'); return; }
        const matches = Object.entries(POKEMON_DB)
          .filter(([name]) => name.toLowerCase().startsWith(q))
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
      suggestEl.classList.add('hidden');
      loadPokemonData(prefix, name);
      if (prefix === 'dmg-atk' && cachedMove) {
        const moveType = cachedMove.type?.name;
        if (moveType) {
          const capitalized = moveType[0].toUpperCase() + moveType.slice(1);
          const stabCheck = document.getElementById('dmg-stab');
          if (stabCheck) stabCheck.checked = (POKEMON_DB[name] || []).includes(capitalized);
        }
      }
    });

    document.addEventListener('click', e => {
      if (!inputEl.contains(e.target) && !suggestEl.contains(e.target))
        suggestEl.classList.add('hidden');
    });
  }

  function renderStatsRow(prefix) {
    const bsWrap = document.getElementById(`${prefix}-base-stats`);
    if (!bsWrap || !bsWrap.dataset.bs) return;
    let bs;
    try { bs = JSON.parse(bsWrap.dataset.bs); } catch { return; }
    const nature = document.getElementById(`${prefix}-nature`)?.value || 'Hardy';
    const nat = NATURES[nature] || { up: null, down: null };
    const statsRow = document.getElementById(`${prefix}-stats-row`);
    if (!statsRow) return;
    statsRow.innerHTML = STAT_KEYS.map(k => {
      let ind = '';
      if (nat.up === k)   ind = ` <span style="color:#4c8;font-weight:700">▲</span>`;
      if (nat.down === k) ind = ` <span style="color:#f55;font-weight:700">▼</span>`;
      return `<span><strong>${STAT_LABELS[k]}</strong>: ${bs[k] ?? '—'}${ind}</span>`;
    }).join(' · ');
  }

  function setupItemAutocomplete(prefix) {
    const inputEl   = document.getElementById(`${prefix}-item`);
    const suggestEl = document.getElementById(`${prefix}-item-sug`);
    if (!inputEl || !suggestEl) return;
    let debounce = null;

    const iconEl = () => document.getElementById(`${prefix}-item-icon`);

    inputEl.addEventListener('input', () => {
      clearTimeout(debounce);
      if (!inputEl.value.trim()) { const ic = iconEl(); if (ic) ic.classList.add('hidden'); }
      debounce = setTimeout(() => {
        const q = inputEl.value.trim().toLowerCase();
        if (q.length < 2) { suggestEl.classList.add('hidden'); return; }
        const matches = ITEMS.filter(i => i.toLowerCase().includes(q)).slice(0, 8);
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

    suggestEl.addEventListener('mousedown', e => {
      const li = e.target.closest('li');
      if (!li) return;
      e.preventDefault();
      const value = li.dataset.value;
      inputEl.value = value;
      suggestEl.classList.add('hidden');
      const icon = iconEl();
      if (icon) {
        icon.src = `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/${PokeAPI.apiName(value)}.png`;
        icon.classList.remove('hidden');
        icon.onerror = () => icon.classList.add('hidden');
      }
    });

    inputEl.addEventListener('blur', () => {
      setTimeout(() => suggestEl.classList.add('hidden'), 150);
    });
  }

  function setupAbilityAutocomplete(prefix) {
    const inputEl   = document.getElementById(`${prefix}-ability`);
    const suggestEl = document.getElementById(`${prefix}-ability-sug`);
    if (!inputEl || !suggestEl) return;
    let debounce = null;

    inputEl.addEventListener('focus', () => { PokeAPI.ensureAbilityList().catch(() => {}); });

    inputEl.addEventListener('input', () => {
      clearTimeout(debounce);
      debounce = setTimeout(async () => {
        const q = inputEl.value.trim().toLowerCase();
        if (q.length < 2) { suggestEl.classList.add('hidden'); return; }
        const pkName = document.getElementById(`${prefix}-name`)?.value;
        try {
          if (pkName && POKEMON_DB[pkName]) {
            const abilities = await PokeAPI.getPokemonAbilities(pkName);
            const matches = abilities.filter(a => a.name.toLowerCase().includes(q));
            if (!matches.length) { suggestEl.classList.add('hidden'); return; }
            suggestEl.innerHTML = matches.map(a => {
              const tag = a.hidden ? ` <span style="font-size:10px;color:var(--text2)">(oculta)</span>` : '';
              return `<li data-name="${a.name}" class="ac-item-rich"><span>${a.name}${tag}</span></li>`;
            }).join('');
          } else {
            const list = await PokeAPI.ensureAbilityList();
            const matches = list.filter(a => a.toLowerCase().includes(q)).slice(0, 10);
            if (!matches.length) { suggestEl.classList.add('hidden'); return; }
            suggestEl.innerHTML = matches.map(a =>
              `<li data-name="${a}" class="ac-item-rich"><span>${a}</span></li>`
            ).join('');
          }
          suggestEl.classList.remove('hidden');
        } catch { suggestEl.classList.add('hidden'); }
      }, 150);
    });

    suggestEl.addEventListener('mousedown', e => {
      const li = e.target.closest('li');
      if (!li) return;
      e.preventDefault();
      inputEl.value = li.dataset.name;
      suggestEl.classList.add('hidden');
    });

    inputEl.addEventListener('blur', () => {
      setTimeout(() => suggestEl.classList.add('hidden'), 150);
    });
  }

  function loadPokemonData(prefix, name) {
    PokeAPI.getPokemon(name).then(data => {
      const spriteWrap = document.getElementById(`${prefix}-sprite`);
      if (spriteWrap)
        spriteWrap.innerHTML = `<img src="${PokeAPI.spriteUrl(data.id)}" class="pkmn-sprite-sm" alt="${name}">`;

      const statsRow = document.getElementById(`${prefix}-stats-row`);
      const bsWrap   = document.getElementById(`${prefix}-base-stats`);
      if (statsRow && bsWrap) {
        const keyMap = { hp:'hp', attack:'atk', defense:'def', 'special-attack':'spa', 'special-defense':'spd', speed:'spe' };
        const bs = {};
        data.stats.forEach(s => { const k = keyMap[s.stat.name]; if(k) bs[k]=s.base_stat; });
        bsWrap.classList.remove('hidden');
        bsWrap.dataset.bs = JSON.stringify(bs);
        renderStatsRow(prefix);
      }

      // Auto-preenche habilidade com a primeira não-oculta se campo vazio
      const abilityInput = document.getElementById(`${prefix}-ability`);
      if (abilityInput && !abilityInput.value) {
        const first = data.abilities.find(a => !a.is_hidden);
        if (first) {
          abilityInput.value = first.ability.name
            .split('-').filter(Boolean).map(w => w[0].toUpperCase() + w.slice(1)).join(' ');
        }
      }

      // Auto efetividade quando o defensor muda e já há golpe carregado
      if (prefix === 'dmg-def' && cachedMove) {
        const moveTypeName = cachedMove.type?.name;
        if (moveTypeName) {
          const mType = moveTypeName[0].toUpperCase() + moveTypeName.slice(1);
          const defTypes = (POKEMON_DB[name] || []).filter(Boolean);
          const eff = typeEff(mType, defTypes);
          const effSel = document.getElementById('dmg-eff');
          if (effSel) effSel.value = String(eff);
        }
      }
    }).catch(() => {});
  }

  // ── Damage formula (Gen 5+, Lv50) ────────────────────────────
  // floor(floor(floor(2*Lv/5+2) * Power * A/D) / 50 + 2) * mods
  /**
   * Retorna array de 16 valores de dano (rolls 85–100).
   * O spread 85–100 representa a variação aleatória do jogo (±15% do base).
   * @param {number} atk - Stat de ataque do atacante
   * @param {number} def - Stat de defesa do defensor
   * @param {number} power - Base power do golpe
   * @param {number} level - Nível do atacante
   * @param {{stab, typeEff, crit, weather, burn}} mods - Modificadores
   * @returns {number[]} 16 valores de dano, do mínimo ao máximo
   */
  function calcDamage(atk, def, power, level, mods) {
    const { stab, typeEff, crit, weather, burn, critMult = 1.5 } = mods;
    const base = Math.floor(
      Math.floor(
        Math.floor(2 * level / 5 + 2) * power * atk / def
      ) / 50 + 2
    );
    const rolls = [];
    for (let r = 85; r <= 100; r++) {
      let dmg = Math.floor(base * r / 100);
      dmg = Math.floor(dmg * weather);
      if (crit) dmg = Math.floor(dmg * critMult);
      dmg = Math.floor(dmg * stab);
      dmg = Math.floor(dmg * typeEff);
      if (burn) dmg = Math.floor(dmg * 0.5);
      rolls.push(dmg);
    }
    return rolls;
  }

  // Lê os inputs do formulário e calcula o valor real do stat
  function getStat(prefix, stat, baseStats) {
    const ev       = parseInt(document.getElementById(`${prefix}-ev-${stat}`)?.value) || 0;
    const ivActive = document.getElementById(`${prefix}-iv-toggle`)?.dataset.active === 'true';
    const ivRaw    = ivActive ? parseInt(document.getElementById(`${prefix}-iv-${stat}`)?.value) : 31;
    const iv       = isNaN(ivRaw) ? 31 : ivRaw;
    const nature   = document.getElementById(`${prefix}-nature`)?.value || 'Hardy';
    const level    = parseInt(document.getElementById(`${prefix}-level`)?.value) || 50;
    const base     = baseStats?.[stat] || 80;
    return calcStat(base, stat, ev, iv, nature, level);
  }

  function getFieldMod(weatherKey, terrainKey, moveType, moveName, atkGrounded, defGrounded) {
    let mod = 1;
    if (weatherKey === 'sun') {
      if (moveType === 'Fire')  mod *= 1.5;
      if (moveType === 'Water') mod *= 0.5;
    } else if (weatherKey === 'rain') {
      if (moveType === 'Water') mod *= 1.5;
      if (moveType === 'Fire')  mod *= 0.5;
    }
    if (terrainKey === 'electric-terrain' && moveType === 'Electric' && atkGrounded) mod *= 1.3;
    else if (terrainKey === 'grassy-terrain') {
      if (moveType === 'Grass' && atkGrounded) mod *= 1.3;
      else if (['earthquake', 'bulldoze', 'magnitude'].includes(moveName)) mod *= 0.5;
    } else if (terrainKey === 'psychic-terrain' && moveType === 'Psychic' && atkGrounded) mod *= 1.3;
    else if (terrainKey === 'misty-terrain' && moveType === 'Dragon' && defGrounded) mod *= 0.5;
    return mod;
  }

  function getBaseStats(prefix) {
    const bsWrap = document.getElementById(`${prefix}-base-stats`);
    if (!bsWrap || !bsWrap.dataset.bs) return null;
    try { return JSON.parse(bsWrap.dataset.bs); } catch { return null; }
  }

  function stageMultiplier(s) {
    return s >= 0 ? (2 + s) / 2 : 2 / (2 - s);
  }

  // Items que boosteiam um tipo de golpe ×1.2
  const TYPE_ITEMS = {
    'Charcoal':'Fire','Mystic Water':'Water','Magnet':'Electric',
    'Miracle Seed':'Grass','Never-Melt Ice':'Ice','Black Belt':'Fighting',
    'Poison Barb':'Poison','Soft Sand':'Ground','Sharp Beak':'Flying',
    'Twisted Spoon':'Psychic','Silver Powder':'Bug','Hard Stone':'Rock',
    'Spell Tag':'Ghost','Dragon Fang':'Dragon','Black Glasses':'Dark',
    'Metal Coat':'Steel','Silk Scarf':'Normal','Fairy Feather':'Fairy',
    'Sea Incense':'Water','Wave Incense':'Water','Odd Incense':'Psychic',
    'Rock Incense':'Rock','Rose Incense':'Grass',
  };

  function hasFlag(flag) {
    return cachedMove?.flags?.some(f => f.name === flag) ?? false;
  }

  function applyAtkMods({ item, ability, moveType, moveCategory, movePower, typeEff, atkHpPct }) {
    let statMult  = 1;
    let powerMult = 1;
    let finalMult = 1;
    let stabAdaptability = false;
    let critMult  = 1.5;
    const notes   = [];

    // Itens de atacante
    if      (item === 'Choice Band'  && moveCategory === 'physical') statMult  *= 1.5;
    else if (item === 'Choice Specs' && moveCategory === 'special')  statMult  *= 1.5;
    else if (item === 'Life Orb')  { finalMult *= 1.3; notes.push('life-orb'); }
    else if (item === 'Muscle Band' && moveCategory === 'physical')  finalMult *= 1.1;
    else if (item === 'Wise Glasses' && moveCategory === 'special')  finalMult *= 1.1;
    else if (TYPE_ITEMS[item] && TYPE_ITEMS[item] === moveType)      finalMult *= 1.2;

    // Habilidades de atacante
    switch (ability) {
      case 'Adaptability':   stabAdaptability = true; break;
      case 'Huge Power':
      case 'Pure Power':     if (moveCategory === 'physical') statMult *= 2; break;
      case 'Gorilla Tactics':
      case 'Hustle':         if (moveCategory === 'physical') statMult *= 1.5; break;
      case 'Technician':     if (movePower && movePower <= 60) powerMult *= 1.5; break;
      case 'Iron Fist':      if (hasFlag('punch'))   powerMult *= 1.2; break;
      case 'Strong Jaw':     if (hasFlag('bite'))    powerMult *= 1.5; break;
      case 'Tough Claws':    if (hasFlag('contact')) powerMult *= 1.3; break;
      case 'Punk Rock':      if (hasFlag('sound'))   powerMult *= 1.3; break;
      case 'Water Bubble':   if (moveType === 'Water') statMult *= 2; break;
      case 'Steelworker':
      case 'Steely Spirit':  if (moveType === 'Steel')    powerMult *= 1.5; break;
      case "Dragon's Maw":   if (moveType === 'Dragon')   powerMult *= 1.5; break;
      case 'Transistor':     if (moveType === 'Electric') powerMult *= 1.5; break;
      case 'Rocky Payload':  if (moveType === 'Rock')     powerMult *= 1.5; break;
      case 'Neuroforce':     if (typeEff > 1) finalMult *= 1.25; break;
      case 'Sniper':         critMult = 2.25; break;
      case 'Blaze':    if (moveType === 'Fire'  && atkHpPct <= 33) powerMult *= 1.5; break;
      case 'Torrent':  if (moveType === 'Water' && atkHpPct <= 33) powerMult *= 1.5; break;
      case 'Overgrow': if (moveType === 'Grass' && atkHpPct <= 33) powerMult *= 1.5; break;
      case 'Swarm':    if (moveType === 'Bug'   && atkHpPct <= 33) powerMult *= 1.5; break;
    }

    return { statMult, powerMult, finalMult, stabAdaptability, critMult, notes };
  }

  function applyDefMods({ item, ability, moveType, moveCategory, typeEff, defHpPct }) {
    let statMult  = 1;
    let finalMult = 1;

    // Itens de defensor
    if      (item === 'Eviolite')   statMult *= 1.5;
    else if (item === 'Assault Vest' && moveCategory === 'special') statMult *= 1.5;

    // Habilidades de defensor
    switch (ability) {
      case 'Filter':
      case 'Solid Rock':
      case 'Prism Armor':   if (typeEff > 1) finalMult *= 0.75; break;
      case 'Multiscale':
      case 'Shadow Shield': if (defHpPct >= 100) finalMult *= 0.5; break;
      case 'Fluffy':
        if (hasFlag('contact')) finalMult *= 0.5;
        if (moveType === 'Fire') finalMult *= 2;
        break;
      case 'Thick Fat':     if (moveType === 'Fire' || moveType === 'Ice') finalMult *= 0.5; break;
      case 'Water Bubble':  if (moveType === 'Fire') finalMult *= 0.5; break;
      case 'Heatproof':     if (moveType === 'Fire') finalMult *= 0.5; break;
      case 'Punk Rock':     if (hasFlag('sound')) finalMult *= 0.5; break;
      case 'Ice Scales':    if (moveCategory === 'special') finalMult *= 0.5; break;
      case 'Wonder Guard':  if (typeEff <= 1) finalMult = 0; break;
    }

    return { statMult, finalMult };
  }

  // Dados do último golpe carregado via API
  let cachedMove = null;

  function setupMoveAutocomplete() {
    const inputEl   = document.getElementById('dmg-move-input');
    const suggestEl = document.getElementById('dmg-move-suggestions');
    let debounce = null;

    inputEl.addEventListener('focus', () => { PokeAPI.ensureMoveList().catch(() => {}); });

    inputEl.addEventListener('input', () => {
      clearTimeout(debounce);
      cachedMove = null;
      document.getElementById('dmg-move-info').classList.add('hidden');
      debounce = setTimeout(() => {
        const q = inputEl.value.trim().toLowerCase();
        if (q.length < 2) { suggestEl.classList.add('hidden'); return; }
        suggestEl.innerHTML = '<li class="sug-loading">Carregando golpes…</li>';
        suggestEl.classList.remove('hidden');
        PokeAPI.ensureMoveList().then(list => {
          const currentQ = inputEl.value.trim().toLowerCase();
          if (currentQ.length < 2) { suggestEl.classList.add('hidden'); return; }
          const matches = list.filter(n => n.toLowerCase().includes(currentQ)).slice(0, 12);
          if (!matches.length) { suggestEl.classList.add('hidden'); return; }
          suggestEl.innerHTML = matches.map(n => `<li data-name="${n}" class="ac-item-rich"><span>${n}</span></li>`).join('');
          suggestEl.classList.remove('hidden');
          PokeAPI.getMovesInfo(matches).then(typesMap => {
            if (suggestEl.classList.contains('hidden')) return;
            suggestEl.innerHTML = matches.map(n => {
              const info = typesMap[n];
              const pill = info ? `<span class="tpill t-${info.type}" style="font-size:10px;padding:1px 5px">${info.type}</span>` : '';
              return `<li data-name="${n}" class="ac-item-rich"><span>${n}</span>${pill}</li>`;
            }).join('');
          }).catch(() => {});
        }).catch(() => { suggestEl.classList.add('hidden'); });
      }, 200);
    });

    suggestEl.addEventListener('click', e => {
      const li = e.target.closest('li');
      if (!li || !li.dataset.name) return;
      inputEl.value = li.dataset.name;
      suggestEl.classList.add('hidden');
      loadMove(li.dataset.name);
    });

    document.addEventListener('click', e => {
      if (!inputEl.contains(e.target) && !suggestEl.contains(e.target))
        suggestEl.classList.add('hidden');
    });
  }

  function loadMove(name) {
    PokeAPI.getMove(name).then(data => {
      cachedMove = data;
      const typeName = data.type.name;
      const capitalized = typeName[0].toUpperCase() + typeName.slice(1);
      document.getElementById('dmg-move-type-pill').textContent = capitalized;
      document.getElementById('dmg-move-type-pill').className = `tpill t-${capitalized}`;
      document.getElementById('dmg-move-category').textContent = data.damage_class?.name || '';
      document.getElementById('dmg-move-bp').textContent = data.power || '—';
      document.getElementById('dmg-move-info').classList.remove('hidden');

      // Auto STAB
      const atkName = document.getElementById('dmg-atk-name')?.value;
      if (atkName && POKEMON_DB[atkName]) {
        const stabCheck = document.getElementById('dmg-stab');
        stabCheck.checked = POKEMON_DB[atkName].includes(capitalized);
      }

      // Auto efetividade se defensor já estiver selecionado
      const defName = document.getElementById('dmg-def-name')?.value;
      if (defName && POKEMON_DB[defName]) {
        const defTypes = POKEMON_DB[defName].filter(Boolean);
        const eff = typeEff(capitalized, defTypes);
        const effSel = document.getElementById('dmg-eff');
        if (effSel) effSel.value = String(eff);
      }
    }).catch(() => {
      document.getElementById('dmg-move-info').classList.add('hidden');
    });
  }

  // ── Calculate ─────────────────────────────────────────────────
  function calculate() {
    const atkBs = getBaseStats('dmg-atk');
    const defBs = getBaseStats('dmg-def');
    const level  = parseInt(document.getElementById('dmg-atk-level').value) || 50;
    const power  = cachedMove ? (cachedMove.power || 0) : 80;

    if (!power) { alert('Carregue um golpe com Base Power válido.'); return; }

    const moveCategory = cachedMove?.damage_class?.name || 'physical';
    const isSpecial = moveCategory === 'special';

    const atkStat = isSpecial ? 'spa' : 'atk';
    const defStat = isSpecial ? 'spd' : 'def';

    const atkVal = getStat('dmg-atk', atkStat, atkBs);
    const defVal = getStat('dmg-def', defStat, defBs);
    const defHp  = getStat('dmg-def', 'hp', defBs);
    const atkHp  = getStat('dmg-atk', 'hp', atkBs);

    const typeEffRaw  = parseFloat(document.getElementById('dmg-eff').value);
    const typeEffMod  = isNaN(typeEffRaw) ? 1 : typeEffRaw;
    const crit        = document.getElementById('dmg-crit').checked;
    const burn        = document.getElementById('dmg-burned').checked;
    const trickRoom   = document.getElementById('dmg-trick-room')?.checked ?? false;
    const atkGrounded = document.getElementById('dmg-atk-grounded')?.checked ?? true;
    const defGrounded = document.getElementById('dmg-def-grounded')?.checked ?? true;
    const weatherKey  = document.getElementById('dmg-weather').value;
    const terrainKey  = document.getElementById('dmg-terrain').value;
    const moveType    = cachedMove ? (cachedMove.type?.name[0].toUpperCase() + cachedMove.type.name.slice(1)) : null;
    const moveName    = cachedMove?.name || null;
    const weather     = getFieldMod(weatherKey, terrainKey, moveType, moveName, atkGrounded, defGrounded);

    const atkItem    = document.getElementById('dmg-atk-item')?.value?.trim()  || '';
    const defItem    = document.getElementById('dmg-def-item')?.value?.trim()  || '';
    const atkAbility = document.getElementById('dmg-atk-ability')?.value?.trim() || '';
    const defAbility = document.getElementById('dmg-def-ability')?.value?.trim() || '';
    const atkHpPct   = parseInt(document.getElementById('dmg-atk-hp-pct')?.value) || 100;
    const defHpPct   = parseInt(document.getElementById('dmg-def-hp-pct')?.value) || 100;

    // Stat stages — crit ignora etapas desfavoráveis (atk negativo → 0; def positivo → 0)
    const atkOffStage = parseInt(document.getElementById('dmg-atk-stage-off')?.value) || 0;
    const atkSpeStage = parseInt(document.getElementById('dmg-atk-stage-spe')?.value) || 0;
    const defOffStage = parseInt(document.getElementById('dmg-def-stage-off')?.value) || 0;
    const defSpeStage = parseInt(document.getElementById('dmg-def-stage-spe')?.value) || 0;

    const effAtkStage = crit ? Math.max(0, atkOffStage) : atkOffStage;
    const effDefStage = crit ? Math.min(0, defOffStage) : defOffStage;

    // Modificadores de item / habilidade
    const atkMods = applyAtkMods({ item: atkItem, ability: atkAbility, moveType, moveCategory, movePower: cachedMove?.power, typeEff: typeEffMod, atkHpPct });
    const defMods = applyDefMods({ item: defItem, ability: defAbility, moveType, moveCategory, typeEff: typeEffMod, defHpPct });

    const atkStatFinal = Math.floor(atkVal * stageMultiplier(effAtkStage) * atkMods.statMult);
    const defStatFinal = Math.max(1, Math.floor(defVal * stageMultiplier(effDefStage) * defMods.statMult));
    const powerFinal   = Math.floor(power * atkMods.powerMult);

    // STAB: Adaptability usa ×2 em vez de ×1.5
    const stabChecked = document.getElementById('dmg-stab').checked;
    const stab = stabChecked ? (atkMods.stabAdaptability ? 2 : 1.5) : 1;

    const atkTailwind  = document.getElementById('dmg-atk-tailwind')?.checked  ?? false;
    const atkParalyzed = document.getElementById('dmg-atk-paralyzed')?.checked ?? false;
    const defTailwind  = document.getElementById('dmg-def-tailwind')?.checked  ?? false;
    const defParalyzed = document.getElementById('dmg-def-paralyzed')?.checked ?? false;

    const atkSpeMult = (atkTailwind ? 2 : 1) * (atkParalyzed ? 0.5 : 1);
    const defSpeMult = (defTailwind ? 2 : 1) * (defParalyzed ? 0.5 : 1);

    const atkSpeFinal = atkBs ? Math.floor(getStat('dmg-atk', 'spe', atkBs) * stageMultiplier(atkSpeStage) * atkSpeMult) : null;
    const defSpeFinal = defBs ? Math.floor(getStat('dmg-def', 'spe', defBs) * stageMultiplier(defSpeStage) * defSpeMult) : null;

    const atkSpeConditions = [atkTailwind && 'Tailwind', atkParalyzed && 'Paralisia'].filter(Boolean);
    const defSpeConditions = [defTailwind && 'Tailwind', defParalyzed && 'Paralisia'].filter(Boolean);

    const burnChip = burn ? Math.floor(atkHp / 16) : 0;
    const atkName  = document.getElementById('dmg-atk-name').value || 'Atacante';
    const defName  = document.getElementById('dmg-def-name').value || 'Defensor';

    let rolls = calcDamage(atkStatFinal, defStatFinal, powerFinal, level,
      { stab, typeEff: typeEffMod, crit, weather, burn, critMult: atkMods.critMult });

    // Multiplicadores finais (Life Orb, Filter, Multiscale, etc.)
    const finalMult = atkMods.finalMult * defMods.finalMult;
    if (finalMult !== 1) rolls = rolls.map(r => Math.floor(r * finalMult));

    // Multi-hit
    const minHits = cachedMove?.meta?.min_hits;
    const maxHits = cachedMove?.meta?.max_hits;
    let multiHitData = null;
    if (minHits != null && maxHits != null && maxHits > 1) {
      const isSkillLink = atkAbility === 'Skill Link';
      if (isSkillLink && maxHits >= 5) {
        multiHitData = [{ hits: 5, prob: 1, label: '5 acertos (Skill Link)' }];
      } else if (minHits === maxHits) {
        multiHitData = [{ hits: minHits, prob: 1, label: `${minHits} acertos (fixo)` }];
      } else {
        const dist = [
          { hits: 2, prob: 1/3,  label: '2 acertos' },
          { hits: 3, prob: 1/3,  label: '3 acertos' },
          { hits: 4, prob: 1/6,  label: '4 acertos' },
          { hits: 5, prob: 1/6,  label: '5 acertos' },
        ].filter(d => d.hits >= minHits && d.hits <= maxHits);
        const total = dist.reduce((s, d) => s + d.prob, 0);
        dist.forEach(d => d.prob = d.prob / total);
        multiHitData = dist;
      }
    }

    const defStatus      = document.getElementById('dmg-def-status')?.value || 'none';
    const defPassiveItem = document.getElementById('dmg-def-passive-item')?.value || 'none';

    const extraNotes = atkMods.notes;
    renderResults(rolls, defHp, {
      burnChip, atkHp, extraNotes, multiHitData,
      atkSpe: atkSpeFinal, defSpe: defSpeFinal,
      atkSpeConditions, defSpeConditions,
      trickRoom, atkName, defName,
      defStatus, defPassiveItem,
    });
  }

  function renderResults(rolls, defHp, endOfTurn = {}) {
    const resultsEl = document.getElementById('dmg-results');
    resultsEl.classList.remove('hidden');

    const minDmg = rolls[0];
    const maxDmg = rolls[rolls.length - 1];

    // Barra de HP
    const minPct = Math.min((minDmg / defHp) * 100, 100);
    const maxPct = Math.min((maxDmg / defHp) * 100, 100);
    document.getElementById('dmg-range-overlay').style.left  = minPct + '%';
    document.getElementById('dmg-range-overlay').style.width = (maxPct - minPct) + '%';
    document.getElementById('dmg-hp-label').textContent =
      `${minDmg}–${maxDmg} dano / ${defHp} HP (${(minPct).toFixed(1)}–${(maxPct).toFixed(1)}%)`;

    // Valores de roll individuais
    document.getElementById('dmg-rolls').innerHTML = `
      <div class="dmg-rolls-grid">
        ${rolls.map((r, i) => {
          const pct = ((r / defHp) * 100).toFixed(1);
          const cls = r >= defHp ? 'roll-ko' : r >= defHp * 0.5 ? 'roll-high' : 'roll-low';
          return `<span class="dmg-roll ${cls}">${r} <small>(${pct}%)</small></span>`;
        }).join('')}
      </div>`;

    // Badges de KO (1HKO / 2HKO / 3HKO)
    const ko1 = rolls.filter(r => r >= defHp).length;
    const ko2 = rolls.filter(r => r * 2 >= defHp).length;
    const ko3 = rolls.filter(r => r * 3 >= defHp).length;

    const badges = [];
    if (ko1 === 16) badges.push(`<span class="dmg-ko-badge badge-1hko">1HKO garantido</span>`);
    else if (ko1 > 0) badges.push(`<span class="dmg-ko-badge badge-1hko">1HKO ${ko1}/16</span>`);

    if (ko1 < 16) {
      if (ko2 === 16) badges.push(`<span class="dmg-ko-badge badge-2hko">2HKO garantido</span>`);
      else if (ko2 > 0) badges.push(`<span class="dmg-ko-badge badge-2hko">2HKO ${ko2}/16</span>`);
    }

    if (ko2 < 16 && ko1 < 16) {
      if (ko3 === 16) badges.push(`<span class="dmg-ko-badge badge-3hko">3HKO garantido</span>`);
      else if (ko3 > 0) badges.push(`<span class="dmg-ko-badge badge-3hko">3HKO ${ko3}/16</span>`);
    }

    if (!badges.length) badges.push(`<span class="dmg-ko-badge badge-no">Sem KO</span>`);

    document.getElementById('dmg-ko-badges').innerHTML = badges.join('');
    document.getElementById('dmg-summary').textContent =
      `Atk: ${document.getElementById('dmg-atk-name').value || '?'} vs Def: ${document.getElementById('dmg-def-name').value || '?'} · Power ${cachedMove?.power || '?'} · ${cachedMove?.damage_class?.name || '?'}`;

    const notesEl = document.getElementById('dmg-endturn-notes');
    if (notesEl) {
      const { burnChip, atkHp, atkSpe, defSpe, atkSpeConditions = [], defSpeConditions = [], trickRoom, atkName, defName, extraNotes = [], multiHitData, defStatus, defPassiveItem } = endOfTurn;
      const notes = [];
      if (burnChip) {
        notes.push(`Queimado — atacante perde <strong>${burnChip} HP</strong> ao final do turno (1/16 de ${atkHp} HP)`);
      }
      if (extraNotes.includes('life-orb')) {
        const chip = Math.floor(atkHp / 10);
        notes.push(`Life Orb — atacante perde <strong>${chip} HP</strong> ao final do turno (1/10 de ${atkHp} HP)`);
      }
      // End-of-turn do defensor
      if (defStatus && defStatus !== 'none') {
        const defHpVal = getStat('dmg-def', 'hp', getBaseStats('dmg-def'));
        if (defStatus === 'poison') {
          const chip = Math.floor(defHpVal / 8);
          notes.push(`Veneno — defensor perde <strong>${chip} HP</strong>/turno (1/8 de ${defHpVal} HP)`);
        } else if (defStatus === 'toxic') {
          const base = Math.floor(defHpVal / 16);
          notes.push(`Tóxico — defensor perde <strong>${base}, ${base*2}, ${base*3}…</strong> HP/turno (N/16 de ${defHpVal} HP)`);
        } else if (defStatus === 'burn') {
          const chip = Math.floor(defHpVal / 16);
          notes.push(`Queimado — defensor perde <strong>${chip} HP</strong>/turno (1/16 de ${defHpVal} HP)`);
        }
      }
      if (defPassiveItem && defPassiveItem !== 'none') {
        const defHpVal = getStat('dmg-def', 'hp', getBaseStats('dmg-def'));
        if (defPassiveItem === 'leftovers') {
          const heal = Math.floor(defHpVal / 16);
          notes.push(`Leftovers — defensor recupera <strong>${heal} HP</strong>/turno (1/16 de ${defHpVal} HP)`);
        } else if (defPassiveItem === 'black-sludge-poison') {
          const heal = Math.floor(defHpVal / 16);
          notes.push(`Black Sludge (Poison) — defensor recupera <strong>${heal} HP</strong>/turno`);
        } else if (defPassiveItem === 'black-sludge-other') {
          const chip = Math.floor(defHpVal / 8);
          notes.push(`Black Sludge (não-Poison) — defensor perde <strong>${chip} HP</strong>/turno (1/8 de ${defHpVal} HP)`);
        }
      }

      if (atkSpe != null && defSpe != null) {
        const atkFirst = trickRoom ? atkSpe < defSpe : atkSpe > defSpe;
        const tied = atkSpe === defSpe;
        const trLabel = trickRoom ? ' <em>(Trick Room)</em>' : '';
        const atkCond = atkSpeConditions.length ? ` <em>(${atkSpeConditions.join(', ')})</em>` : '';
        const defCond = defSpeConditions.length ? ` <em>(${defSpeConditions.join(', ')})</em>` : '';
        if (tied) {
          notes.push(`Velocidade: <strong>${atkName} ${atkSpe}</strong>${atkCond} vs <strong>${defName} ${defSpe}</strong>${defCond} — empate (coin flip)${trLabel}`);
        } else {
          const first = atkFirst ? atkName : defName;
          notes.push(`Velocidade: <strong>${atkName} ${atkSpe}</strong>${atkCond} vs <strong>${defName} ${defSpe}</strong>${defCond} — <strong>${first}</strong> age primeiro${trLabel}`);
        }
      }
      notesEl.innerHTML = notes.map(n => `<div>${n}</div>`).join('');

      // Seção multi-hit
      let multiEl = document.getElementById('dmg-multihit-section');
      if (!multiEl) {
        multiEl = document.createElement('div');
        multiEl.id = 'dmg-multihit-section';
        multiEl.style.cssText = 'margin-top:10px;';
        notesEl.after(multiEl);
      }
      if (multiHitData) {
        const minRoll = rolls[0];
        const maxRoll = rolls[rolls.length - 1];
        const rows = multiHitData.map(({ hits, prob, label }) => {
          const minTotal = minRoll * hits;
          const maxTotal = maxRoll * hits;
          const minPct = ((minTotal / defHp) * 100).toFixed(1);
          const maxPct = ((maxTotal / defHp) * 100).toFixed(1);
          const probStr = prob < 1 ? ` <span style="color:var(--text2);font-size:11px">(${(prob * 100).toFixed(0)}%)</span>` : '';
          const ko = minTotal >= defHp ? '✓ 1HKO' : maxTotal >= defHp ? '⚡ 1HKO possível' :
                     minTotal * 2 >= defHp ? '✓ 2HKO' : '';
          const koTag = ko ? ` <span style="color:#4c8;font-size:11px">${ko}</span>` : '';
          return `<div style="font-size:12px;padding:2px 0"><strong>${label}</strong>${probStr}: <strong>${minTotal}–${maxTotal}</strong> (${minPct}–${maxPct}%)${koTag}</div>`;
        }).join('');
        multiEl.innerHTML = `<div style="font-size:12px;color:var(--text2);margin-bottom:4px;font-weight:600">Multi-Hit</div>${rows}`;
      } else {
        multiEl.innerHTML = '';
      }
    }

    resultsEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function setupIvToggle(prefix) {
    const btn  = document.getElementById(`${prefix}-iv-toggle`);
    const grid = document.getElementById(`${prefix}-iv-grid`);
    if (!btn || !grid) return;
    btn.addEventListener('click', () => {
      const opening = btn.dataset.active !== 'true';
      btn.dataset.active = opening ? 'true' : 'false';
      btn.textContent = opening ? 'personalizados ▼ (clique para usar 31)' : 'todos 31 ▶ personalizar';
      grid.classList.toggle('hidden', !opening);
    });
  }

  function init() {
    document.getElementById('dmg-atk-form').innerHTML = buildForm('dmg-atk', 'Atacante');
    document.getElementById('dmg-def-form').innerHTML = buildForm('dmg-def', 'Defensor');

    setupAutocomplete('dmg-atk');
    setupAutocomplete('dmg-def');
    setupItemAutocomplete('dmg-atk');
    setupItemAutocomplete('dmg-def');
    setupAbilityAutocomplete('dmg-atk');
    setupAbilityAutocomplete('dmg-def');
    setupIvToggle('dmg-atk');
    setupIvToggle('dmg-def');
    setupMoveAutocomplete();

    document.getElementById('dmg-atk-nature').addEventListener('change', () => renderStatsRow('dmg-atk'));
    document.getElementById('dmg-def-nature').addEventListener('change', () => renderStatsRow('dmg-def'));

    document.getElementById('dmg-calc-btn').addEventListener('click', calculate);
  }

  return { init };
})();
