// The AI players in doubles and triples: each slot picks its own move and target, then the picks
// are checked against each other (no two slots switching in the same Pokémon, no bag item used twice
// when there's one left). Singles keeps its own code in players.ts.
//
// Spread moves score the damage they deal to every foe, minus what they do to the partner; a move
// aimed at the partner scores as a penalty; switching scores the incoming Pokémon's matchup against
// the foes in battle.
import type { Pokemon } from '@pkmn/sim';
import type { Action, BattleSession, SideID } from '../engine';
import type { AiKind } from './players';
import { bestHit, foe, hit, rng } from './view';

const HEALS = ['maxpotion', 'fullrestore', 'hyperpotion', 'superpotion', 'potion'];
const SPREAD = new Set(['allAdjacentFoes', 'allAdjacent', 'all', 'foeSide']);

function actives(session: BattleSession, side: SideID): Pokemon[] {
  return session.side(side).active.filter((p): p is Pokemon => !!p && !p.fainted);
}

/** One slot's options, scored */
function scoreSlot(session: BattleSession, side: SideID, slot: number, kind: AiKind): { action: Action; score: number }[] {
  const legal = session.legalSlot(side, slot);
  const me = session.active(side, slot);
  const foes = actives(session, foe(side));
  const allies = actives(session, side).filter((p) => p !== me);
  const party = session.side(side).pokemon;
  const dex = session.battle.dex;
  if (!me || me.fainted || legal.every((a) => a.kind === 'pass')) return legal.map((action) => ({ action, score: 0 }));

  // the most any foe can do to me this turn
  const taken = Math.min(1, Math.max(0, ...foes.map((f) => bestHit(session, foe(side), f, me).avg)));
  const last = session.side(side).pokemonLeft <= session.slots;

  return legal.map((action) => {
    if (action.kind === 'move') {
      const move = dex.moves.get(me.moveSlots[action.move - 1]?.id ?? '');
      const tera = action.gimmick === 'terastallize';
      // in-game trainers save Tera and Dynamax for their last Pokémon
      if (kind === 'ingame' && (action.gimmick === 'terastallize' || action.gimmick === 'dynamax') && !last) return { action, score: -9 };
      if (move.category === 'Status') {
        if (action.target !== undefined && action.target < 0) return { action, score: -0.3 };
        return { action, score: (move.status && foes.some((f) => !f.status) ? 0.25 : 0.05) - (kind === 'smart' ? taken * 0.3 : 0) };
      }
      const accuracy = move.accuracy === true ? 1 : move.accuracy / 100;
      let dealt = 0;
      if (action.target !== undefined) {
        const target = me.getAtLoc(action.target);
        if (!target || target.fainted) return { action, score: -1 };
        const h = hit(session, side, me, target, move.name, tera);
        // hitting your partner is a mistake, not a plan
        if (action.target < 0) return { action, score: -0.5 - Math.min(1, h.avg) };
        dealt = Math.min(1, h.avg) + (h.min >= 1 ? 0.5 : 0);
      } else if (SPREAD.has(move.target)) {
        for (const f of foes) {
          const h = hit(session, side, me, f, move.name, tera);
          dealt += Math.min(1, h.avg) + (h.min >= 1 ? 0.4 : 0);
        }
        // Earthquake and the like hit the partner too
        if (move.target === 'allAdjacent') for (const a of allies) dealt -= Math.min(1, hit(session, side, me, a, move.name, tera).avg) * 1.5;
      } else {
        const h = foes[0] ? hit(session, side, me, foes[0], move.name, tera) : { avg: 0, min: 0 };
        dealt = Math.min(1, h.avg);
      }
      return { action, score: dealt * accuracy - (kind === 'smart' ? taken * 0.4 : 0) + (action.gimmick ? 0.03 : 0) };
    }
    if (action.kind === 'switch') {
      if (kind === 'ingame' && legal.some((a) => a.kind === 'move')) return { action, score: -9 };
      const incoming = party[action.to];
      const mine = Math.max(0, ...foes.map((f) => Math.min(1, bestHit(session, side, incoming, f).avg)));
      const theirs = Math.max(0, ...foes.map((f) => Math.min(1, bestHit(session, foe(side), f, incoming).avg)));
      const forced = legal.every((a) => a.kind === 'switch');
      // in-game trainers send the next one in party order
      if (kind === 'ingame') return { action, score: -action.to };
      return { action, score: mine - theirs - (forced ? 0 : 0.25 + taken * 0.2) };
    }
    if (action.kind === 'bag') {
      const target = party[action.use.target];
      if (HEALS.includes(action.use.item) && target === me && me.hp / me.maxhp < 0.3) return { action, score: kind === 'ingame' ? 0.9 : 0.6 - taken * 0.5 };
      return { action, score: -0.5 };
    }
    if (action.kind === 'shift') return { action, score: -0.4 };
    return { action, score: 0 };
  });
}

/** Choices for every active slot, kept consistent with each other */
export function pickSlots(session: BattleSession, side: SideID, kind: AiKind): Action[] {
  const random = rng(session.setup.seed, session.turn, side);
  const noise = kind === 'ingame' ? 0.15 : kind === 'smart' ? 0.04 : 2;
  const used = new Set<number>();
  // one Tera, Mega, Z-Move, or Dynamax per side
  const gimmicks = new Set<string>();
  const bagLeft = { ...session.bags[side === 'p1' ? 0 : 1] };
  const out: Action[] = [];
  for (let slot = 0; slot < session.slots; slot++) {
    const options = scoreSlot(session, side, slot, kind).filter(({ action }) => {
      if (action.kind === 'switch') return !used.has(action.to);
      if (action.kind === 'move' && action.gimmick) return !gimmicks.has(action.gimmick);
      if (action.kind === 'bag') return (bagLeft[action.use.item] ?? 0) > 0;
      return true;
    });
    let best = options[0];
    let top = -Infinity;
    for (const o of options) {
      const s = o.score + (random() - 0.5) * noise;
      if (s > top) {
        top = s;
        best = o;
      }
    }
    const action = best?.action ?? { kind: 'pass' };
    if (action.kind === 'switch') used.add(action.to);
    if (action.kind === 'move' && action.gimmick) gimmicks.add(action.gimmick);
    if (action.kind === 'bag') bagLeft[action.use.item] = (bagLeft[action.use.item] ?? 1) - 1;
    out.push(action);
  }
  return out;
}
