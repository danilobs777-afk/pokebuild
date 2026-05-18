'use strict';

/**
 * data.js — Constantes e utilitários globais
 * ------------------------------------------
 * Fonte de verdade local para todos os dados que NAO precisam de API:
 * tipos, tabela de efetividade, naturezas, nomes de Pokemon, itens e versoes.
 * Carregado primeiro na ordem de scripts (ver index.html).
 * Todas as variaveis aqui sao globais e acessadas pelos demais modulos.
 * Regras de produto derivadas dessas tabelas devem passar por generation.js.
 *
 * Dependencias: nenhuma (este e o primeiro script carregado).
 */

// ── Tipos ─────────────────────────────────────────────────────────────────────

const TYPES = ['Normal','Fire','Water','Electric','Grass','Ice','Fighting','Poison','Ground','Flying','Psychic','Bug','Rock','Ghost','Steel','Dragon','Dark','Fairy'];
const TYPES_SORTED = [...TYPES].sort();

// ── Sistema de gerações ────────────────────────────────────────────────────────

let _activeGen = 'gen6plus';
function setActiveGen(gen) { _activeGen = gen; }
function getActiveGen()    { return _activeGen; }

// Tipos que não existem em cada geração
const _GEN_EXCLUDED = {
  gen1:    new Set(['Steel','Dark','Fairy']),
  gen2to5: new Set(['Fairy']),
  gen6plus: new Set(),
};

// Patches sobre o TYPE_CHART Gen 6+ (linha → { colIdx: novoValor })
const _GEN_PATCHES = {
  gen1: {
    Ghost:   { 10: 0 },   // Ghost vs Psychic: deveria ser 2× mas bug o zera
    Psychic: { 13: 0 },   // Psychic vs Ghost: imune no Gen 1
    Poison:  { 11: 2 },   // Poison vs Bug: 2× no Gen 1, 1× depois
    Bug:     { 7:  2 },   // Bug vs Poison: 2× no Gen 1, 0.5× depois
    Ice:     { 1:  1 },   // Ice vs Fire: 1× no Gen 1 (Fire ganhou resist a Ice no Gen 2)
  },
  gen2to5: {
    Dark:  { 14: 0.5 },   // Dark vs Steel: resistência que foi removida no Gen 6
    Ghost: { 14: 0.5 },   // Ghost vs Steel: idem
  },
};

/** Retorna os tipos atacantes/defensores válidos para a geração ativa. */
function getTypesForGen(gen = _activeGen) {
  const excl = _GEN_EXCLUDED[gen] || new Set();
  return TYPES.filter(t => !excl.has(t));
}

function getActiveTypes() {
  return getTypesForGen(_activeGen);
}

/**
 * Tabela de efetividade (Gen 6+, inclui Fairy).
 * Linha = tipo atacante, colunas = multiplicador contra cada tipo defensor
 * na mesma ordem de TYPES. Valores: 0=imune, 0.5=resistencia, 1=neutro, 2=fraqueza.
 */
const TYPE_CHART = {
  Normal:   [1,1,1,1,1,1,1,1,1,1,1,1,.5,0,.5,1,1,1],
  Fire:     [1,.5,.5,1,2,2,1,1,1,1,1,2,.5,1,2,.5,1,1],
  Water:    [1,2,.5,1,.5,1,1,1,2,1,1,1,2,1,1,.5,1,1],
  Electric: [1,1,2,.5,.5,1,1,1,0,2,1,1,1,1,1,.5,1,1],
  Grass:    [1,.5,2,1,.5,1,1,.5,2,.5,1,.5,2,1,.5,.5,1,1],
  Ice:      [1,.5,.5,1,2,.5,1,1,2,2,1,1,1,1,.5,2,1,1],
  Fighting: [2,1,1,1,1,2,1,.5,1,.5,.5,.5,2,0,2,1,2,.5],
  Poison:   [1,1,1,1,2,1,1,.5,.5,1,1,1,.5,.5,0,1,1,2],
  Ground:   [1,2,1,2,.5,1,1,2,1,0,1,1,2,1,2,1,1,1],
  Flying:   [1,1,1,.5,2,1,2,1,1,1,1,2,.5,1,.5,1,1,1],
  Psychic:  [1,1,1,1,1,1,2,2,1,1,.5,1,1,1,.5,1,0,1],
  Bug:      [1,.5,1,1,2,1,.5,.5,1,.5,2,1,1,.5,.5,1,2,.5],
  Rock:     [1,2,1,1,1,2,.5,1,.5,2,1,2,1,1,.5,1,1,1],
  Ghost:    [0,1,1,1,1,1,1,1,1,1,2,1,1,2,1,1,.5,1],
  Steel:    [1,.5,.5,.5,1,2,1,1,1,1,1,1,2,1,.5,1,1,2],
  Dragon:   [1,1,1,1,1,1,1,1,1,1,1,1,1,1,.5,2,1,0],
  Dark:     [1,1,1,1,1,1,.5,1,1,1,2,1,1,2,1,1,.5,.5],
  Fairy:    [1,.5,1,1,1,1,2,.5,1,1,1,1,1,1,.5,2,2,1]
};

/** Multiplica efetividade do tipo atacante contra 1 ou 2 tipos defensores. */
function typeEff(atk, defTypes) {
  const excl    = _GEN_EXCLUDED[_activeGen] || new Set();
  const patches = _GEN_PATCHES[_activeGen]  || {};
  if (excl.has(atk)) return 0;
  const chart = TYPE_CHART[atk];
  if (!chart) return 1;
  let m = 1;
  for (const d of defTypes) {
    if (excl.has(d)) continue;
    const idx = TYPES.indexOf(d);
    if (idx === -1) continue;
    const val = (patches[atk] && patches[atk][idx] !== undefined) ? patches[atk][idx] : chart[idx];
    m *= val;
  }
  return m;
}

/** Retorna mapa { tipo: multiplicador } apenas para tipos válidos na geração ativa. */
function getDefProfile(defTypes) {
  const p = {};
  for (const atk of getActiveTypes()) p[atk] = typeEff(atk, defTypes);
  return p;
}

function multLabel(m) {
  if (m === 0)    return { cls: 'm-immune',  txt: '0×' };
  if (m === 0.25) return { cls: 'm-quarter', txt: '¼×' };
  if (m === 0.5)  return { cls: 'm-half',    txt: '½×' };
  if (m === 1)    return { cls: 'm-neutral', txt: '1×' };
  if (m === 2)    return { cls: 'm-double',  txt: '2×' };
  if (m === 4)    return { cls: 'm-quad',    txt: '4×' };
  return { cls: '', txt: m + '×' };
}

// ── Naturezas ─────────────────────────────────────────────────────────────────

/**
 * up/down sao as chaves de STAT_KEYS que a natureza aumenta/diminui (+10%/-10%).
 * Naturezas neutras (Hardy, Docile, Serious, Bashful, Quirky) tem up/down = null.
 */
const NATURES = {
  Hardy:   { up: null,  down: null  },
  Lonely:  { up: 'atk', down: 'def' },
  Brave:   { up: 'atk', down: 'spe' },
  Adamant: { up: 'atk', down: 'spa' },
  Naughty: { up: 'atk', down: 'spd' },
  Bold:    { up: 'def', down: 'atk' },
  Docile:  { up: null,  down: null  },
  Relaxed: { up: 'def', down: 'spe' },
  Impish:  { up: 'def', down: 'spa' },
  Lax:     { up: 'def', down: 'spd' },
  Timid:   { up: 'spe', down: 'atk' },
  Hasty:   { up: 'spe', down: 'def' },
  Serious: { up: null,  down: null  },
  Jolly:   { up: 'spe', down: 'spa' },
  Naive:   { up: 'spe', down: 'spd' },
  Modest:  { up: 'spa', down: 'atk' },
  Mild:    { up: 'spa', down: 'def' },
  Quiet:   { up: 'spa', down: 'spe' },
  Bashful: { up: null,  down: null  },
  Rash:    { up: 'spa', down: 'spd' },
  Calm:    { up: 'spd', down: 'atk' },
  Gentle:  { up: 'spd', down: 'def' },
  Sassy:   { up: 'spd', down: 'spe' },
  Careful: { up: 'spd', down: 'spa' },
  Quirky:  { up: null,  down: null  }
};

function natureMod(nature, stat) {
  const n = NATURES[nature];
  if (!n) return 1;
  if (n.up === stat)   return 1.1;
  if (n.down === stat) return 0.9;
  return 1;
}

// ── Stats (cálculo de atributos) ─────────────────────────────────────────────

/**
 * Calcula o valor real de um stat pela formula padrao Gen 3+.
 * HP usa formula diferente dos demais (soma level+10 no final).
 */
// Cálculo de stat (Gen 3+, Nível 50)
function calcStat(base, stat, ev, iv, nature, level = 50) {
  if (stat === 'hp') {
    return Math.floor((2 * base + iv + Math.floor(ev / 4)) * level / 100) + level + 10;
  }
  const raw = Math.floor((2 * base + iv + Math.floor(ev / 4)) * level / 100) + 5;
  return Math.floor(raw * natureMod(nature, stat));
}

/** Formato Champions: cada SP vale +1 no stat final (sem divisao por 4). */
// Champions SP: 1 SP = +1 direto no stat final (todos os IVs = 31)
function calcStatChampions(base, stat, sp) {
  if (stat === 'hp') {
    return Math.floor((2 * base + 31) * 50 / 100) + 60 + sp;
  }
  return Math.floor((Math.floor((2 * base + 31) * 50 / 100) + 5)) + sp;
}

const STAT_KEYS  = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];
const STAT_LABELS = { hp: 'HP', atk: 'Atk', def: 'Def', spa: 'SpA', spd: 'SpD', spe: 'Spe' };


// ── Cores dos tipos ──────────────────────────────────────────────────────────

/**
 * Cores dos tipos — espelham os valores das classes .t-* no CSS.
 * Usadas em JS para aplicar cor dinamica (ex: bordas dos campos de golpe no Builder)
 * sem precisar de regras CSS adicionais com seletor de atributo para cada tipo.
 */
const TYPE_COLORS = {
  Normal:'#ABABAB',Fire:'#f97316', Water:'#3b82f6', Electric:'#eab308',
  Grass:'#22c55e', Ice:'#67e8f9', Fighting:'#dc2626', Poison:'#a855f7',
  Ground:'#d97706', Flying:'#818cf8', Psychic:'#ec4899', Bug:'#84cc16',
  Rock:'#B8A038', Ghost:'#6d28d9', Steel:'#94a3b8', Dragon:'#4f46e5',
  Dark:'#374151', Fairy:'#f9a8d4'
};

// ── Versoes de jogo ────────────────────────────────────────────────────────────

/**
 * Versoes disponiveis no Builder para validacao de legalidade de moves.
 * key deve corresponder ao version-group principal da PokeAPI.
 * O formato champions e tratado separadamente (sem restricao de geracao).
 */
const GAME_VERSIONS = [
  { label: 'Pokémon Champions',              key: 'champions',                          gen: null },
  { label: 'Scarlet / Violet',               key: 'scarlet-violet',                     gen: 9,
    moveGroups: ['scarlet-violet', 'the-teal-mask', 'the-indigo-disk'] },
  { label: 'Sword / Shield',                 key: 'sword-shield',                       gen: 8,
    moveGroups: ['sword-shield', 'the-isle-of-armor', 'the-crown-tundra'] },
  { label: 'Brilliant Diamond / Shining Pearl', key: 'brilliant-diamond-shining-pearl',  gen: 8    },
  { label: 'Sun / Moon',                     key: 'sun-moon',                           gen: 7    },
  { label: 'Ultra Sun / Ultra Moon',         key: 'ultra-sun-ultra-moon',               gen: 7    },
  { label: 'X / Y',                          key: 'x-y',                                gen: 6    },
  { label: 'Omega Ruby / Alpha Sapphire',    key: 'omega-ruby-alpha-sapphire',          gen: 6    },
  { label: 'Black / White',                  key: 'black-white',                        gen: 5    },
  { label: 'Black 2 / White 2',             key: 'black-2-white-2',                    gen: 5    },
  { label: 'HeartGold / SoulSilver',         key: 'heartgold-soulsilver',               gen: 4    },
  { label: 'Diamond / Pearl / Platinum',     key: 'diamond-pearl',                      gen: 4,
    moveGroups: ['diamond-pearl', 'platinum'] },
  { label: 'FireRed / LeafGreen',            key: 'firered-leafgreen',                  gen: 3    },
  { label: 'Ruby / Sapphire / Emerald',      key: 'ruby-sapphire',                      gen: 3,
    moveGroups: ['ruby-sapphire', 'emerald'] },
  { label: 'Gold / Silver / Crystal',        key: 'gold-silver',                        gen: 2,
    moveGroups: ['gold-silver', 'crystal'] },
  { label: 'Red / Blue / Yellow',            key: 'red-blue',                           gen: 1,
    moveGroups: ['red-blue', 'yellow'] },
];

const GEN_GROUPS = {
  gen1: [1],
  gen2to5: [2, 3, 4, 5],
  gen6plus: [6, 7, 8, 9],
};

function getGameVersionsForGen(gen = _activeGen) {
  const allowed = GEN_GROUPS[gen] || GEN_GROUPS.gen6plus;
  return GAME_VERSIONS.filter(v => v.key !== 'champions' && allowed.includes(v.gen));
}

function getDefaultGameVersionForGen(gen = _activeGen) {
  return getGameVersionsForGen(gen)[0]?.key || 'scarlet-violet';
}

function isGameVersionAllowedForGen(key, gen = _activeGen) {
  return getGameVersionsForGen(gen).some(v => v.key === key);
}

function getGenGroupForGameVersion(key) {
  const version = GAME_VERSIONS.find(v => v.key === key);
  if (!version || version.gen == null) return null;
  if (version.gen === 1) return 'gen1';
  if (version.gen <= 5) return 'gen2to5';
  return 'gen6plus';
}

function getMoveVersionGroupsForGameVersion(key) {
  const version = GAME_VERSIONS.find(v => v.key === key);
  if (!version || version.key === 'champions') return null;
  return version.moveGroups || [version.key];
}

// ── Itens competitivos ────────────────────────────────────────────────────────

/** Lista curada de itens competitivos para autocomplete no Builder e DmgCalc.
 *  Nao inclui todos os itens do jogo — apenas os relevantes para o meta. */
const ITEMS = [
  'Choice Band','Choice Specs','Choice Scarf','Life Orb','Focus Sash','Assault Vest',
  'Leftovers','Rocky Helmet','Eviolite','Heavy-Duty Boots','Black Sludge','Sitrus Berry',
  'Lum Berry','Weakness Policy','Air Balloon','Mental Herb','Power Herb','White Herb',
  'Flame Orb','Toxic Orb','Throat Spray','Loaded Dice','Clear Amulet','Covert Cloak',
  'Mirror Herb','Booster Energy','Expert Belt','Scope Lens','Wide Lens','Zoom Lens',
  "King's Rock",'Razor Fang','Metronome','Shell Bell','Shed Shell','Safety Goggles',
  'Terrain Extender','Room Service','Utility Umbrella','Blunder Policy','Protective Pads',
  'Absorb Bulb','Cell Battery','Float Stone','Iron Ball','Lagging Tail','Full Incense',
  'Mystic Water','Charcoal','Miracle Seed','Magnet','Twisted Spoon','Never-Melt Ice',
  'Poison Barb','Soft Sand','Sharp Beak','Silk Scarf','Hard Stone','Silver Powder',
  'Spell Tag','Metal Coat','Dragon Fang','Dread Plate','Fist Plate','Flame Plate',
  'Icicle Plate','Insect Plate','Iron Plate','Meadow Plate','Mind Plate','Pixie Plate',
  'Sky Plate','Splash Plate','Spooky Plate','Stone Plate','Toxic Plate','Zap Plate',
  // Mega Stones (Gen 6–7)
  'Venusaurite','Charizardite X','Charizardite Y','Blastoisinite','Beedrillite','Pidgeotite',
  'Alakazite','Slowbronite','Gengarite','Kangaskhanite','Pinsirite','Gyaradosite',
  'Aerodactylite','Mewtwonite X','Mewtwonite Y','Ampharosite','Steelixite','Scizorite',
  'Heracronite','Houndoominite','Tyranitarite','Sceptilite','Blazikenite','Swampertite',
  'Gardevoirite','Sablenite','Mawilite','Aggronite','Medichamite','Manectite',
  'Sharpedonite','Cameruptite','Altarianite','Banettite','Absolite','Glalitite',
  'Salamencite','Metagrossite','Latiasite','Latiosite',
  'Lucarionite','Garchompite','Lopunnite','Abomasite','Galladite','Audinite','Diancite',
  // Z-Crystals de tipo (Gen 7)
  'Normalium Z','Firium Z','Waterium Z','Electrium Z','Grassium Z','Icium Z',
  'Fightinium Z','Poisonium Z','Groundium Z','Flyinium Z','Psychium Z','Buginium Z',
  'Rockium Z','Ghostium Z','Steelium Z','Dragonium Z','Darkinium Z','Fairium Z',
  // Z-Crystals específicos de Pokémon (Gen 7)
  'Pikanium Z','Pikashunium Z','Aloraichium Z','Snorlium Z','Mewnium Z','Eevium Z',
  'Decidium Z','Incinium Z','Primarium Z','Tapunium Z','Marshadium Z',
  'Lycanium Z','Kommonium Z','Mimikium Z','Solganium Z','Lunalium Z','Ultranecrozium Z',
];

// ── Mega Stones: pedra → forma Mega ───────────────────────────────────────────
const MEGA_STONE_MAP = {
  'Venusaurite':    'Venusaur-Mega',
  'Charizardite X': 'Charizard-Mega-X',
  'Charizardite Y': 'Charizard-Mega-Y',
  'Blastoisinite':  'Blastoise-Mega',
  'Beedrillite':    'Beedrill-Mega',
  'Pidgeotite':     'Pidgeot-Mega',
  'Alakazite':      'Alakazam-Mega',
  'Slowbronite':    'Slowbro-Mega',
  'Gengarite':      'Gengar-Mega',
  'Kangaskhanite':  'Kangaskhan-Mega',
  'Pinsirite':      'Pinsir-Mega',
  'Gyaradosite':    'Gyarados-Mega',
  'Aerodactylite':  'Aerodactyl-Mega',
  'Mewtwonite X':   'Mewtwo-Mega-X',
  'Mewtwonite Y':   'Mewtwo-Mega-Y',
  'Ampharosite':    'Ampharos-Mega',
  'Steelixite':     'Steelix-Mega',
  'Scizorite':      'Scizor-Mega',
  'Heracronite':    'Heracross-Mega',
  'Houndoominite':  'Houndoom-Mega',
  'Tyranitarite':   'Tyranitar-Mega',
  'Sceptilite':     'Sceptile-Mega',
  'Blazikenite':    'Blaziken-Mega',
  'Swampertite':    'Swampert-Mega',
  'Gardevoirite':   'Gardevoir-Mega',
  'Sablenite':      'Sableye-Mega',
  'Mawilite':       'Mawile-Mega',
  'Aggronite':      'Aggron-Mega',
  'Medichamite':    'Medicham-Mega',
  'Manectite':      'Manectric-Mega',
  'Sharpedonite':   'Sharpedo-Mega',
  'Cameruptite':    'Camerupt-Mega',
  'Altarianite':    'Altaria-Mega',
  'Banettite':      'Banette-Mega',
  'Absolite':       'Absol-Mega',
  'Glalitite':      'Glalie-Mega',
  'Salamencite':    'Salamence-Mega',
  'Metagrossite':   'Metagross-Mega',
  'Latiasite':      'Latias-Mega',
  'Latiosite':      'Latios-Mega',
  'Lucarionite':    'Lucario-Mega',
  'Garchompite':    'Garchomp-Mega',
  'Lopunnite':      'Lopunny-Mega',
  'Abomasite':      'Abomasnow-Mega',
  'Galladite':      'Gallade-Mega',
  'Audinite':       'Audino-Mega',
  'Diancite':       'Diancie-Mega',
};

// ── Base de dados de Pokemon ──────────────────────────────────────────────────

/**
 * Mapa de todos os Pokemon com seus tipos.
 * Formato: { "Nome": ["Tipo1", "Tipo2 ou null"] }
 * Usado para autocomplete (nome) e calculo de efetividade (tipos) sem chamada de API.
 */
const POKEMON_DB = {"Abomasnow":["Grass","Ice"],"Abra":["Psychic",null],"Absol":["Dark",null],"Accelgor":["Bug",null],"Aegislash":["Steel","Ghost"],"Aerodactyl":["Rock","Flying"],"Aggron":["Steel","Rock"],"Aipom":["Normal",null],"Alakazam":["Psychic",null],"Alcremie":["Fairy",null],"Alomomola":["Water",null],"Altaria":["Dragon","Flying"],"Amaura":["Rock","Ice"],"Ambipom":["Normal",null],"Amoonguss":["Grass","Poison"],"Ampharos":["Electric",null],"Annihilape":["Fighting","Ghost"],"Anorith":["Rock","Bug"],"Appletun":["Grass","Dragon"],"Applin":["Grass","Dragon"],"Araquanid":["Water","Bug"],"Arbok":["Poison",null],"Arboliva":["Grass","Normal"],"Arcanine":["Fire",null],"Arceus":["Normal",null],"Archaludon":["Steel","Dragon"],"Archen":["Rock","Flying"],"Archeops":["Rock","Flying"],"Arctibax":["Dragon","Ice"],"Arctovish":["Ice","Water"],"Arctozolt":["Electric","Ice"],"Ariados":["Bug","Poison"],"Armaldo":["Rock","Bug"],"Armarouge":["Fire","Psychic"],"Aromatisse":["Fairy",null],"Aron":["Steel","Rock"],"Arrokuda":["Water",null],"Articuno":["Ice","Flying"],"Audino":["Normal",null],"Aurorus":["Rock","Ice"],"Avalugg":["Ice",null],"Axew":["Dragon",null],"Azelf":["Psychic",null],"Azumarill":["Water","Fairy"],"Azurill":["Normal","Fairy"],"Bagon":["Dragon",null],"Baltoy":["Ground","Psychic"],"Banette":["Ghost",null],"Barbaracle":["Rock","Water"],"Barboach":["Water","Ground"],"Barraskewda":["Water",null],"Basculegion":["Water","Ghost"],"Basculin":["Water",null],"Bastiodon":["Rock","Steel"],"Baxcalibur":["Dragon","Ice"],"Bayleef":["Grass",null],"Beartic":["Ice",null],"Beautifly":["Bug","Flying"],"Beedrill":["Bug","Poison"],"Beheeyem":["Psychic",null],"Beldum":["Steel","Psychic"],"Bellibolt":["Electric",null],"Bellossom":["Grass",null],"Bellsprout":["Grass","Poison"],"Bergmite":["Ice",null],"Bewear":["Normal","Fighting"],"Bibarel":["Normal","Water"],"Bidoof":["Normal",null],"Binacle":["Rock","Water"],"Bisharp":["Dark","Steel"],"Blacephalon":["Fire","Ghost"],"Blastoise":["Water",null],"Blaziken":["Fire","Fighting"],"Blipbug":["Bug",null],"Blissey":["Normal",null],"Blitzle":["Electric",null],"Boldore":["Rock",null],"Boltund":["Electric",null],"Bombirdier":["Flying","Dark"],"Bonsly":["Rock",null],"Bouffalant":["Normal",null],"Bounsweet":["Grass",null],"Braixen":["Fire",null],"Brambleghast":["Grass","Ghost"],"Bramblin":["Grass","Ghost"],"Braviary":["Normal","Flying"],"Breloom":["Grass","Fighting"],"Brionne":["Water",null],"Bronzong":["Steel","Psychic"],"Bronzor":["Steel","Psychic"],"Brute-Bonnet":["Grass","Dark"],"Bruxish":["Water","Psychic"],"Budew":["Grass","Poison"],"Buizel":["Water",null],"Bulbasaur":["Grass","Poison"],"Buneary":["Normal",null],"Bunnelby":["Normal",null],"Burmy":["Bug",null],"Butterfree":["Bug","Flying"],"Buzzwole":["Bug","Fighting"],"Cacnea":["Grass",null],"Cacturne":["Grass","Dark"],"Calyrex":["Psychic","Grass"],"Camerupt":["Fire","Ground"],"Capsakid":["Grass",null],"Carbink":["Rock","Fairy"],"Carkol":["Rock","Fire"],"Carnivine":["Grass",null],"Carracosta":["Water","Rock"],"Carvanha":["Water","Dark"],"Cascoon":["Bug",null],"Castform":["Normal",null],"Caterpie":["Bug",null],"Celebi":["Psychic","Grass"],"Celesteela":["Steel","Flying"],"Centiskorch":["Fire","Bug"],"Ceruledge":["Fire","Ghost"],"Cetitan":["Ice",null],"Cetoddle":["Ice",null],"Chandelure":["Ghost","Fire"],"Chansey":["Normal",null],"Charcadet":["Fire",null],"Charizard":["Fire","Flying"],"Charjabug":["Bug","Electric"],"Charmander":["Fire",null],"Charmeleon":["Fire",null],"Chatot":["Normal","Flying"],"Cherrim":["Grass",null],"Cherubi":["Grass",null],"Chesnaught":["Grass","Fighting"],"Chespin":["Grass",null],"Chewtle":["Water",null],"Chi-Yu":["Dark","Fire"],"Chien-Pao":["Dark","Ice"],"Chikorita":["Grass",null],"Chimchar":["Fire",null],"Chimecho":["Psychic",null],"Chinchou":["Water","Electric"],"Chingling":["Psychic",null],"Cinccino":["Normal",null],"Cinderace":["Fire",null],"Clamperl":["Water",null],"Clauncher":["Water",null],"Clawitzer":["Water",null],"Claydol":["Ground","Psychic"],"Clefable":["Fairy",null],"Clefairy":["Fairy",null],"Cleffa":["Fairy",null],"Clobbopus":["Fighting",null],"Clodsire":["Poison","Ground"],"Cloyster":["Water","Ice"],"Coalossal":["Rock","Fire"],"Cobalion":["Steel","Fighting"],"Cofagrigus":["Ghost",null],"Combee":["Bug","Flying"],"Combusken":["Fire","Fighting"],"Comfey":["Fairy",null],"Conkeldurr":["Fighting",null],"Copperajah":["Steel",null],"Corphish":["Water",null],"Corsola":["Water","Rock"],"Corviknight":["Flying","Steel"],"Corvisquire":["Flying",null],"Cosmoem":["Psychic",null],"Cosmog":["Psychic",null],"Cottonee":["Grass","Fairy"],"Crabominable":["Fighting","Ice"],"Crabrawler":["Fighting",null],"Cradily":["Rock","Grass"],"Cramorant":["Flying","Water"],"Cranidos":["Rock",null],"Crawdaunt":["Water","Dark"],"Cresselia":["Psychic",null],"Croagunk":["Poison","Fighting"],"Crobat":["Poison","Flying"],"Crocalor":["Fire",null],"Croconaw":["Water",null],"Crustle":["Bug","Rock"],"Cryogonal":["Ice",null],"Cubchoo":["Ice",null],"Cubone":["Ground",null],"Cufant":["Steel",null],"Cursola":["Ghost",null],"Cutiefly":["Bug","Fairy"],"Cyclizar":["Dragon","Normal"],"Cyndaquil":["Fire",null],"Dachsbun":["Fairy",null],"Darkrai":["Dark",null],"Darmanitan":["Fire",null],"Dartrix":["Grass","Flying"],"Darumaka":["Fire",null],"Decidueye":["Grass","Ghost"],"Dedenne":["Electric","Fairy"],"Deerling":["Normal","Grass"],"Deino":["Dark","Dragon"],"Delcatty":["Normal",null],"Delibird":["Ice","Flying"],"Delphox":["Fire","Psychic"],"Deoxys":["Psychic",null],"Dewgong":["Water","Ice"],"Dewott":["Water",null],"Dewpider":["Water","Bug"],"Dhelmise":["Ghost","Grass"],"Dialga":["Steel","Dragon"],"Diancie":["Rock","Fairy"],"Diggersby":["Normal","Ground"],"Diglett":["Ground",null],"Dipplin":["Grass","Dragon"],"Ditto":["Normal",null],"Dodrio":["Normal","Flying"],"Doduo":["Normal","Flying"],"Dolliv":["Grass","Normal"],"Dondozo":["Water",null],"Donphan":["Ground",null],"Dottler":["Bug","Psychic"],"Doublade":["Steel","Ghost"],"Dracovish":["Water","Dragon"],"Dracozolt":["Electric","Dragon"],"Dragalge":["Poison","Dragon"],"Dragapult":["Dragon","Ghost"],"Dragonair":["Dragon",null],"Dragonite":["Dragon","Flying"],"Drakloak":["Dragon","Ghost"],"Drampa":["Normal","Dragon"],"Drapion":["Poison","Dark"],"Dratini":["Dragon",null],"Drednaw":["Water","Rock"],"Dreepy":["Dragon","Ghost"],"Drifblim":["Ghost","Flying"],"Drifloon":["Ghost","Flying"],"Drilbur":["Ground",null],"Drizzile":["Water",null],"Drowzee":["Psychic",null],"Druddigon":["Dragon",null],"Dubwool":["Normal",null],"Ducklett":["Water","Flying"],"Dudunsparce":["Normal",null],"Dugtrio":["Ground",null],"Dunsparce":["Normal",null],"Duosion":["Psychic",null],"Duraludon":["Steel","Dragon"],"Durant":["Bug","Steel"],"Dusclops":["Ghost",null],"Dusknoir":["Ghost",null],"Duskull":["Ghost",null],"Dustox":["Bug","Poison"],"Dwebble":["Bug","Rock"],"Eelektrik":["Electric",null],"Eelektross":["Electric",null],"Eevee":["Normal",null],"Eiscue":["Ice",null],"Ekans":["Poison",null],"Eldegoss":["Grass",null],"Electabuzz":["Electric",null],"Electivire":["Electric","Steel"],"Electrike":["Electric",null],"Electrode":["Electric",null],"Elekid":["Electric",null],"Elgyem":["Psychic",null],"Emboar":["Fire","Fighting"],"Emolga":["Electric","Flying"],"Empoleon":["Water","Steel"],"Enamorus":["Fairy","Flying"],"Entei":["Fire",null],"Escavalier":["Bug","Steel"],"Espathra":["Psychic",null],"Espeon":["Psychic",null],"Espurr":["Psychic",null],"Eternatus":["Poison","Dragon"],"Excadrill":["Ground","Steel"],"Exeggcute":["Grass","Psychic"],"Exeggutor":["Grass","Psychic"],"Exploud":["Normal",null],"Falinks":["Fighting",null],"Farfetchd":["Normal","Flying"],"Farigiraf":["Normal","Psychic"],"Fearow":["Normal","Flying"],"Feebas":["Water",null],"Fennekin":["Fire",null],"Feraligatr":["Water",null],"Ferroseed":["Grass","Steel"],"Ferrothorn":["Grass","Steel"],"Fezandipiti":["Poison","Fairy"],"Fidough":["Fairy",null],"Finizen":["Water",null],"Finneon":["Water",null],"Flaaffy":["Electric",null],"Flabebe":["Fairy",null],"Flamigo":["Flying","Fighting"],"Flapple":["Grass","Dragon"],"Flareon":["Fire",null],"Fletchinder":["Fire","Flying"],"Fletchling":["Normal","Flying"],"Flittle":["Psychic",null],"Floatzel":["Water",null],"Floette":["Fairy",null],"Floragato":["Grass",null],"Florges":["Fairy",null],"Flutter-Mane":["Ghost","Fairy"],"Flygon":["Ground","Dragon"],"Fomantis":["Grass",null],"Foongus":["Grass","Poison"],"Forretress":["Bug","Steel"],"Fraxure":["Dragon",null],"Frigibax":["Dragon","Ice"],"Frillish":["Water","Ghost"],"Froakie":["Water",null],"Frogadier":["Water",null],"Froslass":["Ice","Ghost"],"Frosmoth":["Ice","Bug"],"Fuecoco":["Fire",null],"Furfrou":["Normal",null],"Furret":["Normal",null],"Gabite":["Dragon","Ground"],"Gallade":["Psychic","Fighting"],"Galvantula":["Bug","Electric"],"Garbodor":["Poison",null],"Garchomp":["Dragon","Ground"],"Gardevoir":["Psychic","Fairy"],"Garganacl":["Rock",null],"Gastly":["Ghost","Poison"],"Gastrodon":["Water","Ground"],"Genesect":["Bug","Steel"],"Gengar":["Ghost","Poison"],"Geodude":["Rock","Ground"],"Gholdengo":["Steel","Ghost"],"Gible":["Dragon","Ground"],"Gigalith":["Rock",null],"Gimmighoul":["Ghost",null],"Girafarig":["Normal","Psychic"],"Giratina":["Ghost","Dragon"],"Glaceon":["Ice",null],"Glalie":["Ice",null],"Glameow":["Normal",null],"Glastrier":["Ice",null],"Gligar":["Ground","Flying"],"Glimmet":["Rock","Poison"],"Glimmora":["Rock","Poison"],"Gliscor":["Ground","Flying"],"Gloom":["Grass","Poison"],"Gogoat":["Grass",null],"Golbat":["Poison","Flying"],"Goldeen":["Water",null],"Golduck":["Water",null],"Golem":["Rock","Ground"],"Golett":["Ground","Ghost"],"Golisopod":["Bug","Water"],"Golurk":["Ground","Ghost"],"Goodra":["Dragon",null],"Goomy":["Dragon",null],"Gorebyss":["Water",null],"Gossifleur":["Grass",null],"Gothita":["Psychic",null],"Gothitelle":["Psychic",null],"Gothorita":["Psychic",null],"Gouging-Fire":["Fire","Dragon"],"Gourgeist":["Ghost","Grass"],"Grafaiai":["Poison","Normal"],"Granbull":["Fairy",null],"Grapploct":["Fighting",null],"Graveler":["Rock","Ground"],"Great-Tusk":["Ground","Fighting"],"Greavard":["Ghost",null],"Greedent":["Normal",null],"Greninja":["Water","Dark"],"Grimer":["Poison",null],"Grimmsnarl":["Dark","Fairy"],"Grookey":["Grass",null],"Grotle":["Grass",null],"Groudon":["Ground",null],"Grovyle":["Grass",null],"Growlithe":["Fire",null],"Grubbin":["Bug",null],"Grumpig":["Psychic",null],"Gulpin":["Poison",null],"Gumshoos":["Normal",null],"Gurdurr":["Fighting",null],"Guzzlord":["Dark","Dragon"],"Gyarados":["Water","Flying"],"Hakamo-O":["Dragon","Fighting"],"Happiny":["Normal",null],"Hariyama":["Fighting",null],"Hatenna":["Psychic",null],"Hatterene":["Psychic","Fairy"],"Hattrem":["Psychic",null],"Haunter":["Ghost","Poison"],"Hawlucha":["Fighting","Flying"],"Haxorus":["Dragon",null],"Heatmor":["Fire",null],"Heatran":["Fire","Steel"],"Heliolisk":["Electric","Normal"],"Helioptile":["Electric","Normal"],"Heracross":["Bug","Fighting"],"Herdier":["Normal",null],"Hippopotas":["Ground",null],"Hippowdon":["Ground",null],"Hitmonchan":["Fighting",null],"Hitmonlee":["Fighting",null],"Hitmontop":["Fighting",null],"Ho-Oh":["Fire","Flying"],"Honchkrow":["Dark","Flying"],"Honedge":["Steel","Ghost"],"Hoopa":["Psychic","Ghost"],"Hoothoot":["Normal","Flying"],"Hoppip":["Grass","Flying"],"Horsea":["Water",null],"Houndoom":["Dark","Fire"],"Houndour":["Dark","Fire"],"Houndstone":["Ghost",null],"Huntail":["Water",null],"Hydrapple":["Grass","Dragon"],"Hydreigon":["Dark","Dragon"],"Hypno":["Psychic",null],"Igglybuff":["Normal","Fairy"],"Illumise":["Bug",null],"Impidimp":["Dark","Fairy"],"Incineroar":["Fire","Dark"],"Indeedee":["Psychic","Normal"],"Infernape":["Fire","Fighting"],"Inkay":["Dark","Psychic"],"Inteleon":["Water",null],"Iron-Boulder":["Rock","Psychic"],"Iron-Bundle":["Ice","Water"],"Iron-Crown":["Steel","Psychic"],"Iron-Hands":["Fighting","Electric"],"Iron-Jugulis":["Dark","Flying"],"Iron-Leaves":["Grass","Psychic"],"Iron-Moth":["Fire","Poison"],"Iron-Thorns":["Rock","Electric"],"Iron-Treads":["Ground","Steel"],"Iron-Valiant":["Fairy","Fighting"],"Ivysaur":["Grass","Poison"],"Jangmo-O":["Dragon",null],"Jellicent":["Water","Ghost"],"Jigglypuff":["Normal","Fairy"],"Jirachi":["Steel","Psychic"],"Jolteon":["Electric",null],"Joltik":["Bug","Electric"],"Jumpluff":["Grass","Flying"],"Jynx":["Ice","Psychic"],"Kabuto":["Rock","Water"],"Kabutops":["Rock","Water"],"Kadabra":["Psychic",null],"Kakuna":["Bug","Poison"],"Kangaskhan":["Normal",null],"Karrablast":["Bug",null],"Kartana":["Grass","Steel"],"Kecleon":["Normal",null],"Keldeo":["Water","Fighting"],"Kilowattrel":["Electric","Flying"],"Kingambit":["Dark","Steel"],"Kingdra":["Water","Dragon"],"Kingler":["Water",null],"Kirlia":["Psychic","Fairy"],"Klang":["Steel",null],"Klawf":["Rock",null],"Kleavor":["Bug","Rock"],"Klefki":["Steel","Fairy"],"Klink":["Steel",null],"Klinklang":["Steel",null],"Koffing":["Poison",null],"Komala":["Normal",null],"Kommo-O":["Dragon","Fighting"],"Koraidon":["Fighting","Dragon"],"Krabby":["Water",null],"Kricketot":["Bug",null],"Kricketune":["Bug",null],"Krokorok":["Ground","Dark"],"Krookodile":["Ground","Dark"],"Kubfu":["Fighting",null],"Kyogre":["Water",null],"Kyurem":["Dragon","Ice"],"Lairon":["Steel","Rock"],"Lampent":["Ghost","Fire"],"Landorus":["Ground","Flying"],"Lanturn":["Water","Electric"],"Lapras":["Water","Ice"],"Larvesta":["Bug","Fire"],"Larvitar":["Rock","Ground"],"Latias":["Dragon","Psychic"],"Latios":["Dragon","Psychic"],"Leafeon":["Grass",null],"Leavanny":["Bug","Grass"],"Lechonk":["Normal",null],"Ledian":["Bug","Flying"],"Ledyba":["Bug","Flying"],"Lickilicky":["Normal",null],"Lickitung":["Normal",null],"Liepard":["Dark",null],"Lileep":["Rock","Grass"],"Lilligant":["Grass",null],"Lillipup":["Normal",null],"Linoone":["Normal",null],"Litleo":["Fire","Normal"],"Litten":["Fire",null],"Litwick":["Ghost","Fire"],"Lokix":["Bug","Dark"],"Lombre":["Water","Grass"],"Lopunny":["Normal",null],"Lotad":["Water","Grass"],"Loudred":["Normal",null],"Lucario":["Fighting","Steel"],"Ludicolo":["Water","Grass"],"Lugia":["Psychic","Flying"],"Lumineon":["Water",null],"Lunala":["Psychic","Ghost"],"Lunatone":["Rock","Psychic"],"Lurantis":["Grass",null],"Luvdisc":["Water",null],"Luxio":["Electric",null],"Luxray":["Electric",null],"Lycanroc":["Rock",null],"Mabosstiff":["Dark",null],"Machamp":["Fighting",null],"Machoke":["Fighting",null],"Machop":["Fighting",null],"Magby":["Fire",null],"Magcargo":["Fire","Rock"],"Magearna":["Steel","Fairy"],"Magikarp":["Water",null],"Magmar":["Fire",null],"Magmortar":["Fire",null],"Magnemite":["Electric","Steel"],"Magneton":["Electric","Steel"],"Magnezone":["Electric","Steel"],"Makuhita":["Fighting",null],"Malamar":["Dark","Psychic"],"Mamoswine":["Ice","Ground"],"Manaphy":["Water",null],"Mandibuzz":["Dark","Flying"],"Manectric":["Electric",null],"Mankey":["Fighting",null],"Mantine":["Water","Flying"],"Mantyke":["Water","Flying"],"Maractus":["Grass",null],"Mareanie":["Poison","Water"],"Mareep":["Electric",null],"Marill":["Water","Fairy"],"Marowak":["Ground",null],"Marshadow":["Fighting","Ghost"],"Marshtomp":["Water","Ground"],"Maschiff":["Dark",null],"Masquerain":["Bug","Flying"],"Maushold":["Normal",null],"Mawile":["Steel","Fairy"],"Medicham":["Fighting","Psychic"],"Meditite":["Fighting","Psychic"],"Meganium":["Grass",null],"Melmetal":["Steel",null],"Meloetta":["Normal","Psychic"],"Meltan":["Steel",null],"Meowscarada":["Grass","Dark"],"Meowstic-Female":["Psychic",null],"Meowstic":["Psychic",null],"Meowth":["Normal",null],"Mesprit":["Psychic",null],"Metagross":["Steel","Psychic"],"Metang":["Steel","Psychic"],"Metapod":["Bug",null],"Mew":["Psychic",null],"Mewtwo":["Psychic",null],"Mienfoo":["Fighting",null],"Mienshao":["Fighting",null],"Mightyena":["Dark",null],"Milcery":["Fairy",null],"Milotic":["Water",null],"Miltank":["Normal",null],"Mime-Jr":["Psychic","Fairy"],"Mimikyu":["Ghost","Fairy"],"Minccino":["Normal",null],"Minior":["Rock","Flying"],"Minun":["Electric",null],"Miraidon":["Electric","Dragon"],"Misdreavus":["Ghost",null],"Mismagius":["Ghost",null],"Moltres":["Fire","Flying"],"Monferno":["Fire","Fighting"],"Morelull":["Grass","Fairy"],"Morgrem":["Dark","Fairy"],"Morpeko":["Electric","Dark"],"Mothim":["Bug","Flying"],"Mr-Mime":["Psychic","Fairy"],"Mr-Rime":["Ice","Psychic"],"Mudbray":["Ground",null],"Mudkip":["Water",null],"Mudsdale":["Ground",null],"Muk":["Poison",null],"Munchlax":["Normal",null],"Munkidori":["Poison","Psychic"],"Munna":["Psychic",null],"Murkrow":["Dark","Flying"],"Musharna":["Psychic",null],"Nacli":["Rock",null],"Naclstack":["Rock",null],"Naganadel":["Poison","Dragon"],"Natu":["Psychic","Flying"],"Necrozma":["Psychic",null],"Nickit":["Dark",null],"Nidoking":["Poison","Ground"],"Nidoqueen":["Poison","Ground"],"Nidoran-F":["Poison",null],"Nidoran-M":["Poison",null],"Nidorina":["Poison",null],"Nidorino":["Poison",null],"Nihilego":["Rock","Poison"],"Nincada":["Bug","Ground"],"Ninetales":["Fire",null],"Ninjask":["Bug","Flying"],"Noctowl":["Normal","Flying"],"Noibat":["Flying","Dragon"],"Noivern":["Flying","Dragon"],"Nosepass":["Rock",null],"Numel":["Fire","Ground"],"Nuzleaf":["Grass","Dark"],"Nymble":["Bug",null],"Obstagoon":["Dark","Normal"],"Octillery":["Water",null],"Oddish":["Grass","Poison"],"Ogerpon":["Grass",null],"Oinkologne":["Normal",null],"Okidogi":["Poison","Fighting"],"Omanyte":["Rock","Water"],"Omastar":["Rock","Water"],"Onix":["Rock","Ground"],"Oranguru":["Normal","Psychic"],"Orbeetle":["Bug","Psychic"],"Oricorio":["Fire","Flying"],"Orthworm":["Steel",null],"Oshawott":["Water",null],"Overqwil":["Dark","Poison"],"Pachirisu":["Electric",null],"Palafin":["Water",null],"Palkia":["Water","Dragon"],"Palossand":["Ghost","Ground"],"Palpitoad":["Water","Ground"],"Pancham":["Fighting",null],"Pangoro":["Fighting","Dark"],"Panpour":["Water",null],"Pansage":["Grass",null],"Pansear":["Fire",null],"Paras":["Bug","Grass"],"Parasect":["Bug","Grass"],"Passimian":["Fighting",null],"Patrat":["Normal",null],"Pawmi":["Electric",null],"Pawmo":["Electric","Fighting"],"Pawmot":["Electric","Fighting"],"Pawniard":["Dark","Steel"],"Pecharunt":["Poison","Ghost"],"Pelipper":["Water","Flying"],"Perrserker":["Steel",null],"Persian":["Normal",null],"Petilil":["Grass",null],"Phanpy":["Ground",null],"Phantump":["Ghost","Grass"],"Pheromosa":["Bug","Fighting"],"Phione":["Water",null],"Pichu":["Electric",null],"Pidgeot":["Normal","Flying"],"Pidgeotto":["Normal","Flying"],"Pidgey":["Normal","Flying"],"Pidove":["Normal","Flying"],"Pignite":["Fire","Fighting"],"Pikachu":["Electric",null],"Pikipek":["Normal","Flying"],"Piloswine":["Ice","Ground"],"Pincurchin":["Electric",null],"Pineco":["Bug",null],"Pinsir":["Bug",null],"Piplup":["Water",null],"Plusle":["Electric",null],"Poipole":["Poison",null],"Politoed":["Water",null],"Poliwag":["Water",null],"Poliwhirl":["Water",null],"Poliwrath":["Water","Fighting"],"Poltchageist":["Grass","Ghost"],"Polteageist":["Ghost",null],"Ponyta":["Fire",null],"Poochyena":["Dark",null],"Popplio":["Water",null],"Porygon":["Normal",null],"Porygon-Z":["Normal",null],"Porygon2":["Normal",null],"Primarina":["Water","Fairy"],"Primeape":["Fighting",null],"Prinplup":["Water",null],"Probopass":["Rock","Steel"],"Psyduck":["Water",null],"Pumpkaboo":["Ghost","Grass"],"Pupitar":["Rock","Ground"],"Purrloin":["Dark",null],"Purugly":["Normal",null],"Pyroar":["Fire","Normal"],"Pyukumuku":["Water",null],"Quagsire":["Water","Ground"],"Quaquaval":["Water","Fighting"],"Quaxly":["Water",null],"Quaxwell":["Water",null],"Quilava":["Fire",null],"Quilladin":["Grass",null],"Qwilfish":["Water","Poison"],"Raboot":["Fire",null],"Rabsca":["Bug","Psychic"],"Raging-Bolt":["Electric","Dragon"],"Raichu":["Electric",null],"Raikou":["Electric",null],"Ralts":["Psychic","Fairy"],"Rampardos":["Rock",null],"Rapidash":["Fire",null],"Raticate":["Normal",null],"Rattata":["Normal",null],"Rayquaza":["Dragon","Flying"],"Regice":["Ice",null],"Regidrago":["Dragon",null],"Regieleki":["Electric",null],"Regigigas":["Normal",null],"Regirock":["Rock",null],"Registeel":["Steel",null],"Relicanth":["Water","Rock"],"Rellor":["Bug",null],"Remoraid":["Water",null],"Reshiram":["Dragon","Fire"],"Reuniclus":["Psychic",null],"Revavroom":["Steel","Poison"],"Rhydon":["Ground","Rock"],"Rhyhorn":["Ground","Rock"],"Rhyperior":["Ground","Rock"],"Ribombee":["Bug","Fairy"],"Rillaboom":["Grass",null],"Riolu":["Fighting",null],"Roaring-Moon":["Dragon","Dark"],"Rockruff":["Rock",null],"Roggenrola":["Rock",null],"Rolycoly":["Rock",null],"Rookidee":["Flying",null],"Roselia":["Grass","Poison"],"Roserade":["Grass","Poison"],"Rotom":["Electric","Ghost"],"Rowlet":["Grass","Flying"],"Rufflet":["Normal","Flying"],"Runerigus":["Ground","Ghost"],"Sableye":["Dark","Ghost"],"Salamence":["Dragon","Flying"],"Salandit":["Poison","Fire"],"Salazzle":["Poison","Fire"],"Samurott":["Water",null],"Sandaconda":["Ground",null],"Sandile":["Ground","Dark"],"Sandshrew":["Ground",null],"Sandslash":["Ground",null],"Sandy-Shocks":["Electric","Ground"],"Sandygast":["Ghost","Ground"],"Sawk":["Fighting",null],"Sawsbuck":["Normal","Grass"],"Scatterbug":["Bug",null],"Sceptile":["Grass",null],"Scizor":["Bug","Steel"],"Scolipede":["Bug","Poison"],"Scorbunny":["Fire",null],"Scovillain":["Grass","Fire"],"Scrafty":["Dark","Fighting"],"Scraggy":["Dark","Fighting"],"Scream-Tail":["Fairy","Psychic"],"Scyther":["Bug","Flying"],"Seadra":["Water",null],"Seaking":["Water",null],"Sealeo":["Ice","Water"],"Seedot":["Grass",null],"Seel":["Water",null],"Seismitoad":["Water","Ground"],"Sentret":["Normal",null],"Serperior":["Grass",null],"Servine":["Grass",null],"Seviper":["Poison",null],"Sewaddle":["Bug","Grass"],"Sharpedo":["Water","Dark"],"Shaymin":["Grass",null],"Shedinja":["Bug","Ghost"],"Shelgon":["Dragon",null],"Shellder":["Water",null],"Shellos":["Water",null],"Shelmet":["Bug",null],"Shieldon":["Rock","Steel"],"Shiftry":["Grass","Dark"],"Shiinotic":["Grass","Fairy"],"Shinx":["Electric",null],"Shroodle":["Poison","Normal"],"Shroomish":["Grass",null],"Shuckle":["Bug","Rock"],"Shuppet":["Ghost",null],"Sigilyph":["Psychic","Flying"],"Silcoon":["Bug",null],"Silicobra":["Ground",null],"Silvally":["Normal",null],"Simipour":["Water",null],"Simisage":["Grass",null],"Simisear":["Fire",null],"Sinistcha":["Grass","Ghost"],"Sinistea":["Ghost",null],"Sirfetchd":["Fighting",null],"Sizzlipede":["Fire","Bug"],"Skarmory":["Steel","Flying"],"Skeledirge":["Fire","Ghost"],"Skiddo":["Grass",null],"Skiploom":["Grass","Flying"],"Skitty":["Normal",null],"Skorupi":["Poison","Bug"],"Skrelp":["Poison","Water"],"Skuntank":["Dark","Poison"],"Skwovet":["Normal",null],"Slaking":["Normal",null],"Slakoth":["Normal",null],"Sliggoo":["Dragon",null],"Slither-Wing":["Bug","Fighting"],"Slowbro":["Water","Psychic"],"Slowking":["Water","Psychic"],"Slowpoke":["Water","Psychic"],"Slugma":["Fire",null],"Slurpuff":["Fairy",null],"Smeargle":["Normal",null],"Smoliv":["Grass","Normal"],"Smoochum":["Ice","Psychic"],"Sneasel":["Dark","Ice"],"Sneasler":["Fighting","Poison"],"Snivy":["Grass",null],"Snom":["Ice","Bug"],"Snorlax":["Normal",null],"Snorunt":["Ice",null],"Snover":["Grass","Ice"],"Snubbull":["Fairy",null],"Sobble":["Water",null],"Solgaleo":["Psychic","Steel"],"Solosis":["Psychic",null],"Solrock":["Rock","Psychic"],"Spearow":["Normal","Flying"],"Spectrier":["Ghost",null],"Spewpa":["Bug",null],"Spheal":["Ice","Water"],"Spidops":["Bug",null],"Spinarak":["Bug","Poison"],"Spinda":["Normal",null],"Spiritomb":["Ghost","Dark"],"Spoink":["Psychic",null],"Sprigatito":["Grass",null],"Spritzee":["Fairy",null],"Squawkabilly":["Normal","Flying"],"Squirtle":["Water",null],"Stakataka":["Rock","Steel"],"Stantler":["Normal",null],"Staraptor":["Normal","Flying"],"Staravia":["Normal","Flying"],"Starly":["Normal","Flying"],"Starmie":["Water","Psychic"],"Staryu":["Water",null],"Steelix":["Steel","Ground"],"Steenee":["Grass",null],"Stonjourner":["Rock",null],"Stoutland":["Normal",null],"Stufful":["Normal","Fighting"],"Stunfisk":["Ground","Electric"],"Stunky":["Dark","Poison"],"Sudowoodo":["Rock",null],"Suicune":["Water",null],"Sunflora":["Grass",null],"Sunkern":["Grass",null],"Surskit":["Bug","Water"],"Swablu":["Normal","Flying"],"Swadloon":["Bug","Grass"],"Swalot":["Poison",null],"Swampert":["Water","Ground"],"Swanna":["Water","Flying"],"Swellow":["Normal","Flying"],"Swinub":["Ice","Ground"],"Swirlix":["Fairy",null],"Swoobat":["Psychic","Flying"],"Sylveon":["Fairy",null],"Tadbulb":["Electric",null],"Taillow":["Normal","Flying"],"Talonflame":["Fire","Flying"],"Tandemaus":["Normal",null],"Tangela":["Grass",null],"Tangrowth":["Grass",null],"Tapu-Bulu":["Grass","Fairy"],"Tapu-Fini":["Water","Fairy"],"Tapu-Koko":["Electric","Fairy"],"Tapu-Lele":["Psychic","Fairy"],"Tarountula":["Bug",null],"Tatsugiri":["Dragon","Water"],"Tauros":["Normal",null],"Teddiursa":["Normal",null],"Tentacool":["Water","Poison"],"Tentacruel":["Water","Poison"],"Tepig":["Fire",null],"Terapagos":["Normal",null],"Terrakion":["Rock","Fighting"],"Thievul":["Dark",null],"Throh":["Fighting",null],"Thundurus":["Electric","Flying"],"Thwackey":["Grass",null],"Timburr":["Fighting",null],"Ting-Lu":["Dark","Ground"],"Tinkatink":["Fairy","Steel"],"Tinkaton":["Fairy","Steel"],"Tinkatuff":["Fairy","Steel"],"Tirtouga":["Water","Rock"],"Toedscool":["Ground","Grass"],"Toedscruel":["Ground","Grass"],"Togedemaru":["Electric","Steel"],"Togekiss":["Fairy","Flying"],"Togepi":["Fairy",null],"Togetic":["Fairy","Flying"],"Torchic":["Fire",null],"Torkoal":["Fire",null],"Tornadus":["Flying",null],"Torracat":["Fire",null],"Torterra":["Grass","Ground"],"Totodile":["Water",null],"Toucannon":["Normal","Flying"],"Toxapex":["Poison","Water"],"Toxel":["Electric","Poison"],"Toxicroak":["Poison","Fighting"],"Toxtricity":["Electric","Poison"],"Tranquill":["Normal","Flying"],"Trapinch":["Ground",null],"Treecko":["Grass",null],"Trevenant":["Ghost","Grass"],"Tropius":["Grass","Flying"],"Trubbish":["Poison",null],"Trumbeak":["Normal","Flying"],"Tsareena":["Grass",null],"Turtonator":["Fire","Dragon"],"Turtwig":["Grass",null],"Tympole":["Water",null],"Tynamo":["Electric",null],"Type-Null":["Normal",null],"Typhlosion":["Fire",null],"Tyranitar":["Rock","Dark"],"Tyrantrum":["Rock","Dragon"],"Tyrogue":["Fighting",null],"Tyrunt":["Rock","Dragon"],"Umbreon":["Dark",null],"Unfezant":["Normal","Flying"],"Unown":["Psychic",null],"Ursaluna":["Ground","Normal"],"Ursaring":["Normal",null],"Urshifu":["Fighting","Dark"],"Uxie":["Psychic",null],"Vanillish":["Ice",null],"Vanillite":["Ice",null],"Vanilluxe":["Ice",null],"Vaporeon":["Water",null],"Varoom":["Steel","Poison"],"Veluza":["Water","Psychic"],"Venipede":["Bug","Poison"],"Venomoth":["Bug","Poison"],"Venonat":["Bug","Poison"],"Venusaur":["Grass","Poison"],"Vespiquen":["Bug","Flying"],"Vibrava":["Ground","Dragon"],"Victini":["Psychic","Fire"],"Victreebel":["Grass","Poison"],"Vigoroth":["Normal",null],"Vikavolt":["Bug","Electric"],"Vileplume":["Grass","Poison"],"Virizion":["Grass","Fighting"],"Vivillon":["Bug","Flying"],"Volbeat":["Bug",null],"Volcanion":["Fire","Water"],"Volcarona":["Bug","Fire"],"Voltorb":["Electric",null],"Vullaby":["Dark","Flying"],"Vulpix":["Fire",null],"Wailmer":["Water",null],"Wailord":["Water",null],"Walking-Wake":["Water","Dragon"],"Walrein":["Ice","Water"],"Wartortle":["Water",null],"Watchog":["Normal",null],"Wattrel":["Electric","Flying"],"Weavile":["Dark","Ice"],"Weedle":["Bug","Poison"],"Weepinbell":["Grass","Poison"],"Weezing":["Poison",null],"Whimsicott":["Grass","Fairy"],"Whirlipede":["Bug","Poison"],"Whiscash":["Water","Ground"],"Whismur":["Normal",null],"Wigglytuff":["Normal","Fairy"],"Wiglett":["Water",null],"Wimpod":["Bug","Water"],"Wingull":["Water","Flying"],"Wishiwashi":["Water",null],"Wo-Chien":["Dark","Grass"],"Wobbuffet":["Psychic",null],"Woobat":["Psychic","Flying"],"Wooloo":["Normal",null],"Wooper":["Water","Ground"],"Wormadam":["Bug","Grass"],"Wugtrio":["Water",null],"Wurmple":["Bug",null],"Wynaut":["Psychic",null],"Wyrdeer":["Normal","Psychic"],"Xatu":["Psychic","Flying"],"Xerneas":["Fairy",null],"Xurkitree":["Electric",null],"Yamask":["Ghost",null],"Yamper":["Electric",null],"Yanma":["Bug","Flying"],"Yanmega":["Bug","Flying"],"Yungoos":["Normal",null],"Yveltal":["Dark","Flying"],"Zacian":["Fairy",null],"Zamazenta":["Fighting",null],"Zangoose":["Normal",null],"Zapdos":["Electric","Flying"],"Zarude":["Dark","Grass"],"Zebstrika":["Electric",null],"Zekrom":["Dragon","Electric"],"Zeraora":["Electric",null],"Zigzagoon":["Normal",null],"Zoroark":["Dark",null],"Zorua":["Dark",null],"Zubat":["Poison","Flying"],"Zweilous":["Dark","Dragon"],"Zygarde-50":["Dragon","Ground"],"Aegislash-Blade":["Steel","Ghost"],"Arcanine-Hisui":["Fire","Rock"],"Articuno-Galar":["Psychic","Flying"],"Avalugg-Hisui":["Ice","Rock"],"Basculegion-Female":["Water","Ghost"],"Basculin-Blue-Striped":["Water",null],"Braviary-Hisui":["Psychic","Flying"],"Calyrex-Ice-Rider":["Psychic","Ice"],"Calyrex-Shadow-Rider":["Psychic","Ghost"],"Castform-Rainy":["Water",null],"Castform-Snowy":["Ice",null],"Castform-Sunny":["Fire",null],"Corsola-Galar":["Ghost",null],"Darmanitan-Galar":["Ice",null],"Darmanitan-Galar-Zen":["Ice","Fire"],"Darmanitan-Zen":["Fire","Psychic"],"Darumaka-Galar":["Ice",null],"Decidueye-Hisui":["Grass","Fighting"],"Deoxys-Attack":["Psychic",null],"Deoxys-Defense":["Psychic",null],"Deoxys-Speed":["Psychic",null],"Dialga-Origin":["Steel","Dragon"],"Diglett-Alola":["Ground","Steel"],"Dudunsparce-Three-Segment":["Normal",null],"Dugtrio-Alola":["Ground","Steel"],"Eiscue-Noice":["Ice",null],"Electrode-Hisui":["Electric","Grass"],"Enamorus-Therian":["Fairy","Flying"],"Eternatus-Eternamax":["Poison","Dragon"],"Exeggutor-Alola":["Grass","Dragon"],"Farfetchd-Galar":["Fighting",null],"Frillish-Female":["Water","Ghost"],"Geodude-Alola":["Rock","Electric"],"Gimmighoul-Roaming":["Ghost",null],"Giratina-Origin":["Ghost","Dragon"],"Golem-Alola":["Rock","Electric"],"Goodra-Hisui":["Steel","Dragon"],"Gourgeist-Large":["Ghost","Grass"],"Gourgeist-Small":["Ghost","Grass"],"Gourgeist-Super":["Ghost","Grass"],"Graveler-Alola":["Rock","Electric"],"Grimer-Alola":["Poison","Dark"],"Growlithe-Hisui":["Fire","Rock"],"Hoopa-Unbound":["Psychic","Dark"],"Indeedee-Female":["Psychic","Normal"],"Jellicent-Female":["Water","Ghost"],"Keldeo-Resolute":["Water","Fighting"],"Kyurem-Black":["Dragon","Ice"],"Kyurem-White":["Dragon","Ice"],"Landorus-Therian":["Ground","Flying"],"Lilligant-Hisui":["Grass","Fighting"],"Linoone-Galar":["Dark","Normal"],"Lycanroc-Dusk":["Rock",null],"Lycanroc-Midnight":["Rock",null],"Marowak-Alola":["Fire","Ghost"],"Maushold-Family-Of-Three":["Normal",null],"Meloetta-Pirouette":["Normal","Fighting"],"Meowth-Alola":["Dark",null],"Meowth-Galar":["Steel",null],"Mimikyu-Busted":["Ghost","Fairy"],"Minior-Red-Core":["Rock","Flying"],"Moltres-Galar":["Dark","Flying"],"Morpeko-Hangry":["Electric","Dark"],"Mr-Mime-Galar":["Ice","Psychic"],"Muk-Alola":["Poison","Dark"],"Necrozma-Dawn-Wings":["Psychic","Ghost"],"Necrozma-Dusk-Mane":["Psychic","Steel"],"Necrozma-Ultra":["Psychic","Dragon"],"Ninetales-Alola":["Ice","Fairy"],"Ogerpon-Cornerstone-Mask":["Grass",null],"Ogerpon-Hearthflame-Mask":["Grass",null],"Ogerpon-Wellspring-Mask":["Grass",null],"Oinkologne-Female":["Normal",null],"Oricorio-Pa-U":["Psychic","Flying"],"Oricorio-Pom-Pom":["Electric","Flying"],"Oricorio-Sensu":["Ghost","Flying"],"Palafin-Hero":["Water","Fighting"],"Palkia-Origin":["Water","Dragon"],"Persian-Alola":["Dark",null],"Ponyta-Galar":["Psychic",null],"Pumpkaboo-Large":["Ghost","Grass"],"Pumpkaboo-Small":["Ghost","Grass"],"Pumpkaboo-Super":["Ghost","Grass"],"Pyroar-Female":["Fire","Normal"],"Qwilfish-Hisui":["Dark","Poison"],"Raichu-Alola":["Electric","Psychic"],"Rapidash-Galar":["Psychic","Fairy"],"Raticate-Alola":["Dark","Normal"],"Rattata-Alola":["Dark","Normal"],"Rotom-Fan":["Electric","Flying"],"Rotom-Frost":["Electric","Ice"],"Rotom-Heat":["Electric","Fire"],"Rotom-Mow":["Electric","Grass"],"Rotom-Wash":["Electric","Water"],"Samurott-Hisui":["Water","Dark"],"Sandshrew-Alola":["Ice","Steel"],"Sandslash-Alola":["Ice","Steel"],"Shaymin-Sky":["Grass","Flying"],"Sliggoo-Hisui":["Steel","Dragon"],"Slowbro-Galar":["Poison","Psychic"],"Slowking-Galar":["Poison","Psychic"],"Slowpoke-Galar":["Psychic",null],"Sneasel-Hisui":["Fighting","Poison"],"Squawkabilly-Blue-Plumage":["Normal","Flying"],"Squawkabilly-White-Plumage":["Normal","Flying"],"Squawkabilly-Yellow-Plumage":["Normal","Flying"],"Stunfisk-Galar":["Ground","Steel"],"Tatsugiri-Droopy":["Dragon","Water"],"Tatsugiri-Stretchy":["Dragon","Water"],"Tauros-Paldea-Aqua":["Fighting","Water"],"Tauros-Paldea-Blaze":["Fighting","Fire"],"Tauros-Paldea-Combat":["Fighting",null],"Thundurus-Therian":["Electric","Flying"],"Tornadus-Therian":["Flying",null],"Toxtricity-Low-Key":["Electric","Poison"],"Typhlosion-Hisui":["Fire","Ghost"],"Ursaluna-Bloodmoon":["Ground","Normal"],"Urshifu-Rapid-Strike":["Fighting","Water"],"Voltorb-Hisui":["Electric","Grass"],"Vulpix-Alola":["Ice",null],"Weezing-Galar":["Poison","Fairy"],"Wishiwashi-School":["Water",null],"Wormadam-Sandy":["Bug","Ground"],"Wormadam-Trash":["Bug","Steel"],"Yamask-Galar":["Ground","Ghost"],"Zacian-Crowned":["Fairy","Steel"],"Zamazenta-Crowned":["Fighting","Steel"],"Zapdos-Galar":["Fighting","Flying"],"Zigzagoon-Galar":["Dark","Normal"],"Zoroark-Hisui":["Normal","Ghost"],"Zorua-Hisui":["Normal","Ghost"],"Zygarde-10":["Dragon","Ground"],"Zygarde-Complete":["Dragon","Ground"],
"Venusaur-Mega":["Grass","Poison"],"Charizard-Mega-X":["Fire","Dragon"],"Charizard-Mega-Y":["Fire","Flying"],
"Blastoise-Mega":["Water",null],"Beedrill-Mega":["Bug","Poison"],"Pidgeot-Mega":["Normal","Flying"],
"Alakazam-Mega":["Psychic",null],"Slowbro-Mega":["Water","Psychic"],"Gengar-Mega":["Ghost","Poison"],
"Kangaskhan-Mega":["Normal",null],"Pinsir-Mega":["Bug","Flying"],"Gyarados-Mega":["Water","Dark"],
"Aerodactyl-Mega":["Rock","Flying"],"Mewtwo-Mega-X":["Psychic","Fighting"],"Mewtwo-Mega-Y":["Psychic",null],
"Ampharos-Mega":["Electric","Dragon"],"Steelix-Mega":["Steel","Ground"],"Scizor-Mega":["Bug","Steel"],
"Heracross-Mega":["Bug","Fighting"],"Houndoom-Mega":["Dark","Fire"],"Tyranitar-Mega":["Rock","Dark"],
"Sceptile-Mega":["Grass","Dragon"],"Blaziken-Mega":["Fire","Fighting"],"Swampert-Mega":["Water","Ground"],
"Gardevoir-Mega":["Psychic","Fairy"],"Sableye-Mega":["Dark","Ghost"],"Mawile-Mega":["Steel","Fairy"],
"Aggron-Mega":["Steel",null],"Medicham-Mega":["Fighting","Psychic"],"Manectric-Mega":["Electric",null],
"Sharpedo-Mega":["Water","Dark"],"Camerupt-Mega":["Fire","Ground"],"Altaria-Mega":["Dragon","Fairy"],
"Banette-Mega":["Ghost",null],"Absol-Mega":["Dark",null],"Glalie-Mega":["Ice",null],
"Salamence-Mega":["Dragon","Flying"],"Metagross-Mega":["Steel","Psychic"],
"Latias-Mega":["Dragon","Psychic"],"Latios-Mega":["Dragon","Psychic"],"Rayquaza-Mega":["Dragon","Flying"],
"Lucario-Mega":["Fighting","Steel"],"Garchomp-Mega":["Dragon","Ground"],"Lopunny-Mega":["Normal","Fighting"],
"Abomasnow-Mega":["Grass","Ice"],"Gallade-Mega":["Psychic","Fighting"],
"Audino-Mega":["Normal","Fairy"],"Diancie-Mega":["Rock","Fairy"],
"Venusaur-Gmax":["Grass","Poison"],"Charizard-Gmax":["Fire","Flying"],"Blastoise-Gmax":["Water",null],
"Butterfree-Gmax":["Bug","Flying"],"Pikachu-Gmax":["Electric",null],"Meowth-Gmax":["Normal",null],
"Machamp-Gmax":["Fighting",null],"Gengar-Gmax":["Ghost","Poison"],"Kingler-Gmax":["Water",null],
"Lapras-Gmax":["Water","Ice"],"Eevee-Gmax":["Normal",null],"Snorlax-Gmax":["Normal",null],
"Garbodor-Gmax":["Poison",null],"Melmetal-Gmax":["Steel",null],
"Rillaboom-Gmax":["Grass",null],"Cinderace-Gmax":["Fire",null],"Inteleon-Gmax":["Water",null],
"Corviknight-Gmax":["Flying","Steel"],"Orbeetle-Gmax":["Bug","Psychic"],"Drednaw-Gmax":["Water","Rock"],
"Coalossal-Gmax":["Rock","Fire"],"Flapple-Gmax":["Grass","Dragon"],"Appletun-Gmax":["Grass","Dragon"],
"Sandaconda-Gmax":["Ground",null],"Toxtricity-Gmax":["Electric","Poison"],"Centiskorch-Gmax":["Fire","Bug"],
"Hatterene-Gmax":["Psychic","Fairy"],"Grimmsnarl-Gmax":["Dark","Fairy"],"Alcremie-Gmax":["Fairy",null],
"Copperajah-Gmax":["Steel",null],"Duraludon-Gmax":["Steel","Dragon"],
"Urshifu-Gmax":["Fighting","Dark"],"Urshifu-Rapid-Strike-Gmax":["Fighting","Water"]};

// ── Formas alternativas ───────────────────────────────────────────────────────
// Agrupa base → [formas]. A chave é o nome base (existe em POKEMON_DB).
// Usado para: filtrar autocomplete (mostrar só a base) e renderizar form switcher.

const POKEMON_FORMS = {
  // Funcionais (tipo/stats mudam)
  'Castform':    ['Castform','Castform-Sunny','Castform-Rainy','Castform-Snowy'],
  'Deoxys':      ['Deoxys','Deoxys-Attack','Deoxys-Defense','Deoxys-Speed'],
  'Wormadam':    ['Wormadam','Wormadam-Sandy','Wormadam-Trash'],
  'Rotom':       ['Rotom','Rotom-Heat','Rotom-Wash','Rotom-Frost','Rotom-Fan','Rotom-Mow'],
  'Giratina':    ['Giratina','Giratina-Origin'],
  'Shaymin':     ['Shaymin','Shaymin-Sky'],
  'Darmanitan':  ['Darmanitan','Darmanitan-Zen','Darmanitan-Galar','Darmanitan-Galar-Zen'],
  'Tornadus':    ['Tornadus','Tornadus-Therian'],
  'Thundurus':   ['Thundurus','Thundurus-Therian'],
  'Landorus':    ['Landorus','Landorus-Therian'],
  'Kyurem':      ['Kyurem','Kyurem-Black','Kyurem-White'],
  'Keldeo':      ['Keldeo','Keldeo-Resolute'],
  'Meloetta':    ['Meloetta','Meloetta-Pirouette'],
  'Aegislash':   ['Aegislash','Aegislash-Blade'],
  'Pumpkaboo':   ['Pumpkaboo','Pumpkaboo-Small','Pumpkaboo-Large','Pumpkaboo-Super'],
  'Gourgeist':   ['Gourgeist','Gourgeist-Small','Gourgeist-Large','Gourgeist-Super'],
  'Hoopa':       ['Hoopa','Hoopa-Unbound'],
  'Wishiwashi':  ['Wishiwashi','Wishiwashi-School'],
  'Lycanroc':    ['Lycanroc','Lycanroc-Midnight','Lycanroc-Dusk'],
  'Oricorio':    ['Oricorio','Oricorio-Pa-U','Oricorio-Pom-Pom','Oricorio-Sensu'],
  'Necrozma':    ['Necrozma','Necrozma-Dusk-Mane','Necrozma-Dawn-Wings','Necrozma-Ultra'],
  'Zygarde':     ['Zygarde','Zygarde-10','Zygarde-Complete'],
  'Toxtricity':  ['Toxtricity','Toxtricity-Gmax','Toxtricity-Low-Key'],
  'Morpeko':     ['Morpeko','Morpeko-Hangry'],
  'Eiscue':      ['Eiscue','Eiscue-Noice'],
  'Dialga':      ['Dialga','Dialga-Origin'],
  'Palkia':      ['Palkia','Palkia-Origin'],
  'Zacian':      ['Zacian','Zacian-Crowned'],
  'Zamazenta':   ['Zamazenta','Zamazenta-Crowned'],
  'Urshifu':     ['Urshifu','Urshifu-Gmax','Urshifu-Rapid-Strike','Urshifu-Rapid-Strike-Gmax'],
  'Calyrex':     ['Calyrex','Calyrex-Ice-Rider','Calyrex-Shadow-Rider'],
  'Enamorus':    ['Enamorus','Enamorus-Therian'],
  'Palafin':     ['Palafin','Palafin-Hero'],
  'Ogerpon':     ['Ogerpon','Ogerpon-Hearthflame-Mask','Ogerpon-Wellspring-Mask','Ogerpon-Cornerstone-Mask'],
  'Tatsugiri':   ['Tatsugiri','Tatsugiri-Droopy','Tatsugiri-Stretchy'],
  'Squawkabilly':['Squawkabilly','Squawkabilly-Yellow-Plumage','Squawkabilly-Blue-Plumage','Squawkabilly-White-Plumage'],
  'Dudunsparce': ['Dudunsparce','Dudunsparce-Three-Segment'],
  'Maushold':    ['Maushold','Maushold-Family-Of-Three'],
  'Minior':      ['Minior','Minior-Red-Core'],
  'Gimmighoul':  ['Gimmighoul','Gimmighoul-Roaming'],
  'Eternatus':   ['Eternatus','Eternatus-Eternamax'],
  // Regionais
  'Rattata':     ['Rattata','Rattata-Alola'],
  'Raticate':    ['Raticate','Raticate-Alola'],
  'Raichu':      ['Raichu','Raichu-Alola'],
  'Sandshrew':   ['Sandshrew','Sandshrew-Alola'],
  'Sandslash':   ['Sandslash','Sandslash-Alola'],
  'Vulpix':      ['Vulpix','Vulpix-Alola'],
  'Ninetales':   ['Ninetales','Ninetales-Alola'],
  'Diglett':     ['Diglett','Diglett-Alola'],
  'Dugtrio':     ['Dugtrio','Dugtrio-Alola'],
  'Meowth':      ['Meowth','Meowth-Gmax','Meowth-Alola','Meowth-Galar'],
  'Persian':     ['Persian','Persian-Alola'],
  'Geodude':     ['Geodude','Geodude-Alola'],
  'Graveler':    ['Graveler','Graveler-Alola'],
  'Golem':       ['Golem','Golem-Alola'],
  'Grimer':      ['Grimer','Grimer-Alola'],
  'Muk':         ['Muk','Muk-Alola'],
  'Exeggutor':   ['Exeggutor','Exeggutor-Alola'],
  'Marowak':     ['Marowak','Marowak-Alola'],
  'Corsola':     ['Corsola','Corsola-Galar'],
  'Linoone':     ['Linoone','Linoone-Galar'],
  'Zigzagoon':   ['Zigzagoon','Zigzagoon-Galar'],
  'Darumaka':    ['Darumaka','Darumaka-Galar'],
  'Yamask':      ['Yamask','Yamask-Galar'],
  'Weezing':     ['Weezing','Weezing-Galar'],
  'Mr-Mime':     ['Mr-Mime','Mr-Mime-Galar'],
  'Farfetchd':   ['Farfetchd','Farfetchd-Galar'],
  'Ponyta':      ['Ponyta','Ponyta-Galar'],
  'Rapidash':    ['Rapidash','Rapidash-Galar'],
  'Slowpoke':    ['Slowpoke','Slowpoke-Galar'],
  'Slowbro':     ['Slowbro','Slowbro-Mega','Slowbro-Galar'],
  'Slowking':    ['Slowking','Slowking-Galar'],
  'Stunfisk':    ['Stunfisk','Stunfisk-Galar'],
  'Articuno':    ['Articuno','Articuno-Galar'],
  'Zapdos':      ['Zapdos','Zapdos-Galar'],
  'Moltres':     ['Moltres','Moltres-Galar'],
  'Growlithe':   ['Growlithe','Growlithe-Hisui'],
  'Arcanine':    ['Arcanine','Arcanine-Hisui'],
  'Voltorb':     ['Voltorb','Voltorb-Hisui'],
  'Electrode':   ['Electrode','Electrode-Hisui'],
  'Typhlosion':  ['Typhlosion','Typhlosion-Hisui'],
  'Qwilfish':    ['Qwilfish','Qwilfish-Hisui'],
  'Sneasel':     ['Sneasel','Sneasel-Hisui'],
  'Samurott':    ['Samurott','Samurott-Hisui'],
  'Lilligant':   ['Lilligant','Lilligant-Hisui'],
  'Zorua':       ['Zorua','Zorua-Hisui'],
  'Zoroark':     ['Zoroark','Zoroark-Hisui'],
  'Braviary':    ['Braviary','Braviary-Hisui'],
  'Sliggoo':     ['Sliggoo','Sliggoo-Hisui'],
  'Goodra':      ['Goodra','Goodra-Hisui'],
  'Avalugg':     ['Avalugg','Avalugg-Hisui'],
  'Decidueye':   ['Decidueye','Decidueye-Hisui'],
  'Tauros':      ['Tauros','Tauros-Paldea-Combat','Tauros-Paldea-Blaze','Tauros-Paldea-Aqua'],
  'Basculin':    ['Basculin','Basculin-Blue-Striped'],
  'Mimikyu':     ['Mimikyu','Mimikyu-Busted'],
  // Mega Evoluções (Gen 6–7)
  'Venusaur':   ['Venusaur','Venusaur-Mega','Venusaur-Gmax'],
  'Charizard':  ['Charizard','Charizard-Mega-X','Charizard-Mega-Y','Charizard-Gmax'],
  'Blastoise':  ['Blastoise','Blastoise-Mega','Blastoise-Gmax'],
  'Beedrill':   ['Beedrill','Beedrill-Mega'],
  'Pidgeot':    ['Pidgeot','Pidgeot-Mega'],
  'Alakazam':   ['Alakazam','Alakazam-Mega'],
  'Gengar':     ['Gengar','Gengar-Mega','Gengar-Gmax'],
  'Kangaskhan': ['Kangaskhan','Kangaskhan-Mega'],
  'Pinsir':     ['Pinsir','Pinsir-Mega'],
  'Gyarados':   ['Gyarados','Gyarados-Mega'],
  'Aerodactyl': ['Aerodactyl','Aerodactyl-Mega'],
  'Mewtwo':     ['Mewtwo','Mewtwo-Mega-X','Mewtwo-Mega-Y'],
  'Ampharos':   ['Ampharos','Ampharos-Mega'],
  'Steelix':    ['Steelix','Steelix-Mega'],
  'Scizor':     ['Scizor','Scizor-Mega'],
  'Heracross':  ['Heracross','Heracross-Mega'],
  'Houndoom':   ['Houndoom','Houndoom-Mega'],
  'Tyranitar':  ['Tyranitar','Tyranitar-Mega'],
  'Sceptile':   ['Sceptile','Sceptile-Mega'],
  'Blaziken':   ['Blaziken','Blaziken-Mega'],
  'Swampert':   ['Swampert','Swampert-Mega'],
  'Gardevoir':  ['Gardevoir','Gardevoir-Mega'],
  'Sableye':    ['Sableye','Sableye-Mega'],
  'Mawile':     ['Mawile','Mawile-Mega'],
  'Aggron':     ['Aggron','Aggron-Mega'],
  'Medicham':   ['Medicham','Medicham-Mega'],
  'Manectric':  ['Manectric','Manectric-Mega'],
  'Sharpedo':   ['Sharpedo','Sharpedo-Mega'],
  'Camerupt':   ['Camerupt','Camerupt-Mega'],
  'Altaria':    ['Altaria','Altaria-Mega'],
  'Banette':    ['Banette','Banette-Mega'],
  'Absol':      ['Absol','Absol-Mega'],
  'Glalie':     ['Glalie','Glalie-Mega'],
  'Salamence':  ['Salamence','Salamence-Mega'],
  'Metagross':  ['Metagross','Metagross-Mega'],
  'Latias':     ['Latias','Latias-Mega'],
  'Latios':     ['Latios','Latios-Mega'],
  'Rayquaza':   ['Rayquaza','Rayquaza-Mega'],
  'Lucario':    ['Lucario','Lucario-Mega'],
  'Garchomp':   ['Garchomp','Garchomp-Mega'],
  'Lopunny':    ['Lopunny','Lopunny-Mega'],
  'Abomasnow':  ['Abomasnow','Abomasnow-Mega'],
  'Gallade':    ['Gallade','Gallade-Mega'],
  'Audino':     ['Audino','Audino-Mega'],
  'Diancie':    ['Diancie','Diancie-Mega'],
  // Gigantamax (Gen 8)
  'Butterfree':  ['Butterfree','Butterfree-Gmax'],
  'Pikachu':     ['Pikachu','Pikachu-Gmax'],
  'Machamp':     ['Machamp','Machamp-Gmax'],
  'Kingler':     ['Kingler','Kingler-Gmax'],
  'Lapras':      ['Lapras','Lapras-Gmax'],
  'Eevee':       ['Eevee','Eevee-Gmax'],
  'Snorlax':     ['Snorlax','Snorlax-Gmax'],
  'Garbodor':    ['Garbodor','Garbodor-Gmax'],
  'Melmetal':    ['Melmetal','Melmetal-Gmax'],
  'Rillaboom':   ['Rillaboom','Rillaboom-Gmax'],
  'Cinderace':   ['Cinderace','Cinderace-Gmax'],
  'Inteleon':    ['Inteleon','Inteleon-Gmax'],
  'Corviknight': ['Corviknight','Corviknight-Gmax'],
  'Orbeetle':    ['Orbeetle','Orbeetle-Gmax'],
  'Drednaw':     ['Drednaw','Drednaw-Gmax'],
  'Coalossal':   ['Coalossal','Coalossal-Gmax'],
  'Flapple':     ['Flapple','Flapple-Gmax'],
  'Appletun':    ['Appletun','Appletun-Gmax'],
  'Sandaconda':  ['Sandaconda','Sandaconda-Gmax'],
  'Centiskorch': ['Centiskorch','Centiskorch-Gmax'],
  'Hatterene':   ['Hatterene','Hatterene-Gmax'],
  'Grimmsnarl':  ['Grimmsnarl','Grimmsnarl-Gmax'],
  'Alcremie':    ['Alcremie','Alcremie-Gmax'],
  'Copperajah':  ['Copperajah','Copperajah-Gmax'],
  'Duraludon':   ['Duraludon','Duraludon-Gmax'],
};

// Pokémon com forma feminina funcional (stats/habilidades distintas) — nunca via form arrows
const GENDER_VARIANTS = {
  'Meowstic':    'Meowstic-Female',
  'Indeedee':    'Indeedee-Female',
  'Frillish':    'Frillish-Female',
  'Jellicent':   'Jellicent-Female',
  'Pyroar':      'Pyroar-Female',
  'Oinkologne':  'Oinkologne-Female',
  'Basculegion': 'Basculegion-Female',
};

// Conjunto de formas não-base — filtradas do autocomplete (inclui variantes de gênero)
const FORM_VARIANTS = new Set([
  ...Object.values(POKEMON_FORMS).flat().filter(f => !POKEMON_FORMS[f]),
  ...Object.values(GENDER_VARIANTS),
]);

// Mapa reverso: qualquer forma → chave base
const FORM_BASE = {};
for (const [base, forms] of Object.entries(POKEMON_FORMS)) {
  FORM_BASE[base] = base;
  for (const f of forms) FORM_BASE[f] = base;
}

// Nomes oficiais da forma base quando o label "Normal" seria impreciso
const BASE_FORM_LABELS = {
  'Castform':    'Normal',     'Deoxys':      'Normal',
  'Wormadam':    'Plant',      'Rotom':        'Normal',
  'Giratina':    'Altered',    'Shaymin':      'Land',
  'Darmanitan':  'Standard',   'Tornadus':     'Incarnate',
  'Thundurus':   'Incarnate',  'Landorus':     'Incarnate',
  'Kyurem':      'Base',       'Keldeo':       'Ordinary',
  'Meloetta':    'Aria',       'Aegislash':    'Shield',
  'Pumpkaboo':   'Average',    'Gourgeist':    'Average',
  'Hoopa':       'Confined',   'Wishiwashi':   'Solo',
  'Lycanroc':    'Midday',     'Oricorio':     'Baile',
  'Necrozma':    'Base',       'Toxtricity':   'Amped',
  'Morpeko':     'Full Belly', 'Eiscue':       'Ice Face',
  'Dialga':      'Base',       'Palkia':       'Base',
  'Zacian':      'Hero',       'Zamazenta':    'Hero',
  'Urshifu':     'Single Strike', 'Calyrex':    'Base',
  'Enamorus':    'Incarnate',  'Palafin':      'Zero',
  'Ogerpon':     'Teal Mask',   'Tatsugiri':    'Curly',
  'Squawkabilly':'Green',      'Dudunsparce':  'Two-Segment',
  'Maushold':    'Four',       'Minior':       'Meteor',
  'Gimmighoul':  'Chest',      'Basculin':     'Red-Striped',
  'Mimikyu':     'Disguised',
  'Zygarde':     '50%',
};

// Pokémon cujo endpoint base não existe na PokéAPI (só o nome com sufixo de forma)
const FORM_API_NAMES = {
  'Deoxys':     'Deoxys-Normal',
  'Wormadam':   'Wormadam-Plant',
  'Giratina':   'Giratina-Altered',
  'Shaymin':    'Shaymin-Land',
  'Darmanitan': 'Darmanitan-Standard',
  'Tornadus':   'Tornadus-Incarnate',
  'Thundurus':  'Thundurus-Incarnate',
  'Landorus':   'Landorus-Incarnate',
  'Enamorus':   'Enamorus-Incarnate',
  'Meloetta':   'Meloetta-Aria',
  'Aegislash':  'Aegislash-Shield',
  'Hoopa':      'Hoopa-Confined',
  'Wishiwashi': 'Wishiwashi-Solo',
  'Lycanroc':   'Lycanroc-Midday',
  'Oricorio':         'Oricorio-Baile',
  'Oricorio-Pa-U':    'Oricorio-Pau',
  'Mimikyu':          'Mimikyu-Disguised',
  'Toxtricity':       'Toxtricity-Amped',
  'Morpeko':          'Morpeko-Full-Belly',
  'Eiscue':              'Eiscue-Ice',
  'Darmanitan-Galar':    'Darmanitan-Galar-Standard',
  'Necrozma-Dusk-Mane':  'Necrozma-Dusk',
  'Necrozma-Dawn-Wings': 'Necrozma-Dawn',
  'Palafin':             'Palafin-Zero',
  'Zygarde':             'Zygarde-50',
  'Toxtricity-Gmax':     'Toxtricity-Amped-Gmax',
  'Urshifu-Gmax':        'Urshifu-Single-Strike-Gmax',
};

// Retorna o nome de API para o sprite padrão (macho/forma base)
function spriteApiName(name) {
  if (GENDER_VARIANTS[name]) return GENDER_VARIANTS[name].replace('-Female', '-Male');
  return FORM_API_NAMES[name] || name;
}

function lookupKey(value) {
  return String(value || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[’']/g, '')
    .replace(/♀/g, 'f').replace(/♂/g, 'm')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function normalizePokemonName(raw) {
  const text = String(raw || '').trim();
  if (!text) return '';
  if (POKEMON_DB[text]) return text;
  const key = lookupKey(text);
  return Object.keys(POKEMON_DB).find(name => lookupKey(name) === key) || text;
}

function cleanSmogonValue(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  const key = text.toLowerCase();
  return ['-', '—', 'none', '(none)', '(sem item)', '(sem habilidade)'].includes(key) ? '' : text;
}

function parseSmogonHeader(header) {
  const [leftRaw, ...itemParts] = String(header || '').split('@');
  let namePart = leftRaw.trim();
  const item = cleanSmogonValue(itemParts.join('@'));
  let species = '';
  let nickname = '';
  let gender = '';

  let match;
  while ((match = namePart.match(/\s*\(([^()]+)\)\s*$/))) {
    const token = match[1].trim();
    const lower = token.toLowerCase();
    namePart = namePart.slice(0, match.index).trim();
    if (lower === 'm' || lower === 'male') {
      gender = 'male';
      continue;
    }
    if (lower === 'f' || lower === 'female') {
      gender = 'female';
      continue;
    }
    species = token;
    nickname = namePart;
    break;
  }

  if (!species) species = namePart;
  let normalizedSpecies = normalizePokemonName(species);
  if (lookupKey(normalizedSpecies) === 'nidoran' && gender) {
    normalizedSpecies = gender === 'female' ? 'Nidoran-F' : 'Nidoran-M';
  }

  return {
    species: normalizedSpecies,
    nickname,
    item,
    gender,
  };
}

function parseStatSpread(str, defaultVal = 0, statMax) {
  const result = { hp:defaultVal, atk:defaultVal, def:defaultVal, spa:defaultVal, spd:defaultVal, spe:defaultVal };
  if (!str) return result;
  const labelToKey = Object.fromEntries(STAT_KEYS.map(k => [STAT_LABELS[k].toLowerCase(), k]));
  String(str).split(/[\/,]/).forEach(part => {
    const m = part.trim().match(/^(\d+)\s*(HP|Atk|Def|SpA|SpD|Spe)$/i);
    if (!m) return;
    const key = labelToKey[m[2].toLowerCase()];
    if (!key) return;
    const val = parseInt(m[1], 10);
    result[key] = statMax !== undefined ? Math.min(val, statMax) : val;
  });
  return result;
}

function normalizeNature(raw) {
  const key = String(raw || '').trim();
  return Object.keys(NATURES).find(n => n.toLowerCase() === key.toLowerCase()) || 'Hardy';
}

function smogonHeaderName(member) {
  const rawName = member.name || '';
  const isGmax = rawName.endsWith('-Gmax');
  const name = isGmax ? (FORM_BASE[rawName] || rawName) : rawName;
  if (member.gender === 'female') return `${name} (F)`;
  return name;
}

function smogonMemberLines(member, opts = {}) {
  const gen = opts.gen ?? 9;
  const isChampions = !!opts.isChampions;
  const lines = [];
  const name = smogonHeaderName(member);
  const item = cleanSmogonValue(member.item);
  const isGmax = member.name?.endsWith('-Gmax');

  if (gen >= 2 || isChampions) lines.push(item ? `${name} @ ${item}` : name);
  else lines.push(name);

  if ((gen >= 3 || isChampions) && cleanSmogonValue(member.ability)) {
    lines.push(`Ability: ${cleanSmogonValue(member.ability)}`);
  }
  if (isGmax) lines.push('Gigantamax: Yes');
  if (member.shiny) lines.push('Shiny: Yes');
  if (member.teraType) lines.push(`Tera Type: ${member.teraType}`);
  lines.push('Level: 50');

  if (isChampions) {
    lines.push(`SP Spread: ${STAT_KEYS.map(k => `${STAT_LABELS[k]} ${member.evs?.[k] || 0}`).join(' / ')}`);
  } else {
    const evParts = STAT_KEYS.filter(k => (member.evs?.[k] || 0) > 0).map(k => `${member.evs[k]} ${STAT_LABELS[k]}`);
    if (evParts.length) lines.push(`EVs: ${evParts.join(' / ')}`);
    if (gen >= 3) lines.push(`${normalizeNature(member.nature)} Nature`);
    const ivParts = STAT_KEYS.filter(k => (member.ivs?.[k] ?? 31) !== 31).map(k => `${member.ivs[k]} ${STAT_LABELS[k]}`);
    if (ivParts.length) lines.push(`IVs: ${ivParts.join(' / ')}`);
  }

  (member.moves || []).filter(Boolean).forEach(move => lines.push(`- ${move}`));
  return lines;
}

function smogonTeamText(members, opts = {}) {
  return (members || [])
    .filter(member => member?.name?.trim())
    .map(member => smogonMemberLines(member, opts).join('\n'))
    .join('\n\n');
}

const REGIONAL_SUFFIXES = ['Alola', 'Galar', 'Hisui', 'Paldea'];
function isRegionalForm(base, formName) {
  const suffix = formName.slice(base.length + 1);
  return REGIONAL_SUFFIXES.some(r => suffix === r || suffix.startsWith(r + '-'));
}

// Retorna label legível para um nome de forma
function formLabel(base, formName) {
  if (formName === base) {
    if (BASE_FORM_LABELS[base]) return BASE_FORM_LABELS[base];
    const forms = POKEMON_FORMS[base] || [];
    if (forms.some(f => f !== base && isRegionalForm(base, f))) return 'Kanto';
    return 'Normal';
  }
  return formName.slice(base.length + 1).replace(/-/g, ' ');
}

// Retorna HTML do navegador ◀ label ▶ de formas, ou '' se não aplicável
function buildFormNavHTML(name, slotAttr) {
  const base = FORM_BASE[name];
  if (!base) return '';
  const forms = POKEMON_FORMS[base];
  if (!forms || forms.length <= 1) return '';
  const label = formLabel(base, name);
  const attr = slotAttr !== undefined ? ` data-slot="${slotAttr}"` : '';
  return `<div class="form-nav"><button class="form-nav-btn" data-dir="-1"${attr}>◀</button><span class="form-nav-label">${label}</span><button class="form-nav-btn" data-dir="1"${attr}>▶</button></div>`;
}

// ── Lista de golpes ───────────────────────────────────────────────────────────

/**
 * Lista de nomes de golpes para autocomplete.
 * Populada de forma assincrona via PokeAPI.ensureMoveList() no init do app.
 * Comeca vazia — o autocomplete de golpes no Analyzer cai na API se vazia.
 */
let MOVE_NAMES = [];

function bindAutocompleteKeys(inputEl, suggestEl, onPick) {
  window.PokeBuildUI?.bindAutocompleteKeys(inputEl, suggestEl, onPick);
}
