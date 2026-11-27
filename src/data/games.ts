/**
 * Playthrough checkpoints per game: the next big battle you're preparing for, and the level its ace is at.
 * That level stands in for a level cap (the official games have none, but disobedience and the
 * trainers' levels make it the practical ceiling). Levels are each boss's ace on Bulbapedia; where a
 * later gym's ace is lower (Pryce), the cap stays at the earlier one so caps never go down.
 * Romhack checkpoints come from their trainer docs.
 */
export interface Checkpoint {
  label: string;
  levelCap: number;
  /** Bulbapedia pages whose story fight this checkpoint is (npm run fetch:trainers pins those fights here) */
  bosses?: string[];
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

/** `[label, cap, ...Bulbapedia pages]` rows → checkpoints */
const cps = (...rows: [string, number, ...string[]][]): Checkpoint[] =>
  rows.map(([label, levelCap, ...bosses]) => ({ label, levelCap, ...(bosses.length ? { bosses } : {}) }));

const KANTO_GYMS = ['Pewter_Gym', 'Cerulean_Gym', 'Vermilion_Gym', 'Celadon_Gym', 'Fuchsia_Gym', 'Saffron_Gym', 'Cinnabar_Gym', 'Viridian_Gym'];

/** Red/Blue, Yellow, and FireRed/LeafGreen share the story; Yellow's leaders run higher */
const kanto = (caps: number[], post: string): Checkpoint[] =>
  cps(
    ['Gym 1: Brock', caps[0], 'Pewter_Gym'],
    ['Gym 2: Misty', caps[1], 'Cerulean_Gym'],
    ['Gym 3: Lt. Surge', caps[2], 'Vermilion_Gym'],
    ['Gym 4: Erika', caps[3], 'Celadon_Gym'],
    ['Gym 5: Koga', caps[4], 'Fuchsia_Gym'],
    ['Gym 6: Sabrina', caps[5], 'Saffron_Gym'],
    ['Gym 7: Blaine', caps[6], 'Cinnabar_Gym'],
    ['Gym 8: Giovanni', caps[7], 'Viridian_Gym'],
    ['Elite Four & Champion', caps[8]],
    [post, 100],
  );
const KANTO_RB = kanto([14, 21, 24, 29, 43, 43, 47, 50, 65], 'Post-game');
const KANTO_Y = kanto([12, 21, 28, 32, 50, 50, 54, 55, 65], 'Post-game');
const KANTO_FRLG = kanto([14, 21, 24, 29, 43, 43, 47, 50, 63], 'Post-game (Sevii Islands)');

const johto = (caps: number[]): Checkpoint[] =>
  cps(
    ['Gym 1: Falkner', caps[0], 'Violet_Gym'],
    ['Gym 2: Bugsy', caps[1], 'Azalea_Gym'],
    ['Gym 3: Whitney', caps[2], 'Goldenrod_Gym'],
    ['Gym 4: Morty', caps[3], 'Ecruteak_Gym'],
    ['Gym 5: Chuck', caps[4], 'Cianwood_Gym'],
    ['Gym 6: Jasmine', caps[5], 'Olivine_Gym'],
    ['Gym 7: Pryce', caps[6], 'Mahogany_Gym'],
    ['Gym 8: Clair', caps[7], 'Blackthorn_Gym'],
    ['Elite Four & Lance', caps[8]],
    ['Kanto Gyms', caps[9], ...KANTO_GYMS],
    ['Red', caps[10], 'Red_(game)'],
  );
const JOHTO_GSC = johto([9, 16, 20, 25, 30, 35, 35, 40, 50, 58, 81]);
const JOHTO_HGSS = johto([13, 17, 19, 25, 31, 35, 35, 41, 50, 60, 88]);

const hoenn = (caps: number[], gym8: string, champion: string, post: string): Checkpoint[] =>
  cps(
    ['Gym 1: Roxanne', caps[0], 'Rustboro_Gym'],
    ['Gym 2: Brawly', caps[1], 'Dewford_Gym'],
    ['Gym 3: Wattson', caps[2], 'Mauville_Gym'],
    ['Gym 4: Flannery', caps[3], 'Lavaridge_Gym'],
    ['Gym 5: Norman', caps[4], 'Petalburg_Gym'],
    ['Gym 6: Winona', caps[5], 'Fortree_Gym'],
    ['Gym 7: Tate & Liza', caps[6], 'Mossdeep_Gym'],
    [`Gym 8: ${gym8}`, caps[7], 'Sootopolis_Gym'],
    [`Elite Four & ${champion}`, caps[8]],
    [post, 100],
  );
const HOENN_RS = hoenn([15, 18, 23, 28, 31, 33, 42, 43, 58], 'Wallace', 'Steven', 'Post-game');
const HOENN_E = hoenn([15, 19, 24, 29, 31, 33, 42, 46, 58], 'Juan', 'Wallace', 'Post-game');
const HOENN_ORAS = hoenn([14, 16, 21, 28, 30, 35, 45, 46, 59], 'Wallace', 'Steven', 'Post-game (Delta Episode)');

/** Diamond/Pearl (and their remakes) and Platinum take the gyms in a different order */
const SINNOH_DP = cps(
  ['Gym 1: Roark', 14, 'Oreburgh_Gym'],
  ['Gym 2: Gardenia', 22, 'Eterna_Gym'],
  ['Gym 3: Maylene', 30, 'Veilstone_Gym'],
  ['Gym 4: Crasher Wake', 30, 'Pastoria_Gym'],
  ['Gym 5: Fantina', 36, 'Hearthome_Gym'],
  ['Gym 6: Byron', 39, 'Canalave_Gym'],
  ['Gym 7: Candice', 42, 'Snowpoint_Gym'],
  ['Gym 8: Volkner', 49, 'Sunyshore_Gym'],
  ['Elite Four & Cynthia', 66],
  ['Post-game', 100],
);
const SINNOH_PT = cps(
  ['Gym 1: Roark', 14, 'Oreburgh_Gym'],
  ['Gym 2: Gardenia', 22, 'Eterna_Gym'],
  ['Gym 3: Fantina', 26, 'Hearthome_Gym'],
  ['Gym 4: Maylene', 32, 'Veilstone_Gym'],
  ['Gym 5: Crasher Wake', 37, 'Pastoria_Gym'],
  ['Gym 6: Byron', 41, 'Canalave_Gym'],
  ['Gym 7: Candice', 44, 'Snowpoint_Gym'],
  ['Gym 8: Volkner', 50, 'Sunyshore_Gym'],
  ['Elite Four & Cynthia', 62],
  ['Post-game', 100],
);

const UNOVA: Checkpoint[] = cps(
  ['Gym 1: Striaton trio', 14, 'Striaton_Gym'],
  ['Gym 2: Lenora', 20, 'Nacrene_Gym'],
  ['Gym 3: Burgh', 23, 'Castelia_Gym'],
  ['Gym 4: Elesa', 27, 'Nimbasa_Gym'],
  ['Gym 5: Clay', 31, 'Driftveil_Gym'],
  ['Gym 6: Skyla', 35, 'Mistralton_Gym'],
  ['Gym 7: Brycen', 39, 'Icirrus_Gym'],
  ['Gym 8: Drayden', 43, 'Opelucid_Gym'],
  ['Elite Four, N & Ghetsis', 54],
  ['Post-game', 75],
);

/** Black 2/White 2, Normal Mode */
const UNOVA2 = cps(
  ['Gym 1: Cheren', 13, 'Aspertia_Gym'],
  ['Gym 2: Roxie', 18, 'Virbank_Gym'],
  ['Gym 3: Burgh', 24, 'Castelia_Gym'],
  ['Gym 4: Elesa', 30, 'Nimbasa_Gym'],
  ['Gym 5: Clay', 33, 'Driftveil_Gym'],
  ['Gym 6: Skyla', 39, 'Mistralton_Gym'],
  ['Gym 7: Drayden', 48, 'Opelucid_Gym'],
  ['Gym 8: Marlon', 51, 'Humilau_Gym'],
  ['Elite Four & Iris', 59],
  ['Post-game', 100],
);

const KALOS = cps(
  ['Gym 1: Viola', 12, 'Santalune_Gym'],
  ['Gym 2: Grant', 25, 'Cyllage_Gym'],
  ['Gym 3: Korrina', 32, 'Shalour_Gym'],
  ['Gym 4: Ramos', 34, 'Coumarine_Gym'],
  ['Gym 5: Clemont', 37, 'Lumiose_Gym'],
  ['Gym 6: Valerie', 42, 'Laverre_Gym'],
  ['Gym 7: Olympia', 48, 'Anistar_Gym'],
  ['Gym 8: Wulfric', 59, 'Snowbelle_Gym'],
  ['Elite Four & Diantha', 68],
  ['Post-game', 100],
);

/** Alola has trials instead of gyms; the kahunas' grand trials are the big fights */
const alola = (caps: number[], champion: string): Checkpoint[] =>
  cps(
    ["Ilima's trial", caps[0], 'Ilima'],
    ["Hala's grand trial", caps[1], 'Hala'],
    ["Olivia's grand trial", caps[2], 'Olivia'],
    ["Nanu's grand trial", caps[3], 'Nanu'],
    ["Hapu's grand trial", caps[4], 'Hapu'],
    [`Elite Four & ${champion}`, caps[5]],
    ['Post-game', 100],
  );
const ALOLA_SM = alola([10, 15, 27, 39, 48, 58], 'Kukui');
const ALOLA_USUM = alola([11, 16, 28, 44, 54, 60], 'Hau');

/** Sword and Shield swap gyms 4 and 6 */
const galar = (gym4: string, gym6: string): Checkpoint[] =>
  cps(
    ['Gym 1: Milo', 20, 'Milo'],
    ['Gym 2: Nessa', 24, 'Nessa'],
    ['Gym 3: Kabu', 27, 'Kabu'],
    [`Gym 4: ${gym4}`, 36, gym4],
    ['Gym 5: Opal', 38, 'Opal'],
    [`Gym 6: ${gym6}`, 42, gym6],
    ['Gym 7: Piers', 46, 'Piers'],
    ['Gym 8: Raihan', 48, 'Raihan'],
    ['Champion Cup & Leon', 65],
    ['Post-game', 100],
    ['The Isle of Armor', 100],
    ['The Crown Tundra', 100],
  );
const GALAR_SW = galar('Bea', 'Gordie');
const GALAR_SH = galar('Allister', 'Melony');

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

const wild = (name: string) => `PokéAPI wild encounters and gifts for ${name}, placed by location and level`;
const official = (rulesetId: string, checkpoints: Checkpoint[], ...games: [id: string, name: string][]): GameInfo[] =>
  games.map(([id, name]) => ({ id, name, rulesetId, checkpoints, tradeEvolutions: false, source: wild(name) }));

export const GAMES: GameInfo[] = [
  ...official('gen1', KANTO_RB, ['red', 'Red'], ['blue', 'Blue']),
  ...official('gen1', KANTO_Y, ['yellow', 'Yellow']),
  ...official('gen2', JOHTO_GSC, ['gold', 'Gold'], ['silver', 'Silver']),
  ...official('gen2', JOHTO_GSC, ['crystal', 'Crystal']).map((g) => ({ ...g, source: `${wild('Crystal')}; Gold and Silver's fill gaps in PokéAPI's Crystal data` })),
  ...official('gen3', HOENN_RS, ['ruby', 'Ruby'], ['sapphire', 'Sapphire']),
  ...official('gen3', HOENN_E, ['emerald', 'Emerald']),
  ...official('gen3', KANTO_FRLG, ['firered', 'FireRed'], ['leafgreen', 'LeafGreen']),
  ...official('gen4', SINNOH_DP, ['diamond', 'Diamond'], ['pearl', 'Pearl']),
  ...official('gen4', SINNOH_PT, ['platinum', 'Platinum']),
  ...official('gen4', JOHTO_HGSS, ['heartgold', 'HeartGold'], ['soulsilver', 'SoulSilver']),
  { id: 'black', name: 'Black', rulesetId: 'gen5', checkpoints: UNOVA, tradeEvolutions: false, source: 'PokéAPI wild encounters for Black, placed by location and level' },
  { id: 'white', name: 'White', rulesetId: 'gen5', checkpoints: UNOVA, tradeEvolutions: false, source: 'PokéAPI wild encounters for White, placed by location and level' },
  ...official('gen5', UNOVA2, ['black-2', 'Black 2'], ['white-2', 'White 2']),
  ...official('gen6', KALOS, ['x', 'X'], ['y', 'Y']),
  ...official('gen6', HOENN_ORAS, ['omega-ruby', 'Omega Ruby'], ['alpha-sapphire', 'Alpha Sapphire']).map((g) => ({
    ...g,
    source: `${wild(g.name)}, plus ${g.id === 'omega-ruby' ? 'Ruby' : 'Sapphire'}'s wild tables, which the remakes keep and PokéAPI's ORAS data mostly lacks`,
  })),
  ...official('gen7', ALOLA_SM, ['sun', 'Sun'], ['moon', 'Moon']),
  ...official('gen7', ALOLA_USUM, ['ultra-sun', 'Ultra Sun'], ['ultra-moon', 'Ultra Moon']),
  ...official('gen8', GALAR_SW, ['sword', 'Sword']),
  ...official('gen8', GALAR_SH, ['shield', 'Shield']),
  // BDSP's Sinnoh dex isn't in Sword/Shield's, so it plays under the National Dex ruleset.
  // PokéAPI has no BDSP encounters; the remakes keep Diamond/Pearl's, so those stand in
  ...official('gen8natdex', SINNOH_DP, ['brilliant-diamond', 'Brilliant Diamond'], ['shining-pearl', 'Shining Pearl']).map((g) => ({
    ...g,
    source: `PokéAPI wild encounters and gifts for ${g.id === 'brilliant-diamond' ? 'Diamond' : 'Pearl'}, which BDSP keeps (the Grand Underground isn't counted), placed by location and level`,
  })),
  { id: 'scarlet', name: 'Scarlet', rulesetId: 'gen9', checkpoints: PALDEA, tradeEvolutions: false, source: "PokéAPI's Paldea, Kitakami, and Blueberry Pokédexes; Bulbapedia's version exclusives" },
  { id: 'violet', name: 'Violet', rulesetId: 'gen9', checkpoints: PALDEA, tradeEvolutions: false, source: "PokéAPI's Paldea, Kitakami, and Blueberry Pokédexes; Bulbapedia's version exclusives" },
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
