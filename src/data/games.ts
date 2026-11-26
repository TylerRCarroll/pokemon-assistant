/**
 * Playthrough checkpoints per game: the next big battle you're preparing for, and the level its ace is at.
 * That level stands in for a level cap (Scarlet/Violet and Black have none, but disobedience and the
 * trainers' levels make it the practical ceiling). Romhack checkpoints come from their trainer docs.
 */
export interface Checkpoint {
  label: string;
  levelCap: number;
}

export interface GameInfo {
  id: string;
  name: string;
  rulesetId: string;
  /** Official checkpoints; romhacks load theirs with the availability data */
  checkpoints?: Checkpoint[];
  /** Whether trade evolutions are reachable alone (romhacks replace them with level or item methods) */
  tradeEvolutions: boolean;
  source: string;
}

const UNOVA: Checkpoint[] = [
  { label: 'Gym 1: Striaton trio', levelCap: 14 },
  { label: 'Gym 2: Lenora', levelCap: 20 },
  { label: 'Gym 3: Burgh', levelCap: 23 },
  { label: 'Gym 4: Elesa', levelCap: 27 },
  { label: 'Gym 5: Clay', levelCap: 31 },
  { label: 'Gym 6: Skyla', levelCap: 35 },
  { label: 'Gym 7: Brycen', levelCap: 39 },
  { label: 'Gym 8: Drayden', levelCap: 43 },
  { label: 'Elite Four, N & Ghetsis', levelCap: 54 },
  { label: 'Post-game', levelCap: 75 },
];

/** Gyms in the usual order; Scarlet/Violet's are free-order, so "Gym 3" means your third badge */
const PALDEA: Checkpoint[] = [
  { label: 'Gym 1: Katy', levelCap: 15 },
  { label: 'Gym 2: Brassius', levelCap: 17 },
  { label: 'Gym 3: Iono', levelCap: 24 },
  { label: 'Gym 4: Kofu', levelCap: 30 },
  { label: 'Gym 5: Larry', levelCap: 36 },
  { label: 'Gym 6: Ryme', levelCap: 42 },
  { label: 'Gym 7: Tulip', levelCap: 45 },
  { label: 'Gym 8: Grusha', levelCap: 48 },
  { label: 'Elite Four & Geeta', levelCap: 62 },
  { label: 'Area Zero (ending)', levelCap: 68 },
  { label: 'Post-game', levelCap: 75 },
  { label: 'The Teal Mask', levelCap: 75 },
  { label: 'The Indigo Disk', levelCap: 80 },
];

/** Index helpers the fetch script uses to place Pokémon */
export const PALDEA_CHECKPOINT = { areaZero: 9, postgame: 10, tealMask: 11, indigoDisk: 12 } as const;
export const UNOVA_CHECKPOINT = { surf: 6, postgame: 9 } as const;

export const GAMES: GameInfo[] = [
  { id: 'scarlet', name: 'Scarlet', rulesetId: 'gen9', checkpoints: PALDEA, tradeEvolutions: false, source: "PokéAPI's Paldea, Kitakami, and Blueberry Pokédexes; Bulbapedia's version exclusives" },
  { id: 'violet', name: 'Violet', rulesetId: 'gen9', checkpoints: PALDEA, tradeEvolutions: false, source: "PokéAPI's Paldea, Kitakami, and Blueberry Pokédexes; Bulbapedia's version exclusives" },
  { id: 'black', name: 'Black', rulesetId: 'gen5', checkpoints: UNOVA, tradeEvolutions: false, source: 'PokéAPI wild encounters for Black, placed by location and level' },
  { id: 'white', name: 'White', rulesetId: 'gen5', checkpoints: UNOVA, tradeEvolutions: false, source: 'PokéAPI wild encounters for White, placed by location and level' },
  { id: 'renegade-platinum', name: 'Renegade Platinum', rulesetId: 'renegade-platinum', tradeEvolutions: true, source: "the Complete patch doc's encounter tables" },
  { id: 'unbound', name: 'Unbound', rulesetId: 'unbound', tradeEvolutions: true, source: "the Unbound location guide, timed by location from the Unbound wiki (data-src/romhacks/unbound/locations.json); water and swarm encounters aren't timed yet" },
];

export const gamesFor = (rulesetId: string) => GAMES.filter((g) => g.rulesetId === rulesetId);

/** What scripts and imports write: species id → earliest checkpoint it can be caught or received at */
export interface AvailabilityFile {
  game: string;
  /** Present for romhacks, whose checkpoints come from their trainer docs */
  checkpoints?: Checkpoint[];
  species: Record<string, number>;
  /** Obtainable, but the source doesn't say when (Unbound's wild encounters): never suggested, never flagged */
  untimed?: string[];
}
