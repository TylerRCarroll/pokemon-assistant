// A battle between two teams on Showdown's engine (@pkmn/sim), driven directly rather than through
// text streams so we can read the state, clone it for search, and add what the games have and
// Showdown doesn't (the bag). A battle is fully determined by its setup (teams, seed) and the
// decisions made, so replaying the decisions rebuilds it exactly: that's how rewind and replays work.
import { Battle, extractChannelMessages, type Pokemon, type Side } from '@pkmn/sim';
import { getRuleset } from '../rulesets/registry';
import type { Ruleset } from '../rulesets/types';
import type { TeamSet } from '../lib/team';
import { applyBagItem, bagItem, bagItemsFor, bagUsable, type BagItemId, type BagUse } from './bag';
import { simFormat } from './mods';

export type SideID = 'p1' | 'p2';
type ChoiceRequest = NonNullable<Side['activeRequest']>;
type PokemonMoveRequestData = Extract<ChoiceRequest, { active: unknown }>['active'][number];
export type Gimmick = 'mega' | 'zmove' | 'ultra' | 'dynamax' | 'terastallize';

export type Action =
  /** Move slot 1-4, optionally with that gen's gimmick */
  | { kind: 'move'; move: number; gimmick?: Gimmick }
  /** Party index (0-based, in the sim's current party order) */
  | { kind: 'switch'; to: number }
  | { kind: 'bag'; use: BagUse }
  | { kind: 'forfeit' };

export type Bag = Partial<Record<BagItemId, number>>;

export interface SideSetup {
  name: string;
  team: TeamSet[];
  bag?: Bag;
}

export interface BattleSetup {
  rulesetId: string;
  /** Game being played, where a remake's mechanics differ (BDSP) */
  game?: string;
  /** Four numbers: the same seed and decisions always give the same battle */
  seed: [number, number, number, number];
  sides: [SideSetup, SideSetup];
}

/** What each side that had to choose did at one decision point */
export type Decision = Partial<Record<SideID, Action>>;

export const SIDES: SideID[] = ['p1', 'p2'];
const index = (side: SideID) => (side === 'p1' ? 0 : 1);

export const newSeed = (): BattleSetup['seed'] => [0, 0, 0, 0].map(() => Math.floor(Math.random() * 0x10000)) as BattleSetup['seed'];

/** Our set → Showdown's set: the same fields, by name */
export function toSimSet(set: TeamSet) {
  return {
    name: set.species,
    species: set.species,
    item: set.item ?? '',
    ability: set.ability ?? '',
    moves: set.moves.filter(Boolean),
    nature: set.nature ?? '',
    evs: { ...set.evs },
    ivs: { ...set.ivs },
    level: set.level,
    gender: set.gender ?? '',
    shiny: set.shiny,
    teraType: set.teraType,
  };
}

function simTeam(team: TeamSet[]) {
  const seen = new Map<string, number>();
  return team.map((set) => {
    // nicknames must be unique for the protocol to tell two of a species apart
    const n = (seen.get(set.species) ?? 0) + 1;
    seen.set(set.species, n);
    return { ...toSimSet(set), name: n > 1 ? `${set.species} ${n}` : set.species };
  });
}

export class BattleSession {
  readonly battle: Battle;
  readonly setup: BattleSetup;
  readonly rs: Ruleset;
  readonly decisions: Decision[];
  /** Items left in each side's bag */
  readonly bags: [Bag, Bag];

  private constructor(setup: BattleSetup, battle: Battle, decisions: Decision[], bags: [Bag, Bag]) {
    this.setup = setup;
    this.battle = battle;
    this.rs = getRuleset(setup.rulesetId);
    this.decisions = decisions;
    this.bags = bags;
  }

  static start(setup: BattleSetup): BattleSession {
    const rs = getRuleset(setup.rulesetId);
    const { formatid } = simFormat(rs, setup.game);
    const battle = new Battle({ formatid: formatid as never, seed: setup.seed.join(',') as never });
    setup.sides.forEach((s, i) => battle.setPlayer(SIDES[i], { name: s.name, team: simTeam(s.team) as never }));
    return new BattleSession(setup, battle, [], [{ ...setup.sides[0].bag }, { ...setup.sides[1].bag }]);
  }

  /** The battle after the first `upTo` decisions (all of them by default): rewind, replays */
  static replay(setup: BattleSetup, decisions: Decision[], upTo = decisions.length): BattleSession {
    const session = BattleSession.start(setup);
    for (const d of decisions.slice(0, upTo)) session.submit(d);
    return session;
  }

  /** An independent copy at the same point, for looking ahead */
  clone(): BattleSession {
    simFormat(this.rs, this.setup.game); // the format must be registered wherever this runs
    const battle = Battle.fromJSON(JSON.stringify(this.battle.toJSON()));
    return new BattleSession(this.setup, battle, [...this.decisions], [{ ...this.bags[0] }, { ...this.bags[1] }]);
  }

  get ended() {
    return this.battle.ended;
  }
  /** The winning side, '' for a tie, undefined while it's going */
  get winner(): SideID | '' | undefined {
    if (!this.battle.ended) return undefined;
    return SIDES.find((s) => this.battle.sides[index(s)].name === this.battle.winner) ?? '';
  }
  get turn() {
    return this.battle.turn;
  }

  side(side: SideID) {
    return this.battle.sides[index(side)];
  }
  active(side: SideID): Pokemon | undefined {
    return this.side(side).active[0] ?? undefined;
  }

  /** Sides that have to choose before the battle goes on */
  pending(): SideID[] {
    if (this.battle.ended) return [];
    return SIDES.filter((s) => {
      const req = this.side(s).activeRequest;
      return !!req && !req.wait;
    });
  }

  /** Everything the side may do now */
  legal(side: SideID): Action[] {
    const req = this.side(side).activeRequest;
    if (!req || req.wait || this.battle.ended) return [];
    const party = this.side(side).pokemon;
    const switches = party.flatMap((p, i) => (!p.isActive && !p.fainted ? [{ kind: 'switch' as const, to: i }] : []));
    if (req.forceSwitch) return switches;
    const active = moveRequest(req);
    if (!active) return [];

    const out: Action[] = [];
    active.moves.forEach((m, i) => {
      if (m.disabled || (m.pp !== undefined && m.pp <= 0 && active.moves.length > 1)) return;
      out.push({ kind: 'move', move: i + 1 });
      if (active.canMegaEvo) out.push({ kind: 'move', move: i + 1, gimmick: 'mega' });
      if (active.canUltraBurst) out.push({ kind: 'move', move: i + 1, gimmick: 'ultra' });
      if (active.canZMove?.[i]) out.push({ kind: 'move', move: i + 1, gimmick: 'zmove' });
      if (active.canDynamax) out.push({ kind: 'move', move: i + 1, gimmick: 'dynamax' });
      if (active.canTerastallize) out.push({ kind: 'move', move: i + 1, gimmick: 'terastallize' });
    });
    if (!active.trapped) out.push(...switches);
    // no bag while locked into a move (Outrage, Rollout, recharging): the game gives no choice then
    const locked = active.moves.some((m) => m.pp === undefined);
    if (!locked) {
      const bag = this.bags[index(side)];
      for (const item of bagItemsFor(this.battle.gen)) {
        if (!bag[item.id]) continue;
        party.forEach((mon, target) => {
          const moves = item.pickMove ? mon.moveSlots.map((_, m) => m) : [undefined];
          for (const move of moves) {
            const use: BagUse = { item: item.id, target, ...(move !== undefined ? { move } : {}) };
            if (bagUsable(this.battle, index(side), use)) out.push({ kind: 'bag', use });
          }
        });
      }
    }
    return out;
  }

  /** Make the pending sides' choices; throws if one is missing or illegal */
  submit(decision: Decision) {
    const pending = this.pending();
    for (const side of pending) {
      const action = decision[side];
      if (!action) throw new Error(`${side} has to choose`);
      if (action.kind === 'forfeit') {
        this.decisions.push(decision);
        this.battle.lose(side);
        return;
      }
      if (!this.legal(side).some((a) => sameAction(a, action))) throw new Error(`${side}: illegal action ${JSON.stringify(action)}`);
    }
    // the bag goes first, before anyone moves
    const choices: [SideID, string][] = [];
    for (const side of pending) {
      const action = decision[side]!;
      if (action.kind === 'bag') {
        const bag = this.bags[index(side)];
        bag[action.use.item] = (bag[action.use.item] ?? 1) - 1;
        applyBagItem(this.battle, index(side), action.use);
        // the item took the turn: submit any move, and cancel it before it runs
        this.active(side)!.addVolatile('ppbagturn');
        const slot = moveRequest(this.side(side).activeRequest)!.moves.findIndex((m) => !m.disabled);
        choices.push([side, `move ${slot + 1}`]);
      } else choices.push([side, choiceString(action)]);
    }
    this.decisions.push(decision);
    for (const [side, choice] of choices) {
      if (!this.battle.choose(side, choice)) throw new Error(`${side}: the sim refused "${choice}"`);
    }
  }

  /** The protocol log with every detail (exact HP for both sides) */
  log(): string[] {
    return extractChannelMessages(this.battle.log.join('\n'), [-1])[-1];
  }
}

/** The active Pokémon's options in a move request (none for switch, wait, or preview requests) */
function moveRequest(req: ChoiceRequest | null): PokemonMoveRequestData | undefined {
  return req && 'active' in req && !req.wait && !req.forceSwitch ? req.active[0] : undefined;
}

export function choiceString(action: Action): string {
  switch (action.kind) {
    case 'move':
      return `move ${action.move}${action.gimmick ? ` ${action.gimmick}` : ''}`;
    case 'switch':
      return `switch ${action.to + 1}`;
    default:
      throw new Error(`${action.kind} has no choice string`);
  }
}

export function sameAction(a: Action, b: Action): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'move' && b.kind === 'move') return a.move === b.move && (a.gimmick ?? '') === (b.gimmick ?? '');
  if (a.kind === 'switch' && b.kind === 'switch') return a.to === b.to;
  if (a.kind === 'bag' && b.kind === 'bag') return a.use.item === b.use.item && a.use.target === b.use.target && (a.use.move ?? -1) === (b.use.move ?? -1);
  return a.kind === 'forfeit';
}

/** A short name for an action, for logs and the advisor */
export function describeAction(session: BattleSession, side: SideID, action: Action): string {
  const s = session.side(side);
  switch (action.kind) {
    case 'move': {
      const mon = session.active(side);
      const name = mon?.moveSlots[action.move - 1]?.move ?? `Move ${action.move}`;
      const gimmick = { mega: ' + Mega Evolve', ultra: ' + Ultra Burst', zmove: ' (Z-Move)', dynamax: ' + Dynamax', terastallize: ' + Terastallize' };
      return name + (action.gimmick ? gimmick[action.gimmick] : '');
    }
    case 'switch':
      return `Switch to ${s.pokemon[action.to].name}`;
    case 'bag':
      return `${bagItem(action.use.item).name} on ${s.pokemon[action.use.target].name}`;
    case 'forfeit':
      return 'Forfeit';
  }
}
