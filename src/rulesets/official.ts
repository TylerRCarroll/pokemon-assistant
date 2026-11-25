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

export function toSpeciesInfo(s: NonNullable<ReturnType<Generation['species']['get']>>): SpeciesInfo {
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
  };
}

export interface OfficialOptions {
  natDex?: boolean;
}

export function createOfficialRuleset(num: GenerationNum, opts: OfficialOptions = {}): Ruleset {
  const gen = (opts.natDex ? natDexGens : gens).get(num);
  const types = [...gen.types].map((t) => t.name).filter((t) => !HIDDEN_TYPES.has(t));

  let speciesCache: SpeciesInfo[] | undefined;
  let movesCache: MoveInfo[] | undefined;

  return {
    id: opts.natDex ? `gen${num}natdex` : `gen${num}`,
    name: opts.natDex ? `Gen ${num} National Dex` : `Gen ${num}`,
    kind: 'official',
    gen: num,
    verified: true,
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
      return [...gen.abilities].map((a) => ({ id: a.id, name: a.name, shortDesc: a.shortDesc }));
    },
    items(): ItemInfo[] {
      return [...gen.items].map((i) => ({ id: i.id, name: i.name, shortDesc: i.shortDesc }));
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
      flags: { ...m.flags } as Record<string, 1>,
      drain: m.drain,
    };
  }
}

export { toID };
