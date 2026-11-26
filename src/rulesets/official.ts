import { Dex } from '@pkmn/dex';
import { Generations, type Generation, type GenerationNum } from '@pkmn/data';
import type {
  AbilityInfo,
  ItemInfo,
  LearnMethod,
  LearnsetEntry,
  MoveInfo,
  Ruleset,
  SpeciesInfo,
  TypeName,
} from './types';

export const gens = new Generations(Dex);

/** National Dex view: also includes species/moves/items cut from that gen's games ("Past") */
export const natDexGens = new Generations(Dex, (d) => {
  if ('isNonstandard' in d && d.isNonstandard === 'Past') return !!d.exists;
  return Generations.DEFAULT_EXISTS(d);
});

/** Legends: Arceus moves; @pkmn dates them to Gen 9 because Scarlet/Violet brought them to the main games */
const LEGENDS_ARCEUS_MOVES = new Set([
  'barbbarrage', 'bittermalice', 'bleakwindstorm', 'ceaselessedge', 'chloroblast', 'direclaw', 'esperwing',
  'headlongrush', 'infernalparade', 'lunarblessing', 'mountaingale', 'mysticalpower', 'powershift', 'psyshieldbash',
  'ragingfury', 'sandsearstorm', 'shelter', 'springtidestorm', 'stoneaxe', 'takeheart', 'triplearrows', 'victorydance',
  'wavecrash', 'wildboltstorm',
]);

/**
 * National Dex plus Legends: Arceus content (Hisuian forms, Sneasler, Wyrdeer, the Origin formes, and their
 * moves), which @pkmn files under "Future" in Gen 8. Some Gen 8 romhacks (Unbound) include it.
 */
export const legendsArceusGens = new Generations(Dex, (d) => {
  if ('isNonstandard' in d && d.isNonstandard === 'Future' && d.exists) {
    if ('basePower' in d) return LEGENDS_ARCEUS_MOVES.has(d.id);
    if ('baseStats' in d) return d.gen === 8;
    return false;
  }
  if ('isNonstandard' in d && d.isNonstandard === 'Past') return !!d.exists;
  return Generations.DEFAULT_EXISTS(d);
});

/** The @pkmn generation a ruleset's data comes from */
export function generationFor(num: GenerationNum, opts: OfficialOptions = {}): Generation {
  return (opts.legendsArceus ? legendsArceusGens : opts.natDex ? natDexGens : gens).get(num);
}

/** Pseudo-types that exist in the data but aren't real defending types */
const HIDDEN_TYPES = new Set(['???', 'Stellar']);

const toID = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Parse a Showdown learnset source code like "9L42", "8M", "4E" */
export function parseLearnCode(code: string): { gen: number; method: LearnMethod } {
  const gen = Number(code[0]);
  const kind = code[1];
  switch (kind) {
    case 'L':
      return { gen, method: { kind: 'level', level: Number(code.slice(2)) } };
    case 'M':
      return { gen, method: { kind: 'tm' } };
    case 'T':
      return { gen, method: { kind: 'tutor' } };
    case 'E':
      return { gen, method: { kind: 'egg' } };
    case 'S':
      return { gen, method: { kind: 'event' } };
    default:
      return { gen, method: { kind: 'other' } };
  }
}

function sameMethod(a: LearnMethod, b: LearnMethod) {
  return a.kind === b.kind && (a.kind !== 'level' || a.level === (b as typeof a).level);
}

/** Collapse source codes to the methods available in `gen` (latest gen's codes win) */
export function methodsFor(codes: string[], gen: number): LearnMethod[] {
  const parsed = codes.map(parseLearnCode).filter((c) => c.gen <= gen);
  if (!parsed.length) return [];
  const newest = Math.max(...parsed.map((c) => c.gen));
  const out: LearnMethod[] = [];
  for (const { gen: g, method } of parsed) {
    if (g === newest && !out.some((m) => sameMethod(m, method))) out.push(method);
  }
  return out;
}

type PkmnSpecies = NonNullable<ReturnType<Generation['species']['get']>>;

/** Human-readable evolution requirement from Showdown's evo fields */
export function evoMethod(s: PkmnSpecies): string | undefined {
  if (!s.prevo) return undefined;
  const cond = s.evoCondition ? ` ${s.evoCondition}` : '';
  const gender = s.gender === 'M' ? ' (male)' : s.gender === 'F' ? ' (female)' : '';
  let text: string;
  switch (s.evoType) {
    case 'useItem':
      text = `Use ${s.evoItem}`;
      break;
    case 'trade':
      text = s.evoItem ? `Trade holding ${s.evoItem}` : 'Trade';
      break;
    case 'levelFriendship':
      text = 'Level up with high friendship';
      break;
    case 'levelHold':
      text = `Level up holding ${s.evoItem}`;
      break;
    case 'levelMove':
      text = `Level up knowing ${s.evoMove}`;
      break;
    case 'levelExtra':
    case 'other':
      return (s.evoCondition ? `Level up ${s.evoCondition}` : 'Special condition') + gender;
    default:
      text = s.evoLevel ? `Level ${s.evoLevel}` : 'Level up';
  }
  return text + cond + gender;
}

/** Showdown sprite naming: base species id plus "-forme" */
export const spriteIdFor = (s: { baseSpecies: string; forme: string }) =>
  toID(s.baseSpecies) + (s.forme ? `-${toID(s.forme)}` : '');

export function toSpeciesInfo(s: PkmnSpecies): SpeciesInfo {
  return {
    id: s.id,
    name: s.name,
    num: s.num,
    types: [...s.types],
    baseStats: { ...s.baseStats },
    abilities: Object.values(s.abilities).filter(Boolean) as string[],
    tier: s.tier,
    prevo: s.prevo || undefined,
    evos: s.evos?.length ? [...s.evos] : undefined,
    evoMethod: evoMethod(s),
    spriteId: spriteIdFor(s),
    legendary: s.tags.some((t) => t === 'Restricted Legendary' || t === 'Mythical') || undefined,
    battleOnly: !!(s.battleOnly || s.isMega || s.isPrimal || s.forme === 'Gmax' || s.forme === 'Totem') || undefined,
  };
}

export interface OfficialOptions {
  natDex?: boolean;
  /** Also include Legends: Arceus species and moves (implies natDex) */
  legendsArceus?: boolean;
}

export function createOfficialRuleset(num: GenerationNum, opts: OfficialOptions = {}): Ruleset {
  const gen = generationFor(num, opts);
  const types = [...gen.types].map((t) => t.name).filter((t) => !HIDDEN_TYPES.has(t));

  let speciesCache: SpeciesInfo[] | undefined;
  let movesCache: MoveInfo[] | undefined;

  return {
    id: opts.natDex ? `gen${num}natdex` : `gen${num}`,
    name: opts.natDex ? `Gen ${num} National Dex` : `Gen ${num}`,
    kind: 'official',
    gen: num,
    verified: true,
    natDex: opts.natDex,
    legendsArceus: opts.legendsArceus,
    types,

    effectiveness(attack: TypeName, defend: TypeName[]) {
      return gen.types.totalEffectiveness(attack as never, defend as never);
    },

    species() {
      return (speciesCache ??= [...gen.species].map(toSpeciesInfo));
    },
    getSpecies(name) {
      const s = gen.species.get(name);
      return s ? toSpeciesInfo(s) : undefined;
    },
    moves() {
      return (movesCache ??= [...gen.moves].map(toMoveInfo));
    },
    getMove(name) {
      const m = gen.moves.get(name);
      return m ? toMoveInfo(m) : undefined;
    },
    abilities(): AbilityInfo[] {
      return [...gen.abilities].map(toAbilityInfo);
    },
    getAbility(name) {
      const a = gen.abilities.get(name);
      return a ? toAbilityInfo(a) : undefined;
    },
    items(): ItemInfo[] {
      return [...gen.items].map(toItemInfo);
    },
    getItem(name) {
      const i = gen.items.get(name);
      return i ? toItemInfo(i) : undefined;
    },

    natures() {
      return [...gen.natures].map((n) => ({ name: n.name, plus: n.plus, minus: n.minus }));
    },
    calcStat(stat, base, iv, ev, level, nature) {
      return gen.stats.calc(stat, base, iv, ev, level, nature ? gen.natures.get(nature) : undefined);
    },

    async learnset(name) {
      const [own, all] = await Promise.all([gen.learnsets.get(name), gen.learnsets.learnable(name)]);
      if (!all) return [];
      const ownMoves = own?.learnset ?? {};
      return Object.entries(all)
        .map(([move, codes]): LearnsetEntry => {
          const ownCodes = ownMoves[move]?.filter((c) => Number(c[0]) <= num) ?? [];
          return {
            move,
            methods: methodsFor(ownCodes.length ? ownCodes : codes, num),
            viaPrevo: ownCodes.length === 0 || undefined,
          };
        })
        .filter((e) => e.methods.length > 0);
    },
  };

  function toMoveInfo(m: NonNullable<ReturnType<Generation['moves']['get']>>): MoveInfo {
    return {
      id: m.id,
      name: m.name,
      type: m.type,
      category: m.category,
      basePower: m.basePower,
      accuracy: m.accuracy,
      pp: m.pp,
      priority: m.priority,
      shortDesc: m.shortDesc,
      desc: m.desc,
      flags: { ...m.flags } as Record<string, 1>,
      drain: m.drain,
    };
  }
}

function toAbilityInfo(a: { id: string; name: string; shortDesc: string; desc: string }): AbilityInfo {
  return { id: a.id, name: a.name, shortDesc: a.shortDesc, desc: a.desc };
}

function toItemInfo(i: { id: string; name: string; shortDesc: string; desc: string }): ItemInfo {
  return { id: i.id, name: i.name, shortDesc: i.shortDesc, desc: i.desc };
}

export { toID };
