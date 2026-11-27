// What the AI players see of a battle: damage estimates from @smogon/calc (not the sim's own
// damage roll, which would draw from its PRNG and change the battle), speed order, and the like.
import type { Pokemon } from '@pkmn/sim';
import { calcMove, type CalcSide, type FieldOptions } from '../../lib/calc';
import type { TeamSet } from '../../lib/team';
import type { BattleSession, SideID } from '../engine';

export const foe = (side: SideID): SideID => (side === 'p1' ? 'p2' : 'p1');

/** A battle Pokémon as a set, in its current form (Mega, Tera), for the calc */
export function setOf(session: BattleSession, mon: Pokemon): TeamSet {
  const dex = session.battle.dex;
  return {
    species: mon.species.name,
    item: mon.item ? dex.items.get(mon.item).name : undefined,
    ability: mon.ability ? dex.abilities.get(mon.ability).name : undefined,
    moves: mon.moveSlots.map((m) => m.move),
    nature: mon.set.nature || undefined,
    evs: { ...mon.set.evs },
    ivs: { ...mon.set.ivs },
    level: mon.level,
    teraType: mon.terastallized || mon.teraType || undefined,
  };
}

function calcSide(session: BattleSession, side: SideID, mon: Pokemon, tera?: boolean): CalcSide {
  const conditions = session.side(side).sideConditions;
  const status = (mon.status || '') as CalcSide['status'];
  return {
    set: setOf(session, mon),
    boosts: { ...mon.boosts },
    status,
    tera: tera || !!mon.terastallized,
    reflect: !!conditions.reflect || !!conditions.auroraveil,
    lightScreen: !!conditions.lightscreen || !!conditions.auroraveil,
  };
}

const WEATHER: Record<string, FieldOptions['weather']> = {
  sunnyday: 'Sun',
  desolateland: 'Sun',
  raindance: 'Rain',
  primordialsea: 'Rain',
  sandstorm: 'Sand',
  snow: 'Snow',
  snowscape: 'Snow',
  hail: 'Hail',
};
const TERRAIN: Record<string, FieldOptions['terrain']> = {
  electricterrain: 'Electric',
  grassyterrain: 'Grassy',
  psychicterrain: 'Psychic',
  mistyterrain: 'Misty',
};

export function fieldOf(session: BattleSession): FieldOptions {
  const f = session.battle.field;
  return { weather: WEATHER[f.weather] ?? '', terrain: TERRAIN[f.terrain] ?? '' };
}

/** Expected damage of one of the attacker's moves, as fractions of the defender's current HP */
export interface Hit {
  min: number;
  max: number;
  avg: number;
}

const ZERO: Hit = { min: 0, max: 0, avg: 0 };

// The same matchups come up again and again in simulations; a calc result depends only on these
const calcCache = new Map<string, ReturnType<typeof calcMove> | null>();
const sideKey = (c: CalcSide) =>
  [c.set.species, c.set.item, c.set.ability, c.set.level, c.set.nature, Object.values(c.set.evs), Object.values(c.set.ivs), c.set.teraType, c.tera, c.status, c.reflect, c.lightScreen, Object.values(c.boosts ?? {})].join('|');

export function hit(session: BattleSession, side: SideID, attacker: Pokemon, defender: Pokemon, move: string, tera = false): Hit {
  if (!defender.hp) return ZERO;
  const a = calcSide(session, side, attacker, tera);
  const d = calcSide(session, foe(side), defender);
  const field = fieldOf(session);
  const key = `${session.rs.id}#${sideKey(a)}#${sideKey(d)}#${move}#${field.weather}#${field.terrain}`;
  let r = calcCache.get(key);
  if (r === undefined) {
    try {
      r = calcMove(session.rs, a, d, move, field) ?? null;
    } catch {
      r = null;
    }
    if (calcCache.size > 20000) calcCache.clear();
    calcCache.set(key, r);
  }
  if (!r) return ZERO;
  const scale = defender.maxhp / 100 / defender.hp;
  return { min: r.minPct * scale, max: r.maxPct * scale, avg: ((r.minPct + r.maxPct) / 2) * scale };
}

/** The attacker's strongest hit on the defender, by average damage */
export function bestHit(session: BattleSession, side: SideID, attacker: Pokemon, defender: Pokemon): Hit & { move?: string } {
  let best: Hit & { move?: string } = ZERO;
  for (const slot of attacker.moveSlots) {
    if (slot.pp <= 0 || slot.disabled) continue;
    const h = hit(session, side, attacker, defender, slot.move);
    if (h.avg > best.avg) best = { ...h, move: slot.move };
  }
  return best;
}

/** Whether `a` moves before `b` with these moves' priorities (speed ties count as no) */
export function movesFirst(a: Pokemon, aPriority: number, b: Pokemon, bPriority: number): boolean {
  if (aPriority !== bPriority) return aPriority > bPriority;
  return a.getActionSpeed() > b.getActionSpeed();
}

/** Seeded random numbers for an AI's choices, so a battle's decisions are reproducible */
export function rng(seed: number[], turn: number, side: SideID): () => number {
  let a = (seed[0] * 73856093) ^ (seed[1] * 19349663) ^ (seed[2] * 83492791) ^ (seed[3] * 2654435761) ^ (turn * 97) ^ (side === 'p1' ? 1 : 2);
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
