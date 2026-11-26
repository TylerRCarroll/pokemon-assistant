import type { Ruleset } from '../rulesets/types';
import { calcAll, effectiveSpeed, type CalcSide, type FieldOptions, type MoveResult } from './calc';
import type { TeamSet } from './team';

export interface Matchup {
  member: TeamSet;
  /** Threat's strongest move against this member */
  theirBest?: MoveResult;
  /** Member's strongest move against the threat */
  yourBest?: MoveResult;
  threatFaster: boolean;
  speedTie: boolean;
  /** Takes under half from the threat's best move and hits back for at least half */
  walls: boolean;
  /** Moves first and its worst roll OHKOs the threat */
  revengeKills: boolean;
  /** walls or revengeKills */
  checks: boolean;
}

export interface ThreatReport {
  threat: TeamSet;
  /** The threat Terastallizes (a Scarlet/Violet boss's ace) */
  tera?: boolean;
  usage: number;
  matchups: Matchup[];
  /** Members the threat can OHKO (max roll) */
  ohkos: number;
  /** Members it 2HKOs at worst (min roll ≥ 50%) */
  twoHkos: number;
  checks: number;
  danger: 'high' | 'medium' | 'low';
}

/** One team member against one threat. Sides can carry boosts (the counter advisor's setup moves). */
export function matchupOf(rs: Ruleset, threat: CalcSide, member: CalcSide, field: FieldOptions = {}, threatSpeed = effectiveSpeed(rs, threat)): Matchup {
  const theirBest = calcAll(rs, threat, member, field)[0];
  const yourBest = calcAll(rs, member, threat, field)[0];
  const memberSpeed = effectiveSpeed(rs, member);
  const walls = (theirBest?.maxPct ?? 0) < 50 && (yourBest?.minPct ?? 0) >= 50;
  const revengeKills = memberSpeed > threatSpeed && (yourBest?.minPct ?? 0) >= 100;
  return {
    member: member.set,
    theirBest,
    yourBest,
    threatFaster: threatSpeed > memberSpeed,
    speedTie: threatSpeed === memberSpeed,
    walls,
    revengeKills,
    checks: walls || revengeKills,
  };
}

export function analyzeThreat(rs: Ruleset, threat: TeamSet, usage: number, team: TeamSet[], field: FieldOptions = {}, tera = false): ThreatReport {
  const t = { set: threat, tera };
  const threatSpeed = effectiveSpeed(rs, t);
  const matchups = team.map((member) => matchupOf(rs, t, { set: member }, field, threatSpeed));
  const ohkos = matchups.filter((x) => (x.theirBest?.maxPct ?? 0) >= 100).length;
  const twoHkos = matchups.filter((x) => (x.theirBest?.minPct ?? 0) >= 50).length;
  const checks = matchups.filter((x) => x.checks).length;
  const pressure = ohkos + 0.5 * (twoHkos - ohkos);
  const danger = checks === 0 && pressure >= team.length / 2 ? 'high' : checks <= 1 && pressure >= 2 ? 'medium' : 'low';
  return { threat, tera, usage, matchups, ohkos, twoHkos, checks, danger };
}

const RANK = { high: 0, medium: 1, low: 2 };

/** Every threat against the team, most dangerous first (ties broken by usage) */
export function analyzeThreats(
  rs: Ruleset,
  threats: { set: TeamSet; usage: number; tera?: boolean }[],
  team: TeamSet[],
  field: FieldOptions = {},
): ThreatReport[] {
  return threats
    .map((t) => analyzeThreat(rs, t.set, t.usage, team, field, t.tera))
    .sort((a, b) => RANK[a.danger] - RANK[b.danger] || b.usage - a.usage);
}
