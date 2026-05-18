'use strict';

const SmogonDamage = (() => {
  const STAT_KEYS = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];
  const TYPE_NAMES = [
    'normal',
    'fire',
    'water',
    'electric',
    'grass',
    'ice',
    'fighting',
    'poison',
    'ground',
    'flying',
    'psychic',
    'bug',
    'rock',
    'ghost',
    'dragon',
    'dark',
    'steel',
    'fairy',
  ];

  const STATUS_MAP = {
    burn: 'brn',
    poison: 'psn',
    toxic: 'tox',
    paralysis: 'par',
    sleep: 'slp',
    freeze: 'frz',
  };

  const WEATHER_MAP = {
    sun: 'Sun',
    rain: 'Rain',
    sand: 'Sand',
    snow: 'Snow',
    hail: 'Hail',
  };

  const TERRAIN_MAP = {
    'electric-terrain': 'Electric',
    'grassy-terrain': 'Grassy',
    'psychic-terrain': 'Psychic',
    'misty-terrain': 'Misty',
  };

  const SPECIES_OVERRIDES = {
    'Zygarde-50': 'Zygarde',
    'Zygarde-10': 'Zygarde-10%',
    'Zygarde-Complete': 'Zygarde-Complete',
    'Tornadus-Incarnate': 'Tornadus',
    'Thundurus-Incarnate': 'Thundurus',
    'Landorus-Incarnate': 'Landorus',
    'Enamorus-Incarnate': 'Enamorus',
    'Urshifu-Single-Strike': 'Urshifu',
    'Urshifu-Rapid-Strike': 'Urshifu-Rapid-Strike',
    'Giratina-Altered': 'Giratina',
    'Shaymin-Land': 'Shaymin',
    'Darmanitan-Standard': 'Darmanitan',
    'Darmanitan-Galar-Standard': 'Darmanitan-Galar',
    'Basculin-Red-Striped': 'Basculin',
    'Basculin-Blue-Striped': 'Basculin-Blue-Striped',
    'Aegislash-Shield': 'Aegislash',
    'Mimikyu-Disguised': 'Mimikyu',
    'Eiscue-Ice': 'Eiscue',
    'Indeedee-Male': 'Indeedee',
    'Basculegion-Male': 'Basculegion',
    'Oinkologne-Male': 'Oinkologne',
    'Meowstic-Male': 'Meowstic',
  };

  function smogon() {
    return window.calc;
  }

  function isReady() {
    const calc = smogon();
    return !!(
      calc &&
      calc.Generations &&
      calc.Pokemon &&
      calc.Move &&
      calc.Field &&
      typeof calc.calculate === 'function'
    );
  }

  function toId(value) {
    const calc = smogon();
    if (calc && typeof calc.toID === 'function') return calc.toID(value || '');
    return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  }

  function titleCase(value) {
    return String(value || '')
      .trim()
      .split(/[\s_-]+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
      .join(' ');
  }

  function compactName(value) {
    return String(value || '').trim().replace(/\s+/g, ' ');
  }

  function typeName(value) {
    const type = String(value || '').trim().toLowerCase();
    return TYPE_NAMES.includes(type) ? titleCase(type) : undefined;
  }

  function readGen(state) {
    const gen = Number(state?.gen || 9);
    if (!Number.isFinite(gen)) return 9;
    return Math.min(9, Math.max(1, Math.trunc(gen)));
  }

  function hasResource(gen, kind, candidate) {
    const id = toId(candidate);
    if (!id) return false;
    const dex = gen?.[kind];
    return !!(dex && typeof dex.get === 'function' && dex.get(id));
  }

  function resolveName(gen, kind, rawName) {
    const original = compactName(rawName);
    if (!original) throw new Error(`Nome de ${kind} ausente.`);

    const candidates = [
      kind === 'species' ? SPECIES_OVERRIDES[original] : undefined,
      original,
      original.replace(/-/g, ' '),
      titleCase(original),
      titleCase(original.replace(/-/g, ' ')),
    ].filter(Boolean);

    const found = candidates.find((candidate) => hasResource(gen, kind, candidate));
    if (found) return found;

    if (kind === 'species' && original.includes('-')) {
      const base = original.split('-')[0];
      if (hasResource(gen, kind, base)) return base;
    }

    throw new Error(`${kind === 'species' ? 'Pokemon' : 'Golpe'} nao encontrado no motor Smogon: ${original}.`);
  }

  function numberOr(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function clamp(value, min, max, fallback = min) {
    const parsed = numberOr(value, fallback);
    return Math.min(max, Math.max(min, parsed));
  }

  function statusCode(value) {
    return STATUS_MAP[String(value || '').trim().toLowerCase()] || undefined;
  }

  function evs(values = {}) {
    return STAT_KEYS.reduce((acc, stat) => {
      acc[stat] = clamp(values[stat], 0, 252, 0);
      return acc;
    }, {});
  }

  function ivs(values = {}) {
    return STAT_KEYS.reduce((acc, stat) => {
      acc[stat] = clamp(values[stat], 0, 31, 31);
      return acc;
    }, {});
  }

  function boosts(values = {}) {
    return {
      atk: clamp(values.atk ?? 0, -6, 6, 0),
      def: clamp(values.def ?? 0, -6, 6, 0),
      spa: clamp(values.spa ?? 0, -6, 6, 0),
      spd: clamp(values.spd ?? 0, -6, 6, 0),
      spe: clamp(values.speed, -6, 6, 0),
    };
  }

  function currentHpPercent(value) {
    return clamp(value, 1, 100, 100);
  }

  function pokemonOptions(side = {}, role, moveCategory) {
    const opts = {
      level: clamp(side.level, 1, 100, 50),
      evs: evs(side.evs),
      ivs: ivs(side.ivs),
      nature: compactName(side.nature || 'Serious') || 'Serious',
      boosts: boosts(role === 'attacker'
        ? { atk: side.offenseStage, spa: side.offenseStage, speed: side.speedStage }
        : { def: side.defenseStage, spd: side.defenseStage, speed: side.speedStage }),
    };

    if (side.ability) opts.ability = compactName(side.ability);
    if (side.item) opts.item = compactName(side.item);
    if (side.status) opts.status = statusCode(side.status) || side.status;
    if (side.teraType) opts.teraType = typeName(side.teraType);
    if (side.abilityOn) opts.abilityOn = true;
    if (side.isDynamaxed) {
      opts.isDynamaxed = true;
      opts.dynamaxLevel = clamp(side.dynamaxLevel, 0, 10, 10);
    }
    if (side.alliesFainted) opts.alliesFainted = clamp(side.alliesFainted, 0, 5, 0);
    if (side.boostedStat) opts.boostedStat = side.boostedStat;
    if (side.toxicCounter) opts.toxicCounter = clamp(side.toxicCounter, 1, 15, 1);

    if (role === 'attacker' && side.isBurned) {
      opts.status = 'brn';
    }

    return opts;
  }

  function weatherName(value, genNumber) {
    if (value === 'snow' && genNumber < 9) return 'Hail';
    return WEATHER_MAP[value] || undefined;
  }

  function fieldOptions(state = {}, genNumber) {
    const field = {
      gameType: state.gameType === 'Doubles' ? 'Doubles' : 'Singles',
      attackerSide: {
        isHelpingHand: !!state.field?.helpingHand,
        isTailwind: !!state.attacker?.tailwind,
        isBattery: !!state.field?.battery,
        isPowerSpot: !!state.field?.powerSpot,
        isFlowerGift: !!state.field?.flowerGiftAtk,
        isSteelySpirit: !!state.field?.steelySpirit,
        isPowerTrick: !!state.field?.powerTrickAtk,
      },
      defenderSide: {
        isReflect: !!state.field?.reflect,
        isLightScreen: !!state.field?.lightScreen,
        isAuroraVeil: !!state.field?.auroraVeil,
        isFriendGuard: !!state.field?.friendGuard,
        isProtected: !!state.field?.protected,
        isTailwind: !!state.defender?.tailwind,
        isForesight: !!state.field?.foresight,
        isFlowerGift: !!state.field?.flowerGiftDef,
        isPowerTrick: !!state.field?.powerTrickDef,
        isSR: !!state.field?.stealthRock,
        spikes: clamp(state.field?.spikes, 0, 3, 0),
        steelsurge: !!state.field?.steelsurge,
        vinelash: !!state.field?.vinelash,
        wildfire: !!state.field?.wildfire,
        cannonade: !!state.field?.cannonade,
        volcalith: !!state.field?.volcalith,
        isSeeded: !!state.field?.seeded,
        isSaltCured: !!state.field?.saltCured,
        isSwitching: ['out', 'in'].includes(state.field?.defenderSwitching) ? state.field.defenderSwitching : undefined,
      },
    };

    const weather = weatherName(state.weather, genNumber);
    if (weather) field.weather = weather;

    const terrain = TERRAIN_MAP[state.terrain];
    if (terrain) field.terrain = terrain;

    if (state.field?.gravity) field.isGravity = true;
    if (state.field?.magicRoom) field.isMagicRoom = true;
    if (state.field?.wonderRoom) field.isWonderRoom = true;
    if (state.field?.auraBreak) field.isAuraBreak = true;
    if (state.field?.fairyAura) field.isFairyAura = true;
    if (state.field?.darkAura) field.isDarkAura = true;
    if (state.field?.beadsRuin) field.isBeadsOfRuin = true;
    if (state.field?.swordRuin) field.isSwordOfRuin = true;
    if (state.field?.tabletsRuin) field.isTabletsOfRuin = true;
    if (state.field?.vesselRuin) field.isVesselOfRuin = true;

    return field;
  }

  function normalizeDamage(damage) {
    if (typeof damage === 'number') return Array.from({ length: 16 }, () => damage);

    if (!Array.isArray(damage)) {
      throw new Error('Resposta de dano inesperada do motor Smogon.');
    }

    if (damage.every((value) => typeof value === 'number')) {
      if (damage.length === 16) return damage;
      if (damage.length === 1) return Array.from({ length: 16 }, () => damage[0]);
      return damage;
    }

    const damageSets = damage.filter(Array.isArray);
    if (!damageSets.length) throw new Error('Resposta multi-hit inesperada do motor Smogon.');

    const rollCount = Math.max(...damageSets.map((set) => set.length));
    return Array.from({ length: rollCount }, (_, index) =>
      damageSets.reduce((sum, set) => sum + numberOr(set[index] ?? set[set.length - 1], 0), 0)
    );
  }

  function maxHp(pokemon) {
    if (pokemon && typeof pokemon.maxHP === 'function') return pokemon.maxHP();
    return numberOr(pokemon?.rawStats?.hp, 1);
  }

  function moveOptions(state = {}, attackerName = '') {
    const opts = {
      isCrit: !!state.isCrit,
    };

    const hits = state.hits === 'auto' ? 0 : Number(state.hits);
    if (Number.isFinite(hits) && hits > 0) opts.hits = hits;
    if (state.move?.useMax) opts.useMax = true;
    else if (state.move?.useZ) opts.useZ = true;
    if (state.move?.isStellarFirstUse) opts.isStellarFirstUse = true;
    if (state.move?.timesUsed) opts.timesUsed = clamp(state.move.timesUsed, 1, 5, 1);
    if (state.move?.timesUsedWithMetronome) {
      opts.timesUsedWithMetronome = clamp(state.move.timesUsedWithMetronome, 0, 5, 0);
    }
    if (state.attacker?.ability) opts.ability = compactName(state.attacker.ability);
    if (state.attacker?.item) opts.item = compactName(state.attacker.item);
    if (attackerName) opts.species = attackerName;

    return opts;
  }

  function textResult(getter) {
    try {
      const value = getter();
      return value?.text || '';
    } catch {
      return '';
    }
  }

  function collectNotes(result, state) {
    const notes = [];
    if (state.engineLabel) notes.push(state.engineLabel);
    if (result?.desc?.moveName) notes.push(`Golpe calculado: ${result.desc.moveName}.`);
    if (state.field?.reflect || state.field?.lightScreen || state.field?.auroraVeil) {
      notes.push('Telas defensivas aplicadas pelo motor de dano.');
    }
    if (state.field?.helpingHand) notes.push('Helping Hand aplicado.');
    if (state.field?.stealthRock || state.field?.spikes || state.field?.steelsurge) {
      notes.push('Entry hazards do defensor considerados na chance de KO.');
    }
    if (state.field?.vinelash || state.field?.wildfire || state.field?.cannonade || state.field?.volcalith) {
      notes.push('Efeitos G-Max residuais considerados na chance de KO.');
    }
    if (state.move?.useZ) notes.push('Z-Move solicitado ao motor.');
    if (state.move?.useMax) notes.push('Max Move solicitado ao motor.');
    if (state.move?.isStellarFirstUse) notes.push('Primeiro uso Stellar informado ao motor.');
    if (state.attacker?.teraType) notes.push(`Tera ofensivo: ${titleCase(state.attacker.teraType)}.`);
    if (state.defender?.teraType) notes.push(`Tera defensivo: ${titleCase(state.defender.teraType)}.`);
    return notes;
  }

  function calculate(state = {}) {
    if (!isReady()) throw new Error('Motor Smogon Calc nao carregado.');

    const calc = smogon();
    const genNumber = readGen(state);
    const gen = calc.Generations.get(genNumber);
    const moveName = resolveName(gen, 'moves', state.move?.name);
    const attackerName = resolveName(gen, 'species', state.attacker?.name);
    const defenderName = resolveName(gen, 'species', state.defender?.name);
    const move = new calc.Move(gen, moveName, moveOptions(state, attackerName));
    const moveCategory = move.category || state.move?.category || 'Physical';
    const attacker = new calc.Pokemon(gen, attackerName, pokemonOptions(state.attacker, 'attacker', moveCategory));
    const defender = new calc.Pokemon(gen, defenderName, pokemonOptions(state.defender, 'defender', moveCategory));

    if (state.attacker?.currentHpPercent) {
      attacker.originalCurHP = Math.max(
        1,
        Math.floor((maxHp(attacker) * currentHpPercent(state.attacker.currentHpPercent)) / 100)
      );
    }
    if (state.defender?.currentHpPercent) {
      defender.originalCurHP = Math.max(
        1,
        Math.floor((maxHp(defender) * currentHpPercent(state.defender.currentHpPercent)) / 100)
      );
    }

    const field = new calc.Field(fieldOptions(state, genNumber));
    const result = calc.calculate(gen, attacker, defender, move, field);
    const rolls = normalizeDamage(result.damage);

    return {
      engine: 'smogon',
      gen: genNumber,
      rolls,
      defHp: maxHp(defender),
      description: typeof result.fullDesc === 'function' ? result.fullDesc() : '',
      koText: textResult(() => result.kochance(false)),
      recoilText: textResult(() => result.recoil()),
      recoveryText: textResult(() => result.recovery()),
      notes: collectNotes(result, state),
      rawDamage: result.damage,
      attacker,
      defender,
      move,
      field,
      result,
    };
  }

  return {
    isReady,
    calculate,
  };
})();

window.SmogonDamage = SmogonDamage;
