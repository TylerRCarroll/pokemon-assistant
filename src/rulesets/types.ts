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
  /** How this species evolves from its prevo, e.g. "Level 30", "Use Thunder Stone" */
  evoMethod?: string;
  /** Showdown sprite id, e.g. "raichu-alola" */
  spriteId: string;
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
  desc?: string;
  /** Showdown-style move flags, e.g. { contact: 1, bite: 1 } */
  flags?: Record<string, 1>;
  /** Fraction of damage dealt the user recovers, e.g. [1, 2] */
  drain?: [number, number];
}

export interface AbilityInfo {
  id: string;
  name: string;
  shortDesc: string;
  desc?: string;
}

export interface ItemInfo {
  id: string;
  name: string;
  shortDesc: string;
  desc?: string;
}

export type StatID = keyof StatsTable;

export interface NatureInfo {
  name: string;
  plus?: StatID;
  minus?: StatID;
}

export interface TMInfo {
  num: number;
  name: string;
  /** move id, or null when the name doesn't match a known move */
  move: string | null;
  type: string;
  location: string;
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
  getAbility(name: string): AbilityInfo | undefined;
  items(): ItemInfo[];
  getItem(name: string): ItemInfo | undefined;
  learnset(species: string): Promise<LearnsetEntry[]>;
  /** Natures (empty before Gen 3) */
  natures(): NatureInfo[];
  /** Final stat value, using Showdown's 0-31 IV / 0-252 EV scale in every gen */
  calcStat(stat: StatID, base: number, iv: number, ev: number, level: number, nature?: string): number;
  /** The game's TM list with locations, when known (romhack docs) */
  tms?: TMInfo[];
}
