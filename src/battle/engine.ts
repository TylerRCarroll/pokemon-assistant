// A battle between two teams on Showdown's engine (@pkmn/sim), driven directly rather than through
// text streams so we can read the state, clone it for search, and add what the games have and
// Showdown doesn't (the bag). A battle is fully determined by its setup (teams, seed) and the
// decisions made, so replaying the decisions rebuilds it exactly: that's how rewind and replays work.
import { Battle, Dex, extractChannelMessages, type Pokemon, type Side } from '@pkmn/sim';
import { getRuleset } from '../rulesets/registry';
import type { Ruleset } from '../rulesets/types';
import type { TeamSet } from '../lib/team';
import { applyBagItem, bagItem, bagItemsFor, bagUsable, type BagItemId, type BagUse } from './bag';
import { simFormat, type GameType } from './mods';

export type SideID = 'p1' | 'p2';
type ChoiceRequest = NonNullable<Side['activeRequest']>;
type PokemonMoveRequestData = Extract<ChoiceRequest, { active: unknown }>['active'][number];
export type Gimmick = 'mega' | 'zmove' | 'ultra' | 'dynamax' | 'terastallize';

export type Action =
  /**
   * Move slot 1-4, optionally with that gen's gimmick. In doubles and triples, `target` is Showdown's
   * target location: 1-3 for a foe, -1 to -3 for an ally (spread and self moves take none)
   */
  | { kind: 'move'; move: number; gimmick?: Gimmick; target?: number }
  /** Party index (0-based, in the sim's current party order) */
  | { kind: 'switch'; to: number }
  | { kind: 'bag'; use: BagUse }
  /** Triples: an outer Pokémon moves to the middle */
  | { kind: 'shift' }
  /** A slot with nothing to do this time (it didn't faint while its partner did) */
  | { kind: 'pass' }
  | { kind: 'forfeit' };

export type Bag = Partial<Record<BagItemId, number>>;

/** A Pokémon's condition carried in from an earlier fight (gauntlets) */
export interface MonState {
  /** HP left, 0 for fainted */
  hp: number;
  status?: string;
  /** PP left per move slot */
  pp?: number[];
}

export interface SideSetup {
  name: string;
  team: TeamSet[];
  bag?: Bag;
  /** Any item, any number of times (a well-stocked bag), instead of counting `bag` */
  unlimitedBag?: boolean;
  /** Per team member, its condition from an earlier fight; full health when absent */
  state?: (MonState | undefined)[];
}

export interface BattleSetup {
  rulesetId: string;
  /** Game being played, where a remake's mechanics differ (BDSP) */
  game?: string;
  /** Four numbers: the same seed and decisions always give the same battle */
  seed: [number, number, number, number];
  sides: [SideSetup, SideSetup];
  /** Singles by default */
  gameType?: GameType;
}

/** What each side that had to choose did at one decision point: one action, or one per active slot in doubles and triples */
export type Decision = Partial<Record<SideID, Action | Action[]>>;

export const SIDES: SideID[] = ['p1', 'p2'];
const index = (side: SideID) => (side === 'p1' ? 0 : 1);
const LOCS = [1, 2, 3, -1, -2, -3];

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

/**
 * Nicknames by team position, as the battle will show them: Showdown names an un-nicknamed Pokémon
 * after its base species (Rotom-Wash is "Rotom"), so that's the name, numbered when it repeats so
 * the protocol can tell them apart
 */
function simNames(team: TeamSet[]): string[] {
  const seen = new Map<string, number>();
  return team.map((set) => {
    const base = Dex.species.get(set.species).baseSpecies || set.species;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return (n > 1 ? `${base} ${n}` : base).slice(0, 20);
  });
}

/**
 * The team as the sim gets it, and each member's carried-in state. Fainted members go to the back,
 * so the first healthy one leads, as in the games.
 */
function simTeam(side: SideSetup) {
  const names = simNames(side.team);
  const members = side.team.map((set, i) => ({ set: { ...toSimSet(set), name: names[i] }, state: side.state?.[i] }));
  return [...members.filter((m) => m.state?.hp !== 0), ...members.filter((m) => m.state?.hp === 0)];
}

/** Carry HP, status, PP, and faints in from an earlier fight */
function applyState(battle: Battle, sideIndex: number, states: (MonState | undefined)[]) {
  const s = battle.sides[sideIndex];
  s.pokemon.forEach((mon, i) => {
    const st = states[i];
    if (!st) return;
    if (st.hp === 0) {
      mon.hp = 0;
      mon.fainted = true;
      mon.status = 'fnt' as Pokemon['status'];
      return;
    }
    mon.hp = Math.min(mon.maxhp, Math.max(1, st.hp));
    if (st.status) {
      // setStatus only works on a Pokémon in battle; this is its effect, without the message.
      // A carried-in sleep gets two turns left, so the battle stays the same on replay
      mon.status = st.status as Pokemon['status'];
      mon.statusState = battle.initEffectState({ id: st.status, target: mon, ...(st.status === 'slp' ? { startTime: 2, time: 2 } : {}), ...(st.status === 'tox' ? { stage: 0 } : {}) });
    }
    st.pp?.forEach((pp, m) => {
      if (mon.moveSlots[m]) mon.moveSlots[m].pp = Math.min(mon.moveSlots[m].maxpp, pp);
    });
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
    const { formatid } = simFormat(rs, setup.game, setup.gameType);
    const battle = new Battle({ formatid: formatid as never, seed: setup.seed.join(',') as never });
    const teams = setup.sides.map(simTeam);
    // state goes in before the second player joins, which is when the leads come out
    battle.setPlayer('p1', { name: setup.sides[0].name, team: teams[0].map((m) => m.set) as never });
    applyState(battle, 0, teams[0].map((m) => m.state));
    battle.setPlayer('p2', { name: setup.sides[1].name, team: teams[1].map((m) => m.set) as never });
    applyState(battle, 1, teams[1].map((m) => m.state));
    // the start resets the count of Pokémon left; carried-in faints don't count
    for (const side of battle.sides) side.pokemonLeft = side.pokemon.filter((p) => !p.fainted).length;
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
    simFormat(this.rs, this.setup.game, this.setup.gameType); // the format must be registered wherever this runs
    const battle = Battle.fromJSON(JSON.stringify(this.battle.toJSON()));
    // the state's references name classes; if a build renamed them, nothing restores to a real
    // Pokémon. Replaying the decisions is slower but always right
    if (!battle.sides.every((s) => s.active.every((p) => !p || typeof p.getMoveRequestData === 'function'))) {
      return BattleSession.replay(this.setup, this.decisions);
    }
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
  /** Pokémon in battle per side: 1, 2, or 3 */
  get slots() {
    return this.battle.activePerHalf;
  }

  side(side: SideID) {
    return this.battle.sides[index(side)];
  }
  active(side: SideID, slot = 0): Pokemon | undefined {
    return this.side(side).active[slot] ?? undefined;
  }

  /** Sides that have to choose before the battle goes on */
  pending(): SideID[] {
    if (this.battle.ended) return [];
    return SIDES.filter((s) => {
      const req = this.side(s).activeRequest;
      return !!req && !req.wait;
    });
  }

  /** Everything the side may do now (singles; slot 0 in doubles and triples) */
  legal(side: SideID): Action[] {
    return this.legalSlot(side, 0);
  }

  /** What one active slot may do now. Two slots switching in the same Pokémon is checked on submit */
  legalSlot(side: SideID, slot: number): Action[] {
    const req = this.side(side).activeRequest;
    if (!req || req.wait || this.battle.ended) return [];
    const party = this.side(side).pokemon;
    const switches = party.flatMap((p, i) => (!p.isActive && !p.fainted ? [{ kind: 'switch' as const, to: i }] : []));
    if (req.forceSwitch) {
      const forced = Array.isArray(req.forceSwitch) ? req.forceSwitch : [true];
      if (!forced[slot] || !switches.length) return [{ kind: 'pass' }];
      // more fainted slots than Pokémon left to send: a slot may stay empty
      const short = forced.filter(Boolean).length > switches.length;
      return short ? [...switches, { kind: 'pass' }] : switches;
    }
    const active = moveRequest(req, slot);
    const mon = this.active(side, slot);
    if (!active || !mon || mon.fainted) return [{ kind: 'pass' }];

    const out: Action[] = [];
    active.moves.forEach((m, i) => {
      if (m.disabled || (m.pp !== undefined && m.pp <= 0 && active.moves.length > 1)) return;
      for (const target of this.targetsFor(mon, m.target)) {
        const t = target !== undefined ? { target } : {};
        out.push({ kind: 'move', move: i + 1, ...t });
        if (active.canMegaEvo) out.push({ kind: 'move', move: i + 1, gimmick: 'mega', ...t });
        if (active.canUltraBurst) out.push({ kind: 'move', move: i + 1, gimmick: 'ultra', ...t });
        if (active.canZMove?.[i]) out.push({ kind: 'move', move: i + 1, gimmick: 'zmove', ...t });
        if (active.canDynamax) out.push({ kind: 'move', move: i + 1, gimmick: 'dynamax', ...t });
        if (active.canTerastallize) out.push({ kind: 'move', move: i + 1, gimmick: 'terastallize', ...t });
      }
    });
    if (!active.trapped) out.push(...switches);
    // triples: an outer Pokémon can move to the middle
    if (this.slots === 3 && slot !== 1) out.push({ kind: 'shift' });
    // no bag while locked into a move (Outrage, Rollout, recharging): the game gives no choice then
    const locked = active.moves.some((m) => m.pp === undefined);
    if (!locked) {
      for (const item of bagItemsFor(this.battle.gen)) {
        if (this.bagLeft(side, item.id) <= 0) continue;
        party.forEach((p, target) => {
          // X items and the like work on the Pokémon whose turn it is
          if (item.target === 'active' && p !== mon) return;
          const moves = item.pickMove ? p.moveSlots.map((_, m) => m) : [undefined];
          for (const move of moves) {
            const use: BagUse = { item: item.id, target, ...(move !== undefined ? { move } : {}) };
            if (bagUsable(this.battle, index(side), use)) out.push({ kind: 'bag', use });
          }
        });
      }
    }
    return out;
  }

  /** How many of an item the side has left (Infinity for an unlimited bag) */
  bagLeft(side: SideID, item: BagItemId): number {
    return this.setup.sides[index(side)].unlimitedBag ? Infinity : (this.bags[index(side)][item] ?? 0);
  }

  /** The targets a move can be aimed at: none needed in singles or for spread moves, else every Pokémon in reach */
  private targetsFor(mon: Pokemon, targetType?: string): (number | undefined)[] {
    if (this.slots === 1 || !targetType || !this.battle.actions.targetTypeChoices(targetType)) return [undefined];
    const reach = LOCS.filter((loc) => this.battle.validTargetLoc(loc, mon, targetType as never));
    const standing = reach.filter((loc) => mon.getAtLoc(loc) && !mon.getAtLoc(loc)!.fainted);
    return standing.length ? standing : reach.length ? [reach[0]] : [undefined];
  }

  /** Make the pending sides' choices; throws if one is missing or illegal */
  submit(decision: Decision) {
    const pending = this.pending();
    const perSlot = new Map<SideID, Action[]>();
    for (const side of pending) {
      const given = decision[side];
      if (!given) throw new Error(`${side} has to choose`);
      const actions = Array.isArray(given) ? [...given] : [given];
      if (actions.some((a) => a.kind === 'forfeit')) {
        this.decisions.push(decision);
        this.battle.lose(side);
        return;
      }
      // slots beyond those given pass (a single switch in a doubles forced switch)
      while (actions.length < this.slots) actions.push({ kind: 'pass' });
      actions.forEach((action, slot) => {
        if (!this.legalSlot(side, slot).some((a) => sameAction(a, action))) {
          throw new Error(`${side}: illegal action ${JSON.stringify(action)}${this.slots > 1 ? ` for slot ${slot + 1}` : ''}`);
        }
      });
      const switchTo = actions.flatMap((a) => (a.kind === 'switch' ? [a.to] : []));
      if (new Set(switchTo).size < switchTo.length) throw new Error(`${side}: two slots can't switch in the same Pokémon`);
      const gimmicks = actions.flatMap((a) => (a.kind === 'move' && a.gimmick ? [a.gimmick] : []));
      if (new Set(gimmicks).size < gimmicks.length) throw new Error(`${side}: one ${gimmicks[0]} per side`);
      perSlot.set(side, actions);
    }
    // the bag goes first, before anyone moves
    const choices: [SideID, string][] = [];
    for (const side of pending) {
      const parts = perSlot.get(side)!.map((action, slot) => {
        if (action.kind !== 'bag') return choiceString(action);
        if (!this.setup.sides[index(side)].unlimitedBag) {
          const bag = this.bags[index(side)];
          bag[action.use.item] = (bag[action.use.item] ?? 1) - 1;
        }
        applyBagItem(this.battle, index(side), action.use);
        // the item took this Pokémon's turn: submit any move for it, and cancel the move before it runs
        const mon = this.active(side, slot)!;
        mon.addVolatile('ppbagturn');
        const req = moveRequest(this.side(side).activeRequest, slot)!;
        const m = req.moves.findIndex((x) => !x.disabled);
        const target = this.targetsFor(mon, req.moves[m].target)[0];
        return `move ${m + 1}${target !== undefined ? ` ${target}` : ''}`;
      });
      choices.push([side, parts.join(', ')]);
    }
    this.decisions.push(decision);
    for (const [side, choice] of choices) {
      if (!this.battle.choose(side, choice)) throw new Error(`${side}: the sim refused "${choice}"`);
    }
  }

  /** Each Pokémon's condition now, in the order the setup listed the team (for the next fight of a gauntlet) */
  state(side: SideID): MonState[] {
    const s = this.side(side);
    return simNames(this.setup.sides[index(side)].team).map((name) => {
      const mon = s.pokemon.find((p) => p.name === name);
      return mon ? { hp: mon.fainted ? 0 : mon.hp, status: mon.status || undefined, pp: mon.moveSlots.map((m) => m.pp) } : { hp: 0 };
    });
  }

  /** The protocol log with every detail (exact HP for both sides) */
  log(): string[] {
    return extractChannelMessages(this.battle.log.join('\n'), [-1])[-1];
  }
}

/** An active Pokémon's options in a move request (none for switch, wait, or preview requests) */
function moveRequest(req: ChoiceRequest | null, slot = 0): PokemonMoveRequestData | undefined {
  return req && 'active' in req && !req.wait && !req.forceSwitch ? req.active[slot] : undefined;
}

export function choiceString(action: Action): string {
  switch (action.kind) {
    case 'move':
      return `move ${action.move}${action.target !== undefined ? ` ${action.target}` : ''}${action.gimmick ? ` ${action.gimmick}` : ''}`;
    case 'switch':
      return `switch ${action.to + 1}`;
    case 'shift':
      return 'shift';
    case 'pass':
      return 'pass';
    default:
      throw new Error(`${action.kind} has no choice string`);
  }
}

export function sameAction(a: Action, b: Action): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'move' && b.kind === 'move') return a.move === b.move && (a.gimmick ?? '') === (b.gimmick ?? '') && (a.target ?? 0) === (b.target ?? 0);
  if (a.kind === 'switch' && b.kind === 'switch') return a.to === b.to;
  if (a.kind === 'bag' && b.kind === 'bag') return a.use.item === b.use.item && a.use.target === b.use.target && (a.use.move ?? -1) === (b.use.move ?? -1);
  return true;
}

/** A short name for an action, for logs and the advisor */
export function describeAction(session: BattleSession, side: SideID, action: Action, slot = 0): string {
  const s = session.side(side);
  switch (action.kind) {
    case 'move': {
      const mon = session.active(side, slot);
      const name = mon?.moveSlots[action.move - 1]?.move ?? `Move ${action.move}`;
      const gimmick = { mega: ' + Mega Evolve', ultra: ' + Ultra Burst', zmove: ' (Z-Move)', dynamax: ' + Dynamax', terastallize: ' + Terastallize' };
      const target = action.target !== undefined && mon ? mon.getAtLoc(action.target) : undefined;
      return name + (target ? ` → ${action.target! < 0 ? 'ally ' : ''}${target.name}` : '') + (action.gimmick ? gimmick[action.gimmick] : '');
    }
    case 'switch':
      return `Switch to ${s.pokemon[action.to].name}`;
    case 'bag':
      return `${bagItem(action.use.item).name} on ${s.pokemon[action.use.target].name}`;
    case 'shift':
      return 'Shift to the middle';
    case 'pass':
      return 'Pass';
    case 'forfeit':
      return 'Forfeit';
  }
}
