// Imports Renegade Platinum (Complete patch) species data from the community documentation
// workbook into data-src/romhacks/renegade-platinum/generated/. Run: npm run import:rp
import { mkdir, writeFile } from 'node:fs/promises';
import { readWorkbook, sheetRows } from '../../lib/xlsx';
import { createOfficialRuleset } from '../../../src/rulesets/official';
import type { SpeciesInfo, StatsTable } from '../../../src/rulesets/types';

const DOC = 'Documentation/Renegade Platinum/Pokemon Renegade Platinum - Documentation.xlsx';
const OUT = 'data-src/romhacks/renegade-platinum/generated';
const base = createOfficialRuleset(4);
const warnings: string[] = [];

// "backroom" sheet columns: OLD = vanilla Platinum, CLA = Classic patch, COM = Complete patch
const COL = { name: 0, comType1: 6, comType2: 7, comStats: 22, comAbility1: 33, comAbility2: 34 };
const STATS: (keyof StatsTable)[] = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];
/** Misspellings in the doc */
const ABILITY_FIXES: Record<string, string> = { Anticipate: 'Anticipation' };

/** Invisible marks the doc puts next to edited values (Khmer/Mongolian vowel and variation marks, zero-width chars, BOM) */
const MARKS = new Set([0x17b4, 0x17b5, 0x17d9, 0x180b, 0x180c, 0x180d, 0x180e, 0x200b, 0x200c, 0x200d, 0x200e, 0x200f, 0xfeff]);

/** Strip the doc's edit markers: invisible marks and "(!)" for new abilities */
const clean = (s = '') =>
  [...s]
    .filter((c) => !MARKS.has(c.codePointAt(0)!))
    .join('')
    .replaceAll('(!)', '')
    .trim();
const typeName = (s: string) => {
  const t = clean(s);
  return !t || t === '-' ? undefined : t[0] + t.slice(1).toLowerCase();
};

const wb = await readWorkbook(DOC);
// species rows start with "#NNN"; skips headers and the column-index row
const rows = sheetRows(wb.getWorksheet('backroom')!).filter((r) => /^#\d+/.test(clean(r.cells[COL.name])));

type Override = Partial<Pick<SpeciesInfo, 'types' | 'baseStats' | 'abilities'>>;
const species: Record<string, Override> = {};
const counts = { types: 0, stats: 0, abilities: 0, rows: rows.length };

for (const { n, cells } of rows) {
  const name = clean(cells[COL.name]).replace(/^#\d+\s*/, '');
  const sp = base.getSpecies(name);
  if (!sp) {
    warnings.push(`row ${n} "${name}": no matching species`);
    continue;
  }
  const o: Override = {};

  const types = [typeName(cells[COL.comType1]), typeName(cells[COL.comType2])].filter((t): t is string => !!t);
  if (types.join('/') !== sp.types.join('/')) {
    o.types = types;
    counts.types++;
  }

  const values = cells.slice(COL.comStats, COL.comStats + 6).map((c) => Number(clean(c)));
  if (values.some(Number.isNaN)) warnings.push(`row ${n} ${sp.name}: unreadable stats`);
  else {
    const stats = Object.fromEntries(STATS.map((s, i) => [s, values[i]])) as unknown as StatsTable;
    if (STATS.some((s) => stats[s] !== sp.baseStats[s])) {
      o.baseStats = stats;
      counts.stats++;
    }
  }

  // ability names in the doc use Gen 4 spellings ("Compoundeyes"); resolve through the dex by id
  const abilities = [...new Set([cells[COL.comAbility1], cells[COL.comAbility2]].map(clean).filter((a) => a && a !== '-'))].flatMap((a) => {
    const known = base.getAbility(ABILITY_FIXES[a] ?? a);
    if (!known) warnings.push(`row ${n} ${sp.name}: unknown ability "${a}"`);
    return known ? [known.name] : [];
  });
  if (abilities.length && abilities.join('/') !== sp.abilities.join('/')) {
    o.abilities = abilities;
    counts.abilities++;
  }

  if (Object.keys(o).length) species[sp.id] = o;
}

await mkdir(OUT, { recursive: true });
await writeFile(`${OUT}/species.json`, JSON.stringify(species, null, 1) + '\n');
console.log(`${counts.rows} rows → ${Object.keys(species).length} species changed (types ${counts.types}, stats ${counts.stats}, abilities ${counts.abilities})`);
if (warnings.length) console.log(`\n${warnings.length} warnings:\n  ${warnings.join('\n  ')}`);
