export type TypeName = string;

export interface StatsTable {
  hp: number;
  atk: number;
  def: number;
  spa: number;
  spd: number;
  spe: number;
}

export interface SpeciesInfo {
  id: string;
  name: string;
  num: number;
  types: TypeName[];
  baseStats: StatsTable;
  abilities: string[];
  tier?: string;
  prevo?: string;
  evos?: string[];
}

export interface MoveInfo {
  id: string;
  name: string;
  type: TypeName;
  category: 'Physical' | 'Special' | 'Status';
  basePower: number;
  accuracy: number | true;
  pp: number;
  priority: number;
  shortDesc: string;
}

export interface AbilityInfo {
  id: string;
  name: string;
  shortDesc: string;
}

export interface ItemInfo {
  id: string;
  name: string;
  shortDesc: string;
}

export type LearnMethod =
  | { kind: 'level'; level: number }
  | { kind: 'tm' }
  | { kind: 'tutor' }
  | { kind: 'egg' }
  | { kind: 'event' }
  | { kind: 'other' };

export interface LearnsetEntry {
  move: string; // move id
  methods: LearnMethod[];
  /** true when only learnable through a pre-evolution */
  viaPrevo?: boolean;
}

/**
 * A ruleset is one playable rules context: an official generation or a romhack.
 * Every feature reads game data through this interface, never from @pkmn directly.
 */
export interface Ruleset {
  id: string;
  name: string;
  kind: 'official' | 'romhack';
  /** Mechanics generation used for damage calc and fallbacks */
  gen: number;
  /** false while romhack data is unverified against the hack's own documentation */
  verified: boolean;
  notes?: string;

  types: TypeName[];
  /** Damage multiplier of an attacking type against a (possibly dual-typed) defender */
  effectiveness(attack: TypeName, defend: TypeName[]): number;

  species(): SpeciesInfo[];
  getSpecies(name: string): SpeciesInfo | undefined;
  moves(): MoveInfo[];
  getMove(name: string): MoveInfo | undefined;
  abilities(): AbilityInfo[];
  items(): ItemInfo[];
  learnset(species: string): Promise<LearnsetEntry[]>;
}
