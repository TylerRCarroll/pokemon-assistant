// Imports Renegade Platinum (Complete patch) data from the community documentation workbook
// into data-src/romhacks/renegade-platinum/generated/. Run: npm run import:rp
//
// Sheets used: backroom (species types/stats/abilities), MOVES (move table + replacements),
// LEARNSETS, iTEMSTMs (TM locations), and every "... SPLiT", POST GAME, and REMATCHES sheet (trainers).
import { mkdir, writeFile } from 'node:fs/promises';
import type { GenerationNum } from '@pkmn/data';
import { readWorkbook, sheetRows } from '../../lib/xlsx';
import { createOfficialRuleset, gens, toID } from '../../../src/rulesets/official';
import type { CompactLearnset } from '../../../src/rulesets/romhack';
import type { MoveInfo, SpeciesInfo, StatsTable, TMInfo, TrainerInfo, TrainerMon } from '../../../src/rulesets/types';

const DOC = 'Documentation/Renegade Platinum/Pokemon Renegade Platinum - Documentation.xlsx';
const OUT = 'data-src/romhacks/renegade-platinum/generated';
const base = createOfficialRuleset(4);
const warnings: string[] = [];
const warn = (msg: string) => warnings.push(msg);

const STATS: (keyof StatsTable)[] = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];
/** Misspellings in the doc */
const ABILITY_FIXES: Record<string, string> = { Anticipate: 'Anticipation' };
const MOVE_FIXES: Record<string, string> = { 'Drll Run': 'Drill Run', Twinneedle: 'Twineedle' };

/** Invisible marks the doc puts next to edited values (Khmer/Mongolian vowel and variation marks, zero-width chars, BOM) */
const MARKS = new Set([0x17b4, 0x17b5, 0x17d9, 0x180b, 0x180c, 0x180d, 0x180e, 0x200b, 0x200c, 0x200d, 0x200e, 0x200f, 0xfeff]);

/** Strip the doc's edit markers: invisible marks, "(!)" / "(!!)" / "(!!!)" for new things, "COM" for Complete-only */
const clean = (s = '') =>
  [...s]
    .filter((c) => !MARKS.has(c.codePointAt(0)!))
    .join('')
    .replaceAll('(!!!)', '')
    .replaceAll('(!!)', '')
    .replaceAll('(!)', '')
    .replace(/\s+COM$/, '')
    .replace(/\s+/g, ' ')
    .trim();
const titleCase = (s: string) => (s ? s[0].toUpperCase() + s.slice(1).toLowerCase() : s);
const typeName = (s: string) => {
  const t = clean(s);
  return !t || t === '-' ? undefined : titleCase(t);
};

const wb = await readWorkbook(DOC);
const sheet = (name: string) => sheetRows(wb.getWorksheet(name)!).map((r) => ({ n: r.n, cells: r.cells.map(clean) }));

// ---------------------------------------------------------------- species
// backroom columns: OLD = vanilla Platinum, CLA = Classic patch, COM = Complete patch
const SP = { name: 0, comType1: 6, comType2: 7, comStats: 22, comAbility1: 33, comAbility2: 34 };
type SpeciesOverride = Partial<Pick<SpeciesInfo, 'types' | 'baseStats' | 'abilities'>>;
const species: Record<string, SpeciesOverride> = {};

const FORME_SUFFIX: Record<string, Record<string, string>> = {
  Deoxys: { N: '', A: '-Attack', D: '-Defense', S: '-Speed' },
  Wormadam: { P: '', S: '-Sandy', T: '-Trash' },
};
/** Species names as the doc writes them: "#386 Deoxys (A)", ",2 Deoxys (D)", "Wormadam (T)" */
const resolveSpecies = (raw: string) => {
  const name = clean(raw).replace(/^[#,\d]+\s*/, '');
  const m = name.match(/^(\w+) \((\w)\)$/);
  const suffix = m && FORME_SUFFIX[m[1]]?.[m[2]];
  return base.getSpecies(m && suffix !== undefined ? m[1] + suffix : name);
};

const resolveAbility = (raw: string, ctx: string) => {
  const a = clean(raw);
  if (!a || a === '-') return undefined;
  const known = base.getAbility(ABILITY_FIXES[a] ?? a);
  if (!known) warn(`${ctx}: unknown ability "${a}"`);
  return known?.name;
};

for (const { n, cells } of sheet('backroom').filter((r) => /^#\d+/.test(r.cells[SP.name]))) {
  const name = cells[SP.name].replace(/^#\d+\s*/, '');
  const sp = base.getSpecies(name);
  if (!sp) {
    warn(`backroom row ${n} "${name}": no matching species`);
    continue;
  }
  const o: SpeciesOverride = {};
  const types = [typeName(cells[SP.comType1]), typeName(cells[SP.comType2])].filter((t): t is string => !!t);
  if (types.join('/') !== sp.types.join('/')) o.types = types;

  const values = cells.slice(SP.comStats, SP.comStats + 6).map(Number);
  if (values.some(Number.isNaN)) warn(`backroom row ${n} ${sp.name}: unreadable stats`);
  else {
    const stats = Object.fromEntries(STATS.map((s, i) => [s, values[i]])) as unknown as StatsTable;
    if (STATS.some((s) => stats[s] !== sp.baseStats[s])) o.baseStats = stats;
  }

  const abilities = [...new Set([cells[SP.comAbility1], cells[SP.comAbility2]].map((a) => resolveAbility(a, `backroom ${sp.name}`)))].filter(
    (a): a is string => !!a,
  );
  if (abilities.length && abilities.join('/') !== sp.abilities.join('/')) o.abilities = abilities;

  if (Object.keys(o).length) species[sp.id] = o;
}

// ---------------------------------------------------------------- moves
const MV = { name: 1, type: 3, category: 6, bp: 8, acc: 9, pp: 10 };
type MoveOverride = Partial<Pick<MoveInfo, 'type' | 'category' | 'basePower' | 'accuracy' | 'pp'>>;
const moveOverrides: Record<string, MoveOverride> = {};
const customMoves: Record<string, MoveInfo & { assumed: string[] }> = {};
const removedMoves: string[] = [];

/** Accuracy cells mix "100%", "1", "0.9", and "--" (never misses / not applicable) */
const parseAcc = (s: string): number | true => {
  if (!s || s === '--' || s === '-') return true;
  const n = Number(s.replace('%', ''));
  return s.endsWith('%') || n > 1 ? n : Math.round(n * 100);
};
const parseNum = (s: string) => (!s || s.startsWith('-') ? 0 : Number(s.replace(/PP/i, '')));

/** The newest official data for a move the hack imported from a later gen */
const laterMove = (name: string) => {
  for (let g = 9; g >= 5; g--) {
    const m = gens.get(g as GenerationNum).moves.get(name);
    if (m) return m;
  }
  return undefined;
};

const movesSheet = sheet('MOVES');
// replacement table: rows between the "Old Move" header and the full move table
// (empty rows aren't returned, so bound it by the table header rather than a blank row)
const oldHeader = movesSheet.findIndex((r) => r.cells[1] === 'Old Move');
const tableStart = movesSheet.findIndex((r) => r.cells[MV.name] === 'NAME');
for (const { cells } of movesSheet.slice(oldHeader + 1, tableStart)) {
  if (!cells[1] || !cells[3]) continue;
  const old = base.getMove(cells[1]);
  if (old) removedMoves.push(old.id);
  else warn(`MOVES replacement: unknown old move "${cells[1]}"`);
}

for (const { n, cells } of movesSheet.slice(tableStart + 1)) {
  const name = MOVE_FIXES[cells[MV.name]] ?? cells[MV.name];
  const type = typeName(cells[MV.type]);
  if (!name || !type) continue;
  const category = titleCase(cells[MV.category]) as MoveInfo['category'];
  const doc = { type, category, basePower: parseNum(cells[MV.bp]), accuracy: parseAcc(cells[MV.acc]), pp: parseNum(cells[MV.pp]) };
  const known = base.getMove(name);
  if (known) {
    const o: MoveOverride = {};
    if (doc.type !== known.type) o.type = doc.type;
    if (doc.category !== known.category) o.category = doc.category;
    if (doc.basePower !== known.basePower && known.category !== 'Status') o.basePower = doc.basePower;
    if (doc.accuracy !== known.accuracy) o.accuracy = doc.accuracy;
    if (doc.pp !== known.pp) o.pp = doc.pp;
    if (Object.keys(o).length) moveOverrides[known.id] = o;
    continue;
  }
  const later = laterMove(name);
  if (!later) {
    warn(`MOVES row ${n}: "${name}" isn't a known move in any gen`);
    continue;
  }
  customMoves[later.id] = {
    id: later.id,
    name: later.name,
    ...doc,
    priority: later.priority,
    shortDesc: later.shortDesc,
    desc: later.desc,
    flags: { ...later.flags } as Record<string, 1>,
    drain: later.drain,
    // numbers come from the doc; these come from the move's official later-gen data
    assumed: ['priority', 'contact/other flags', 'secondary effects'],
  };
}

const resolveMove = (raw: string): MoveInfo | undefined => {
  const name = MOVE_FIXES[clean(raw)] ?? clean(raw);
  return customMoves[toID(name)] ?? base.getMove(name);
};

// ---------------------------------------------------------------- learnsets
const learnsets: Record<string, CompactLearnset> = {};
const tmMoves = new Map<number, string>();
/** Species whose TM / tutor list is just "ALL" (Mew); filled in once every move is known */
const learnsAllTMs: string[] = [];
const learnsAllTutors: string[] = [];
const bareTMs: [string, string][] = [];
/** "TM06" / "HM07" → move name, from every named entry in the sheet */
const machineMoves = new Map<string, string>();
const lsRows = sheet('LEARNSETS');
const header = lsRows[0].cells;

for (let col = 1; col < header.length; col++) {
  if (!/^[#,]\d+/.test(header[col])) continue;
  const sp = resolveSpecies(header[col]);
  if (!sp) {
    warn(`LEARNSETS column ${col} "${header[col]}": no matching species`);
    continue;
  }
  const ls: CompactLearnset = { level: [], tm: [], tutor: [], egg: [] };
  for (const { cells } of lsRows.slice(1)) {
    const section = cells[0];
    const cell = cells[col];
    // "N" = none in that section
    if (!cell || cell === 'N' || /:$/.test(cell) || cell === 'Move Tutor' || cell === 'Special Tutors') continue;
    if (cell === 'ALL') {
      if (section.startsWith('TMs')) learnsAllTMs.push(sp.id);
      else if (section === 'MOVE TUTOR') learnsAllTutors.push(sp.id);
      continue;
    }
    if (/^\d+$/.test(cell)) {
      warn(`LEARNSETS ${sp.name}: stray number "${cell}" in ${section}, skipped`);
      continue;
    }
    let m: RegExpMatchArray | null;
    let moveName: string;
    let kind: 'level' | 'tm' | 'tutor';
    let level = 0;
    if (section === 'LEVEL UP' && (m = cell.match(/^(\d+)\s*-\s*(.+)$/))) {
      kind = 'level';
      level = Number(m[1]);
      moveName = m[2];
    } else if (section.startsWith('TMs') && (m = cell.match(/^(TM|HM)(\d+)\s*(\D.*)$/))) {
      kind = 'tm';
      moveName = m[3];
      if (m[1] === 'TM') tmMoves.set(Number(m[2]), moveName);
      machineMoves.set(`${m[1]}${Number(m[2])}`, moveName);
    } else if (section.startsWith('TMs') && (m = cell.match(/^(TM|HM)(\d+)$/))) {
      // a bare "TM77" / "HM07" with the move name missing; resolved from other entries afterwards
      bareTMs.push([sp.id, `${m[1]}${Number(m[2])}`]);
      continue;
    } else if (section.startsWith('TMs') && resolveMove(cell)) {
      // some HMs are listed without their "HMxx" prefix
      kind = 'tm';
      moveName = cell;
    } else if (section === 'MOVE TUTOR') {
      kind = 'tutor';
      moveName = cell;
    } else {
      warn(`LEARNSETS ${sp.name}: unreadable cell "${cell}"`);
      continue;
    }
    const move = resolveMove(moveName);
    if (!move) {
      warn(`LEARNSETS ${sp.name}: unknown move "${moveName}"`);
      continue;
    }
    if (kind === 'level') ls.level.push([level, move.id]);
    else if (!ls[kind].includes(move.id)) ls[kind].push(move.id);
  }
  // the doc has no egg moves, so keep vanilla Platinum's
  ls.egg = (await base.learnset(sp.name)).filter((e) => e.methods.some((x) => x.kind === 'egg')).map((e) => e.move);
  learnsets[sp.id] = ls;
}

for (const [id, num] of bareTMs) {
  const move = machineMoves.get(num) && resolveMove(machineMoves.get(num)!);
  if (move && !learnsets[id].tm.includes(move.id)) learnsets[id].tm.push(move.id);
  else if (!move) warn(`LEARNSETS ${id}: ${num} has no move name and isn't named elsewhere`);
}
const allTutors = [...new Set(Object.values(learnsets).flatMap((l) => l.tutor))];
for (const id of learnsAllTutors) learnsets[id].tutor = [...new Set([...learnsets[id].tutor, ...allTutors])];
for (const id of learnsAllTMs) {
  const all = [...tmMoves.values()].flatMap((name) => resolveMove(name)?.id ?? []);
  learnsets[id].tm = [...new Set([...learnsets[id].tm, ...all])];
}

// ---------------------------------------------------------------- TM list with locations
const tms: TMInfo[] = [];
// the TM table is laid out in three column groups: name, type, power, accuracy, PP, location, note
for (const { cells } of sheet('iTEMSTMs')) {
  for (const col of [26, 35, 44]) {
    const m = cells[col]?.match(/^TM(\d+)\s+(.+)$/);
    if (!m) continue;
    const num = Number(m[1]);
    if (tms.some((t) => t.num === num)) continue;
    const move = resolveMove(m[2]);
    if (!move) warn(`iTEMSTMs: unknown TM move "${m[2]}"`);
    const where = [cells[col + 5], cells[col + 6]].filter(Boolean);
    tms.push({
      num,
      name: move?.name ?? m[2],
      move: move?.id ?? null,
      type: titleCase(cells[col + 1]),
      location: where.length > 1 ? `${where[0]} (${where[1]})` : (where[0] ?? ''),
    });
  }
}
for (const [num, name] of tmMoves) {
  if (!tms.some((t) => t.num === num)) {
    const move = resolveMove(name);
    tms.push({ num, name: move?.name ?? name, move: move?.id ?? null, type: move?.type ?? '', location: '' });
  }
}
tms.sort((a, b) => a.num - b.num);

// ---------------------------------------------------------------- trainers
const BLOCKS = [4, 12, 20, 28, 36, 44];
const BOSS = /LEADER|RIVAL|COMMANDER|GALACTIC BOSS|CYRUS|ELITE FOUR|CHAMPION|PKMN TRAINER (LUCAS|DAWN)/i;
const trainers: TrainerInfo[] = [];
const trainerSheets = wb.worksheets.map((w) => w.name).filter((s) => /SPLiT|SPLIT|^POST GAME$|^REMATCHES$/.test(s.trim()));

for (const sheetName of trainerSheets) {
  const rows = sheet(sheetName);
  const split = titleCase(rows[0].cells[1] || sheetName.trim());
  const levelCap = Number(rows[0].cells[8]?.match(/LVL CAP\s*:\s*(\d+)/)?.[1]) || undefined;
  let location = '';

  for (let i = 0; i < rows.length; i++) {
    const c = rows[i].cells;
    // location headers repeat the same short, upper-case text across the row (long repeated text is a note)
    const header = c[1] && c[1] === c[3] && c[1] === c[5] && c[1] === c[1].toUpperCase() && c[1].length <= 45;
    if (header && !c[1].startsWith('#') && !/SPLIT|CAP/.test(c[1])) {
      // capitalise after spaces/punctuation only, so "POKéMON" becomes "Pokémon", not "PokéMon"
      location = c[1].toLowerCase().replace(/(^|[\s(~/-])(\S)/g, (_, sep: string, ch: string) => sep + ch.toUpperCase());
      continue;
    }
    const blocks = BLOCKS.filter((b) => /^#\d+\s+\S/.test(c[b + 1] ?? '') && !c[b + 1].startsWith('#000') && /^Lv\.\s*\d+/.test(c[b + 6] ?? ''));
    if (!blocks.length) continue;

    const nameCells = [0, 1, 2, 3].map((k) => rows[i + k]?.cells[1] ?? '').filter((s) => /\[\d+\]/.test(s));
    // big teams wrap onto another row band without repeating the trainer's name
    const continues = !nameCells.length && trainers.at(-1)?.location === location && trainers.at(-1)?.split === split;
    if (!nameCells.length && !continues) {
      warn(`${sheetName} row ${rows[i].n}: team without a trainer name`);
      continue;
    }
    const notes = [0, 1, 2, 3, 4, 5]
      .map((k) => rows[i + k]?.cells[1] ?? '')
      .filter((s) => s && !/\[\d+\]/.test(s) && (/^\(/.test(s) || /if you/i.test(s)));

    const team: TrainerMon[] = blocks.flatMap((b) => {
      const sp = resolveSpecies(c[b + 1]);
      if (!sp) {
        warn(`${sheetName} row ${rows[i].n}: unknown species "${c[b + 1]}"`);
        return [];
      }
      const at = (k: number, col: number) => rows[i + k]?.cells[b + col] ?? '';
      const itemRaw = at(4, 1);
      // non-battle items (Rare Candy) aren't in the battle dex; keep the doc's name
      const item = itemRaw && itemRaw !== 'No Item' ? (base.getItem(itemRaw)?.name ?? itemRaw) : undefined;
      const moves = [6, 7, 8, 9]
        .map((k) => at(k, 0))
        .filter((m) => m && m !== '-')
        .flatMap((m) => {
          const move = resolveMove(m);
          if (!move) warn(`${sheetName} ${sp.name}: unknown move "${m}"`);
          return move ? [move.name] : [];
        });
      return [
        {
          species: sp.name,
          level: Number(c[b + 6].match(/\d+/)![0]),
          item,
          ability: resolveAbility(at(4, 4), `${sheetName} ${sp.name}`),
          nature: at(5, 0).split('(')[0].trim() || undefined,
          ivs: Number(at(5, 6).match(/\d+/)?.[0] ?? 0),
          moves,
        },
      ];
    });

    if (continues) {
      trainers.at(-1)!.team.push(...team);
      continue;
    }
    trainers.push({
      id: Number(nameCells[0].match(/\[(\d+)\]/)![1]),
      name: [...new Set(nameCells.map((s) => s.replace(/\s*\[\d+\]/, '')))].join(' / '),
      location,
      split,
      levelCap,
      notes,
      boss: nameCells.some((s) => BOSS.test(s)),
      team,
    });
  }
}

// ---------------------------------------------------------------- write
await mkdir(OUT, { recursive: true });
const write = (file: string, data: unknown, pretty = true) => writeFile(`${OUT}/${file}`, JSON.stringify(data, null, pretty ? 1 : 0) + '\n');
await write('species.json', species);
await write('moves.json', { overrides: moveOverrides, customMoves, removedMoves });
await write('learnsets.json', learnsets, false);
await write('tms.json', tms);
await write('trainers.json', trainers, false);

for (const t of trainers) if (t.team.length > 6) warn(`trainer ${t.name} [${t.id}] has ${t.team.length} Pokémon`);
const bosses = trainers.filter((t) => t.boss);
console.log(`species: ${Object.keys(species).length} changed`);
console.log(`moves: ${Object.keys(moveOverrides).length} changed, ${Object.keys(customMoves).length} added (${Object.values(customMoves).map((m) => m.name).join(', ')}), ${removedMoves.length} removed`);
console.log(`learnsets: ${Object.keys(learnsets).length} species`);
console.log(`TMs: ${tms.length} (${tms.filter((t) => t.location).length} with locations)`);
console.log(`trainers: ${trainers.length} from ${trainerSheets.length} sheets, ${bosses.length} bosses`);
if (warnings.length) {
  const shown = warnings.slice(0, 40);
  console.log(`\n${warnings.length} warnings${warnings.length > shown.length ? ' (first 40)' : ''}:\n  ${shown.join('\n  ')}`);
}
