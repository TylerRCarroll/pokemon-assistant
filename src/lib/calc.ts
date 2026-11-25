import { calculate, Field, Move, Pokemon } from '@smogon/calc';
import type { Generation, GenerationNum } from '@pkmn/data';
import { gens, natDexGens } from '../rulesets/official';
import type { MoveInfo, Ruleset, StatsTable } from '../rulesets/types';
import { STAT_IDS, type TeamSet } from './team';

// @smogon/calc's own Generation type is structurally compatible with @pkmn/data's
type CalcGen = Exclude<Parameters<typeof calculate>[0], number>;

const genCache = new WeakMap<Ruleset, CalcGen>();

/** The data generation the calc runs on: the ruleset's mechanics gen, with a borrowed type chart for hacks that need one */
export function calcGeneration(rs: Ruleset): CalcGen {
  let g = genCache.get(rs);
  if (!g) {
    const base: Generation = (rs.natDex ? natDexGens : gens).get(rs.gen as GenerationNum);
    const withChart = rs.typeChartGen
      ? (Object.create(base, { types: { value: gens.get(rs.typeChartGen as GenerationNum).types } }) as Generation)
      : base;
    g = withChart as unknown as CalcGen;
    genCache.set(rs, g);
  }
  return g;
}

export type Boosts = Partial<Omit<StatsTable, 'hp'>>;

export interface CalcSide {
  set: TeamSet;
  boosts?: Boosts;
  /** Terastallized (Gen 9 only) */
  tera?: boolean;
  status?: '' | 'brn' | 'par' | 'psn' | 'tox' | 'slp' | 'frz';
  /** Reflect / Light Screen on this side */
  reflect?: boolean;
  lightScreen?: boolean;
}

export interface FieldOptions {
  weather?: '' | 'Sun' | 'Rain' | 'Sand' | 'Snow' | 'Hail';
  terrain?: '' | 'Electric' | 'Grassy' | 'Psychic' | 'Misty';
  doubles?: boolean;
  crit?: boolean;
}

export function toCalcPokemon(rs: Ruleset, side: CalcSide): Pokemon {
  const g = calcGeneration(rs);
  const sp = rs.getSpecies(side.set.species);
  const s = side.set;
  return new Pokemon(g, sp?.name ?? s.species, {
    level: s.level,
    item: s.item || undefined,
    ability: s.ability || undefined,
    nature: s.nature || undefined,
    evs: s.evs,
    ivs: s.ivs,
    boosts: side.boosts,
    status: side.status || undefined,
    teraType: side.tera && s.teraType ? (s.teraType as never) : undefined,
    // ruleset data wins over the calc's built-in data (romhack stat changes, Fairy retypes)
    overrides: sp ? ({ baseStats: sp.baseStats, types: sp.types } as never) : undefined,
  });
}

// Templates for moves the calc doesn't know (hack-only moves); every relevant field is overridden
const TEMPLATE: Record<MoveInfo['category'], string> = { Physical: 'Tackle', Special: 'Swift', Status: 'Growl' };

export function toCalcMove(rs: Ruleset, name: string, crit = false): Move | undefined {
  const g = calcGeneration(rs);
  const m = rs.getMove(name);
  if (!m) return undefined;
  const known = g.moves.get(m.id as never);
  const overrides = {
    name: m.name,
    type: m.type,
    category: m.category,
    basePower: m.basePower,
    ...(known ? {} : { flags: m.flags ?? {}, drain: m.drain }),
  };
  return new Move(g, known ? m.name : TEMPLATE[m.category], { isCrit: crit, overrides: overrides as never });
}

export interface MoveResult {
  move: string;
  type: string;
  category: MoveInfo['category'];
  /** % of the defender's max HP */
  minPct: number;
  maxPct: number;
  koText: string;
  desc: string;
}

/** Damage of one move. Status moves return undefined. */
export function calcMove(rs: Ruleset, attacker: CalcSide, defender: CalcSide, moveName: string, field: FieldOptions = {}): MoveResult | undefined {
  const info = rs.getMove(moveName);
  const move = toCalcMove(rs, moveName, field.crit);
  if (!info || !move || info.category === 'Status') return undefined;

  const atk = toCalcPokemon(rs, attacker);
  const def = toCalcPokemon(rs, defender);
  const result = calculate(
    calcGeneration(rs),
    atk,
    def,
    move,
    new Field({
      gameType: field.doubles ? 'Doubles' : 'Singles',
      weather: field.weather || undefined,
      terrain: field.terrain || undefined,
      attackerSide: { isReflect: attacker.reflect, isLightScreen: attacker.lightScreen },
      defenderSide: { isReflect: defender.reflect, isLightScreen: defender.lightScreen },
    }),
  );
  const [min, max] = result.range();
  const hp = def.maxHP();
  const round = (n: number) => Math.round((n / hp) * 1000) / 10;
  // calc's desc()/kochance() assert on zero damage, so immunities get our own text
  const immune = max === 0;
  return {
    move: info.name,
    type: info.type,
    category: info.category,
    minPct: round(min),
    maxPct: round(max),
    koText: immune ? 'No damage' : result.kochance().text,
    desc: immune ? `${info.name} doesn't affect ${def.name}` : result.desc(),
  };
}

/** All damaging moves of `attacker` against `defender`, strongest first */
export function calcAll(rs: Ruleset, attacker: CalcSide, defender: CalcSide, field: FieldOptions = {}): MoveResult[] {
  return attacker.set.moves
    .map((m) => calcMove(rs, attacker, defender, m, field))
    .filter((r): r is MoveResult => !!r)
    .sort((a, b) => b.maxPct - a.maxPct);
}

/** Final Speed including boosts, Choice Scarf, and paralysis (ignores abilities like Swift Swim) */
export function effectiveSpeed(rs: Ruleset, side: CalcSide): number {
  const p = toCalcPokemon(rs, side);
  let spe = p.stats.spe;
  const b = side.boosts?.spe ?? 0;
  spe = Math.floor(spe * (b >= 0 ? (2 + b) / 2 : 2 / (2 - b)));
  if (side.set.item === 'Choice Scarf') spe = Math.floor(spe * 1.5);
  if (side.status === 'par') spe = Math.floor(spe * (rs.gen >= 7 ? 0.5 : 0.25));
  return spe;
}

export const BOOST_STATS = STAT_IDS.filter((s) => s !== 'hp') as (keyof Boosts)[];
