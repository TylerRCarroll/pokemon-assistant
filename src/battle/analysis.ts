// Simulation: many AI-vs-AI battles between the same teams, and the "what should I do?" advisor.
// Both run in Web Workers in the app (worker.ts); everything here is plain functions so tests can
// call them directly.
import { BattleSession, describeAction, sameAction, SIDES, type Action, type BattleSetup, type Decision, type SideID } from './engine';
import { aiDecision, player, type AiKind } from './ai/players';

// ---------------------------------------------------------------------------------------------
// Batch

export interface MonStats {
  side: SideID;
  name: string;
  /** Foes it knocked out */
  kos: number;
  fainted: boolean;
  /** Damage dealt to foes, in % of their max HP (a full KO of a healthy foe is 100) */
  damage: number;
}

export interface BattleRecord {
  seed: BattleSetup['seed'];
  decisions: Decision[];
  winner: SideID | '';
  turns: number;
  /** Each side's HP left at the end, in % of the team's total */
  hpLeft: [number, number];
  mons: MonStats[];
}

/** Per-Pokémon stats from the battle log: who hit whom, and who knocked out whom */
export function monStats(session: BattleSession): MonStats[] {
  const stats = new Map<string, MonStats>();
  for (const id of SIDES) {
    for (const p of session.side(id).pokemon) stats.set(`${id}: ${p.name}`, { side: id, name: p.name, kos: 0, fainted: p.fainted, damage: 0 });
  }
  const hp = new Map<string, [number, number]>();
  const key = (ident: string) => ident.replace(/^(p\d)[a-z]?: /, '$1: ');
  const parseHp = (s: string): [number, number] | undefined => {
    const m = /^(\d+)\/(\d+)/.exec(s);
    return m ? [Number(m[1]), Number(m[2])] : undefined;
  };
  let lastAttacker: string | undefined;
  for (const line of session.log()) {
    const p = line.split('|');
    switch (p[1]) {
      case 'switch':
      case 'drag': {
        const h = parseHp(p[4] ?? '');
        if (h) hp.set(key(p[2]), h);
        break;
      }
      case 'move':
        lastAttacker = key(p[2]);
        break;
      case '-damage': {
        const target = key(p[2]);
        const before = hp.get(target);
        const now = p[3] === '0 fnt' ? [0, before?.[1] ?? 1] : parseHp(p[3]);
        if (before && now) {
          // direct hits only: recoil, weather, and status damage have a [from]
          const attacker = !p.slice(4).some((x) => x.startsWith('[from]')) ? lastAttacker : undefined;
          const s = attacker && stats.get(attacker);
          if (s && attacker!.slice(0, 2) !== target.slice(0, 2)) s.damage += ((before[0] - now[0]) / before[1]) * 100;
          hp.set(target, [now[0], before[1]]);
        }
        break;
      }
      case '-heal': {
        const target = key(p[2]);
        const now = parseHp(p[3]);
        if (now) hp.set(target, now);
        break;
      }
      case 'faint': {
        const target = key(p[2]);
        const s = lastAttacker && stats.get(lastAttacker);
        if (s && lastAttacker!.slice(0, 2) !== target.slice(0, 2)) s.kos++;
        break;
      }
      case 'turn':
        lastAttacker = undefined;
        break;
    }
  }
  return [...stats.values()].map((s) => ({ ...s, damage: Math.round(s.damage) }));
}

const hpShare = (session: BattleSession, side: SideID) => {
  const team = session.side(side).pokemon;
  return team.reduce((a, p) => a + p.hp, 0) / team.reduce((a, p) => a + p.maxhp, 0);
};

/** Battle i of a batch: its own seed, derived from the batch's */
export const batchSeed = (seed: BattleSetup['seed'], i: number): BattleSetup['seed'] => [seed[0], seed[1], (seed[2] + i * 7919) & 0xffff, (seed[3] + i) & 0xffff];

export function runBattle(setup: BattleSetup, ai: [AiKind, AiKind]): BattleRecord {
  const session = BattleSession.start(setup);
  const players = { p1: player(ai[0]), p2: player(ai[1]) };
  for (let i = 0; i < 600 && !session.ended; i++) session.submit(aiDecision(session, players));
  return {
    seed: setup.seed,
    decisions: session.decisions,
    winner: session.winner ?? '',
    turns: session.turn,
    hpLeft: [Math.round(hpShare(session, 'p1') * 100), Math.round(hpShare(session, 'p2') * 100)],
    mons: monStats(session),
  };
}

export interface BatchSummary {
  battles: number;
  wins: number;
  losses: number;
  avgTurns: number;
  /** Per Pokémon, averaged over the battles */
  mons: (Omit<MonStats, 'fainted'> & { faintRate: number })[];
}

export function summarize(records: BattleRecord[]): BatchSummary {
  const n = records.length || 1;
  const byMon = new Map<string, { side: SideID; name: string; kos: number; damage: number; fainted: number }>();
  for (const r of records) {
    for (const m of r.mons) {
      const k = `${m.side}|${m.name}`;
      const s = byMon.get(k) ?? { side: m.side, name: m.name, kos: 0, damage: 0, fainted: 0 };
      s.kos += m.kos;
      s.damage += m.damage;
      s.fainted += m.fainted ? 1 : 0;
      byMon.set(k, s);
    }
  }
  return {
    battles: records.length,
    wins: records.filter((r) => r.winner === 'p1').length,
    losses: records.filter((r) => r.winner === 'p2').length,
    avgTurns: Math.round((records.reduce((a, r) => a + r.turns, 0) / n) * 10) / 10,
    mons: [...byMon.values()].map((s) => ({
      side: s.side,
      name: s.name,
      kos: Math.round((s.kos / n) * 100) / 100,
      damage: Math.round(s.damage / n),
      faintRate: Math.round((s.fainted / n) * 100) / 100,
    })),
  };
}

// ---------------------------------------------------------------------------------------------
// Advisor

export interface Advice {
  action: Action;
  label: string;
  /** Estimated chance to win from here after taking it, 0-1 */
  winChance: number;
  /** How many playouts it's based on */
  samples: number;
}

/** Position score for a playout cut short: a smooth stand-in for "who's winning" */
function evaluate(session: BattleSession, side: SideID): number {
  if (session.ended) return session.winner === side ? 1 : session.winner === '' ? 0.5 : 0;
  const mine = hpShare(session, side) + session.side(side).pokemonLeft * 0.05;
  const theirs = hpShare(session, side === 'p1' ? 'p2' : 'p1') + session.side(side === 'p1' ? 'p2' : 'p1').pokemonLeft * 0.05;
  return mine / (mine + theirs || 1);
}

export interface AdviseOptions {
  /** Playouts per option */
  rollouts?: number;
  /** Decisions to play after the option before scoring the position */
  depth?: number;
  /** Only these options (a worker's share) */
  only?: Action[];
}

/**
 * Flat Monte Carlo: for each option, play the battle on from here many times (smart AI on both sides
 * after the first choice, with fresh random rolls each time) and score how it went. An estimate, not
 * a proof: it's as good as the AI that plays the rest.
 */
export function advise(session: BattleSession, side: SideID, opts: AdviseOptions = {}): Advice[] {
  const rollouts = opts.rollouts ?? 24;
  const depth = opts.depth ?? 16;
  const smart = player('smart');
  const other: SideID = side === 'p1' ? 'p2' : 'p1';
  // singles only for now: in doubles an option is a combination of every slot's choice
  if (session.slots > 1) return [];
  const options = (opts.only ?? session.legal(side)).filter((a) => a.kind !== 'forfeit');
  return options
    .map((action) => {
      let total = 0;
      for (let k = 0; k < rollouts; k++) {
        const s = session.clone();
        // fresh random rolls for each playout
        s.battle.resetRNG(`${(k * 2654435761) >>> 16},${k},${s.turn},${options.indexOf(action)}`);
        const first: Decision = { [side]: action };
        if (s.pending().includes(other)) first[other] = smart.pickAll(s, other);
        s.submit(first);
        for (let d = 0; d < depth && !s.ended; d++) s.submit(aiDecision(s, { p1: smart, p2: smart }));
        total += evaluate(s, side);
      }
      return { action, label: describeAction(session, side, action), winChance: total / rollouts, samples: rollouts };
    })
    .sort((a, b) => b.winChance - a.winChance);
}

/** The advice lists of several workers, merged back together */
export function mergeAdvice(parts: Advice[][]): Advice[] {
  const out: Advice[] = [];
  for (const a of parts.flat()) {
    const same = out.find((o) => sameAction(o.action, a.action));
    if (same) {
      same.winChance = (same.winChance * same.samples + a.winChance * a.samples) / (same.samples + a.samples);
      same.samples += a.samples;
    } else out.push({ ...a });
  }
  return out.sort((a, b) => b.winChance - a.winChance);
}

// ---------------------------------------------------------------------------------------------
// Gauntlet: fights back to back, with HP, PP, status, faints, and the bag carried from one to the next

export interface GauntletFight {
  name: string;
  team: BattleSetup['sides'][1]['team'];
  bag?: BattleSetup['sides'][1]['bag'];
}

export interface GauntletSetup {
  rulesetId: string;
  game?: string;
  gameType?: BattleSetup['gameType'];
  seed: BattleSetup['seed'];
  you: BattleSetup['sides'][0];
  fights: GauntletFight[];
  /** Heal everyone between fights (a Pokémon Center between gyms); off for an Elite Four run */
  healBetween?: boolean;
}

export interface GauntletRun {
  /** Index of the fight lost, or undefined for a clean run */
  lostAt?: number;
  /** Each fight played, in order, replayable from the setups it was given */
  fights: { setup: BattleSetup; record: BattleRecord }[];
}

/** The setup for fight i of a run, given how the team came out of the one before */
export function gauntletFightSetup(g: GauntletSetup, i: number, seed: BattleSetup['seed'], carried?: { state?: BattleSetup['sides'][0]['state']; bag?: BattleSetup['sides'][0]['bag'] }): BattleSetup {
  const f = g.fights[i];
  return {
    rulesetId: g.rulesetId,
    game: g.game,
    gameType: g.gameType,
    seed: batchSeed(seed, i * 131),
    sides: [
      { ...g.you, state: g.healBetween ? undefined : carried?.state, bag: carried?.bag ?? g.you.bag },
      { name: f.name, team: f.team, bag: f.bag },
    ],
  };
}

export function runGauntlet(g: GauntletSetup, seed: BattleSetup['seed'], ai: [AiKind, AiKind]): GauntletRun {
  const fights: GauntletRun['fights'] = [];
  let carried: Parameters<typeof gauntletFightSetup>[3];
  for (let i = 0; i < g.fights.length; i++) {
    const setup = gauntletFightSetup(g, i, seed, carried);
    const session = BattleSession.start(setup);
    const players = { p1: player(ai[0]), p2: player(ai[1]) };
    for (let d = 0; d < 600 && !session.ended; d++) session.submit(aiDecision(session, players));
    fights.push({
      setup,
      record: {
        seed: setup.seed,
        decisions: session.decisions,
        winner: session.winner ?? '',
        turns: session.turn,
        hpLeft: [Math.round(hpShare(session, 'p1') * 100), Math.round(hpShare(session, 'p2') * 100)],
        mons: monStats(session),
      },
    });
    if (session.winner !== 'p1') return { lostAt: i, fights };
    carried = { state: session.state('p1'), bag: { ...session.bags[0] } };
  }
  return { fights };
}

export interface GauntletSummary {
  runs: number;
  cleared: number;
  /** Per fight: how many runs reached it, and how many ended there */
  fights: { name: string; reached: number; lost: number; topThreat?: { name: string; kos: number } }[];
  /** Your team across whole runs: KOs and damage per run, and the share of runs it fainted in */
  mons: { name: string; kos: number; damage: number; faintRate: number }[];
}

export function summarizeGauntlet(g: GauntletSetup, runs: GauntletRun[]): GauntletSummary {
  const n = runs.length || 1;
  const fights = g.fights.map((f, i) => {
    const played = runs.flatMap((r) => (r.fights[i] ? [r.fights[i].record] : []));
    // the foe that knocked out the most of you in this fight
    const kos = new Map<string, number>();
    for (const rec of played) for (const m of rec.mons) if (m.side === 'p2') kos.set(m.name, (kos.get(m.name) ?? 0) + m.kos);
    const top = [...kos.entries()].sort((a, b) => b[1] - a[1])[0];
    return {
      name: f.name,
      reached: played.length,
      lost: runs.filter((r) => r.lostAt === i).length,
      ...(top && top[1] > 0 ? { topThreat: { name: top[0], kos: Math.round((top[1] / played.length) * 100) / 100 } } : {}),
    };
  });
  const names = BattleSession.start(gauntletFightSetup(g, 0, g.seed)).side('p1').pokemon.map((p) => p.name);
  const mons = names.map((name) => {
    let kos = 0;
    let damage = 0;
    let fainted = 0;
    for (const r of runs) {
      for (const f of r.fights) {
        const m = f.record.mons.find((x) => x.side === 'p1' && x.name === name);
        kos += m?.kos ?? 0;
        damage += m?.damage ?? 0;
      }
      const last = r.fights[r.fights.length - 1]?.record.mons.find((x) => x.side === 'p1' && x.name === name);
      if (last?.fainted) fainted++;
    }
    return { name, kos: Math.round((kos / n) * 100) / 100, damage: Math.round(damage / n), faintRate: Math.round((fainted / n) * 100) / 100 };
  });
  return { runs: runs.length, cleared: runs.filter((r) => r.lostAt === undefined).length, fights, mons };
}
