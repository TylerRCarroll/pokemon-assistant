import type { GenerationNum } from '@pkmn/data';
import { createOfficialRuleset, gens, toID } from './official';
import type { LearnMethod, LearnsetEntry, MoveInfo, Ruleset, SpeciesInfo, TMInfo, TrainerInfo } from './types';

/**
 * A romhack is described as a base official ruleset plus overrides,
 * the same idea as Showdown's `mods/`.
 */
export interface RomhackOverlay {
  id: string;
  name: string;
  baseGen: GenerationNum;
  /** Use the National Dex species pool of the base gen (species cut from those games) */
  natDex?: boolean;
  legendsArceus?: boolean;
  /** Borrow another gen's type chart and type list (e.g. a Gen 4 hack that adds Fairy) */
  typeChartGen?: GenerationNum;
  /**
   * Retype species and moves to match a later gen's Fairy typings.
   * A bulk rule for hacks that backport Fairy; explicit overrides still win.
   */
  fairyRetypesFromGen?: GenerationNum;
  verified: boolean;
  notes?: string;
  species?: Record<string, Partial<Pick<SpeciesInfo, 'types' | 'baseStats' | 'abilities'>>>;
  moves?: Record<string, Partial<Pick<MoveInfo, 'type' | 'category' | 'basePower' | 'accuracy' | 'pp'>>>;
  /** Moves that exist only in the hack, keyed by move id */
  customMoves?: Record<string, MoveInfo & { assumed?: string[] }>;
  /** Full learnset replacement for a species, keyed by species id */
  learnsets?: Record<string, LearnsetEntry[]>;
  /** The hack's TM list; `move` is null when the name doesn't match a known move */
  tms?: TMInfo[];
  /** Moves the hack removed from the game (hidden from move lists) */
  removedMoves?: string[];
  /** Generated learnsets, loaded on first use; species missing here fall back to the base gen */
  loadLearnsets?: () => Promise<Record<string, CompactLearnset>>;
  loadTrainers?: () => Promise<TrainerInfo[]>;
}

/** Learnset as stored in generated JSON: move ids per method */
export interface CompactLearnset {
  level: [number, string][];
  tm: string[];
  tutor: string[];
  egg: string[];
}

export function expandLearnset(c: CompactLearnset): LearnsetEntry[] {
  const byMove = new Map<string, LearnMethod[]>();
  const add = (move: string, m: LearnMethod) => byMove.set(move, [...(byMove.get(move) ?? []), m]);
  for (const [level, move] of c.level) add(move, { kind: 'level', level });
  for (const move of c.tm) add(move, { kind: 'tm' });
  for (const move of c.tutor) add(move, { kind: 'tutor' });
  for (const move of c.egg) add(move, { kind: 'egg' });
  return [...byMove].map(([move, methods]) => ({ move, methods }));
}

export function createRomhackRuleset(overlay: RomhackOverlay): Ruleset {
  const base = createOfficialRuleset(overlay.baseGen, { natDex: overlay.natDex, legendsArceus: overlay.legendsArceus });
  const chart = overlay.typeChartGen ? createOfficialRuleset(overlay.typeChartGen) : base;
  const fairyGen = overlay.fairyRetypesFromGen ? gens.get(overlay.fairyRetypesFromGen) : undefined;

  const speciesOverride = (s: SpeciesInfo): SpeciesInfo => {
    let out = s;
    if (fairyGen) {
      const later = fairyGen.species.get(s.name);
      if (later?.types.includes('Fairy') && !s.types.includes('Fairy')) {
        out = { ...out, types: [...later.types] };
      }
    }
    const o = overlay.species?.[s.id];
    return o ? { ...out, ...o } : out;
  };

  const moveOverride = (m: MoveInfo): MoveInfo => {
    let out = m;
    if (fairyGen) {
      const later = fairyGen.moves.get(m.name);
      if (later?.type === 'Fairy' && m.type !== 'Fairy') out = { ...out, type: 'Fairy' };
    }
    const o = overlay.moves?.[m.id];
    return o ? { ...out, ...o } : out;
  };

  let speciesCache: SpeciesInfo[] | undefined;
  let movesCache: MoveInfo[] | undefined;
  let learnsetsPromise: Promise<Record<string, CompactLearnset>> | undefined;
  const removed = new Set(overlay.removedMoves ?? []);

  return {
    ...base,
    id: overlay.id,
    name: overlay.name,
    kind: 'romhack',
    verified: overlay.verified,
    notes: overlay.notes,
    tms: overlay.tms,
    natDex: overlay.natDex,
    legendsArceus: overlay.legendsArceus,
    typeChartGen: overlay.typeChartGen,
    types: chart.types,
    effectiveness: chart.effectiveness,

    species() {
      return (speciesCache ??= base.species().map(speciesOverride));
    },
    getSpecies(name) {
      const s = base.getSpecies(name);
      return s ? speciesOverride(s) : undefined;
    },
    moves() {
      return (movesCache ??= [
        ...base.moves().filter((m) => !removed.has(m.id)).map(moveOverride),
        ...Object.values(overlay.customMoves ?? {}),
      ]);
    },
    getMove(name) {
      const custom = overlay.customMoves?.[toID(name)];
      if (custom) return custom;
      const m = base.getMove(name);
      return m ? moveOverride(m) : undefined;
    },
    async learnset(name) {
      const id = base.getSpecies(name)?.id ?? toID(name);
      if (overlay.learnsets?.[id]) return overlay.learnsets[id];
      if (overlay.loadLearnsets) {
        const all = await (learnsetsPromise ??= overlay.loadLearnsets());
        if (all[id]) return expandLearnset(all[id]);
      }
      return base.learnset(name);
    },
    loadTrainers: overlay.loadTrainers,
  };
}
