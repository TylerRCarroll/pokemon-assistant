// Fetches when Pokémon become obtainable in Scarlet/Violet and Black/White and writes
// data-src/availability/<game>.json (species id → earliest checkpoint in src/data/games.ts).
// Run: npm run fetch:availability
//
// Scarlet/Violet: PokéAPI's regional dexes (Paldea, Kitakami, Blueberry) plus the version-exclusive
// tables from Bulbapedia's Scarlet and Violet page. The games are open world, so a Paldea Pokémon
// counts as available from the start; its evolutions are gated by level cap in the app.
// Black/White: PokéAPI's wild encounters, placed by location (story order below) and level.
import { mkdir, writeFile } from 'node:fs/promises';
import { GAMES, PALDEA_CHECKPOINT, UNOVA_CHECKPOINT, type AvailabilityFile } from '../src/data/games';
import { createOfficialRuleset } from '../src/rulesets/official';
import type { Ruleset } from '../src/rulesets/types';

const OUT = 'data-src/availability';
const POKEAPI = 'https://pokeapi.co/api/v2';
const BULBAPEDIA = 'https://bulbapedia.bulbagarden.net/w/api.php';
const HEADERS = { 'User-Agent': 'PokePlanner/0.1 (personal non-commercial project)' };
const warnings: string[] = [];

async function getJson<T>(url: string): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { headers: HEADERS });
    if (res.ok) return res.json() as Promise<T>;
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
// Black / White

/** Story order: the checkpoint index you reach each location before (see UNOVA in src/data/games.ts) */
const UNOVA_LOCATIONS: Record<string, number> = {
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

async function blackWhite() {
  const rs = createOfficialRuleset(5);
  const caps = GAMES.find((g) => g.id === 'black')!.checkpoints!.map((c) => c.levelCap);
  const byLevel = (level: number) => {
    const i = caps.findIndex((cap) => level <= cap);
    return i < 0 ? caps.length - 1 : i;
  };
  const region = await getJson<{ locations: { name: string; url: string }[] }>(`${POKEAPI}/region/unova`);
  const locations = await pooled(region.locations, 6, (l) => getJson<LocationResponse>(l.url));
  const areas = await pooled(
    locations.flatMap((l) => l.areas.map((a) => ({ location: l.name, url: a.url }))),
    6,
    async (a) => ({ location: a.location, data: await getJson<AreaResponse>(a.url) }),
  );

  for (const version of ['black', 'white']) {
    const species: Record<string, number> = {};
    for (const { location, data } of areas) {
      for (const enc of data.pokemon_encounters) {
        const vd = enc.version_details.find((v) => v.version.name === version);
        if (!vd) continue;
        const id = speciesId(rs, enc.pokemon.name);
        if (!id) continue;
        // unlisted locations (Unova's post-game half) count as post-game
        const where = UNOVA_LOCATIONS[location] ?? UNOVA_CHECKPOINT.postgame;
        for (const d of vd.encounter_details) {
          const method = d.method.name;
          const gate = /rod/.test(method) ? UNOVA_CHECKPOINT.postgame : /surf/.test(method) ? UNOVA_CHECKPOINT.surf : 0;
          setEarliest(species, id, Math.max(where, gate, byLevel(d.min_level)));
        }
      }
    }
    // starters are gifts with no encounter row
    for (const s of ['snivy', 'tepig', 'oshawott']) setEarliest(species, s, 0);
    await write({ game: version, species });
  }
}

async function write(file: AvailabilityFile) {
  await mkdir(OUT, { recursive: true });
  await writeFile(`${OUT}/${file.game}.json`, JSON.stringify(file) + '\n');
  console.log(`${file.game}: ${Object.keys(file.species).length} species`);
}

await scarletViolet();
await blackWhite();
const unique = [...new Set(warnings)];
if (unique.length) console.log(`\n${unique.length} warnings:\n  ${unique.join('\n  ')}`);
