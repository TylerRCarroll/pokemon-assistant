/** Compact per-format Smogon data written by scripts/fetch-smogon.ts */

/** [name, share 0-1] pairs, most common first */
export type Share = [string, number];

export interface UsageEntry {
  /** Weighted usage share 0-1 */
  usage: number;
  rank: number;
  moves: Share[];
  items: Share[];
  abilities: Share[];
  teraTypes: Share[];
  /** "Nature:hp/atk/def/spa/spd/spe" */
  spreads: Share[];
  teammates: Share[];
  /** [name, KO-or-switch rate 0-1], best checks first */
  counters: Share[];
}

/** A named Smogon analysis set; slash options are arrays */
export interface SmogonSet {
  moves: (string | string[])[];
  item?: string | string[];
  ability?: string | string[];
  nature?: string | string[];
  evs?: Partial<Record<string, number>> | Partial<Record<string, number>>[];
  ivs?: Partial<Record<string, number>> | Partial<Record<string, number>>[];
  teratypes?: string | string[];
  level?: number;
}

export interface SampleTeam {
  name: string;
  author?: string;
  data: {
    species: string;
    item?: string;
    ability?: string;
    nature?: string;
    teraType?: string;
    moves: string[];
    evs?: Partial<Record<string, number>>;
    ivs?: Partial<Record<string, number>>;
    level?: number;
    gender?: string;
  }[];
}

export interface FormatData {
  format: string;
  fetchedAt: string;
  battles: number;
  pokemon: Record<string, UsageEntry>;
  sets: Record<string, Record<string, SmogonSet>>;
  teams: SampleTeam[];
}
