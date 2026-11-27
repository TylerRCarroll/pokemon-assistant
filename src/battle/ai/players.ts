// AI players: given a battle and a side that has to choose, pick an action.
//
// In-game: plays like a story trainer. It mostly goes for its strongest hit, uses a status move now
// and then, never switches by choice, sends its next Pokémon in party order, heals with its bag when
// low, and saves Tera or Dynamax for its last Pokémon, as gym leaders do.
//
// Smart: looks one turn ahead with damage calcs and speed order. Each option is scored by what it
// deals against what it takes back: attacking, switching to a better matchup, healing, setting up,
// status. It's quick enough to run thousands of times in simulations.
import type { Pokemon } from '@pkmn/sim';
import { bagItem, healAmount } from '../bag';
import type { Action, BattleSession, SideID } from '../engine';
import { pickSlots } from './multi';
import { bestHit, foe, hit, movesFirst, rng } from './view';

export type AiKind = 'ingame' | 'smart' | 'random';

export interface Player {
  kind: AiKind;
  /** One action in singles; one per active slot in doubles and triples */
  pick(session: BattleSession, side: SideID): Action;
  pickAll(session: BattleSession, side: SideID): Action | Action[];
}

const HEALS = ['maxpotion', 'fullrestore', 'hyperpotion', 'superpotion', 'potion'];

interface Scored {
  action: Action;
  score: number;
}

function best(options: Scored[], random: () => number, noise: number): Action {
  let top = options[0];
  let topScore = -Infinity;
  for (const o of options) {
    const s = o.score + (noise ? (random() - 0.5) * noise : 0);
    if (s > topScore) {
      top = o;
      topScore = s;
    }
  }
  return top.action;
}

function moveData(session: BattleSession, mon: Pokemon, slot: number) {
  return session.battle.dex.moves.get(mon.moveSlots[slot - 1]?.id ?? '');
}

/** A status move's worth, without lookahead: what it would do to this foe now */
function statusValue(session: BattleSession, side: SideID, me: Pokemon, them: Pokemon, slot: number, taken: number): number {
  const move = moveData(session, me, slot);
  if (!move.exists) return 0;
  if (move.status) {
    if (them.status || them.volatiles.substitute) return -0.2;
    // the sim knows immunities: Electric types can't be paralyzed, Fire can't be burned, ...
    if (!them.runStatusImmunity(move.status) || (move.status === 'brn' && them.hasType('Fire'))) return -0.3;
    const physical = them.moveSlots.some((s) => session.battle.dex.moves.get(s.id).category === 'Physical');
    const value = { slp: 0.6, par: them.getActionSpeed() > me.getActionSpeed() ? 0.5 : 0.3, brn: physical ? 0.5 : 0.2, tox: 0.4, psn: 0.25, frz: 0.6 }[move.status] ?? 0.2;
    return value * (move.accuracy === true ? 1 : move.accuracy / 100);
  }
  const selfBoosts = move.target === 'self' ? move.boosts : move.self?.boosts;
  if (selfBoosts) {
    const room = Object.entries(selfBoosts).some(([s, n]) => (n ?? 0) > 0 && me.boosts[s as keyof Pokemon['boosts']] < 2);
    // setting up is worth it when you'll live to use it
    return room && taken < 0.45 ? 0.45 - taken : -0.2;
  }
  if (move.heal || move.flags.heal) {
    const missing = 1 - me.hp / me.maxhp;
    return missing > 0.4 ? missing - taken * 0.5 : -0.2;
  }
  if (move.sideCondition && ['stealthrock', 'spikes', 'toxicspikes', 'stickyweb'].includes(move.id)) {
    const left = session.side(foe(side)).pokemonLeft;
    return session.side(foe(side)).sideConditions[move.id] ? -0.3 : left > 2 ? 0.35 : 0.05;
  }
  if (move.id === 'protect' || move.id === 'detect') return 0.02;
  return 0.05;
}

/** How a Pokémon on the bench would fare against the foe's active one: its hit minus the foe's hit, both as fractions */
function matchup(session: BattleSession, side: SideID, mon: Pokemon, them: Pokemon): number {
  const mine = bestHit(session, side, mon, them).avg;
  const theirs = Math.min(1, bestHit(session, foe(side), them, mon).avg);
  const faster = mon.getActionSpeed() > them.getActionSpeed();
  return Math.min(1, mine) * (faster ? 1.2 : 1) - theirs;
}

function forcedSwitch(session: BattleSession, side: SideID, legal: Action[], smart: boolean): Action {
  if (!smart) return legal[0]; // the next one in the party, as the games do
  const them = session.active(foe(side));
  if (!them) return legal[0];
  const party = session.side(side).pokemon;
  return best(
    legal.map((a) => ({ action: a, score: a.kind === 'switch' ? matchup(session, side, party[a.to], them) : -9 })),
    () => 0.5,
    0,
  );
}

function ingame(session: BattleSession, side: SideID): Action {
  const legal = session.legal(side);
  const random = rng(session.setup.seed, session.turn, side);
  if (legal.every((a) => a.kind === 'switch')) return forcedSwitch(session, side, legal, false);
  const me = session.active(side)!;
  const them = session.active(foe(side))!;
  const last = session.side(side).pokemonLeft === 1;

  // low on HP with a potion in the bag: heal, as trainers do
  if (me.hp / me.maxhp < 0.25) {
    const heal = HEALS.map((id) => legal.find((a) => a.kind === 'bag' && a.use.item === id && session.side(side).pokemon[a.use.target] === me)).find(Boolean);
    if (heal && random() < 0.7) return heal;
  }

  const moves: Scored[] = legal.flatMap((a) => {
    if (a.kind !== 'move') return [];
    // gimmicks: Megas right away, Tera and Dynamax on the last Pokémon
    if (a.gimmick === 'terastallize' || a.gimmick === 'dynamax') {
      if (!last) return [];
    } else if (a.gimmick === 'zmove') return [];
    const move = moveData(session, me, a.move);
    if (move.category === 'Status') return [{ action: a, score: statusValue(session, side, me, them, a.move, 0) * 0.6 }];
    const h = hit(session, side, me, them, move.name, a.gimmick === 'terastallize');
    const accuracy = move.accuracy === true ? 1 : move.accuracy / 100;
    return [{ action: a, score: (Math.min(1, h.avg) + (h.min >= 1 ? 0.3 : 0)) * accuracy + (a.gimmick ? 0.05 : 0) }];
  });
  if (!moves.length) return legal.find((a) => a.kind === 'move') ?? legal[0];
  return best(moves, random, 0.15);
}

function smart(session: BattleSession, side: SideID): Action {
  const legal = session.legal(side);
  const random = rng(session.setup.seed, session.turn, side);
  if (legal.every((a) => a.kind === 'switch')) return forcedSwitch(session, side, legal, true);
  const me = session.active(side)!;
  const them = session.active(foe(side))!;
  const party = session.side(side).pokemon;

  // what the foe is likely to do to me: its strongest hit
  const threat = bestHit(session, foe(side), them, me);
  const threatMove = threat.move ? session.battle.dex.moves.get(threat.move) : undefined;
  const taken = Math.min(1, threat.avg);
  const theyKo = threat.min >= 1;

  const options: Scored[] = legal.map((a): Scored => {
    if (a.kind === 'move') {
      const move = moveData(session, me, a.move);
      const tera = a.gimmick === 'terastallize';
      if (move.category === 'Status') {
        const first = movesFirst(me, move.priority, them, threatMove?.priority ?? 0);
        if (theyKo && !first) return { action: a, score: -1 };
        return { action: a, score: statusValue(session, side, me, them, a.move, taken) - taken * 0.5 };
      }
      const h = hit(session, side, me, them, move.name, tera);
      const accuracy = move.accuracy === true ? 1 : move.accuracy / 100;
      const first = movesFirst(me, move.priority, them, threatMove?.priority ?? 0);
      const ko = h.min >= 1 ? 1 : h.max >= 1 ? 0.5 : 0;
      // knocked out before moving: the move never happens
      if (!first && theyKo) return { action: a, score: -1 + (tera ? 0.1 : 0) };
      const dealt = Math.min(1, h.avg) * accuracy;
      const takenBack = first && ko === 1 && accuracy === 1 ? 0 : taken;
      // a gimmick is spent once: worth it when it changes the outcome
      const spend = a.gimmick && a.gimmick !== 'mega' && a.gimmick !== 'ultra' ? 0.15 : 0;
      return { action: a, score: dealt + ko * 0.6 * accuracy - takenBack * 0.7 - spend };
    }
    if (a.kind === 'switch') {
      const incoming = party[a.to];
      // the incoming Pokémon takes the hit meant for the active one
      const hitIn = threat.move ? Math.min(1, hit(session, foe(side), them, incoming, threat.move).avg) : 0;
      return { action: a, score: matchup(session, side, incoming, them) * 0.6 - hitIn * 0.8 - 0.15 };
    }
    if (a.kind === 'bag') {
      const target = party[a.use.target];
      const item = bagItem(a.use.item);
      if (HEALS.includes(a.use.item) && target === me) {
        const amount = healAmount(a.use.item, session.battle.gen);
        const hp = me.hp / me.maxhp;
        const gained = Math.min(1 - hp, amount === 'full' ? 1 : (amount ?? 0) / me.maxhp);
        // the foe's hit, as a share of max HP; healing into one that still KOs wastes the turn
        const hitBack = threat.avg * hp;
        return { action: a, score: hp + gained - hitBack <= 0 ? -1 : gained * 0.9 - hitBack * 0.4 };
      }
      if (item.target === 'fainted') return { action: a, score: 0.3 - taken * 0.5 };
      if (/heal|awakening|antidote/.test(a.use.item) && target === me && me.status) return { action: a, score: 0.35 - taken * 0.5 };
      return { action: a, score: -0.5 };
    }
    return { action: a, score: -9 };
  });
  return best(options, random, 0.04);
}

function randomPick(session: BattleSession, side: SideID): Action {
  const legal = session.legal(side).filter((a) => a.kind !== 'bag');
  const random = rng(session.setup.seed, session.turn, side);
  return legal[Math.floor(random() * legal.length)] ?? session.legal(side)[0];
}

export function player(kind: AiKind): Player {
  const pick = kind === 'ingame' ? ingame : kind === 'smart' ? smart : randomPick;
  return { kind, pick, pickAll: (session, side) => (session.slots > 1 ? pickSlots(session, side, kind) : pick(session, side)) };
}

/** Let AIs make every pending choice (the ones in `players`), leaving the others to the caller */
export function aiDecision(session: BattleSession, players: Partial<Record<SideID, Player>>) {
  return Object.fromEntries(session.pending().flatMap((side) => (players[side] ? [[side, players[side]!.pickAll(session, side)]] : [])));
}

/** Play a battle out with AIs on both sides; returns the session at the end */
export function playOut(session: BattleSession, p1: Player, p2: Player, maxDecisions = 500): BattleSession {
  for (let i = 0; i < maxDecisions && !session.ended; i++) session.submit(aiDecision(session, { p1, p2 }));
  return session;
}
