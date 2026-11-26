// When Pokémon become obtainable in Unbound, from the location guide and raid drop tables in
// Documentation/Unbound. The location guide has no levels or route order, so wild Pokémon only tell us
// what can be caught at all; raids (levels per star tier), the gift/static list (story order and
// requirements), and the legendary list (requirements) say more about when.
import type { Checkpoint } from '../../../src/data/games';
import type { Ruleset, TrainerInfo } from '../../../src/rulesets/types';
import { readWorkbook, sheetRows } from '../../lib/xlsx';

const DOCS = 'Documentation/Unbound';

/** Gift groups the sheet names instead of listing */
const STARTER_GROUPS: Record<string, string[]> = {
  'Borrius Starters': ['Larvitar', 'Gible', 'Beldum'],
  'Kanto Starters': ['Bulbasaur', 'Charmander', 'Squirtle'],
  'Unova Starters': ['Snivy', 'Tepig', 'Oshawott'],
  'Sinnoh Starters': ['Turtwig', 'Chimchar', 'Piplup'],
  'Kalos Starters': ['Chespin', 'Fennekin', 'Froakie'],
  'Alola Starters': ['Rowlet', 'Litten', 'Popplio'],
};

/**
 * Gym towns, as named in the gift sheet, by the checkpoint whose gym they hold. The sheet runs in story
 * order, so a row at a gym town is reached before that gym and a row after it, before the next one.
 * (Dehara City's in-gym static is Voltorb/Electrode, matching Galavan's Electric team, and so on.)
 */
const GYM_TOWNS: [RegExp, number][] = [
  [/^Dresco Town/, 0],
  [/^Crater Town/, 1],
  [/^Blizzard City/, 2],
  [/^Fallshore City/, 3],
  [/^Dehara City/, 4],
  [/^Antisis City/, 5],
  [/^Polder Town/, 6],
  [/^Redwood/, 7],
];

/** "Alolan Vulpix Egg (Daily)" → "Vulpix A", the naming the stats sheet (and speciesNames) uses */
function normalise(raw: string): string[] {
  return raw
    .split(/\s*[/,]\s*/)
    .map((part) =>
      part
        .replace(/\(.*?\)/g, '')
        .replace(/\b(Egg|Shiny|Gigantamax|Post-game)\b/g, '')
        .replace(/^Alcremie \w+$/, 'Alcremie')
        .replace(/♂️?/g, '-M')
        .replace(/♀️?/g, '-F')
        .replace(/^Unown [A-Z?!]$/, 'Unown')
        .replace(/^Alolan (.+)$/, '$1 A')
        .replace(/^Galarian (.+)$/, '$1 G')
        .replace(/^Hisuian (.+)$/, '$1-Hisui')
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .filter(Boolean);
}

export async function parseEncounters(
  base: Ruleset,
  speciesNames: (raw: string) => string[],
  trainers: TrainerInfo[],
  warnings: string[],
) {
  // checkpoints: the gym splits inferred for the hardest difficulty's boss teams, then the post-game
  const insane = trainers.filter((t) => t.difficulty === 'Insane');
  const checkpoints: Checkpoint[] = [...new Map(insane.filter((t) => t.levelCap).map((t) => [t.split, t.levelCap!])).entries()]
    .sort((a, b) => a[1] - b[1])
    .map(([label, levelCap]) => ({ label, levelCap }));
  checkpoints.push({ label: 'Post-game', levelCap: 100 });
  const POSTGAME = checkpoints.length - 1;
  const byLevel = (level: number) => {
    const i = checkpoints.findIndex((c) => level <= c.levelCap);
    return i < 0 ? POSTGAME : i;
  };

  const species: Record<string, number> = {};
  const resolve = (raw: string) =>
    normalise(raw).flatMap((name) => {
      const direct = base.getSpecies(name);
      return direct ? [direct.id] : speciesNames(name).flatMap((n) => base.getSpecies(n)?.id ?? []);
    });
  const place = (raw: string, at: number, ctx: string, quiet = false) => {
    const ids = resolve(raw);
    if (!ids.length && !quiet) warnings.push(`encounters ${ctx}: no species for "${raw}"`);
    for (const id of ids) if (species[id] === undefined || at < species[id]) species[id] = at;
  };

  const guide = await readWorkbook(`${DOCS}/Pokémon Unbound Location Guide v2.1.1.1.xlsx`);
  const rows = (name: string) => sheetRows(guide.worksheets.find((w) => w.name.startsWith(name))!);

  // wild grass/cave/water/swarm tables: catchable, but with no levels or route order. Unevolved Pokémon
  // count from the start; evolved ones (Avalugg on a late route) are left to evolution, below. Cells mix
  // Pokémon with sub-area labels ("1F - 4F", "Yellow Flowers"), so only cells that resolve count, quietly.
  const wildEvolved = new Set<string>();
  for (const sheet of ['Grass & Cave', 'Surfing, Fishing', 'Swarm Schedule', 'In-game trades']) {
    for (const { cells } of rows(sheet)) {
      for (const cell of cells) {
        if (!cell || /\d|Encounter|Color|Swarm|Version|Credits|Guide/.test(cell)) continue;
        for (const id of resolve(cell)) {
          if (base.getSpecies(id)?.prevo) wildEvolved.add(id);
          else place(id, 0, sheet, true);
        }
      }
    }
  }

  // gifts and statics: timed by their place in the (story-ordered) sheet, post-game when it says so
  let checkpoint = 0;
  let atGymTown = false;
  for (const { n, cells } of rows('Gift & Static')) {
    const [method, , location = '', , a = '', b = '', c = '', requirement = ''] = cells;
    if (!/^(Gift|Static|Mission Reward|Random Egg)$/i.test(method)) continue;
    const town = GYM_TOWNS.find(([re]) => re.test(location));
    if (town) {
      checkpoint = Math.max(checkpoint, town[1]);
      atGymTown = true;
    } else if (atGymTown) {
      // left the gym town, so its gym is behind you
      checkpoint = Math.min(checkpoint + 1, POSTGAME - 1);
      atGymTown = false;
    }
    const post = /Post-game|Beat the League/i.test(`${location} ${requirement} ${c}`);
    const at = post ? POSTGAME : checkpoint;
    for (const raw of new Set([a, b, c].filter(Boolean))) {
      const group = Object.entries(STARTER_GROUPS).find(([k]) => raw.includes(k));
      if (group) group[1].forEach((name) => place(name, at, `gift row ${n}`));
      else if (!/Random|Other|Wild Encounters/.test(raw)) place(raw, at, `gift row ${n}`);
    }
  }
  // you pick one Borrius starter at the very start
  for (const name of STARTER_GROUPS['Borrius Starters']) place(name, 0, 'starter');

  // legendaries, mythicals, Ultra Beasts: all behind the post-game or missions
  for (const { cells } of rows('LegendMythical')) {
    for (const cell of cells) if (cell && !/Requires|Location|Legendary|Post-Game|Mission|Night|Orb|Stone/.test(cell)) place(cell, POSTGAME, 'legendary sheet', true);
  }

  // raids: "3-Star Species (Lv. 35 - 40)" rows list that tier's Pokémon; dens marked (Post-game) wait
  const raids = await readWorkbook(`${DOCS}/Pokémon Unbound Raid Drops Table v2.1.1.1.xlsx`);
  for (const ws of raids.worksheets) {
    const post = /Post-game/i.test(ws.name);
    for (const { cells } of sheetRows(ws)) {
      const tier = cells[0]?.match(/Star Species \(Lv\. (\d+)/);
      if (!tier) continue;
      for (const cell of cells.slice(1)) if (cell) place(cell, post ? POSTGAME : byLevel(Number(tier[1])), `raid ${ws.name}`);
    }
  }
  // evolved Pokémon seen in the wild without an obtainable pre-evolution: assume they turn up around
  // the level they'd evolve at, since late routes are where evolved Pokémon live
  for (const id of wildEvolved) {
    if (species[id] !== undefined) continue;
    let sp = base.getSpecies(id);
    let reachable = false;
    while (sp?.prevo) {
      if (species[base.getSpecies(sp.prevo)!.id] !== undefined) reachable = true;
      sp = base.getSpecies(sp.prevo);
    }
    if (reachable) continue;
    const level = Number(base.getSpecies(id)!.evoMethod?.match(/^Level (\d+)/)?.[1] ?? 30);
    place(id, byLevel(level), 'wild evolved');
  }
  return { checkpoints, species };
}
