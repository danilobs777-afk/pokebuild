'use strict';

/**
 * dmgCalc.js — Calculadora de dano
 * ---------------------------------
 * Usa o bundle local do Smogon Calc para reproduzir o motor competitivo de dano.
 * O calculo interno permanece como fallback quando algum dado nao casa com a
 * base local vendorizada.
 *
 * Dependências: data.js (STAT_KEYS, STAT_LABELS, NATURES, POKEMON_DB, calcStat),
 *   ui.js (PokeBuildUI), api.js (PokeAPI.getPokemon, PokeAPI.getMove).
 */

const DmgCalc = (() => {
  // Shared inventory for the advanced panel. Keeping IDs, defaults and help
  // text together avoids three separate maps drifting out of sync.
  const ADVANCED_CONTROL_IDS = [
    'dmg-magic-room', 'dmg-wonder-room', 'dmg-gravity', 'dmg-fairy-aura', 'dmg-dark-aura', 'dmg-aura-break',
    'dmg-beads-ruin', 'dmg-sword-ruin', 'dmg-tablets-ruin', 'dmg-vessel-ruin',
    'dmg-helping-hand', 'dmg-battery', 'dmg-power-spot', 'dmg-flower-gift-atk', 'dmg-steely-spirit',
    'dmg-reflect', 'dmg-light-screen', 'dmg-aurora-veil', 'dmg-friend-guard', 'dmg-protected', 'dmg-foresight', 'dmg-flower-gift-def',
    'dmg-stealth-rock', 'dmg-steelsurge', 'dmg-vinelash', 'dmg-wildfire', 'dmg-cannonade', 'dmg-volcalith', 'dmg-seeded', 'dmg-salt-cured',
    'dmg-use-z', 'dmg-use-max', 'dmg-stellar-first', 'dmg-atk-dynamax', 'dmg-def-dynamax', 'dmg-atk-ability-on', 'dmg-def-ability-on',
    'dmg-atk-power-trick', 'dmg-def-power-trick',
    'dmg-spikes', 'dmg-atk-boosted-stat', 'dmg-def-boosted-stat', 'dmg-allies-fainted', 'dmg-move-times-used', 'dmg-metronome-turns',
    'dmg-atk-dynamax-level', 'dmg-def-dynamax-level', 'dmg-toxic-counter', 'dmg-def-switching',
  ];

  const ADVANCED_DEFAULTS = {
    'dmg-spikes': '0',
    'dmg-atk-boosted-stat': '',
    'dmg-def-boosted-stat': '',
    'dmg-allies-fainted': '0',
    'dmg-move-times-used': '1',
    'dmg-metronome-turns': '0',
    'dmg-atk-dynamax-level': '10',
    'dmg-def-dynamax-level': '10',
    'dmg-toxic-counter': '1',
    'dmg-def-switching': '',
  };

  const ADVANCED_TOOLTIPS = {
    'dmg-magic-room': 'Ignora efeitos de itens por 5 turnos quando o motor suporta a interacao.',
    'dmg-wonder-room': 'Troca Defesa e Sp.Def no calculo.',
    'dmg-gravity': 'Remove imunidades de Ground por airborne/Levitate e afeta alguns golpes.',
    'dmg-fairy-aura': 'Aumenta golpes Fairy; use com Aura Break para inverter.',
    'dmg-dark-aura': 'Aumenta golpes Dark; use com Aura Break para inverter.',
    'dmg-aura-break': 'Inverte Fairy Aura e Dark Aura.',
    'dmg-beads-ruin': 'Ativa o redutor global de Sp.Def da habilidade Beads of Ruin.',
    'dmg-sword-ruin': 'Ativa o redutor global de Defense da habilidade Sword of Ruin.',
    'dmg-tablets-ruin': 'Ativa o redutor global de Attack da habilidade Tablets of Ruin.',
    'dmg-vessel-ruin': 'Ativa o redutor global de Sp.Atk da habilidade Vessel of Ruin.',
    'dmg-helping-hand': 'Aplica Helping Hand ao atacante em Doubles.',
    'dmg-battery': 'Aliado com Battery aumentando golpe especial.',
    'dmg-power-spot': 'Aliado com Power Spot aumentando dano.',
    'dmg-flower-gift-atk': 'Flower Gift no lado atacante sob sol.',
    'dmg-steely-spirit': 'Aliado com Steely Spirit aumentando golpes Steel.',
    'dmg-reflect': 'Tela contra dano fisico no lado defensor.',
    'dmg-light-screen': 'Tela contra dano especial no lado defensor.',
    'dmg-aurora-veil': 'Aurora Veil no lado defensor.',
    'dmg-friend-guard': 'Aliado do defensor com Friend Guard.',
    'dmg-protected': 'Defensor esta usando Protect ou equivalente.',
    'dmg-foresight': 'Permite atingir alvos Ghost com Normal/Fighting em geracoes antigas.',
    'dmg-flower-gift-def': 'Flower Gift no lado defensor sob sol.',
    'dmg-stealth-rock': 'Entry hazard considerado na leitura de KO do Smogon.',
    'dmg-steelsurge': 'Entry hazard G-Max Steelsurge considerado na leitura de KO.',
    'dmg-vinelash': 'Residual G-Max Vine Lash ao fim do turno.',
    'dmg-wildfire': 'Residual G-Max Wildfire ao fim do turno.',
    'dmg-cannonade': 'Residual G-Max Cannonade ao fim do turno.',
    'dmg-volcalith': 'Residual G-Max Volcalith ao fim do turno.',
    'dmg-seeded': 'Leech Seed ativo no defensor.',
    'dmg-salt-cured': 'Salt Cure ativo no defensor.',
    'dmg-use-z': 'Converte o golpe em Z-Move quando a geracao permite.',
    'dmg-use-max': 'Converte o golpe em Max Move quando a geracao permite.',
    'dmg-stellar-first': 'Marca o primeiro uso Stellar para Tera Blast/Judgment e golpes afetados.',
    'dmg-atk-dynamax': 'Atacante esta Dynamaxed.',
    'dmg-def-dynamax': 'Defensor esta Dynamaxed, aumentando HP conforme o nivel Dynamax.',
    'dmg-atk-ability-on': 'Forca habilidades condicionais do atacante como ativas.',
    'dmg-def-ability-on': 'Forca habilidades condicionais do defensor como ativas.',
    'dmg-atk-power-trick': 'Troca Attack e Defense do atacante para golpes fisicos.',
    'dmg-def-power-trick': 'Troca Defense e Attack do defensor para golpes fisicos.',
    'dmg-spikes': 'Camadas de Spikes no lado defensor para a leitura de KO.',
    'dmg-atk-boosted-stat': 'Stat escolhido por Protosynthesis/Quark Drive no atacante.',
    'dmg-def-boosted-stat': 'Stat escolhido por Protosynthesis/Quark Drive no defensor.',
    'dmg-allies-fainted': 'Contador usado por habilidades/golpes como Supreme Overlord.',
    'dmg-move-times-used': 'Turnos consecutivos para golpes que acumulam efeito.',
    'dmg-metronome-turns': 'Contador do item Metronome, nao o golpe Metronome.',
    'dmg-atk-dynamax-level': 'Nivel Dynamax do atacante.',
    'dmg-def-dynamax-level': 'Nivel Dynamax do defensor.',
    'dmg-toxic-counter': 'Turno atual do Toxic para chip N/16.',
    'dmg-def-switching': 'Estado de switch do defensor, usado por Pursuit e afins.',
  };

  function esc(value) {
    return PokeBuildUI.escapeHtml(value);
  }

  function canonicalPokemonName(value) {
    const raw = (value || '').trim();
    if (!raw) return '';
    if (POKEMON_DB[raw]) return raw;
    const lower = raw.toLowerCase();
    return Object.keys(POKEMON_DB).find(name => name.toLowerCase() === lower) || '';
  }

  function currentPokemonName(prefix) {
    return canonicalPokemonName(document.getElementById(`${prefix}-name`)?.value);
  }

  function currentPokemonTypes(prefix) {
    const name = currentPokemonName(prefix);
    if (!name) return [];
    const active = new Set(getActiveTypes());
    return (POKEMON_DB[name] || []).filter(type => active.has(type));
  }

  function moveTypeLabel(move = cachedMove) {
    const typeName = move?.type?.name;
    return typeName ? typeName[0].toUpperCase() + typeName.slice(1) : '';
  }

  function effLabel(value) {
    const n = Number(value);
    if (n === 0.25) return '1/4x';
    if (n === 0.5) return '1/2x';
    return `${Number.isFinite(n) ? n : 1}x`;
  }

  function setValidation(kind, messages) {
    const el = document.getElementById('dmg-validation');
    if (!el) return;
    const list = Array.isArray(messages) ? messages.filter(Boolean) : [messages].filter(Boolean);
    if (!list.length) {
      el.className = 'dmg-validation hidden';
      el.innerHTML = '';
      return;
    }
    el.className = `dmg-validation ${kind || 'info'}`;
    el.innerHTML = list.map(msg => `<div>${esc(msg)}</div>`).join('');
  }

  function setControlDisabled(id, disabled, reason = '') {
    const el = document.getElementById(id);
    if (!el) return;
    el.disabled = disabled;
    if (disabled) {
      if (el.type === 'checkbox') el.checked = false;
      else if (Object.prototype.hasOwnProperty.call(ADVANCED_DEFAULTS, id)) el.value = ADVANCED_DEFAULTS[id];
      else if (id.endsWith('-tera')) el.value = 'none';
      else if (id === 'dmg-terrain') el.value = 'none';
    }

    const wrapper = el.closest('.check-label, .dmg-inline-control, .field-group');
    if (wrapper) {
      wrapper.classList.toggle('is-disabled', disabled);
      if (reason) wrapper.title = reason;
      else if (ADVANCED_TOOLTIPS[id]) wrapper.title = ADVANCED_TOOLTIPS[id];
    }
  }

  function setupAdvancedTooltips() {
    Object.entries(ADVANCED_TOOLTIPS).forEach(([id, tip]) => {
      const el = document.getElementById(id);
      if (!el) return;
      const wrapper = el.closest('.check-label, .dmg-inline-control') || el;
      wrapper.classList?.add('has-help');
      wrapper.title = tip;
    });
  }

  function formatNotesForGen(gen) {
    if (gen === 9) return 'Gen 9: Tera, Stellar, Ruin e Salt Cure liberados; Z-Move e Dynamax ficam bloqueados.';
    if (gen === 8) return 'Gen 8: Dynamax, Max Move e efeitos G-Max liberados; Tera/Stellar e Z-Move ficam bloqueados.';
    if (gen === 7) return 'Gen 7: Z-Move liberado; Dynamax, Max Move, Tera e Stellar ficam bloqueados.';
    if (gen >= 3) return `Gen ${gen}: habilidades, itens e naturezas ativas conforme o motor; Tera, Z-Move e Dynamax ficam bloqueados.`;
    if (gen === 2) return 'Gen 2: itens ativos; habilidades, naturezas, Tera, Z-Move e Dynamax ficam bloqueados.';
    return 'Gen 1: itens, habilidades, naturezas, Tera, Z-Move e Dynamax ficam bloqueados.';
  }

  function syncDamageGenerationLocks() {
    // The exact calc generation is allowed to be narrower than the global gen-bar.
    // Invalid mechanics are disabled and ignored, while typed item/ability/nature
    // text is preserved so switching generations does not destroy user input.
    const gen = selectedCalcGen();
    const notesEl = document.getElementById('dmg-format-notes');
    if (notesEl) notesEl.textContent = formatNotesForGen(gen);

    ['dmg-atk-item', 'dmg-def-item', 'dmg-def-passive-item'].forEach(id =>
      setControlDisabled(id, !featureAllowed('item', gen), 'Itens nao existem nesta geracao.')
    );
    ['dmg-atk-ability', 'dmg-def-ability', 'dmg-atk-ability-on', 'dmg-def-ability-on'].forEach(id =>
      setControlDisabled(id, !featureAllowed('ability', gen), 'Habilidades nao existem nesta geracao.')
    );
    ['dmg-atk-nature', 'dmg-def-nature'].forEach(id =>
      setControlDisabled(id, !featureAllowed('nature', gen), 'Naturezas nao existem nesta geracao.')
    );
    ['dmg-atk-tera', 'dmg-def-tera'].forEach(id =>
      setControlDisabled(id, !featureAllowed('tera', gen), 'Terastalizacao existe apenas na Gen 9.')
    );

    setControlDisabled('dmg-terrain', !featureAllowed('terrain', gen), 'Terrain existe a partir da Gen 6.');
    setControlDisabled('dmg-use-z', !featureAllowed('zMove', gen), 'Z-Move existe apenas na Gen 7.');
    setControlDisabled('dmg-use-max', !featureAllowed('maxMove', gen), 'Max Move existe apenas na Gen 8.');
    setControlDisabled('dmg-atk-dynamax', !featureAllowed('dynamax', gen), 'Dynamax existe apenas na Gen 8.');
    setControlDisabled('dmg-def-dynamax', !featureAllowed('dynamax', gen), 'Dynamax existe apenas na Gen 8.');
    setControlDisabled('dmg-atk-dynamax-level', !featureAllowed('dynamax', gen), 'Nivel Dynamax existe apenas na Gen 8.');
    setControlDisabled('dmg-def-dynamax-level', !featureAllowed('dynamax', gen), 'Nivel Dynamax existe apenas na Gen 8.');
    setControlDisabled('dmg-stellar-first', !featureAllowed('stellar', gen), 'Stellar existe apenas com Tera na Gen 9.');

    ['dmg-fairy-aura', 'dmg-dark-aura', 'dmg-aura-break'].forEach(id =>
      setControlDisabled(id, !featureAllowed('aura', gen), 'Auras existem a partir da Gen 6.')
    );
    ['dmg-beads-ruin', 'dmg-sword-ruin', 'dmg-tablets-ruin', 'dmg-vessel-ruin'].forEach(id =>
      setControlDisabled(id, !featureAllowed('ruin', gen), 'Habilidades Ruin existem na Gen 9.')
    );
    setControlDisabled('dmg-battery', !featureAllowed('battery', gen), 'Battery existe a partir da Gen 7.');
    setControlDisabled('dmg-power-spot', !featureAllowed('powerSpot', gen), 'Power Spot existe a partir da Gen 8.');
    setControlDisabled('dmg-steely-spirit', !featureAllowed('steelySpirit', gen), 'Steely Spirit existe a partir da Gen 8.');
    ['dmg-flower-gift-atk', 'dmg-flower-gift-def'].forEach(id =>
      setControlDisabled(id, !featureAllowed('flowerGift', gen), 'Flower Gift existe a partir da Gen 4.')
    );
    setControlDisabled('dmg-friend-guard', !featureAllowed('friendGuard', gen), 'Friend Guard existe a partir da Gen 5.');
    setControlDisabled('dmg-aurora-veil', !featureAllowed('auroraVeil', gen), 'Aurora Veil existe a partir da Gen 7.');
    setControlDisabled('dmg-foresight', !featureAllowed('foresight', gen), 'Foresight so e relevante nas geracoes 2 a 7.');
    setControlDisabled('dmg-magic-room', !featureAllowed('magicRoom', gen), 'Magic Room existe a partir da Gen 5.');
    setControlDisabled('dmg-wonder-room', !featureAllowed('wonderRoom', gen), 'Wonder Room existe a partir da Gen 5.');
    setControlDisabled('dmg-gravity', !featureAllowed('gravity', gen), 'Gravity existe a partir da Gen 4.');
    ['dmg-atk-power-trick', 'dmg-def-power-trick'].forEach(id =>
      setControlDisabled(id, !featureAllowed('powerTrick', gen), 'Power Trick existe a partir da Gen 4.')
    );
    setControlDisabled('dmg-stealth-rock', !featureAllowed('stealthRock', gen), 'Stealth Rock existe a partir da Gen 4.');
    setControlDisabled('dmg-spikes', !featureAllowed('spikes', gen), 'Spikes existe a partir da Gen 2.');
    ['dmg-steelsurge', 'dmg-vinelash', 'dmg-wildfire', 'dmg-cannonade', 'dmg-volcalith'].forEach(id =>
      setControlDisabled(id, !featureAllowed('gmax', gen), 'Efeitos G-Max existem na Gen 8.')
    );
    setControlDisabled('dmg-salt-cured', !featureAllowed('saltCure', gen), 'Salt Cure existe na Gen 9.');
    ['dmg-atk-boosted-stat', 'dmg-def-boosted-stat'].forEach(id =>
      setControlDisabled(id, !featureAllowed('boostedStat', gen), 'Boosted stat e usado principalmente por mecanicas da Gen 9.')
    );
    setControlDisabled('dmg-allies-fainted', !featureAllowed('alliesFainted', gen), 'Aliados caidos e relevante para mecanicas modernas como Supreme Overlord.');
    setControlDisabled('dmg-metronome-turns', !featureAllowed('metronomeItem', gen), 'O item Metronome existe a partir da Gen 4.');
    setControlDisabled('dmg-def-switching', !featureAllowed('switching', gen), 'Switching e usado principalmente por Pursuit nas geracoes 2 a 7.');
  }

  function resetControlValue(id) {
    const el = document.getElementById(id);
    if (!el) return;
    if (el.type === 'checkbox') el.checked = false;
    else if (Object.prototype.hasOwnProperty.call(ADVANCED_DEFAULTS, id)) el.value = ADVANCED_DEFAULTS[id];
  }

  function clearAdvancedControls() {
    ADVANCED_CONTROL_IDS.forEach(resetControlValue);
  }

  function applyDamagePreset(name) {
    clearAdvancedControls();
    const gameType = document.getElementById('dmg-game-type');
    const hitCount = document.getElementById('dmg-hit-count');
    if (hitCount) hitCount.value = 'auto';

    if (name === 'singles') {
      if (gameType) gameType.value = 'Singles';
    } else if (name === 'hazards') {
      if (gameType) gameType.value = 'Singles';
      const rocks = document.getElementById('dmg-stealth-rock');
      const spikes = document.getElementById('dmg-spikes');
      if (rocks && !rocks.disabled) rocks.checked = true;
      if (spikes && !spikes.disabled) spikes.value = '1';
    } else if (name === 'vgc') {
      if (gameType) gameType.value = 'Doubles';
      const helpingHand = document.getElementById('dmg-helping-hand');
      const protect = document.getElementById('dmg-protected');
      if (helpingHand && !helpingHand.disabled) helpingHand.checked = true;
      if (protect && !protect.disabled) protect.checked = false;
    }

    syncDamageGenerationLocks();
    setValidation('', []);
  }

  function setupDamagePresets() {
    document.querySelectorAll('[data-dmg-preset]').forEach(button => {
      button.addEventListener('click', () => applyDamagePreset(button.dataset.dmgPreset || 'clear'));
    });
  }

  function setPokemonStatus(prefix, kind, text) {
    const el = document.getElementById(`${prefix}-stat-status`);
    if (!el) return;
    if (!text) {
      el.className = 'dmg-stat-status hidden';
      el.textContent = '';
      return;
    }
    el.className = `dmg-stat-status ${kind || 'info'}`;
    el.textContent = text;
  }

  function resetPokemonData(prefix) {
    const bsWrap = document.getElementById(`${prefix}-base-stats`);
    if (bsWrap) {
      bsWrap.classList.add('hidden');
      delete bsWrap.dataset.bs;
      delete bsWrap.dataset.loadedName;
    }
    const spriteWrap = document.getElementById(`${prefix}-sprite`);
    if (spriteWrap) spriteWrap.innerHTML = '';
    setPokemonStatus(prefix, 'warning', 'Selecione no autocomplete para carregar stats reais.');
    syncDerivedControls();
  }

  function syncDerivedControls() {
    const notesEl = document.getElementById('dmg-auto-notes');
    if (!cachedMove) {
      if (notesEl) notesEl.textContent = '';
      return;
    }

    const moveType = moveTypeLabel();
    const notes = [];
    const atkTypes = currentPokemonTypes('dmg-atk');
    const defTypes = currentPokemonTypes('dmg-def');

    if (moveType && atkTypes.length) {
      const stab = atkTypes.includes(moveType);
      const stabCheck = document.getElementById('dmg-stab');
      if (stabCheck) stabCheck.checked = stab;
      notes.push(`STAB ${stab ? 'sim' : 'nao'} (${atkTypes.join('/')})`);
    }

    if (moveType && defTypes.length) {
      const eff = typeEff(moveType, defTypes);
      const effSel = document.getElementById('dmg-eff');
      if (effSel) effSel.value = String(eff);
      notes.push(`Efetividade ${effLabel(eff)} vs ${defTypes.join('/')}`);
    }

    if (notesEl) notesEl.textContent = notes.length ? `Auto: ${notes.join(' · ')}` : '';
  }

  // ── Mini build form (attacker / defender) ────────────────────
  function buildForm(prefix, label) {
    const natureOpts = Object.keys(NATURES).map(n => `<option value="${n}"${n==='Hardy'?' selected':''}>${n}</option>`).join('');
    const typeOpts = ['none', ...TYPES].map(type => {
      const label = type === 'none' ? 'Sem Tera' : type;
      return `<option value="${type}">${label}</option>`;
    }).join('');
    return `
      <div class="field-group">
        <label class="field-label">Pokémon</label>
        <div class="autocomplete-wrap">
          <input type="text" class="text-input" id="${prefix}-name" placeholder="${label}" autocomplete="off">
          <ul class="suggestions hidden" id="${prefix}-sug"></ul>
        </div>
        <div id="${prefix}-sprite" style="margin-top:6px;"></div>
        <div id="${prefix}-stat-status" class="dmg-stat-status hidden"></div>
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
        <div class="field-group" style="flex:1;min-width:110px;">
          <label class="field-label">Tera Type</label>
          <select class="select-input" id="${prefix}-tera">${typeOpts}</select>
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
      const exactName = canonicalPokemonName(inputEl.value);
      const loadedName = document.getElementById(`${prefix}-base-stats`)?.dataset.loadedName || '';
      if (loadedName && loadedName !== exactName) resetPokemonData(prefix);
      if (exactName) syncDerivedControls();
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
      syncDerivedControls();
    });

    PokeBuildUI.bindAutocomplete(inputEl, suggestEl, {
      onPick: li => li.click(),
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
    PokeBuildUI.bindAutocomplete(inputEl, suggestEl, {
      onPick: li => {
      const value = li.dataset.value;
      if (!value) return;
      inputEl.value = value;
      suggestEl.classList.add('hidden');
      const icon = iconEl();
      if (icon) {
        icon.src = `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/${PokeAPI.apiName(value)}.png`;
        icon.classList.remove('hidden');
        icon.onerror = () => icon.classList.add('hidden');
      }
      },
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
    PokeBuildUI.bindAutocomplete(inputEl, suggestEl, {
      onPick: li => {
      if (!li.dataset.name) return;
      inputEl.value = li.dataset.name;
      suggestEl.classList.add('hidden');
      },
    });
  }

  function loadPokemonData(prefix, name) {
    PokeAPI.getPokemon(name).then(data => {
      const spriteWrap = document.getElementById(`${prefix}-sprite`);
      if (spriteWrap)
        spriteWrap.innerHTML = `<img src="${PokeAPI.pixelSpriteUrl(data)}" class="pkmn-sprite-sm" alt="${name}">`;

      const statsRow = document.getElementById(`${prefix}-stats-row`);
      const bsWrap   = document.getElementById(`${prefix}-base-stats`);
      if (statsRow && bsWrap) {
        const keyMap = { hp:'hp', attack:'atk', defense:'def', 'special-attack':'spa', 'special-defense':'spd', speed:'spe' };
        const bs = {};
        data.stats.forEach(s => { const k = keyMap[s.stat.name]; if(k) bs[k]=s.base_stat; });
        bsWrap.classList.remove('hidden');
        bsWrap.dataset.bs = JSON.stringify(bs);
        bsWrap.dataset.loadedName = name;
        setPokemonStatus(prefix, 'success', 'Stats reais carregados.');
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

      syncDerivedControls();
    }).catch(() => {
      setPokemonStatus(prefix, 'error', 'Nao foi possivel carregar stats pela PokeAPI.');
    });
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
   * @param {{stab, typeEff, crit, weather, burnAtkPenalty}} mods - Modificadores
   * @returns {number[]} 16 valores de dano, do mínimo ao máximo
   */
  function calcDamage(atk, def, power, level, mods) {
    const { stab, typeEff, crit, weather, burnAtkPenalty, critMult = 1.5 } = mods;
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
      if (burnAtkPenalty) dmg = Math.floor(dmg * 0.5);
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
    const nature   = featureAllowed('nature') ? (document.getElementById(`${prefix}-nature`)?.value || 'Hardy') : 'Serious';
    const level    = parseInt(document.getElementById(`${prefix}-level`)?.value) || 50;
    const base     = baseStats?.[stat] ?? 80;
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

  function defaultCalcGen() {
    const active = GenerationRules?.activeGen?.() || 'gen6plus';
    if (active === 'gen1') return 1;
    if (active === 'gen2to5') return 5;
    return 9;
  }

  function selectedCalcGen() {
    return readNumber('dmg-calc-gen', defaultCalcGen());
  }

  function featureAllowed(feature, gen = selectedCalcGen()) {
    const rules = {
      item: gen >= 2,
      ability: gen >= 3,
      nature: gen >= 3,
      terrain: gen >= 6,
      tera: gen >= 9,
      zMove: gen === 7,
      maxMove: gen === 8,
      dynamax: gen === 8,
      stellar: gen >= 9,
      aura: gen >= 6,
      ruin: gen >= 9,
      battery: gen >= 7,
      powerSpot: gen >= 8,
      steelySpirit: gen >= 8,
      flowerGift: gen >= 4,
      friendGuard: gen >= 5,
      auroraVeil: gen >= 7,
      foresight: gen >= 2 && gen <= 7,
      magicRoom: gen >= 5,
      wonderRoom: gen >= 5,
      gravity: gen >= 4,
      powerTrick: gen >= 4,
      stealthRock: gen >= 4,
      spikes: gen >= 2,
      gmax: gen === 8,
      saltCure: gen >= 9,
      boostedStat: gen >= 9,
      alliesFainted: gen >= 9,
      metronomeItem: gen >= 4,
      switching: gen >= 2 && gen <= 7,
    };
    return rules[feature] ?? true;
  }

  function syncCalcGenSelect() {
    const select = document.getElementById('dmg-calc-gen');
    if (!select || select.dataset.userSelected === 'true') return;
    select.value = String(defaultCalcGen());
  }

  function readNumber(id, fallback) {
    const value = Number(document.getElementById(id)?.value);
    return Number.isFinite(value) ? value : fallback;
  }

  function readChecked(id) {
    return document.getElementById(id)?.checked ?? false;
  }

  function readSelectValue(id, fallback = '') {
    const value = document.getElementById(id)?.value;
    return value == null || value === '' ? fallback : value;
  }

  function readClampedNumber(id, fallback, min, max) {
    const value = readNumber(id, fallback);
    return Math.min(max, Math.max(min, value));
  }

  function readStatValues(prefix, group, fallback) {
    return STAT_KEYS.reduce((acc, stat) => {
      acc[stat] = readNumber(`${prefix}-${group}-${stat}`, fallback);
      return acc;
    }, {});
  }

  function readIvs(prefix) {
    const active = document.getElementById(`${prefix}-iv-toggle`)?.dataset.active === 'true';
    if (!active) return STAT_KEYS.reduce((acc, stat) => ({ ...acc, [stat]: 31 }), {});
    return readStatValues(prefix, 'iv', 31);
  }

  function teraValue(prefix) {
    const value = document.getElementById(`${prefix}-tera`)?.value || 'none';
    return value === 'none' ? '' : value;
  }

  function readPokemonState(prefix, role, gen = selectedCalcGen()) {
    const selectedDefenderStatus = role === 'defender'
      ? ({ burn: 'brn', poison: 'psn', toxic: 'tox' }[document.getElementById('dmg-def-status')?.value] || '')
      : '';
    const isParalyzed = readChecked(`${prefix}-paralyzed`);
    const status = selectedDefenderStatus || (isParalyzed ? 'par' : '');
    return {
      name: document.getElementById(`${prefix}-name`)?.value?.trim() || '',
      ability: featureAllowed('ability', gen) ? (document.getElementById(`${prefix}-ability`)?.value?.trim() || '') : '',
      item: featureAllowed('item', gen) ? (document.getElementById(`${prefix}-item`)?.value?.trim() || '') : '',
      nature: featureAllowed('nature', gen) ? (document.getElementById(`${prefix}-nature`)?.value || 'Hardy') : 'Serious',
      level: readNumber(`${prefix}-level`, 50),
      currentHpPercent: readNumber(`${prefix}-hp-pct`, 100),
      evs: readStatValues(prefix, 'ev', 0),
      ivs: readIvs(prefix),
      offenseStage: readNumber(`${prefix}-stage-off`, 0),
      defenseStage: readNumber(`${prefix}-stage-off`, 0),
      speedStage: readNumber(`${prefix}-stage-spe`, 0),
      teraType: featureAllowed('tera', gen) ? teraValue(prefix) : '',
      status,
      tailwind: readChecked(`${prefix}-tailwind`),
      isBurned: role === 'attacker' && readChecked('dmg-burn-atk'),
      abilityOn: featureAllowed('ability', gen) && readChecked(role === 'attacker' ? 'dmg-atk-ability-on' : 'dmg-def-ability-on'),
      isDynamaxed: featureAllowed('dynamax', gen) && readChecked(role === 'attacker' ? 'dmg-atk-dynamax' : 'dmg-def-dynamax'),
      dynamaxLevel: readClampedNumber(role === 'attacker' ? 'dmg-atk-dynamax-level' : 'dmg-def-dynamax-level', 10, 0, 10),
      boostedStat: featureAllowed('boostedStat', gen) ? readSelectValue(role === 'attacker' ? 'dmg-atk-boosted-stat' : 'dmg-def-boosted-stat') : '',
      alliesFainted: role === 'attacker' && featureAllowed('alliesFainted', gen) ? readClampedNumber('dmg-allies-fainted', 0, 0, 5) : 0,
      toxicCounter: role === 'defender' ? readClampedNumber('dmg-toxic-counter', 1, 1, 15) : 1,
    };
  }

  function buildSmogonState() {
    const gen = selectedCalcGen();
    return {
      gen,
      gameType: document.getElementById('dmg-game-type')?.value || 'Singles',
      attacker: readPokemonState('dmg-atk', 'attacker', gen),
      defender: readPokemonState('dmg-def', 'defender', gen),
      move: {
        name: document.getElementById('dmg-move-input')?.value?.trim() || cachedMove?.name || '',
        type: cachedMove?.type?.name || '',
        category: cachedMove?.damage_class?.name || '',
        power: cachedMove?.power || 0,
        useZ: featureAllowed('zMove', gen) && readChecked('dmg-use-z') && !readChecked('dmg-use-max'),
        useMax: featureAllowed('maxMove', gen) && readChecked('dmg-use-max'),
        isStellarFirstUse: featureAllowed('stellar', gen) && readChecked('dmg-stellar-first'),
        timesUsed: readClampedNumber('dmg-move-times-used', 1, 1, 5),
        timesUsedWithMetronome: featureAllowed('metronomeItem', gen) ? readClampedNumber('dmg-metronome-turns', 0, 0, 5) : 0,
      },
      weather: document.getElementById('dmg-weather')?.value || 'none',
      terrain: featureAllowed('terrain', gen) ? (document.getElementById('dmg-terrain')?.value || 'none') : 'none',
      isCrit: readChecked('dmg-crit'),
      hits: document.getElementById('dmg-hit-count')?.value || 'auto',
      field: {
        reflect: readChecked('dmg-reflect'),
        lightScreen: readChecked('dmg-light-screen'),
        auroraVeil: readChecked('dmg-aurora-veil'),
        helpingHand: readChecked('dmg-helping-hand'),
        friendGuard: readChecked('dmg-friend-guard'),
        protected: readChecked('dmg-protected'),
        gravity: featureAllowed('gravity', gen) && readChecked('dmg-gravity'),
        magicRoom: featureAllowed('magicRoom', gen) && readChecked('dmg-magic-room'),
        wonderRoom: featureAllowed('wonderRoom', gen) && readChecked('dmg-wonder-room'),
        fairyAura: featureAllowed('aura', gen) && readChecked('dmg-fairy-aura'),
        darkAura: featureAllowed('aura', gen) && readChecked('dmg-dark-aura'),
        auraBreak: featureAllowed('aura', gen) && readChecked('dmg-aura-break'),
        beadsRuin: featureAllowed('ruin', gen) && readChecked('dmg-beads-ruin'),
        swordRuin: featureAllowed('ruin', gen) && readChecked('dmg-sword-ruin'),
        tabletsRuin: featureAllowed('ruin', gen) && readChecked('dmg-tablets-ruin'),
        vesselRuin: featureAllowed('ruin', gen) && readChecked('dmg-vessel-ruin'),
        battery: featureAllowed('battery', gen) && readChecked('dmg-battery'),
        powerSpot: featureAllowed('powerSpot', gen) && readChecked('dmg-power-spot'),
        flowerGiftAtk: featureAllowed('flowerGift', gen) && readChecked('dmg-flower-gift-atk'),
        steelySpirit: featureAllowed('steelySpirit', gen) && readChecked('dmg-steely-spirit'),
        foresight: featureAllowed('foresight', gen) && readChecked('dmg-foresight'),
        flowerGiftDef: featureAllowed('flowerGift', gen) && readChecked('dmg-flower-gift-def'),
        stealthRock: featureAllowed('stealthRock', gen) && readChecked('dmg-stealth-rock'),
        steelsurge: featureAllowed('gmax', gen) && readChecked('dmg-steelsurge'),
        vinelash: featureAllowed('gmax', gen) && readChecked('dmg-vinelash'),
        wildfire: featureAllowed('gmax', gen) && readChecked('dmg-wildfire'),
        cannonade: featureAllowed('gmax', gen) && readChecked('dmg-cannonade'),
        volcalith: featureAllowed('gmax', gen) && readChecked('dmg-volcalith'),
        seeded: readChecked('dmg-seeded'),
        saltCured: featureAllowed('saltCure', gen) && readChecked('dmg-salt-cured'),
        spikes: featureAllowed('spikes', gen) ? readClampedNumber('dmg-spikes', 0, 0, 3) : 0,
        powerTrickAtk: featureAllowed('powerTrick', gen) && readChecked('dmg-atk-power-trick'),
        powerTrickDef: featureAllowed('powerTrick', gen) && readChecked('dmg-def-power-trick'),
        defenderSwitching: featureAllowed('switching', gen) ? readSelectValue('dmg-def-switching') : '',
      },
      engineLabel: 'Motor Smogon Calc local aplicado.',
    };
  }

  function fallbackIgnoredControls() {
    const ignored = [];
    const gameType = document.getElementById('dmg-game-type')?.value || 'Singles';
    const selectedGen = readNumber('dmg-calc-gen', defaultCalcGen());
    const forcedHits = document.getElementById('dmg-hit-count')?.value || 'auto';

    const ignoredCheckboxes = [
      ['dmg-reflect', 'Reflect'],
      ['dmg-light-screen', 'Light Screen'],
      ['dmg-aurora-veil', 'Aurora Veil'],
      ['dmg-helping-hand', 'Helping Hand'],
      ['dmg-friend-guard', 'Friend Guard'],
      ['dmg-protected', 'Protect'],
      ['dmg-gravity', 'Gravity'],
      ['dmg-magic-room', 'Magic Room'],
      ['dmg-wonder-room', 'Wonder Room'],
      ['dmg-fairy-aura', 'Fairy Aura'],
      ['dmg-dark-aura', 'Dark Aura'],
      ['dmg-aura-break', 'Aura Break'],
      ['dmg-beads-ruin', 'Beads of Ruin'],
      ['dmg-sword-ruin', 'Sword of Ruin'],
      ['dmg-tablets-ruin', 'Tablets of Ruin'],
      ['dmg-vessel-ruin', 'Vessel of Ruin'],
      ['dmg-battery', 'Battery'],
      ['dmg-power-spot', 'Power Spot'],
      ['dmg-flower-gift-atk', 'Flower Gift atacante'],
      ['dmg-steely-spirit', 'Steely Spirit'],
      ['dmg-foresight', 'Foresight'],
      ['dmg-flower-gift-def', 'Flower Gift defensor'],
      ['dmg-stealth-rock', 'Stealth Rock'],
      ['dmg-steelsurge', 'G-Max Steelsurge'],
      ['dmg-vinelash', 'G-Max Vine Lash'],
      ['dmg-wildfire', 'G-Max Wildfire'],
      ['dmg-cannonade', 'G-Max Cannonade'],
      ['dmg-volcalith', 'G-Max Volcalith'],
      ['dmg-seeded', 'Leech Seed'],
      ['dmg-salt-cured', 'Salt Cure'],
      ['dmg-use-z', 'Z-Move'],
      ['dmg-use-max', 'Max Move'],
      ['dmg-stellar-first', 'Stellar'],
      ['dmg-atk-dynamax', 'Dynamax atacante'],
      ['dmg-def-dynamax', 'Dynamax defensor'],
      ['dmg-atk-ability-on', 'habilidade ativa Atk'],
      ['dmg-def-ability-on', 'habilidade ativa Def'],
      ['dmg-atk-power-trick', 'Power Trick Atk'],
      ['dmg-def-power-trick', 'Power Trick Def'],
    ];

    if (selectedGen !== 9) ignored.push('geracao exata');
    if (gameType === 'Doubles') ignored.push('Doubles e spread damage');
    ignoredCheckboxes.forEach(([id, label]) => {
      if (readChecked(id)) ignored.push(label);
    });
    if (teraValue('dmg-atk') || teraValue('dmg-def')) ignored.push('Tera Type');
    if (forcedHits !== 'auto') ignored.push('multi-hit forcado');
    if (readClampedNumber('dmg-spikes', 0, 0, 3) > 0) ignored.push('Spikes');
    if (readSelectValue('dmg-atk-boosted-stat')) ignored.push('boosted stat Atk');
    if (readSelectValue('dmg-def-boosted-stat')) ignored.push('boosted stat Def');
    if (readClampedNumber('dmg-allies-fainted', 0, 0, 5) > 0) ignored.push('aliados caidos');
    if (readClampedNumber('dmg-move-times-used', 1, 1, 5) > 1) ignored.push('turnos do golpe');
    if (readClampedNumber('dmg-metronome-turns', 0, 0, 5) > 0) ignored.push('Metronome');
    if (readClampedNumber('dmg-toxic-counter', 1, 1, 15) > 1) ignored.push('toxic counter exato');
    if (readSelectValue('dmg-def-switching')) ignored.push('switch do defensor');
    if (
      readChecked('dmg-atk-tailwind') ||
      readChecked('dmg-def-tailwind') ||
      readChecked('dmg-atk-paralyzed') ||
      readChecked('dmg-def-paralyzed')
    ) {
      ignored.push('Tailwind/paralisia no dano');
    }

    return ignored;
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

  function applyAtkMods({ item, ability, moveType, moveCategory, movePower, moveName, typeEff, atkHpPct, burnAtkPenalty }) {
    let statMult  = 1;
    let powerMult = 1;
    let finalMult = 1;
    let stabAdaptability = false;
    let ignoreBurnDrop = false;
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
      case 'Guts':
        if (burnAtkPenalty && moveCategory === 'physical') {
          statMult *= 1.5;
          ignoreBurnDrop = true;
          notes.push('guts');
        }
        break;
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

    if (moveName === 'facade' && burnAtkPenalty) {
      powerMult *= 2;
      notes.push('facade');
    }

    return { statMult, powerMult, finalMult, stabAdaptability, ignoreBurnDrop, critMult, notes };
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
    PokeBuildUI.bindAutocomplete(inputEl, suggestEl, {
      onPick: li => li.click(),
    });
  }

  function loadMove(name) {
    PokeAPI.getMove(name).then(data => {
      cachedMove = data;
      const typeName = data.type.name;
      const capitalized = typeName[0].toUpperCase() + typeName.slice(1);
      document.getElementById('dmg-move-type-pill').textContent = capitalized;
      document.getElementById('dmg-move-type-pill').className = `tpill t-${capitalized}`;
      const category = data.damage_class?.name || '';
      document.getElementById('dmg-move-category').textContent = category ? category[0].toUpperCase() + category.slice(1) : '';
      document.getElementById('dmg-move-bp').textContent = data.power || '—';
      document.getElementById('dmg-move-info').classList.remove('hidden');
      setValidation('', []);
      syncDerivedControls();
    }).catch(() => {
      document.getElementById('dmg-move-info').classList.add('hidden');
      setValidation('error', 'Nao foi possivel carregar esse golpe pela PokeAPI.');
    });
  }

  // ── Calculate ─────────────────────────────────────────────────
  function calculate() {
    syncDamageGenerationLocks();
    const atkBs = getBaseStats('dmg-atk');
    const defBs = getBaseStats('dmg-def');
    const level  = parseInt(document.getElementById('dmg-atk-level').value) || 50;
    const warnings = [];
    const fallbackMissingStats = [];
    if (!cachedMove) {
      setValidation('error', 'Selecione um golpe no autocomplete antes de calcular.');
      return;
    }
    syncDerivedControls();
    const power  = cachedMove.power || 0;

    if (!power) {
      setValidation('error', 'Esse golpe nao tem Base Power calculavel. Escolha um golpe ofensivo.');
      return;
    }

    if (!atkBs) fallbackMissingStats.push('Atacante sem stats reais carregados.');
    if (!defBs) fallbackMissingStats.push('Defensor sem stats reais carregados.');

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
    const burnAtkRaw  = document.getElementById('dmg-burn-atk')?.checked ?? false;
    const atkBurnChip = document.getElementById('dmg-atk-burn-chip')?.checked ?? false;
    const trickRoom   = document.getElementById('dmg-trick-room')?.checked ?? false;
    const atkGrounded = document.getElementById('dmg-atk-grounded')?.checked ?? true;
    const defGrounded = document.getElementById('dmg-def-grounded')?.checked ?? true;
    const weatherKey  = document.getElementById('dmg-weather').value;
    const terrainKey  = document.getElementById('dmg-terrain').value;
    const moveType    = cachedMove ? (cachedMove.type?.name[0].toUpperCase() + cachedMove.type.name.slice(1)) : null;
    const moveName    = cachedMove?.name || null;
    const weather     = getFieldMod(weatherKey, terrainKey, moveType, moveName, atkGrounded, defGrounded);

    const gen = selectedCalcGen();
    const atkItem    = featureAllowed('item', gen) ? (document.getElementById('dmg-atk-item')?.value?.trim()  || '') : '';
    const defItem    = featureAllowed('item', gen) ? (document.getElementById('dmg-def-item')?.value?.trim()  || '') : '';
    const atkAbility = featureAllowed('ability', gen) ? (document.getElementById('dmg-atk-ability')?.value?.trim() || '') : '';
    const defAbility = featureAllowed('ability', gen) ? (document.getElementById('dmg-def-ability')?.value?.trim() || '') : '';
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
    const atkMods = applyAtkMods({ item: atkItem, ability: atkAbility, moveType, moveCategory, movePower: cachedMove?.power, moveName, typeEff: typeEffMod, atkHpPct, burnAtkPenalty: burnAtkRaw });
    const defMods = applyDefMods({ item: defItem, ability: defAbility, moveType, moveCategory, typeEff: typeEffMod, defHpPct });
    const defTypes = currentPokemonTypes('dmg-def');
    let defWeatherMult = 1;
    const fieldNotes = [];
    if (moveCategory === 'special' && weatherKey === 'sand' && defTypes.includes('Rock')) {
      defWeatherMult *= 1.5;
      fieldNotes.push('sand-spd');
    }
    if (moveCategory === 'special' && weatherKey === 'snow' && defTypes.includes('Ice')) {
      defWeatherMult *= 1.5;
      fieldNotes.push('snow-spd');
    }

    const atkStatFinal = Math.floor(atkVal * stageMultiplier(effAtkStage) * atkMods.statMult);
    const defStatFinal = Math.max(1, Math.floor(defVal * stageMultiplier(effDefStage) * defMods.statMult * defWeatherMult));
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

    const activeBurnDrop = burnAtkRaw && moveCategory === 'physical' && !atkMods.ignoreBurnDrop;
    const burnChip = atkBurnChip ? Math.floor(atkHp / 16) : 0;
    const atkName  = document.getElementById('dmg-atk-name').value || 'Atacante';
    const defName  = document.getElementById('dmg-def-name').value || 'Defensor';

    let usedSmogonEngine = false;
    let smogonEngineNotes = [];
    let smogonEngineDetail = {};
    let resultDefHp = defHp;
    let rolls;

    if (window.SmogonDamage?.isReady?.()) {
      try {
        const smogonResult = window.SmogonDamage.calculate(buildSmogonState());
        rolls = smogonResult.rolls.map(r => Math.max(0, Math.floor(r)));
        resultDefHp = Math.max(1, Math.floor(smogonResult.defHp || defHp));
        smogonEngineNotes = smogonResult.notes || [];
        smogonEngineDetail = {
          description: smogonResult.description || '',
          koText: smogonResult.koText || '',
          recoilText: smogonResult.recoilText || '',
          recoveryText: smogonResult.recoveryText || '',
        };
        usedSmogonEngine = true;
      } catch (err) {
        warnings.push(`Motor Smogon local nao conseguiu calcular (${err.message}). Tentando fallback interno simplificado.`);
      }
    } else {
      warnings.push('Motor Smogon local nao carregado. Tentando fallback interno simplificado.');
    }

    if (!usedSmogonEngine) {
      if (fallbackMissingStats.length) {
        setValidation('error', [
          ...warnings,
          ...fallbackMissingStats,
          'O fallback interno simplificado exige stats reais carregados. Selecione atacante e defensor pelo autocomplete antes de calcular.',
        ]);
        return;
      }

      const ignoredControls = fallbackIgnoredControls();
      warnings.push('Fallback interno simplificado ativo: resultado e uma estimativa, nao uma simulacao cartucho-perfeita.');
      warnings.push('Fallback usa formula moderna simplificada; geracao exata, excecoes de golpe e interacoes avancadas pertencem ao motor Smogon.');
      if (ignoredControls.length) warnings.push(`Controles avancados nao aplicados pelo fallback: ${ignoredControls.join(', ')}.`);

      rolls = calcDamage(atkStatFinal, defStatFinal, powerFinal, level,
        { stab, typeEff: typeEffMod, crit, weather, burnAtkPenalty: activeBurnDrop, critMult: atkMods.critMult });

      // Multiplicadores finais (Life Orb, Filter, Multiscale, etc.)
      const finalMult = atkMods.finalMult * defMods.finalMult;
      if (finalMult !== 1) rolls = rolls.map(r => Math.floor(r * finalMult));
    }

    // Multi-hit
    const minHits = cachedMove?.meta?.min_hits;
    const maxHits = cachedMove?.meta?.max_hits;
    let multiHitData = null;
    if (!usedSmogonEngine && minHits != null && maxHits != null && maxHits > 1) {
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
    const defPassiveItem = featureAllowed('item', selectedCalcGen()) ? (document.getElementById('dmg-def-passive-item')?.value || 'none') : 'none';

    const extraNotes = [
      ...atkMods.notes,
      ...fieldNotes,
      usedSmogonEngine ? 'smogon-engine' : '',
      !usedSmogonEngine ? 'fallback-engine' : '',
      burnAtkRaw && moveCategory !== 'physical' ? 'burn-special' : '',
      burnAtkRaw && atkMods.ignoreBurnDrop ? 'burn-ignored' : '',
      activeBurnDrop ? 'burn-attack' : '',
    ].filter(Boolean);
    const validationMessages = warnings.length ? warnings : [
      usedSmogonEngine ? 'Calculo pronto com Smogon Calc local.' : 'Calculo pronto com fallback interno simplificado.',
    ];
    setValidation(warnings.length ? 'warning' : 'success', validationMessages);
    renderResults(rolls, resultDefHp, {
      burnChip, atkHp, extraNotes, multiHitData,
      engineNotes: smogonEngineNotes,
      engineDetail: smogonEngineDetail,
      atkSpe: atkSpeFinal, defSpe: defSpeFinal,
      atkSpeConditions, defSpeConditions,
      trickRoom, atkName, defName,
      defStatus, defPassiveItem,
    });
  }

  function renderEngineDetail(detail = {}) {
    const detailEl = document.getElementById('dmg-engine-detail');
    if (!detailEl) return;

    const rows = [];
    const seen = new Set();
    [
      ['Linha Smogon', detail.description],
      ['KO contextual', detail.koText],
      ['Recoil', detail.recoilText],
      ['Recovery', detail.recoveryText],
    ].forEach(([label, value]) => {
      const text = String(value || '').trim();
      if (!text || seen.has(text)) return;
      seen.add(text);
      rows.push(`<div><strong>${esc(label)}:</strong> ${esc(text)}</div>`);
    });

    detailEl.classList.toggle('hidden', !rows.length);
    detailEl.innerHTML = rows.length ? rows.join('') : '';
  }

  function clampHp(value, maxHpValue) {
    return Math.min(maxHpValue, Math.max(0, value));
  }

  function defenderEndTurnEffects(defHp, endOfTurn = {}) {
    const effects = [];
    let net = 0;
    const add = (label, amount) => {
      const value = Math.max(0, Math.floor(amount));
      if (!value) return;
      net += value;
      effects.push(`${label} +${value}`);
    };
    const chip = (label, amount) => {
      const value = Math.max(0, Math.floor(amount));
      if (!value) return;
      net -= value;
      effects.push(`${label} -${value}`);
    };

    if (endOfTurn.defStatus === 'poison') chip('Poison', defHp / 8);
    if (endOfTurn.defStatus === 'burn') chip('Burn', defHp / 16);
    if (endOfTurn.defStatus === 'toxic') {
      const counter = readClampedNumber('dmg-toxic-counter', 1, 1, 15);
      chip(`Toxic ${counter}/16`, (defHp * counter) / 16);
    }

    if (readChecked('dmg-seeded')) chip('Leech Seed', defHp / 8);
    if (readChecked('dmg-salt-cured')) {
      const defTypes = currentPokemonTypes('dmg-def');
      chip('Salt Cure', defTypes.includes('Water') || defTypes.includes('Steel') ? defHp / 4 : defHp / 8);
    }
    [
      ['dmg-vinelash', 'Vine Lash'],
      ['dmg-wildfire', 'Wildfire'],
      ['dmg-cannonade', 'Cannonade'],
      ['dmg-volcalith', 'Volcalith'],
    ].forEach(([id, label]) => {
      if (readChecked(id)) chip(label, defHp / 6);
    });

    if (endOfTurn.defPassiveItem === 'leftovers') add('Leftovers', defHp / 16);
    if (endOfTurn.defPassiveItem === 'black-sludge-poison') add('Black Sludge', defHp / 16);
    if (endOfTurn.defPassiveItem === 'black-sludge-other') chip('Black Sludge', defHp / 8);

    return { net, effects };
  }

  function renderPostTurn(minDmg, maxDmg, defHp, endOfTurn = {}) {
    // This bar is a local UI projection for damage + end-of-turn effects. Entry
    // hazards stay in the Smogon KO context because they happen before the attack.
    const postEl = document.getElementById('dmg-postturn');
    const rangeEl = document.getElementById('dmg-postturn-range');
    const labelEl = document.getElementById('dmg-postturn-label');
    if (!postEl || !rangeEl || !labelEl) return;

    const { net, effects } = defenderEndTurnEffects(defHp, endOfTurn);
    const lowHp = clampHp(defHp - maxDmg + net, defHp);
    const highHp = clampHp(defHp - minDmg + net, defHp);
    const lowPct = (lowHp / defHp) * 100;
    const highPct = (highHp / defHp) * 100;
    rangeEl.style.left = `${lowPct}%`;
    rangeEl.style.width = `${Math.max(1, highPct - lowPct)}%`;

    const effectText = effects.length ? ` Efeitos: ${effects.join(', ')}.` : ' Sem efeitos adicionais de fim de turno.';
    labelEl.innerHTML =
      `HP final estimado: <strong>${lowHp}-${highHp}</strong> / ${defHp} (${lowPct.toFixed(1)}-${highPct.toFixed(1)}%).${esc(effectText)}`;
    postEl.classList.remove('hidden');
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

    renderPostTurn(minDmg, maxDmg, defHp, endOfTurn);

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
    renderEngineDetail(endOfTurn.engineDetail);
    document.getElementById('dmg-summary').textContent =
      `Atk: ${document.getElementById('dmg-atk-name').value || '?'} vs Def: ${document.getElementById('dmg-def-name').value || '?'} · Power ${cachedMove?.power || '?'} · ${cachedMove?.damage_class?.name || '?'}`;

    const notesEl = document.getElementById('dmg-endturn-notes');
    if (notesEl) {
      const {
        burnChip, atkHp, atkSpe, defSpe,
        atkSpeConditions = [], defSpeConditions = [],
        trickRoom, atkName, defName,
        extraNotes = [], engineNotes = [],
        multiHitData, defStatus, defPassiveItem
      } = endOfTurn;
      const notes = [];
      if (extraNotes.includes('smogon-engine')) {
        notes.push('Smogon Calc local — motor oficial da comunidade aplicado para formula, itens, habilidades, telas, Tera e casos especiais de golpes.');
      }
      if (extraNotes.includes('fallback-engine')) {
        notes.push('Fallback interno simplificado — estimativa de emergencia com formula moderna basica; nao replica todos os detalhes do jogo.');
      }
      engineNotes.filter(Boolean).forEach(note => notes.push(esc(note)));
      if (burnChip) {
        notes.push(`Queimado — atacante perde <strong>${burnChip} HP</strong> ao final do turno (1/16 de ${atkHp} HP)`);
      }
      if (extraNotes.includes('life-orb')) {
        const chip = Math.floor(atkHp / 10);
        notes.push(`Life Orb — atacante perde <strong>${chip} HP</strong> ao final do turno (1/10 de ${atkHp} HP)`);
      }
      if (extraNotes.includes('burn-attack')) {
        notes.push('Burn ofensivo — dano fisico do atacante reduzido em 50%.');
      }
      if (extraNotes.includes('burn-special')) {
        notes.push('Burn ofensivo marcado — golpes especiais nao sofrem reducao de dano.');
      }
      if (extraNotes.includes('burn-ignored')) {
        notes.push('Guts — burn ofensivo ignorado e Atk fisico aumentado.');
      }
      if (extraNotes.includes('guts')) {
        notes.push('Guts — atacante com status recebe boost de Atk fisico.');
      }
      if (extraNotes.includes('facade')) {
        notes.push('Facade — Base Power dobrado por status do atacante.');
      }
      if (extraNotes.includes('sand-spd')) {
        notes.push('Areia — defensor Rock recebe Sp.Def x1.5 contra golpe especial.');
      }
      if (extraNotes.includes('snow-spd')) {
        notes.push('Neve — defensor Ice recebe Sp.Def x1.5 contra golpe especial.');
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
    setupAdvancedTooltips();
    setupDamagePresets();
    syncCalcGenSelect();
    syncDamageGenerationLocks();

    document.getElementById('dmg-atk-nature').addEventListener('change', () => renderStatsRow('dmg-atk'));
    document.getElementById('dmg-def-nature').addEventListener('change', () => renderStatsRow('dmg-def'));
    document.getElementById('dmg-calc-gen')?.addEventListener('change', e => {
      e.currentTarget.dataset.userSelected = 'true';
      syncDamageGenerationLocks();
      syncDerivedControls();
    });

    document.getElementById('dmg-calc-btn').addEventListener('click', calculate);
  }

  function rerender() {
    syncCalcGenSelect();
    syncDamageGenerationLocks();
    syncDerivedControls();
  }

  return { init, rerender };
})();
