// Fetches when Pokémon become obtainable in each official game with playthrough support and writes
// data-src/availability/<game>.json (species id → earliest checkpoint in src/data/games.ts).
// Run: npm run fetch:availability   (PokéAPI responses are cached in node_modules/.cache/pokeapi; --fresh refetches)
//
// Scarlet/Violet: PokéAPI's regional dexes (Paldea, Kitakami, Blueberry) plus the version-exclusive
// tables from Bulbapedia's Scarlet and Violet page. The games are open world, so a Paldea Pokémon
// counts as available from the start; its evolutions are gated by level cap in the app.
// Every other game: PokéAPI's encounters (wild, gifts, trades, static), placed by location
// (story order in scripts/lib/story-order.ts), by when the method opens (rods, Surf), and by level.
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import type { GenerationNum } from '@pkmn/data';
import { GAMES, PALDEA_CHECKPOINT, type AvailabilityFile } from '../src/data/games';
import { createOfficialRuleset } from '../src/rulesets/official';
import type { Ruleset } from '../src/rulesets/types';
import * as story from './lib/story-order';

const OUT = 'data-src/availability';
const CACHE = 'node_modules/.cache/pokeapi';
const FRESH = process.argv.includes('--fresh');
const POKEAPI = 'https://pokeapi.co/api/v2';
const BULBAPEDIA = 'https://bulbapedia.bulbagarden.net/w/api.php';
const HEADERS = { 'User-Agent': 'PokePlanner/0.1 (personal non-commercial project)' };
const warnings: string[] = [];

async function getJson<T>(url: string): Promise<T> {
  // PokéAPI's data barely changes, and a full run is a few thousand requests: keep them on disk
  const file = url.startsWith(POKEAPI) ? `${CACHE}/${createHash('sha1').update(url).digest('hex')}.json` : undefined;
  if (file && !FRESH) {
    try {
      return JSON.parse(await readFile(file, 'utf8')) as T;
    } catch {
      // not cached yet
    }
  }
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { headers: HEADERS });
    if (res.ok) {
      const text = await res.text();
      if (file) {
        await mkdir(CACHE, { recursive: true });
        await writeFile(file, text);
      }
      return JSON.parse(text) as T;
    }
    if (attempt >= 2 || res.status === 404) throw new Error(`${url}: HTTP ${res.status}`);
    await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
  }
}

/** Run `fn` over `items` a few at a time, to stay polite to PokéAPI */
async function pooled<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size) out.push(...(await Promise.all(items.slice(i, i + size).map(fn))));
  return out;
}

const toID = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** PokéAPI slug ("basculin-red-striped", "deerling-spring") → @pkmn species id, dropping form suffixes until one matches */
function speciesId(rs: Ruleset, slug: string): string | undefined {
  const parts = slug.split('-');
  for (let n = parts.length; n > 0; n--) {
    const sp = rs.getSpecies(toID(parts.slice(0, n).join('-')));
    if (sp) return sp.id;
  }
  warnings.push(`${rs.name}: no species for "${slug}"`);
}

const setEarliest = (map: Record<string, number>, id: string, at: number) => {
  if (map[id] === undefined || at < map[id]) map[id] = at;
};

// ---------------------------------------------------------------------------------------------
// Scarlet / Violet

interface DexResponse {
  pokemon_entries: { pokemon_species: { name: string } }[];
}

/** {{Moveentrytm|0984|Great Tusk|...}} rows under each version's table in one wikitext section */
async function exclusives(): Promise<Record<'scarlet' | 'violet', { name: string; part: string }[]>> {
  const page = await getJson<{ parse: { sections: { index: string; line: string }[] } }>(
    `${BULBAPEDIA}?action=parse&page=Pok%C3%A9mon_Scarlet_and_Violet&prop=sections&format=json`,
  );
  const section = page.parse.sections.find((s) => /Version-exclusive/.test(s.line))?.index;
  if (!section) throw new Error('Bulbapedia: no version-exclusive section');
  const { parse } = await getJson<{ parse: { wikitext: { '*': string } } }>(
    `${BULBAPEDIA}?action=parse&page=Pok%C3%A9mon_Scarlet_and_Violet&prop=wikitext&section=${section}&format=json`,
  );
  const out: Record<'scarlet' | 'violet', { name: string; part: string }[]> = { scarlet: [], violet: [] };
  let part = 'base';
  let version: 'scarlet' | 'violet' | undefined;
  for (const line of parse.wikitext['*'].split('\n')) {
    const heading = line.match(/^====\s*\[\[(?:[^|\]]*\|)?([^\]]+)\]\]\s*====/);
    if (heading) part = heading[1];
    if (/\{\{color\|FFF\|Scarlet\}\}/.test(line)) version = 'scarlet';
    if (/\{\{color\|FFF\|Violet\}\}/.test(line)) version = 'violet';
    const row = line.match(/^\{\{Moveentrytm\|\d+\|(?:form=([^|]*)\|)?([^|]+)\|(?:.*?form=([^|}]*))?/);
    if (row && version) out[version].push({ name: row[2] + (row[1] ?? row[3] ?? ''), part });
  }
  return out;
}

async function scarletViolet() {
  const rs = createOfficialRuleset(9);
  const dex = async (name: string) =>
    (await getJson<DexResponse>(`${POKEAPI}/pokedex/${name}`)).pokemon_entries.map((e) => e.pokemon_species.name);
  const [paldea, kitakami, blueberry, excl] = await Promise.all([dex('paldea'), dex('kitakami'), dex('blueberry'), exclusives()]);

  // every non-battle-only form of a dex species (Paldean Wooper and Kantonian Wooper alike)
  const forms = (slug: string) => {
    const base = speciesId(rs, slug);
    if (!base) return [];
    return rs.species().filter((s) => s.id === base || (s.id.startsWith(base) && !s.battleOnly && rs.getSpecies(base)?.num === s.num)).map((s) => s.id);
  };
  // Paradox Pokémon and legendaries wait for Area Zero and the post-game
  const paradox = (id: string) => /^(great|scream|brute|flutter|slither|sandy|roaring|iron|walking|gouging|raging)/.test(id) && rs.getSpecies(id)!.num >= 984;
  const placement = (id: string, fallback: number) => {
    const sp = rs.getSpecies(id)!;
    if (paradox(id)) return Math.max(fallback, PALDEA_CHECKPOINT.areaZero);
    if (sp.legendary || ['tinglu', 'chienpao', 'wochien', 'chiyu'].includes(id)) return Math.max(fallback, PALDEA_CHECKPOINT.postgame);
    return fallback;
  };

  for (const version of ['scarlet', 'violet'] as const) {
    const other = excl[version === 'scarlet' ? 'violet' : 'scarlet'];
    const otherIds = new Set(other.map((e) => rs.getSpecies(e.name)?.id).filter(Boolean));
    const species: Record<string, number> = {};
    // dexes list every stage, but an open world doesn't put Talonflame in front of you at 2 badges:
    // only first stages (or stages whose pre-evolution isn't in that dex) count from dex membership,
    // and the app reaches the rest by evolving at the level cap
    const add = (slugs: string[], at: number) => {
      const inDex = new Set(slugs.flatMap(forms));
      for (const slug of slugs) {
        for (const id of forms(slug)) {
          const prevo = rs.getSpecies(id)!.prevo;
          if (otherIds.has(id) || (prevo && inDex.has(rs.getSpecies(prevo)!.id))) continue;
          setEarliest(species, id, placement(id, at));
        }
      }
    };
    add(paldea, 0);
    add(kitakami, PALDEA_CHECKPOINT.tealMask);
    add(blueberry, PALDEA_CHECKPOINT.indigoDisk);
    await write({ game: version, species });
  }
}

// ---------------------------------------------------------------------------------------------
// Every other game: encounters by location

interface Region {
  rulesetId: string;
  /** PokéAPI regions whose locations to read */
  regions: string[];
  /** Our game id → the PokéAPI versions whose encounters it has, each from a checkpoint on (DLC) */
  games: Record<string, { version: string; from?: number }[]>;
  locations: Record<string, number>;
  /** Where unlisted locations go: the first post-game checkpoint (Kanto, in the Johto games) */
  postgame: number;
  gates: story.Gates;
  /** Starters, in case the source has no gift row for them */
  starters: Record<string, string[]>;
}

const each = (ids: string[], starters: string[]) => Object.fromEntries(ids.map((id) => [id, starters]));
const self = (...ids: string[]) => Object.fromEntries(ids.map((id) => [id, [{ version: id }]]));
const KANTO_STARTERS = ['bulbasaur', 'charmander', 'squirtle'];

const REGIONS: Region[] = [
  {
    rulesetId: 'gen1',
    regions: ['kanto'],
    games: self('red', 'blue', 'yellow'),
    locations: story.KANTO,
    postgame: 9,
    gates: story.KANTO_GATES,
    starters: { ...each(['red', 'blue'], KANTO_STARTERS), yellow: ['pikachu'] },
  },
  {
    rulesetId: 'gen2',
    regions: ['johto', 'kanto'],
    // PokéAPI's Crystal rows have gaps (no Mareep), and Crystal keeps nearly all of Gold/Silver's wild Pokémon
    games: { ...self('gold', 'silver'), crystal: [{ version: 'crystal' }, { version: 'gold' }, { version: 'silver' }] },
    locations: story.JOHTO,
    postgame: 9,
    gates: story.JOHTO_GATES,
    starters: each(['gold', 'silver', 'crystal'], ['chikorita', 'cyndaquil', 'totodile']),
  },
  {
    rulesetId: 'gen3',
    regions: ['hoenn'],
    games: self('ruby', 'sapphire', 'emerald'),
    locations: story.HOENN,
    postgame: 9,
    gates: story.HOENN_GATES,
    starters: each(['ruby', 'sapphire', 'emerald'], ['treecko', 'torchic', 'mudkip']),
  },
  {
    rulesetId: 'gen3',
    regions: ['kanto'],
    games: self('firered', 'leafgreen'),
    locations: story.KANTO,
    postgame: 9,
    gates: story.KANTO_GATES,
    starters: each(['firered', 'leafgreen'], KANTO_STARTERS),
  },
  {
    rulesetId: 'gen4',
    regions: ['sinnoh'],
    games: self('diamond', 'pearl', 'platinum'),
    locations: story.SINNOH,
    postgame: 9,
    gates: story.SINNOH_GATES,
    starters: each(['diamond', 'pearl', 'platinum'], ['turtwig', 'chimchar', 'piplup']),
  },
  {
    rulesetId: 'gen4',
    regions: ['johto', 'kanto'],
    games: self('heartgold', 'soulsilver'),
    locations: story.JOHTO,
    postgame: 9,
    gates: story.JOHTO_GATES,
    starters: each(['heartgold', 'soulsilver'], ['chikorita', 'cyndaquil', 'totodile']),
  },
  {
    rulesetId: 'gen5',
    regions: ['unova'],
    games: self('black', 'white'),
    locations: story.UNOVA,
    postgame: 9,
    gates: story.UNOVA_GATES,
    starters: each(['black', 'white'], ['snivy', 'tepig', 'oshawott']),
  },
  {
    rulesetId: 'gen5',
    regions: ['unova'],
    games: self('black-2', 'white-2'),
    locations: story.UNOVA2,
    postgame: 9,
    gates: story.UNOVA2_GATES,
    starters: each(['black-2', 'white-2'], ['snivy', 'tepig', 'oshawott']),
  },
  {
    rulesetId: 'gen6',
    regions: ['kalos'],
    games: self('x', 'y'),
    locations: story.KALOS,
    postgame: 9,
    gates: story.KALOS_GATES,
    starters: each(['x', 'y'], ['chespin', 'fennekin', 'froakie']),
  },
  {
    rulesetId: 'gen6',
    regions: ['hoenn'],
    // PokéAPI's ORAS rows are mostly the remakes' additions (no Absol, Abra, or Feebas); the remakes keep Ruby/Sapphire's wild tables
    games: { 'omega-ruby': [{ version: 'omega-ruby' }, { version: 'ruby' }], 'alpha-sapphire': [{ version: 'alpha-sapphire' }, { version: 'sapphire' }] },
    locations: story.HOENN,
    postgame: 9,
    gates: story.HOENN_GATES,
    starters: each(['omega-ruby', 'alpha-sapphire'], ['treecko', 'torchic', 'mudkip']),
  },
  {
    rulesetId: 'gen7',
    regions: ['alola'],
    games: self('sun', 'moon', 'ultra-sun', 'ultra-moon'),
    locations: story.ALOLA,
    postgame: 6,
    gates: story.ALOLA_GATES,
    starters: each(['sun', 'moon', 'ultra-sun', 'ultra-moon'], ['rowlet', 'litten', 'popplio']),
  },
  {
    rulesetId: 'gen8',
    regions: ['galar'],
    games: Object.fromEntries(
      (['sword', 'shield'] as const).map((v) => [v, [{ version: v }, { version: `the-isle-of-armor-${v}`, from: 10 }, { version: `the-crown-tundra-${v}`, from: 11 }]]),
    ),
    locations: story.GALAR,
    postgame: 9,
    gates: story.GALAR_GATES,
    starters: each(['sword', 'shield'], ['grookey', 'scorbunny', 'sobble']),
  },
  {
    rulesetId: 'gen8natdex',
    regions: ['sinnoh'],
    games: { 'brilliant-diamond': [{ version: 'diamond' }], 'shining-pearl': [{ version: 'pearl' }] },
    locations: story.SINNOH,
    postgame: 9,
    gates: story.SINNOH_GATES,
    starters: each(['brilliant-diamond', 'shining-pearl'], ['turtwig', 'chimchar', 'piplup']),
  },
];

interface LocationResponse {
  name: string;
  areas: { name: string; url: string }[];
}
interface AreaResponse {
  pokemon_encounters: {
    pokemon: { name: string };
    version_details: { version: { name: string }; encounter_details: { min_level: number; method: { name: string } }[] }[];
  }[];
}

/** When an encounter method opens up; walking, gifts, trades and statics are open as soon as the place is */
function methodGate(method: string, gates: story.Gates): number {
  if (/old-rod/.test(method)) return gates.oldRod ?? 0;
  if (/good-rod/.test(method)) return gates.goodRod ?? 0;
  if (/rod|feebas|bubbling/.test(method)) return gates.superRod ?? 0;
  if (/seaweed/.test(method)) return gates.dive ?? gates.surf ?? 0;
  if (/surf|water/.test(method)) return gates.surf ?? 0;
  if (/rock-smash/.test(method)) return gates.rockSmash ?? 0;
  if (/headbutt/.test(method)) return gates.headbutt ?? 0;
  return 0;
}

const areaCache = new Map<string, { location: string; data: AreaResponse }[]>();
async function regionAreas(region: string) {
  let areas = areaCache.get(region);
  if (!areas) {
    const r = await getJson<{ locations: { name: string; url: string }[] }>(`${POKEAPI}/region/${region}`);
    const locations = await pooled(r.locations, 6, (l) => getJson<LocationResponse>(l.url));
    areas = await pooled(
      locations.flatMap((l) => l.areas.map((a) => ({ location: l.name, url: a.url }))),
      6,
      async (a) => ({ location: a.location, data: await getJson<AreaResponse>(a.url) }),
    );
    areaCache.set(region, areas);
  }
  return areas;
}

async function regional(region: Region) {
  const gen = Number(region.rulesetId.match(/^gen(\d)/)![1]) as GenerationNum;
  const rs = createOfficialRuleset(gen, { natDex: region.rulesetId.endsWith('natdex') });
  const areas = (await Promise.all(region.regions.map(regionAreas))).flat();

  for (const [game, versions] of Object.entries(region.games)) {
    const caps = GAMES.find((g) => g.id === game)!.checkpoints!.map((c) => c.levelCap);
    const byLevel = (level: number) => {
      const i = caps.findIndex((cap) => level <= cap);
      return i < 0 ? caps.length - 1 : i;
    };
    const species: Record<string, number> = {};
    for (const { location, data } of areas) {
      for (const enc of data.pokemon_encounters) {
        for (const { version, from = 0 } of versions) {
          const vd = enc.version_details.find((v) => v.version.name === version);
          if (!vd) continue;
          const id = speciesId(rs, enc.pokemon.name);
          if (!id) continue;
          // unlisted locations (a region's post-game half, roamers) count as post-game
          const where = region.locations[location] ?? region.postgame;
          for (const d of vd.encounter_details) {
            setEarliest(species, id, Math.max(from, where, methodGate(d.method.name, region.gates), byLevel(d.min_level)));
          }
        }
      }
    }
    // starters are gifts, which not every game's data lists
    for (const s of region.starters[game] ?? []) setEarliest(species, s, 0);
    await write({ game, species });
  }
}

async function write(file: AvailabilityFile) {
  await mkdir(OUT, { recursive: true });
  await writeFile(`${OUT}/${file.game}.json`, JSON.stringify(file) + '\n');
  console.log(`${file.game}: ${Object.keys(file.species).length} species`);
}

await scarletViolet();
for (const region of REGIONS) await regional(region);
const unique = [...new Set(warnings)];
if (unique.length) console.log(`\n${unique.length} warnings:\n  ${unique.join('\n  ')}`);
