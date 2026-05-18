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

  return {
    activeGen,
    activeTypes,
    capabilitiesForGame,
    capabilitiesForGen,
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
