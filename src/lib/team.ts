import type { Ruleset, StatsTable, StatID } from '../rulesets/types';

/** One team member, in Showdown's set shape (names, not ids) so it round-trips through pastes */
export interface TeamSet {
  species: string;
  item?: string;
  ability?: string;
  moves: string[];
  nature?: string;
  evs: StatsTable;
  ivs: StatsTable;
  level: number;
  teraType?: string;
  gender?: string;
  shiny?: boolean;
  /** Playthrough mode: the PC mon this slot holds (see state/box.ts) */
  monId?: string;
}

export const STAT_IDS: StatID[] = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];
export const STAT_LABELS: Record<StatID, string> = { hp: 'HP', atk: 'Atk', def: 'Def', spa: 'SpA', spd: 'SpD', spe: 'Spe' };

const fill = (v: number): StatsTable => ({ hp: v, atk: v, def: v, spa: v, spd: v, spe: v });

/** Which set fields exist in this ruleset's mechanics gen */
export function genFeatures(rs: Ruleset) {
  return {
    items: rs.gen >= 2,
    abilities: rs.gen >= 3,
    natures: rs.gen >= 3,
    // EVs cap at 510 total from Gen 3; earlier gens max every stat (stat experience)
    evTotalCap: rs.gen >= 3 ? 510 : undefined,
    tera: rs.gen === 9 && rs.kind === 'official',
  };
}

export function newSet(rs: Ruleset, species: string): TeamSet {
  const sp = rs.getSpecies(species);
  const f = genFeatures(rs);
  return {
    species: sp?.name ?? species,
    ability: f.abilities ? sp?.abilities[0] : undefined,
    moves: [],
    nature: f.natures ? 'Serious' : undefined,
    evs: fill(f.evTotalCap ? 0 : 252),
    ivs: fill(31),
    level: 100,
    teraType: f.tera ? sp?.types[0] : undefined,
  };
}

export function finalStats(rs: Ruleset, set: TeamSet): StatsTable | undefined {
  const sp = rs.getSpecies(set.species);
  if (!sp) return undefined;
  const out = {} as StatsTable;
  for (const s of STAT_IDS) out[s] = rs.calcStat(s, sp.baseStats[s], set.ivs[s], set.evs[s], set.level, set.nature);
  return out;
}

export const evTotal = (evs: StatsTable) => STAT_IDS.reduce((sum, s) => sum + evs[s], 0);
