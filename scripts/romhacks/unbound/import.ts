// Imports Unbound data from the spreadsheets in Documentation/Unbound into
// data-src/romhacks/unbound/generated/. Run: npm run import:unbound
import { mkdir, writeFile } from 'node:fs/promises';
import { readWorkbook, sheetRows } from '../../lib/xlsx';
import { createOfficialRuleset } from '../../../src/rulesets/official';
import type { StatsTable } from '../../../src/rulesets/types';

const DOCS = 'Documentation/Unbound';
const OUT = 'data-src/romhacks/unbound/generated';
const base = createOfficialRuleset(8, { natDex: true });
const warnings: string[] = [];

/** Spreadsheet name → @pkmn species name(s); returns [] when it can't be mapped */
function speciesNames(raw: string): string[] {
  const name = raw.replace(/\s+/g, ' ').trim();
  const special: Record<string, string[]> = {
    'Rotom-Form': ['Rotom-Heat', 'Rotom-Wash', 'Rotom-Frost', 'Rotom-Fan', 'Rotom-Mow'],
    'Spiky-Eared Pichu': ['Pichu-Spiky-eared'],
    'Minior Shield': ['Minior-Meteor'],
    'Minior Core': ['Minior'],
    'Lycanroc Midday': ['Lycanroc'],
    'Wishiwashi Solo': ['Wishiwashi'],
    'Ultra Necrozma': ['Necrozma-Ultra'],
    TypeNull: ['Type: Null'],
    // unlabeled Gourgeist row is the Small size (lowest HP, highest Speed); "Gourgeist M" is Average
    Gourgeist: ['Gourgeist-Small'],
  };
  if (special[name]) return special[name];

  let m: RegExpMatchArray | null;
  if ((m = name.match(/^Mega (\S+)(?: ([XY]))?$/))) return [`${m[1]}-Mega${m[2] ? `-${m[2]}` : ''}`];
  if ((m = name.match(/^Primal (\S+)$/))) return [`${m[1]}-Primal`];
  if ((m = name.match(/^(.+) A$/))) return [`${m[1]}-Alola`];
  if ((m = name.match(/^(.+) G$/))) return [`${m[1]}-Galar`];

  for (const candidate of [name, name.replace(/ /g, '-')]) {
    if (base.getSpecies(candidate)) return [candidate];
  }
  return [];
}

/** Cells look like "80" or, on form rows, "Venusaur: 80" */
const statNum = (cell: string) => Number(cell.match(/(\d+)\s*$/)?.[1] ?? NaN);

async function importStats() {
  const wb = await readWorkbook(`${DOCS}/PU base stats balanced.xlsx`);
  const species: Record<string, { baseStats: StatsTable }> = {};
  let unchanged = 0;

  for (const { n, cells } of sheetRows(wb.worksheets[0]).slice(1)) {
    const [rawName, ...statCells] = cells;
    if (!rawName) continue;
    const [hp, atk, def, spa, spd, spe] = statCells.slice(0, 6).map(statNum);
    if ([hp, atk, def, spa, spd, spe].some(Number.isNaN)) {
      warnings.push(`stats row ${n} "${rawName}": unreadable stats`);
      continue;
    }
    const names = speciesNames(rawName);
    if (!names.length) {
      warnings.push(`stats row ${n} "${rawName}": no matching species, skipped`);
      continue;
    }
    for (const name of names) {
      const s = base.getSpecies(name);
      if (!s) {
        warnings.push(`stats row ${n} "${rawName}" → "${name}": not in Gen 8 National Dex, skipped`);
        continue;
      }
      const baseStats = { hp, atk, def, spa, spd, spe };
      if (species[s.id]) warnings.push(`stats row ${n} "${rawName}": duplicate for ${s.name}, later row wins`);
      if (Object.entries(baseStats).every(([k, v]) => s.baseStats[k as keyof StatsTable] === v)) unchanged++;
      else species[s.id] = { baseStats };
    }
  }
  return { species, unchanged };
}

const MOVE_FIXES: Record<string, string> = {
  'Power-up Hit/Punch': 'Power-Up Punch',
  'Dazzle/Dazzling Gleam': 'Dazzling Gleam',
  'Drain Kiss': 'Draining Kiss',
};

async function importTMs() {
  const wb = await readWorkbook(`${DOCS}/Tm Locations - Spread Sheet .xlsx`);
  return sheetRows(wb.worksheets[0])
    .slice(1)
    .filter(({ cells }) => cells[0] && cells[1])
    .map(({ cells: [id, rawName, type, location] }) => {
      const name = MOVE_FIXES[rawName.trim()] ?? rawName.trim();
      const move = base.getMove(name);
      if (!move) warnings.push(`TM${id} "${rawName}": unknown move, kept with move: null`);
      return { num: Number(id), name: move?.name ?? name, move: move?.id ?? null, type, location };
    });
}

const { species, unchanged } = await importStats();
const tms = await importTMs();

await mkdir(OUT, { recursive: true });
await writeFile(`${OUT}/species.json`, JSON.stringify(species, null, 1) + '\n');
await writeFile(`${OUT}/tms.json`, JSON.stringify(tms, null, 1) + '\n');

console.log(`species: ${Object.keys(species).length} changed, ${unchanged} identical to Gen 8`);
console.log(`TMs: ${tms.length} (${tms.filter((t) => !t.move).length} unresolved)`);
if (warnings.length) console.log(`\n${warnings.length} warnings:\n  ${warnings.join('\n  ')}`);
