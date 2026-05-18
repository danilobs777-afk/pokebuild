'use strict';

/**
 * generation.js - Contrato global de geracao/formato
 * ---------------------------------------------------
 * A gen-bar do topo altera regras que varios modulos precisam respeitar.
 * Este servico e a camada unica para consultar essas regras sem espalhar
 * conhecimento sobre Gen 1, Gen 2-5 e Gen 6+ pelo aplicativo inteiro.
 *
 * data.js ainda guarda as tabelas brutas: TYPES, GAME_VERSIONS e typeEff().
 * Este arquivo organiza essas tabelas em perguntas de produto:
 * "quais tipos existem agora?", "quais jogos aparecem no Builder?",
 * "este formato tem item/ability/nature/tera?".
 */

const GenerationRules = (() => {
  const FIELD_CAPABILITIES = Object.freeze({
    gen1: {
      item: false,
      ability: false,
      nature: false,
      tera: false,
      mega: false,
      zCrystal: false,
      gmax: false,
    },
    gen2to5: {
      item: true,
      ability: true,
      nature: true,
      tera: false,
      mega: false,
      zCrystal: false,
      gmax: false,
    },
    gen6plus: {
      item: true,
      ability: true,
      nature: true,
      tera: true,
      mega: true,
      zCrystal: true,
      gmax: true,
    },
  });

  const DAMAGE_FEATURE_RULES = Object.freeze({
    item: gen => gen >= 2,
    ability: gen => gen >= 3,
    nature: gen => gen >= 3,
    terrain: gen => gen >= 6,
    tera: gen => gen >= 9,
    zMove: gen => gen === 7,
    maxMove: gen => gen === 8,
    dynamax: gen => gen === 8,
    stellar: gen => gen >= 9,
    aura: gen => gen >= 6,
    ruin: gen => gen >= 9,
    battery: gen => gen >= 7,
    powerSpot: gen => gen >= 8,
    steelySpirit: gen => gen >= 8,
    flowerGift: gen => gen >= 4,
    friendGuard: gen => gen >= 5,
    auroraVeil: gen => gen >= 7,
    foresight: gen => gen >= 2 && gen <= 7,
    magicRoom: gen => gen >= 5,
    wonderRoom: gen => gen >= 5,
    gravity: gen => gen >= 4,
    powerTrick: gen => gen >= 4,
    stealthRock: gen => gen >= 4,
    spikes: gen => gen >= 2,
    gmax: gen => gen === 8,
    saltCure: gen => gen >= 9,
    boostedStat: gen => gen >= 9,
    alliesFainted: gen => gen >= 9,
    metronomeItem: gen => gen >= 4,
    switching: gen => gen >= 2 && gen <= 7,
  });

  function activeGen() {
    return getActiveGen();
  }

  function setActive(genKey) {
    setActiveGen(genKey);
  }

  function activeTypes(genKey = activeGen()) {
    return getTypesForGen(genKey);
  }

  function isTypeAllowed(type, genKey = activeGen()) {
    return activeTypes(genKey).includes(type);
  }

  function normalizeType(type, genKey = activeGen()) {
    return isTypeAllowed(type, genKey) ? type : '';
  }

  function gameVersions(genKey = activeGen()) {
    return getGameVersionsForGen(genKey);
  }

  function defaultGameVersion(genKey = activeGen()) {
    return getDefaultGameVersionForGen(genKey);
  }

  function versionInfo(key) {
    return GAME_VERSIONS.find(v => v.key === key) || null;
  }

  function genGroupForGame(key) {
    return getGenGroupForGameVersion(key);
  }

  function moveVersionGroups(key) {
    return getMoveVersionGroupsForGameVersion(key);
  }

  function capabilitiesForGen(genKey = activeGen()) {
    return FIELD_CAPABILITIES[genKey] || FIELD_CAPABILITIES.gen6plus;
  }

  function capabilitiesForGame(formatKey, champions = false) {
    if (champions || formatKey === 'champions') {
      return {
        gen: 9,
        item: true,
        ability: true,
        nature: true,
        tera: true,
        mega: false,
        zCrystal: false,
        gmax: false,
      };
    }
    const version = versionInfo(formatKey);
    const gen = version?.gen ?? 9;
    return {
      gen,
      item: gen >= 2,
      ability: gen >= 3,
      nature: gen >= 3,
      tera: gen === 9,
      mega: gen >= 6 && gen <= 7,
      zCrystal: gen === 7,
      gmax: gen === 8,
    };
  }

  function damageFeatureAllowed(feature, gen = 9) {
    const numericGen = Math.min(9, Math.max(1, Number(gen) || 9));
    const rule = DAMAGE_FEATURE_RULES[feature];
    return rule ? rule(numericGen) : true;
  }

  return {
    activeGen,
    activeTypes,
    capabilitiesForGame,
    capabilitiesForGen,
    damageFeatureAllowed,
    defaultGameVersion,
    gameVersions,
    genGroupForGame,
    isTypeAllowed,
    moveVersionGroups,
    normalizeType,
    setActive,
    versionInfo,
  };
})();

window.GenerationRules = GenerationRules;
