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
  /** The member's item, when the threat's Knock Off would take it (damage figures then assume it's gone after one hit) */
  losesItem?: string;
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

/** Items Knock Off can't take: they're part of what the holder is (Mega Stones, Z-Crystals, Plates, ...) */
const STUCK_ITEM = /^(?!Eviolite$).*ite( [XY])?$|ium Z$| Plate$| Memory$| Drive$|^Griseous (Orb|Core)$|^Rusted (Sword|Shield)$|^(Red|Blue) Orb$|Mask$|^Booster Energy$/;

/** The threat would Knock Off the member's item (Gen 3+; not through Sticky Hold) */
export function knocksOff(rs: Ruleset, threat: TeamSet, member: TeamSet): boolean {
  if (rs.gen < 3 || !member.item || STUCK_ITEM.test(member.item) || member.ability === 'Sticky Hold') return false;
  return threat.moves.some((n) => rs.getMove(n)?.id === 'knockoff');
}

const worse = (a?: MoveResult, b?: MoveResult) => (!a ? b : !b ? a : b.maxPct > a.maxPct ? b : a);

/** One team member against one threat. Sides can carry boosts (the counter advisor's setup moves). */
export function matchupOf(rs: Ruleset, threat: CalcSide, member: CalcSide, field: FieldOptions = {}, threatSpeed = effectiveSpeed(rs, threat)): Matchup {
  let theirBest: MoveResult | undefined = calcAll(rs, threat, member, field)[0];
  let yourBest: MoveResult | undefined = calcAll(rs, member, threat, field)[0];
  const memberSpeed = effectiveSpeed(rs, member);
  const faster = memberSpeed > threatSpeed;
  const revengeKills = faster && (yourBest?.minPct ?? 0) >= 100;
  // Knock Off: the item is there for the first hit (the calc gives Knock Off its holder bonus), gone after it.
  // Outspeeding and OHKOing still works with the item; walling has to hold up without it.
  const losesItem = knocksOff(rs, threat.set, member.set) ? member.set.item : undefined;
  if (losesItem) {
    const bare = { ...member, set: { ...member.set, item: undefined } };
    theirBest = worse(theirBest, calcAll(rs, threat, bare, field)[0]);
    if (!revengeKills) yourBest = calcAll(rs, bare, threat, field)[0];
  }
  const walls = (theirBest?.maxPct ?? 0) < 50 && (yourBest?.minPct ?? 0) >= 50;
  return {
    member: member.set,
    theirBest,
    yourBest,
    threatFaster: threatSpeed > memberSpeed,
    speedTie: threatSpeed === memberSpeed,
    walls,
    revengeKills,
    checks: walls || revengeKills,
    ...(losesItem ? { losesItem } : {}),
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
