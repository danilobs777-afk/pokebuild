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

  function spriteUrl(id, hd = false, shiny = false) {
    if (hd) return `${SPRITE_BASE}/other/official-artwork${shiny ? '/shiny' : ''}/${id}.png`;
    return `${SPRITE_BASE}${shiny ? '/shiny' : ''}/${id}.png`;
  }

  /**
   * Retorna a URL do sprite adequada para a geração ativa da gen-bar.
   * activeGen: 'gen1' | 'gen2to5' | 'gen6plus'
   * Fallback automático para data.sprites.front_default se o sprite
   * retro não existir (Pokémon introduzido após aquela geração).
   */
  function spriteForGen(data, activeGen) {
    const v = data?.sprites?.versions;
    const fallback = data?.sprites?.front_default || spriteUrl(data.id);
    if (activeGen === 'gen1') {
      return v?.['generation-i']?.['red-blue']?.front_default || fallback;
    }
    if (activeGen === 'gen2to5') {
      return v?.['generation-v']?.['black-white']?.front_default
          || v?.['generation-iv']?.['diamond-pearl']?.front_default
          || v?.['generation-iii']?.['ruby-sapphire']?.front_default
          || v?.['generation-ii']?.['gold']?.front_default
          || fallback;
    }
    // gen6plus: official artwork
    return `${SPRITE_BASE}/other/official-artwork/${data.id}.png`;
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
    return get('/move/' + apiName(name));
  }

  // Retorna { type: 'Ground', status: false } — extraído da resposta completa já cacheada
  async function getMoveInfo(name) {
    if (!name?.trim()) return null;
    try {
      const data = await getMove(name);
      const type = data.type.name.charAt(0).toUpperCase() + data.type.name.slice(1);
      const status = data.damage_class.name === 'status';
      return { type, status };
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

  async function getNature(name) {
    return get('/nature/' + name.toLowerCase());
  }

  /**
   * Mapeia cada version-group da PokéAPI para o número de geração.
   * Usado para filtrar golpes aprendíveis (getLearnableMoves) e validar
   * legalidade de moves no Builder (validatePokemonForVersion).
   */
  // Mapeia cada version-group da PokéAPI para seu número de geração
  const VG_GEN = {
    'red-blue':1,'yellow':1,'red-green-japan':1,'blue-japan':1,
    'gold-silver':2,'crystal':2,
    'ruby-sapphire':3,'emerald':3,'firered-leafgreen':3,'colosseum':3,'xd':3,
    'diamond-pearl':4,'platinum':4,'heartgold-soulsilver':4,
    'black-white':5,'black-2-white-2':5,
    'x-y':6,'omega-ruby-alpha-sapphire':6,
    'sun-moon':7,'ultra-sun-ultra-moon':7,'lets-go-pikachu-lets-go-eevee':7,
    'sword-shield':8,'the-isle-of-armor':8,'the-crown-tundra':8,
    'brilliant-diamond-shining-pearl':8,'legends-arceus':8,
    'scarlet-violet':9,'the-teal-mask':9,'the-indigo-disk':9,'legends-za':9,
    'mega-dimension':9,'champions':9,
  };

  // Valida golpes e habilidade de um Pokémon contra a versão de jogo selecionada
  async function validatePokemonForVersion(pkName, moveNames, abilityName, versionGroupKey) {
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
      const moveSlug = apiName(moveName);
      const moveEntry = data.moves.find(m => m.move.name === moveSlug);
      if (!moveEntry) {
        errors.push(`Move "${moveName}" não pode ser aprendido por ${pkName}`);
        continue;
      }
      if (versionGroupKey) {
        const targetGen = VG_GEN[versionGroupKey] ?? 9;
        const learnable = moveEntry.version_group_details.some(
          vgd => (VG_GEN[vgd.version_group.name] ?? 99) <= targetGen
        );
        if (!learnable) {
          errors.push(`Move "${moveName}" não disponível até a geração ${targetGen} para ${pkName}`);
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
   * até a geração correspondente ao versionGroupKey.
   * Reutiliza o cache de getPokemon() — resposta é instantânea se o Pokémon
   * já foi carregado anteriormente (ex: ao buscar sprite/habilidades).
   * @param {string} pkName - Nome do Pokémon (formato exibição)
   * @param {string|null} versionGroupKey - Chave de VG_GEN; null = sem restrição (gen 9)
   * @returns {Promise<string[]>} Nomes formatados em Title Case, ordenados
   */
  async function getLearnableMoves(pkName, versionGroupKey) {
    const data = await getPokemon(pkName);
    const targetGen = versionGroupKey ? (VG_GEN[versionGroupKey] ?? 9) : 9;
    return data.moves
      .filter(m => m.version_group_details.some(
        vgd => (VG_GEN[vgd.version_group.name] ?? 99) <= targetGen
      ))
      .map(m => m.move.name.split('-').filter(Boolean)
        .map(w => w[0].toUpperCase() + w.slice(1)).join(' '))
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
      const list = data.results.map(m =>
        m.name.split('-').filter(Boolean).map(w => w[0].toUpperCase() + w.slice(1)).join(' ')
      );
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
           getMove, getMoveInfo, getMovesInfo, loadMoveList, ensureMoveList,
           getLearnableMoves,
           loadAbilityList, ensureAbilityList,
           getNature, validatePokemonForVersion,
           getPokemonAbilities, getPokemonStats,
           spriteUrl, spriteForGen, apiName };
})();
