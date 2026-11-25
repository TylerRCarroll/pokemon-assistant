import type { Ruleset } from '../rulesets/types';
import { calcAll, effectiveSpeed, type FieldOptions, type MoveResult } from './calc';
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
  usage: number;
  matchups: Matchup[];
  /** Members the threat can OHKO (max roll) */
  ohkos: number;
  /** Members it 2HKOs at worst (min roll ≥ 50%) */
  twoHkos: number;
  checks: number;
  danger: 'high' | 'medium' | 'low';
}

export function analyzeThreat(rs: Ruleset, threat: TeamSet, usage: number, team: TeamSet[], field: FieldOptions = {}): ThreatReport {
  const t = { set: threat };
  const threatSpeed = effectiveSpeed(rs, t);
  const matchups = team.map((member): Matchup => {
    const m = { set: member };
    const theirBest = calcAll(rs, t, m, field)[0];
    const yourBest = calcAll(rs, m, t, field)[0];
    const memberSpeed = effectiveSpeed(rs, m);
    const walls = (theirBest?.maxPct ?? 0) < 50 && (yourBest?.minPct ?? 0) >= 50;
    const revengeKills = memberSpeed > threatSpeed && (yourBest?.minPct ?? 0) >= 100;
    return {
      member,
      theirBest,
      yourBest,
      threatFaster: threatSpeed > memberSpeed,
      speedTie: threatSpeed === memberSpeed,
      walls,
      revengeKills,
      checks: walls || revengeKills,
    };
  });
  const ohkos = matchups.filter((x) => (x.theirBest?.maxPct ?? 0) >= 100).length;
  const twoHkos = matchups.filter((x) => (x.theirBest?.minPct ?? 0) >= 50).length;
  const checks = matchups.filter((x) => x.checks).length;
  const pressure = ohkos + 0.5 * (twoHkos - ohkos);
  const danger = checks === 0 && pressure >= team.length / 2 ? 'high' : checks <= 1 && pressure >= 2 ? 'medium' : 'low';
  return { threat, usage, matchups, ohkos, twoHkos, checks, danger };
}

const RANK = { high: 0, medium: 1, low: 2 };

/** Every threat against the team, most dangerous first (ties broken by usage) */
export function analyzeThreats(
  rs: Ruleset,
  threats: { set: TeamSet; usage: number }[],
  team: TeamSet[],
  field: FieldOptions = {},
): ThreatReport[] {
  return threats
    .map((t) => analyzeThreat(rs, t.set, t.usage, team, field))
    .sort((a, b) => RANK[a.danger] - RANK[b.danger] || b.usage - a.usage);
}
