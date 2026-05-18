'use strict';

/**
 * api.js — Cliente da PokéAPI com cache localStorage
 * ----------------------------------------------------
 * Todas as chamadas passam por cacheGet/cacheSet com TTL de 7 dias.
 * Isso reduz drasticamente o número de requests em visitas repetidas.
 *
 * Exceção: loadMoveList() usa fetch() direto (não o helper get()) para
 * evitar armazenar o JSON bruto completo (~500KB) no localStorage —
 * armazena apenas o array de nomes processados (~30KB).
 *
 * Padrão singleton (ensureMoveList): garante que apenas um fetch da lista
 * de golpes ocorra ao mesmo tempo, mesmo que múltiplos chamadores solicitem.
 *
 * Dependências: nenhuma (puro fetch API + localStorage).
 */

const PokeAPI = (() => {
  const BASE = 'https://pokeapi.co/api/v2';
  const CACHE_PREFIX = 'pkdb_'; // prefixo para evitar colisão com outras chaves no localStorage
  const SPRITE_BASE = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon';

  function cacheGet(key) {
    try {
      const raw = localStorage.getItem(CACHE_PREFIX + key);
      if (!raw) return null;
      const { ts, data } = JSON.parse(raw);
      // Cache válido por 7 dias
      if (Date.now() - ts > 7 * 86400000) { localStorage.removeItem(CACHE_PREFIX + key); return null; }
      return data;
    } catch { return null; }
  }

  function cacheSet(key, data) {
    try { localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ ts: Date.now(), data })); } catch {}
  }

  async function get(path) {
    const cached = cacheGet(path);
    if (cached) return cached;
    const res = await fetch(BASE + path);
    if (!res.ok) throw new Error(`PokéAPI ${res.status}: ${path}`);
    const data = await res.json();
    cacheSet(path, data);
    return data;
  }

  /**
   * Normaliza um nome de exibição para o formato slug da PokéAPI.
   * Ex: "Mr. Mime" → "mr-mime", "Nidoran♀" → "nidoran-f"
   */
  // Normaliza nome de exibição para slug da PokéAPI
  function apiName(name) {
    return name.toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/['.]/g, '')
      .replace(/♀/g, '-f').replace(/♂/g, '-m');
  }

  function moveApiName(name) {
    const slug = apiName(name);
    if (!slug.includes('--') && /-(physical|special)$/.test(slug)) {
      return slug.replace(/-(physical|special)$/, '--$1');
    }
    return slug;
  }

  function spriteUrl(id, hd = false, shiny = false) {
    if (hd) return `${SPRITE_BASE}/other/official-artwork${shiny ? '/shiny' : ''}/${id}.png`;
    return `${SPRITE_BASE}${shiny ? '/shiny' : ''}/${id}.png`;
  }

  /**
   * Imagens normalizadas, sem depender da geracao ativa.
   * - officialArtworkUrl: prioriza a arte oficial para imagens grandes.
   * - pixelSpriteUrl: prioriza sprites pixelados para UI compacta.
   */
  function officialArtworkUrl(dataOrId, shiny = false) {
    const isData = dataOrId && typeof dataOrId === 'object';
    const id = isData ? dataOrId.id : dataOrId;
    const sp = isData ? dataOrId.sprites : null;
    const oa = sp?.other?.['official-artwork'];
    const home = sp?.other?.home;
    const official = shiny ? oa?.front_shiny : oa?.front_default;
    const modern = shiny ? home?.front_shiny : home?.front_default;
    const fallback = shiny ? sp?.front_shiny : sp?.front_default;
    return official || modern || fallback || (id ? spriteUrl(id, true, shiny) : '');
  }

  function pixelSpriteUrl(dataOrId, shiny = false, female = false) {
    const isData = dataOrId && typeof dataOrId === 'object';
    const id = isData ? dataOrId.id : dataOrId;
    const sp = isData ? dataOrId.sprites : null;
    const femaleSprite = female
      ? (shiny ? sp?.front_shiny_female : sp?.front_female)
      : '';
    const fallback = shiny ? sp?.front_shiny : sp?.front_default;
    return femaleSprite || fallback || (id ? spriteUrl(id, false, shiny) : '');
  }

  function spriteForGen(data) {
    return officialArtworkUrl(data);
  }

  async function getPokemon(name) {
    const key = '/pokemon/' + apiName(name);
    return get(key);
  }

  async function getPokemonSpecies(name) {
    return get('/pokemon-species/' + apiName(name));
  }

  // Carrega lista completa de Pokémon (nome + ID) para autocomplete
  async function loadPokemonList() {
    const cached = cacheGet('__list__');
    if (cached) return cached;
    const data = await get('/pokemon?limit=2000&offset=0');
    const list = data.results.map(p => {
      const parts = p.url.split('/').filter(Boolean);
      return { name: p.name, id: parseInt(parts[parts.length - 1]) };
    });
    cacheSet('__list__', list);
    return list;
  }

  async function getMove(name) {
    return get('/move/' + moveApiName(name));
  }

  function displayMoveName(slug) {
    return String(slug || '').split('-').filter(Boolean)
      .map(w => w[0].toUpperCase() + w.slice(1)).join(' ');
  }

  // Retorna { type: 'Ground', status: false } — extraído da resposta completa já cacheada
  async function getMoveInfo(name) {
    if (!name?.trim()) return null;
    try {
      const data = await getMove(name);
      const type = data.type.name.charAt(0).toUpperCase() + data.type.name.slice(1);
      const category = data.damage_class.name;
      const status = category === 'status';
      return { type, category, status };
    } catch { return null; }
  }

  // Busca vários golpes em paralelo — retorna Map de nome → { type, status }
  async function getMovesInfo(names) {
    const unique = [...new Set(names.filter(Boolean))];
    const results = await Promise.allSettled(unique.map(n => getMoveInfo(n)));
    const map = {};
    unique.forEach((name, i) => {
      if (results[i].status === 'fulfilled' && results[i].value)
        map[name] = results[i].value;
    });
    return map;
  }

  async function getMovesByType(typeName, category) {
    const typeData = await get('/type/' + apiName(typeName));
    let slugs = (typeData.moves || []).map(m => m.name).filter(Boolean);
    if (category) {
      const classData = await get('/move-damage-class/' + apiName(category));
      const classMoves = new Set((classData.moves || []).map(m => m.name).filter(Boolean));
      slugs = slugs.filter(name => classMoves.has(name));
    }
    return slugs.map(displayMoveName).sort();
  }

  async function getNature(name) {
    return get('/nature/' + name.toLowerCase());
  }

  /**
   * Normaliza os version-groups usados pelo Builder para filtrar golpes
   * por jogo/formato selecionado.
   */
  // Filtro atual: version-group exato (ou conjunto de version-groups da opcao do Builder).
  function normalizeVersionGroups(versionGroupKey) {
    if (!versionGroupKey) return null;
    const groups = Array.isArray(versionGroupKey) ? versionGroupKey : [versionGroupKey];
    const clean = [...new Set(groups.filter(Boolean))];
    return clean.length ? clean : null;
  }

  function versionScopeLabel(versionGroups) {
    const groups = normalizeVersionGroups(versionGroups);
    if (!groups) return 'sem restricao de jogo';
    return groups.map(g => g.split('-').filter(Boolean)
      .map(w => w[0].toUpperCase() + w.slice(1)).join(' ')).join(' / ');
  }

  // Valida golpes e habilidade de um Pokémon contra a versão de jogo selecionada
  async function validatePokemonForVersion(pkName, moveNames, abilityName, versionGroupKey, versionLabel) {
    const errors = [];
    let data;
    try {
      data = await getPokemon(pkName);
    } catch {
      errors.push(`Pokémon "${pkName}" não encontrado na PokéAPI`);
      return errors;
    }

    // Valida habilidade
    if (abilityName && abilityName.trim()) {
      const abilitySlug = apiName(abilityName);
      const hasAbility = data.abilities.some(a => a.ability.name === abilitySlug);
      if (!hasAbility) {
        errors.push(`Habilidade "${abilityName}" não é possível para ${pkName}`);
      }
    }

    // Valida golpes contra a versão de jogo
    for (const moveName of moveNames) {
      if (!moveName || !moveName.trim()) continue;
      const moveSlug = moveApiName(moveName);
      const moveEntry = data.moves.find(m => m.move.name === moveSlug);
      if (!moveEntry) {
        errors.push(`Move "${moveName}" não pode ser aprendido por ${pkName}`);
        continue;
      }
      const versionGroups = normalizeVersionGroups(versionGroupKey);
      if (versionGroups) {
        const allowed = new Set(versionGroups);
        const learnable = moveEntry.version_group_details.some(
          vgd => allowed.has(vgd.version_group.name)
        );
        if (!learnable) {
          errors.push(`Move "${moveName}" nao disponivel em ${versionLabel || versionScopeLabel(versionGroups)} para ${pkName}`);
        }
      }
    }

    return errors;
  }

  // Retorna habilidades disponíveis para o Pokémon (nome, slug e se é oculta)
  async function getPokemonAbilities(name) {
    const data = await getPokemon(name);
    return data.abilities.map(a => ({
      name: a.ability.name.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' '),
      slug: a.ability.name,
      hidden: a.is_hidden
    }));
  }

  /**
   * Retorna lista ordenada de nomes de golpes que pkName pode aprender
   * nos version-groups informados.
   * Reutiliza o cache de getPokemon() — resposta é instantânea se o Pokémon
   * já foi carregado anteriormente (ex: ao buscar sprite/habilidades).
   * @param {string} pkName - Nome do Pokémon (formato exibição)
   * @param {string|string[]|null} versionGroupKey - version-group(s); null = sem restricao
   * @returns {Promise<string[]>} Nomes formatados em Title Case, ordenados
   */
  async function getLearnableMoves(pkName, versionGroupKey) {
    const data = await getPokemon(pkName);
    const versionGroups = normalizeVersionGroups(versionGroupKey);
    const allowed = versionGroups ? new Set(versionGroups) : null;
    return data.moves
      .filter(m => !allowed || m.version_group_details.some(
        vgd => allowed.has(vgd.version_group.name)
      ))
      .map(m => displayMoveName(m.move.name))
      .sort();
  }

  // Retorna stats base do Pokémon no formato { hp, atk, def, spa, spd, spe }
  async function getPokemonStats(name) {
    const data = await getPokemon(name);
    const stats = {};
    const keyMap = {
      'hp': 'hp', 'attack': 'atk', 'defense': 'def',
      'special-attack': 'spa', 'special-defense': 'spd', 'speed': 'spe'
    };
    for (const s of data.stats) {
      const k = keyMap[s.stat.name];
      if (k) stats[k] = s.base_stat;
    }
    return stats;
  }

  async function loadMoveList() {
    const cached = cacheGet('__movelist__');
    if (Array.isArray(cached) && cached.length) return cached;

    // Fetch direto com timeout de 12s (evita trava indefinida)
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 30000);
    try {
      const res = await fetch(`${BASE}/move?limit=2000&offset=0`, { signal: ctrl.signal });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`PokéAPI ${res.status}`);
      const data = await res.json();
      const list = data.results.map(m => displayMoveName(m.name));
      cacheSet('__movelist__', list);
      return list;
    } catch (e) {
      clearTimeout(timer);
      console.error('[loadMoveList] erro:', e.name, e.message);
      throw e;
    }
  }

  /**
   * Singleton Promise para a lista de golpes.
   * Garante que apenas um fetch ocorra por vez — chamadores simultâneos
   * recebem o mesmo Promise e aguardam o mesmo resultado.
   * Em caso de falha, reseta _moveListPromise para permitir nova tentativa.
   */
  let _moveListPromise = null;
  function ensureMoveList() {
    if (_moveListPromise) return _moveListPromise;
    _moveListPromise = loadMoveList()
      .catch(e => { _moveListPromise = null; return Promise.reject(e); });
    return _moveListPromise;
  }

  // Lista completa de habilidades para autocomplete sem Pokémon selecionado
  async function loadAbilityList() {
    const cached = cacheGet('__abilitylist__');
    if (Array.isArray(cached) && cached.length) return cached;
    const res = await fetch(`${BASE}/ability?limit=400&offset=0`);
    if (!res.ok) throw new Error(`PokéAPI ${res.status}`);
    const data = await res.json();
    const list = data.results.map(a =>
      a.name.split('-').filter(Boolean).map(w => w[0].toUpperCase() + w.slice(1)).join(' ')
    );
    cacheSet('__abilitylist__', list);
    return list;
  }

  let _abilityListPromise = null;
  function ensureAbilityList() {
    if (_abilityListPromise) return _abilityListPromise;
    _abilityListPromise = loadAbilityList()
      .catch(e => { _abilityListPromise = null; return Promise.reject(e); });
    return _abilityListPromise;
  }

  return { getPokemon, getPokemonSpecies, loadPokemonList,
           getMove, getMoveInfo, getMovesInfo, getMovesByType, loadMoveList, ensureMoveList,
           getLearnableMoves,
           loadAbilityList, ensureAbilityList,
           getNature, validatePokemonForVersion,
           getPokemonAbilities, getPokemonStats,
           spriteUrl, spriteForGen, officialArtworkUrl, pixelSpriteUrl, apiName };
})();
