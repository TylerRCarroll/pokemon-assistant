import type { GenerationNum } from '@pkmn/data';
import { createOfficialRuleset, gens, toID } from './official';
import type { LearnsetEntry, MoveInfo, Ruleset, SpeciesInfo, TMInfo } from './types';

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
}

export function createRomhackRuleset(overlay: RomhackOverlay): Ruleset {
  const base = createOfficialRuleset(overlay.baseGen, { natDex: overlay.natDex });
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

  return {
    ...base,
    id: overlay.id,
    name: overlay.name,
    kind: 'romhack',
    verified: overlay.verified,
    notes: overlay.notes,
    tms: overlay.tms,
    natDex: overlay.natDex,
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
      return (movesCache ??= [...base.moves().map(moveOverride), ...Object.values(overlay.customMoves ?? {})]);
    },
    getMove(name) {
      const custom = overlay.customMoves?.[toID(name)];
      if (custom) return custom;
      const m = base.getMove(name);
      return m ? moveOverride(m) : undefined;
    },
    async learnset(name) {
      return overlay.learnsets?.[toID(name)] ?? base.learnset(name);
    },
  };
}
