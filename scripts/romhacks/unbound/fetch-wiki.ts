// Saves the Pokémon Unbound Wiki (pokemonunbound.fandom.com) pages for every location in the location
// guide, as wikitext, to Documentation/Unbound/source/wiki/ (gitignored). The import reads them to work
// out when each location opens up. Run: npx tsx scripts/romhacks/unbound/fetch-wiki.ts
import { mkdir, writeFile } from 'node:fs/promises';
import { readWorkbook, sheetRows } from '../../lib/xlsx';

const API = 'https://pokemonunbound.fandom.com/api.php';
const OUT = 'Documentation/Unbound/source/wiki';
const HEADERS = { 'User-Agent': 'PokePlanner/0.1 (personal non-commercial project)' };

/** Guide names that differ from the wiki's page titles */
const TITLE_FIXES: Record<string, string[]> = {
  'Route 9 + Autl Woods': ['Route 9', 'Autl Woods'],
  'Thundercap Mt.': ['Thundercap Mountain'],
  'Cube Corp.': ['Cube Corp'],
};

const wb = await readWorkbook('Documentation/Unbound/Pokémon Unbound Location Guide v2.1.1.1.xlsx');
const names = new Set<string>();
for (const sheet of ['Grass & Cave', 'Surfing, Fishing']) {
  const rows = sheetRows(wb.worksheets.find((w) => w.name.startsWith(sheet))!);
  const header = rows.find((r) => r.cells.filter((c) => /Route|Cave/.test(c)).length > 3)!.cells;
  for (const c of header) if (c && !/Surfing|Fishing|Rock Smash/.test(c)) names.add(c.trim());
}
// towns and story places the location pages link to, so connections can be followed
for (const extra of ['Frozen Heights', 'Bellin Town', 'Crater Town', 'Blizzard City', 'Redwood Village', 'Magnolia Town', 'Shadow Base', 'Seaport City']) names.add(extra);

await mkdir(OUT, { recursive: true });
let saved = 0;
const missing: string[] = [];
for (const name of names) {
  for (const title of TITLE_FIXES[name] ?? [name]) {
    const url = `${API}?action=parse&page=${encodeURIComponent(title.replace(/ /g, '_'))}&prop=wikitext&redirects=1&format=json`;
    const res = await fetch(url, { headers: HEADERS });
    const json = (await res.json()) as { parse?: { wikitext: { '*': string } } };
    if (!json.parse) {
      missing.push(title);
      continue;
    }
    await writeFile(`${OUT}/${title.replace(/[^\w ]/g, '')}.txt`, json.parse.wikitext['*']);
    saved++;
    await new Promise((r) => setTimeout(r, 250));
  }
}
console.log(`saved ${saved} pages${missing.length ? `; no page for: ${missing.join(', ')}` : ''}`);
