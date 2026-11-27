// Story order for npm run fetch:availability: the checkpoint index (see src/data/games.ts) you're preparing
// for when you can first reach each PokéAPI location. Unlisted locations count as post-game.
//
// Several games share a list where they share a route through the region (Red/Blue, Yellow, and
// FireRed/LeafGreen; Diamond/Pearl and Platinum, whose gyms differ but whose roads don't).
// Gates say when an encounter method opens up: the rods, Surf, and so on.

export interface Gates {
  oldRod?: number;
  goodRod?: number;
  superRod?: number;
  surf?: number;
  dive?: number;
  rockSmash?: number;
  headbutt?: number;
}

/** Red/Blue/Yellow and FireRed/LeafGreen (0 = preparing for Brock … 8 = Elite Four) */
export const KANTO: Record<string, number> = {
  'pallet-town': 0, 'kanto-route-1': 0, 'viridian-city': 0, 'kanto-route-22': 0, 'kanto-route-2': 0, 'viridian-forest': 0, 'pewter-city': 0,
  'kanto-route-3': 1, 'mt-moon': 1, 'kanto-route-4': 1, 'cerulean-city': 1, 'kanto-route-24': 1, 'kanto-route-25': 1,
  'kanto-route-5': 2, 'kanto-underground-path': 2, 'kanto-route-6': 2, 'vermilion-city': 2, 'ss-anne': 2, 'kanto-route-11': 2, 'digletts-cave': 2,
  'kanto-route-9': 3, 'rock-tunnel': 3, 'kanto-route-10': 3, 'lavender-town': 3, 'kanto-route-8': 3, 'kanto-route-7': 3, 'celadon-city': 3,
  // the Poké Flute (after Pokémon Tower) clears Snorlax off Routes 12 and 16
  'pokemon-tower': 4, 'kanto-route-12': 4, 'kanto-route-13': 4, 'kanto-route-14': 4, 'kanto-route-15': 4, 'kanto-route-16': 4,
  'kanto-route-17': 4, 'kanto-route-18': 4, 'fuchsia-city': 4, 'kanto-safari-zone': 4, 'saffron-city': 4,
  'kanto-sea-route-19': 5, 'kanto-sea-route-20': 5, 'seafoam-islands': 5, 'kanto-power-plant': 5,
  'cinnabar-island': 6, 'pokemon-mansion': 6, 'kanto-sea-route-21': 6,
  // FireRed/LeafGreen: the first three Sevii Islands open after Blaine
  'one-island': 7, 'kindle-road': 7, 'treasure-beach': 7, 'mt-ember': 7, 'two-island': 7, 'cape-brink': 7, 'three-island': 7, 'bond-bridge': 7, 'berry-forest': 7, 'three-isle-port': 7,
  'kanto-route-23': 8, 'kanto-victory-road-1': 8, 'kanto-victory-road-2': 8, 'indigo-plateau': 8,
};
export const KANTO_GATES: Gates = { oldRod: 2, goodRod: 4, superRod: 4, surf: 4 };

/** Gold/Silver/Crystal and HeartGold/SoulSilver (0 = Falkner … 8 = Elite Four, 9 = Kanto, 10 = Red); Kanto is unlisted, so post-game */
export const JOHTO: Record<string, number> = {
  'new-bark-town': 0, 'johto-route-29': 0, 'cherrygrove-city': 0, 'johto-route-30': 0, 'johto-route-31': 0, 'dark-cave': 0, 'violet-city': 0, 'sprout-tower': 0, 'johto-route-46': 0,
  'johto-route-32': 1, 'ruins-of-alph': 1, 'union-cave': 1, 'johto-route-33': 1, 'azalea-town': 1, 'slowpoke-well': 1,
  'ilex-forest': 2, 'johto-route-34': 2, 'goldenrod-city': 2, 'goldenrod-tunnel': 2, 'johto-route-35': 2, 'national-park': 2, 'pokeathlon-dome': 2,
  'johto-route-36': 3, 'johto-route-37': 3, 'ecruteak-city': 3, 'burned-tower': 3, 'bellchime-trail': 3, 'johto-route-38': 3, 'johto-route-39': 3, 'olivine-city': 3, 'johto-lighthouse': 3,
  // Surf after Morty opens the sea to Cianwood and Route 42 east of Ecruteak
  'johto-sea-route-40': 4, 'johto-sea-route-41': 4, 'cianwood-city': 4, 'whirl-islands': 4, 'johto-route-47': 4, 'johto-route-48': 4,
  'cliff-cave': 4, 'cliff-edge-gate': 4, 'safari-zone-gate': 4, 'johto-safari-zone': 4,
  'johto-route-42': 4, 'mt-mortar': 4, 'mahogany-town': 4, 'johto-route-43': 4, 'lake-of-rage': 4,
  'team-rocket-hq': 5,
  'johto-route-44': 7, 'ice-path': 7, 'blackthorn-city': 7, 'dragons-den': 7, 'johto-route-45': 7, 'radio-tower': 7,
  'johto-route-27': 8, 'johto-route-26': 8, 'tohjo-falls': 8, 'kanto-route-23': 8, 'kanto-victory-road-1': 8, 'kanto-victory-road-2': 8, 'indigo-plateau': 8,
  'mt-silver': 10, 'mt-silver-cave': 10,
};
export const JOHTO_GATES: Gates = { oldRod: 1, goodRod: 3, superRod: 9, surf: 4, rockSmash: 3, headbutt: 2 };

/** Ruby/Sapphire/Emerald and Omega Ruby/Alpha Sapphire (0 = Roxanne … 8 = Elite Four) */
export const HOENN: Record<string, number> = {
  'littleroot-town': 0, 'hoenn-route-101': 0, 'oldale-town': 0, 'hoenn-route-103': 0, 'hoenn-route-102': 0, 'petalburg-city': 0,
  'hoenn-route-104': 0, 'petalburg-woods': 0, 'rustboro-city': 0, 'hoenn-route-116': 0,
  'rusturf-tunnel': 1, 'dewford-town': 1, 'hoenn-route-106': 1, 'granite-cave': 1,
  'hoenn-route-109': 2, 'slateport-city': 2, 'hoenn-route-110': 2, 'mauville-city': 2, 'hoenn-route-117': 2, 'verdanturf-town': 2, 'hoenn-route-118': 2,
  'hoenn-route-111': 3, 'hoenn-route-112': 3, 'fiery-path': 3, 'hoenn-route-113': 3, 'fallarbor-town': 3, 'hoenn-route-114': 3,
  'meteor-falls': 3, 'hoenn-route-115': 3, 'mt-chimney': 3, 'jagged-pass': 3, 'lavaridge-town': 3,
  // Flannery's badge and the Go-Goggles open the desert
  'mirage-tower': 4,
  // Surf after Norman
  'hoenn-route-105': 5, 'hoenn-route-107': 5, 'hoenn-route-108': 5, 'abandoned-ship': 5, 'new-mauville': 5,
  'hoenn-route-119': 5, 'fortree-city': 5, 'hoenn-route-120': 5, 'scorched-slab': 5,
  'hoenn-route-121': 6, 'hoenn-safari-zone': 6, 'lilycove-city': 6, 'mt-pyre': 6, 'hoenn-route-122': 6, 'hoenn-route-123': 6,
  'team-aqua-hideout': 6, 'team-magma-hideout': 6, 'magma-hideout': 6, 'hoenn-route-124': 6, 'mossdeep-city': 6, 'hoenn-route-125': 6, 'shoal-cave': 6, 'mossdeep-space-center': 6,
  'hoenn-route-126': 7, 'hoenn-route-127': 7, 'hoenn-route-128': 7, 'seafloor-cavern': 7, 'sootopolis-city': 7, 'cave-of-origin': 7, 'underwater': 7,
  'hoenn-route-129': 7, 'hoenn-route-130': 7, 'hoenn-route-131': 7, 'pacifidlog-town': 7, 'hoenn-route-132': 7, 'hoenn-route-133': 7, 'hoenn-route-134': 7, 'sky-pillar': 7,
  'ever-grande-city': 8, 'hoenn-victory-road': 8, 'hoenn-pokemon-league': 8,
};
export const HOENN_GATES: Gates = { oldRod: 1, goodRod: 2, superRod: 6, surf: 5, dive: 7, rockSmash: 2 };

/** Diamond/Pearl/Platinum, and BDSP through Diamond/Pearl (0 = Roark … 8 = Elite Four) */
export const SINNOH: Record<string, number> = {
  'twinleaf-town': 0, 'sinnoh-route-201': 0, 'lake-verity': 0, 'verity-lakefront': 0, 'sandgem-town': 0, 'sinnoh-route-202': 0,
  'jubilife-city': 0, 'sinnoh-route-203': 0, 'oreburgh-gate': 0, 'oreburgh-city': 0, 'oreburgh-mine': 0,
  'sinnoh-route-204': 1, 'floaroma-town': 1, 'floaroma-meadow': 1, 'sinnoh-route-205': 1, 'valley-windworks': 1, 'eterna-forest': 1, 'eterna-city': 1, 'old-chateau': 1,
  'sinnoh-route-206': 2, 'wayward-cave': 2, 'sinnoh-route-207': 2, 'mt-coronet': 2, 'sinnoh-route-208': 2, 'hearthome-city': 2, 'amity-square': 2,
  'sinnoh-route-209': 2, 'lost-tower': 2, 'solaceon-town': 2, 'solaceon-ruins': 2, 'sinnoh-route-210': 2, 'sinnoh-route-215': 2, 'veilstone-city': 2,
  'sinnoh-route-214': 3, 'valor-lakefront': 3, 'sinnoh-route-213': 3, 'pastoria-city': 3, 'great-marsh': 3, 'sinnoh-route-212': 3, 'trophy-garden': 3,
  'celestic-town': 4, 'ruin-maniac-cave': 4, 'maniac-tunnel': 4, 'sinnoh-route-211': 4, 'lake-valor': 4, 'fuego-ironworks': 4,
  'canalave-city': 5, 'iron-island': 5, 'sinnoh-route-218': 5,
  'sinnoh-route-216': 6, 'sinnoh-route-217': 6, 'acuity-lakefront': 6, 'snowpoint-city': 6, 'lake-acuity': 6,
  'galactic-hq': 7, 'spear-pillar': 7, 'sinnoh-route-222': 7, 'sunyshore-city': 7, 'sinnoh-route-219': 7, 'sinnoh-sea-route-220': 7, 'sinnoh-route-221': 7,
  'sinnoh-sea-route-223': 8, 'sinnoh-victory-road': 8, 'sinnoh-pokemon-league': 8,
};
export const SINNOH_GATES: Gates = { oldRod: 0, goodRod: 2, superRod: 9, surf: 4, rockSmash: 1 };

/** Black/White (0 = Striaton trio … 8 = Elite Four, N & Ghetsis) */
export const UNOVA: Record<string, number> = {
  'nuvema-town': 0, 'unova-route-1': 0, 'accumula-town': 0, 'unova-route-2': 0, 'striaton-city': 0,
  dreamyard: 1, 'unova-route-3': 1, 'wellspring-cave': 1, 'nacrene-city': 1,
  'pinwheel-forest': 2, 'skyarrow-bridge': 2, 'castelia-city': 2,
  'unova-route-4': 3, 'desert-resort': 3, 'relic-castle': 3, 'nimbasa-city': 3,
  'unova-route-5': 4, 'driftveil-drawbridge': 4, 'driftveil-city': 4, 'cold-storage': 4,
  'unova-route-6': 5, 'chargestone-cave': 5, 'mistralton-city': 5,
  'unova-route-7': 6, 'celestial-tower': 6, 'twist-mountain': 6, 'icirrus-city': 6, 'mistralton-cave': 6,
  'dragonspiral-tower': 7, 'unova-route-8': 7, 'moor-of-icirrus': 7, 'tubeline-bridge': 7, 'unova-route-9': 7, 'opelucid-city': 7, 'unova-shopping-mall': 7,
  'unova-route-10': 8, 'unova-victory-road': 8, 'unova-pokemon-league': 8,
};
/** Black/White's rods all come after the credits */
export const UNOVA_GATES: Gates = { oldRod: 9, goodRod: 9, superRod: 9, surf: 6 };

/** Black 2/White 2 start in the south-west and loop the other way (0 = Cheren … 8 = Elite Four) */
export const UNOVA2: Record<string, number> = {
  'aspertia-city': 0, 'unova-route-19': 0, 'floccesy-town': 0, 'unova-route-20': 0, 'floccesy-ranch': 0,
  'virbank-city': 1, 'virbank-complex': 1, 'pokestar-studios': 1,
  'castelia-city': 2, 'castelia-sewers': 2, 'unova-route-4': 2, 'desert-resort': 2, 'relic-castle': 2, 'join-avenue': 2,
  'nimbasa-city': 3, 'unova-route-16': 3, 'lostlorn-forest': 3, 'unova-route-5': 3, 'driftveil-drawbridge': 3,
  'driftveil-city': 4, 'unova-route-6': 4, 'relic-passage': 4, 'clay-tunnel': 4,
  'chargestone-cave': 5, 'mistralton-city': 5, 'unova-route-7': 5, 'celestial-tower': 5,
  'lentimas-town': 6, 'reversal-mountain': 6, 'strange-house': 6, 'undella-town': 6, 'undella-bay': 6, 'unova-route-13': 6, 'lacunosa-town': 6,
  'unova-route-12': 6, 'village-bridge': 6, 'unova-route-11': 6, 'opelucid-city': 6, 'unova-route-9': 6, 'unova-shopping-mall': 6,
  'seaside-cave': 7, 'unova-route-21': 7, 'humilau-city': 7, 'unova-route-22': 7,
  'giant-chasm': 8, 'plasma-frigate': 8, 'unova-route-23': 8, 'unova-victory-road-2': 8, 'unova-pokemon-league': 8,
};
export const UNOVA2_GATES: Gates = { oldRod: 9, goodRod: 9, superRod: 9, surf: 6 };

/** X/Y (0 = Viola … 8 = Elite Four) */
export const KALOS: Record<string, number> = {
  'vaniville-town': 0, 'kalos-route-1': 0, 'aquacorde-town': 0, 'kalos-route-2': 0, 'santalune-forest': 0, 'kalos-route-3': 0, 'santalune-city': 0,
  'kalos-route-4': 1, 'lumiose-city': 1, 'kalos-route-5': 1, 'camphrier-town': 1, 'kalos-route-6': 1, 'parfum-palace': 1, 'kalos-route-7': 1,
  'connecting-cave': 1, 'kalos-route-8': 1, 'ambrette-town': 1, 'ambrette-aquarium': 1, 'kalos-route-9': 1, 'glittering-cave': 1, 'cyllage-city': 1,
  'kalos-route-10': 2, 'geosenge-town': 2, 'kalos-route-11': 2, 'reflection-cave': 2, 'shalour-city': 2, 'tower-of-mastery': 2,
  'kalos-route-12': 3, 'azure-bay': 3, 'coumarine-city': 3,
  'kalos-route-13': 4, 'kalos-power-plant': 4, 'lumiose-badlands': 4,
  'kalos-route-14': 5, 'laverre-city': 5, 'poke-ball-factory': 5,
  'kalos-route-15': 6, 'lost-hotel': 6, 'kalos-route-16': 6, 'dendemille-town': 6, 'frost-cavern': 6, 'kalos-route-17': 6, 'anistar-city': 6,
  'kalos-route-18': 7, 'couriway-town': 7, 'kalos-route-19': 7, 'snowbelle-city': 7, 'kalos-route-20': 7, 'pokemon-village': 7, 'winding-woods': 7, 'team-flare-secret-hq': 7,
  'kalos-route-21': 8, 'kalos-victory-road': 8, 'kalos-pokemon-league': 8,
};
export const KALOS_GATES: Gates = { oldRod: 1, goodRod: 1, superRod: 3, surf: 3, rockSmash: 1 };

/** Sun/Moon and Ultra Sun/Ultra Moon by island (0 = Ilima … 4 = Hapu, 5 = Elite Four) */
export const ALOLA: Record<string, number> = {
  'iki-town': 0, 'mahalo-trail': 0, 'mahalo-trail--plank-bridge': 0, 'alola-route-1': 0, 'alola-route-1--hauoli-outskirts': 0, 'hauoli-city': 0,
  'hauoli-city--beachfront': 0, 'hauoli-city--shopping-district': 0, 'hauoli-city--marina': 0, 'alola-route-2': 0, 'hauoli-cemetery': 0,
  'verdant-cavern': 0, 'verdant-cavern--trial-site': 0, 'verdant-cavern--totems-den': 0, 'alola-berry-fields': 0,
  'alola-route-3': 1, 'melemele-meadow': 1, 'seaward-cave': 1, 'kalae-bay': 1, 'ten-carat-hill': 1, 'melemele-sea': 1,
  'heahea-city': 2, 'heahea-beach': 2, 'alola-route-4': 2, 'paniola-town': 2, 'paniola-ranch': 2, 'alola-route-5': 2, 'brooklet-hill': 2, 'brooklet-hill--totems-den': 2,
  'alola-route-6': 2, 'alola-route-7': 2, 'wela-volcano-park': 2, 'wela-volcano-park--totems-den': 2, 'alola-route-8': 2, 'lush-jungle': 2, 'digletts-tunnel': 2,
  'alola-route-9': 2, 'memorial-hill': 2, 'akala-outskirts': 2, 'konikoni-city': 2, 'hano-grand-resort': 2, 'hano-beach': 2, 'royal-avenue': 2, 'battle-royal-dome': 2, 'dividing-peak-tunnel': 2,
  'malie-city': 3, 'malie-city-proper': 3, 'malie-city--outer-cape': 3, 'malie-garden': 3, 'alola-route-10': 3, 'mount-hokulani': 3, 'hokulani-observatory': 3,
  'alola-route-11': 3, 'alola-route-12': 3, 'secluded-shore': 3, 'alola-route-13': 3, 'blush-mountain': 3, 'haina-desert': 3, 'tapu-village': 3,
  'alola-route-14': 3, 'alola-route-15': 3, 'alola-route-16': 3, 'alola-route-17': 3, 'ulaula-meadow': 3, 'ulaula-beach': 3,
  'thrifty-megamart': 3, 'thrifty-megamart--abandoned-site': 3, 'po-town': 3, 'shady-house': 3,
  'seafolk-village': 4, 'poni-wilds': 4, 'ancient-poni-path': 4, 'poni-breaker-coast': 4, 'exeggutor-island': 4, 'vast-poni-canyon': 4,
  'altar-of-the-sunne': 4, 'altar-of-the-moone': 4, 'aether-paradise': 4, 'ultra-megalopolis': 4,
  'mount-lanakila': 5, 'alola-pokemon-league': 5,
};
/** Lana's trial brings the fishing rod and Lapras Paddle */
export const ALOLA_GATES: Gates = { oldRod: 2, goodRod: 2, superRod: 2, surf: 2 };

/** Sword/Shield (0 = Milo … 8 = Champion Cup); the Wild Area is open from the start, and levels sort out what you can catch */
export const GALAR: Record<string, number> = {
  postwick: 0, wedgehurst: 0, 'galar-route-1': 0, 'galar-route-2': 0, 'slumbering-weald': 0, 'meetup-spot': 0, motostoke: 0, 'motostoke-outskirts': 0,
  'rolling-fields': 0, 'dappled-grove': 0, 'watchtower-ruins': 0, 'east-lake-axewell': 0, 'west-lake-axewell': 0, 'axews-eye': 0, 'south-lake-miloch': 0,
  'giants-seat': 0, 'north-lake-miloch': 0, 'motostoke-riverbank': 0, 'bridge-field': 0, 'stony-wilderness': 0, 'dusty-bowl': 0,
  'giants-mirror': 0, 'hammerlocke-hills': 0, 'giants-cap': 0, 'lake-of-outrage': 0, 'roaming-galar-wild-area': 0, 'galar-wild-area-max-dens': 0,
  'galar-route-3': 0, 'galar-mine': 0, 'galar-route-4': 0, turffield: 0,
  'galar-route-5': 1, hulbury: 1, 'galar-mine-no-2': 1,
  hammerlocke: 3, 'galar-route-6': 3, 'stow-on-side': 3,
  'glimwood-tangle': 4, ballonlea: 4,
  'galar-route-7': 5, 'galar-route-8': 5, 'steamdrift-way': 5, circhester: 5,
  'galar-route-9': 6, spikemuth: 6,
  'energy-plant': 7,
  'galar-route-10': 8, wyndon: 8,
};
export const GALAR_GATES: Gates = { oldRod: 0, goodRod: 0, superRod: 0, surf: 8 };
