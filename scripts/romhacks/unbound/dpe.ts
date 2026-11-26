// Parses Skeli's Dynamic Pokémon Expansion source (Unbound branch, the data Unbound 2.1.1 is built from):
// learnsets, egg moves, TM compatibility, typings, and abilities.
// Files live in Documentation/Unbound/source/dpe (gitignored); see the README for where they come from.
import { readdir, readFile } from 'node:fs/promises';
import type { CompactLearnset } from '../../../src/rulesets/romhack';
import type { Ruleset, SpeciesInfo, TypeName } from '../../../src/rulesets/types';
import { toID } from '../../../src/rulesets/official';

const DIR = 'Documentation/Unbound/source/dpe';

/** Constants whose names don't reduce to the @pkmn id */
const SPECIES_SPECIAL: Record<string, string> = {
  PUMPKABOO: 'Pumpkaboo-Small', PUMPKABOO_M: 'Pumpkaboo', PUMPKABOO_L: 'Pumpkaboo-Large', PUMPKABOO_XL: 'Pumpkaboo-Super',
  GOURGEIST: 'Gourgeist-Small', GOURGEIST_M: 'Gourgeist', GOURGEIST_L: 'Gourgeist-Large', GOURGEIST_XL: 'Gourgeist-Super',
  MINIOR_SHIELD: 'Minior-Meteor', LYCANROC_N: 'Lycanroc-Midnight', WISHIWASHI_S: 'Wishiwashi-School',
  ORICORIO_Y: 'Oricorio-Pom-Pom', ORICORIO_P: "Oricorio-Pa'u", ORICORIO_S: 'Oricorio-Sensu',
  MAGEARNA_P: 'Magearna-Original', PICHU_SPIKY: 'Pichu-Spiky-eared', CHERRIM_SUN: 'Cherrim-Sunshine',
  MEOWSTIC_FEMALE: 'Meowstic-F', INDEEDEE_FEMALE: 'Indeedee-F', BASCULEGION_M: 'Basculegion',
  URSHIFU_SINGLE: 'Urshifu', URSHIFU_RAPID: 'Urshifu-Rapid-Strike', XERNEAS_NATURAL: 'Xerneas',
  CALYREX_ICE_RIDER: 'Calyrex-Ice', CALYREX_SHADOW_RIDER: 'Calyrex-Shadow', BASCULIN_RED: 'Basculin', BASCULIN_H: 'Basculin-White-Striped',
  ARCEUS_FIGHT: 'Arceus-Fighting', SILVALLY_FIGHT: 'Silvally-Fighting',
  PIKACHU_CAP_ORIGINAL: 'Pikachu-Original', PIKACHU_CAP_HOENN: 'Pikachu-Hoenn', PIKACHU_CAP_SINNOH: 'Pikachu-Sinnoh',
  PIKACHU_CAP_UNOVA: 'Pikachu-Unova', PIKACHU_CAP_KALOS: 'Pikachu-Kalos', PIKACHU_CAP_ALOLA: 'Pikachu-Alola',
  PIKACHU_CAP_PARTNER: 'Pikachu-Partner', PIKACHU_POP_STAR: 'Pikachu-Pop-Star', PIKACHU_ROCK_STAR: 'Pikachu-Rock-Star',
};

/**
 * Forms that share their base species' data in @pkmn (colors, genders, cosmetic patterns), Gigantamax
 * forms, and Unbound-only species with no @pkmn equivalent. Skipped without a warning.
 */
const SKIPPED = /^(UNOWN_|BURMY_|SHELLOS_|GASTRODON_|DEERLING_|SAWSBUCK_|FLABEBE_|FLOETTE_(?!ETERNAL)|FLORGES_|FURFROU_|VIVILLON_|MINIOR_(?!SHIELD)|ALCREMIE_|SINISTEA_|POLTEAGEIST_|ZYGARDE_(CELL|CORE)$|MANAPHY_EGG$|.*_GIGA$|(UNFEZANT|FRILLISH|JELLICENT|HIPPOPOTAS|HIPPOWDON|PYROAR)_F(EMALE)?$|(GIBLE|GABITE|GARCHOMP)_B|SHADOW_WARRIOR$|PIKACHU_(SURFING|FLYING)$|MISSINGNO$|EGG$|ETERNATUS_ETERNAMAX$|species$|(KOFFING|MIME_JR)_G$|(EXEGGCUTE|CUBONE)_A$)/;

export function speciesFromConstant(base: Ruleset, constant: string, warnings: string[]): SpeciesInfo | undefined {
  const name = constant.replace(/^SPECIES_/, '');
  if (name === 'NONE' || SKIPPED.test(name)) return undefined;
  const candidates = [
    SPECIES_SPECIAL[name],
    name
      .replace(/_A$/, '_ALOLA')
      .replace(/_G(_ZEN)?$/, '_GALAR$1')
      .replace(/_H$/, '_HISUI'),
  ];
  for (const c of candidates) {
    const sp = c && base.getSpecies(toID(c));
    if (sp) return sp;
  }
  warnings.push(`species ${constant}: no @pkmn match, skipped`);
}

/** MOVE_X / ABILITY_X constants whose names don't reduce to the @pkmn id */
const MOVE_SPECIAL: Record<string, string> = {
  FAINTATTACK: 'feintattack', SMELLINGSALT: 'smellingsalts', HIJUMPKICK: 'highjumpkick', VICEGRIP: 'visegrip',
  SONICBOOM: 'sonicboom', SELFDESTRUCT: 'selfdestruct', DOUBLESLAP: 'doubleslap', THUNDERPUNCH: 'thunderpunch',
};

export function moveFromConstant(base: Ruleset, constant: string, warnings: string[], customMoves: string[] = []) {
  const raw = constant.replace(/^MOVE_/, '').replace(/_/g, '');
  const id = MOVE_SPECIAL[raw] ?? raw.toLowerCase();
  if (customMoves.includes(id) || base.getMove(id)) return customMoves.includes(id) ? id : base.getMove(id)!.id;
  warnings.push(`move ${constant}: no @pkmn match, skipped`);
}

const ABILITY_SPECIAL: Record<string, string> = {
  COMPOUNDEYES: 'compoundeyes', LIGHTNINGROD: 'lightningrod', ASONEGRIM: 'asonespectrier', ASONECHILLING: 'asoneglastrier',
};

function abilityFromConstant(base: Ruleset, constant: string, warnings: string[]) {
  const raw = constant.replace(/^ABILITY_/, '').replace(/_/g, '');
  if (raw === 'NONE') return undefined;
  const ability = base.getAbility(ABILITY_SPECIAL[raw] ?? raw.toLowerCase());
  if (!ability) warnings.push(`ability ${constant}: no @pkmn match, skipped`);
  return ability?.name;
}

const read = (file: string) => readFile(`${DIR}/${file}`, 'utf8');
/** Drop // and /* *\/ comments so commented-out entries don't count */
const stripComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

/** Typings and abilities from Base_Stats.c, keyed by @pkmn species id */
export async function parseBaseStats(base: Ruleset, warnings: string[]) {
  const src = stripComments(await read('Base_Stats.c'));
  const out: Record<string, { types: TypeName[]; abilities: string[] }> = {};
  for (const [, constant, body] of src.matchAll(/\[(SPECIES_\w+)\]\s*=\s*\{([\s\S]*?)\n\s*\}/g)) {
    const sp = speciesFromConstant(base, constant, warnings);
    if (!sp) continue;
    const field = (k: string) => body.match(new RegExp(`\\.${k}\\s*=\\s*(\\w+)`))?.[1];
    const type = (c?: string) => c && c.replace(/^TYPE_/, '').toLowerCase().replace(/^./, (ch) => ch.toUpperCase());
    const types = [...new Set([type(field('type1')), type(field('type2'))].filter((t): t is string => !!t))];
    const abilities = [
      ...new Set(
        ['ability1', 'ability2', 'hiddenAbility']
          .map((k) => field(k))
          .filter((c): c is string => !!c)
          .map((c) => abilityFromConstant(base, c, warnings))
          .filter((a): a is string => !!a),
      ),
    ];
    if (types.some((t) => !base.types.includes(t))) warnings.push(`species ${constant}: unknown type in ${types.join('/')}`);
    out[sp.id] = { types, abilities };
  }
  return out;
}

/** Level-up, TM, and egg moves per @pkmn species id (move tutors aren't in the DPE source) */
export async function parseLearnsets(base: Ruleset, warnings: string[], customMoves: string[]) {
  const move = (c: string) => moveFromConstant(base, c, warnings, customMoves);
  const learnsets: Record<string, CompactLearnset> = {};
  const get = (id: string) => (learnsets[id] ??= { level: [], tm: [], tutor: [], egg: [] });

  // level up: named arrays, then a [SPECIES_X] = sXLevelUpLearnset table
  const lsSrc = stripComments(await read('Learnsets.c'));
  const arrays = new Map<string, [number, string][]>();
  for (const [, name, body] of lsSrc.matchAll(/static const struct LevelUpMove (\w+)\[\]\s*=\s*\{([\s\S]*?)\};/g)) {
    const moves: [number, string][] = [];
    for (const [, lvl, c] of body.matchAll(/LEVEL_UP_MOVE\(\s*(\d+)\s*,\s*(MOVE_\w+)\s*\)/g)) {
      const id = move(c);
      if (id) moves.push([Number(lvl), id]);
    }
    arrays.set(name, moves);
  }
  const table = lsSrc.slice(lsSrc.indexOf('gLevelUpLearnsets'));
  for (const [, constant, arrayName] of table.matchAll(/\[(SPECIES_\w+)\]\s*=\s*(\w+)/g)) {
    const sp = speciesFromConstant(base, constant, warnings);
    const moves = arrays.get(arrayName);
    if (!sp || !moves) continue;
    get(sp.id).level = moves;
  }

  // TMs: gTMHMMoves gives each number's move; tm_compatibility/<n> - <name>.txt lists who learns it
  const tmSrc = stripComments(await read('TM_Tutor_Tables.c'));
  const tmMoves = [...tmSrc.slice(tmSrc.indexOf('gTMHMMoves'), tmSrc.indexOf('gMoveTutorMoves')).matchAll(/MOVE_\w+/g)].map(([c]) => c);
  for (const file of await readdir(`${DIR}/tm_compatibility`)) {
    const num = Number(file.match(/^(\d+)/)?.[1]);
    const constant = tmMoves[num - 1];
    const id = constant && move(constant);
    if (!id) {
      warnings.push(`TM file ${file}: no move for TM ${num}`);
      continue;
    }
    const lines = (await read(`tm_compatibility/${file}`)).split(/\r?\n/).slice(1);
    for (const line of lines.map((l) => l.trim()).filter(Boolean)) {
      const sp = speciesFromConstant(base, `SPECIES_${line}`, warnings);
      if (sp && !get(sp.id).tm.includes(id)) get(sp.id).tm.push(id);
    }
  }

  // egg moves are listed on the first stage; evolutions inherit them
  const eggSrc = stripComments(await read('Egg_Moves.c'));
  const eggByBase = new Map<string, string[]>();
  for (const [, constant, body] of eggSrc.matchAll(/egg_moves\(\s*(\w+)\s*,([\s\S]*?)\)/g)) {
    const sp = speciesFromConstant(base, `SPECIES_${constant}`, warnings);
    if (sp) eggByBase.set(sp.id, [...body.matchAll(/MOVE_\w+/g)].map(([c]) => move(c)).filter((m): m is string => !!m));
  }
  for (const id of Object.keys(learnsets)) {
    let sp = base.getSpecies(id);
    // walk back to the first stage; Megas and Primals have no prevo, so step to their base form first
    const megaBase = /-(Mega|Primal)/.test(sp?.name ?? '') ? base.getSpecies(sp!.name.replace(/-(Mega|Primal).*/, '')) : undefined;
    if (megaBase) sp = megaBase;
    while (sp && !eggByBase.has(sp.id) && sp.prevo) sp = base.getSpecies(sp.prevo);
    learnsets[id].egg = (sp && eggByBase.get(sp.id)) ?? [];
  }
  return learnsets;
}
