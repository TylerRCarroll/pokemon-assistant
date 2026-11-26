// Imports Unbound data from the spreadsheets in Documentation/Unbound into
// data-src/romhacks/unbound/generated/. Run: npm run import:unbound
import { mkdir, writeFile } from 'node:fs/promises';
import { readWorkbook, sheetRows } from '../../lib/xlsx';
import { createOfficialRuleset } from '../../../src/rulesets/official';
import type { StatsTable } from '../../../src/rulesets/types';
import { getRuleset } from '../../../src/rulesets/registry';
import overlay from '../../../data-src/romhacks/unbound/overlay.json';
import { parseCalcTrainers } from './calc';
import { parseBaseStats, parseLearnsets } from './dpe';

const DOCS = 'Documentation/Unbound';
const OUT = 'data-src/romhacks/unbound/generated';
const base = createOfficialRuleset(8, { natDex: true, legendsArceus: true });
const warnings: string[] = [];

/** Spreadsheet name → @pkmn species name(s); returns [] when it can't be mapped */
function speciesNames(raw: string): string[] {
  const name = raw.replace(/\s+/g, ' ').trim();
  const special: Record<string, string[]> = {
    'Rotom-Form': ['Rotom-Heat', 'Rotom-Wash', 'Rotom-Frost', 'Rotom-Fan', 'Rotom-Mow'],
    // one row for all of Unbound's alt Pikachu, like Rotom-Form above. Unbound also has
    // Surfing/Flying Pikachu, which @pkmn has no species for, so they can't take stats yet.
    'Pikachu Alt Form': [
      'Pikachu-Original', 'Pikachu-Hoenn', 'Pikachu-Sinnoh', 'Pikachu-Unova',
      'Pikachu-Kalos', 'Pikachu-Alola', 'Pikachu-Partner',
    ],
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
      // Unbound-only moves (hand-defined in overlay.json) win over official data
      const custom = Object.values(overlay.customMoves).find((m) => m.name === name);
      const move = custom ?? base.getMove(name);
      if (!move) warnings.push(`TM${id} "${rawName}": unknown move, kept with move: null`);
      return { num: Number(id), name: move?.name ?? name, move: move?.id ?? null, type, location };
    });
}

/** Typings and abilities from the game source, kept only where they differ from Gen 8 */
async function importTypesAndAbilities(species: Record<string, Partial<{ baseStats: StatsTable; types: string[]; abilities: string[] }>>) {
  let types = 0;
  let abilities = 0;
  for (const [id, s] of Object.entries(await parseBaseStats(base, warnings))) {
    const official = base.getSpecies(id)!;
    // order-insensitive: the source lists a few Hisuian typings the other way round
    if (s.types.length && [...s.types].sort().join('/') !== [...official.types].sort().join('/')) {
      (species[id] ??= {}).types = s.types;
      types++;
    }
    if (s.abilities.length && s.abilities.join('/') !== official.abilities.join('/')) {
      (species[id] ??= {}).abilities = s.abilities;
      abilities++;
    }
  }
  return { types, abilities };
}

const { species, unchanged } = await importStats();
const tms = await importTMs();
const changed = await importTypesAndAbilities(species);
const learnsets = await parseLearnsets(base, warnings, Object.keys(overlay.customMoves));
// trainer sets are checked against the hack itself, so Unbound-only moves like Leech Fang resolve
const trainers = await parseCalcTrainers(getRuleset('unbound'), warnings);

await mkdir(OUT, { recursive: true });
await writeFile(`${OUT}/species.json`, JSON.stringify(species, null, 1) + '\n');
await writeFile(`${OUT}/tms.json`, JSON.stringify(tms, null, 1) + '\n');
await writeFile(`${OUT}/learnsets.json`, JSON.stringify(learnsets) + '\n');
await writeFile(`${OUT}/trainers.json`, JSON.stringify(trainers) + '\n');

console.log(`species: ${Object.keys(species).length} changed, ${unchanged} with Gen 8 stats`);
console.log(`  ${changed.types} retyped, ${changed.abilities} with different abilities`);
console.log(`learnsets: ${Object.keys(learnsets).length}`);
const counts = new Map<string, number>();
for (const t of trainers) counts.set(t.difficulty ?? '', (counts.get(t.difficulty ?? '') ?? 0) + 1);
console.log(`trainers: ${[...counts].map(([d, n]) => `${d} ${n}`).join(', ')}`);
console.log(`TMs: ${tms.length} (${tms.filter((t) => !t.move).length} unresolved)`);
const unique = [...new Set(warnings)];
if (unique.length) console.log(`\n${unique.length} warnings:\n  ${unique.join('\n  ')}`);
