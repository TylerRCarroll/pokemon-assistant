import type { Ruleset, SpeciesInfo, TypeName } from '../rulesets/types';
import { memberRoles, roleNeeds, type RoleNeed } from './roles';
import type { FormatData } from './smogonTypes';
import type { TeamSet } from './team';

/** Abilities that make the holder immune to an attacking type */
export const IMMUNITY_ABILITIES: Record<string, TypeName> = {
  Levitate: 'Ground',
  'Earth Eater': 'Ground',
  'Flash Fire': 'Fire',
  'Well-Baked Body': 'Fire',
  'Water Absorb': 'Water',
  'Storm Drain': 'Water',
  'Dry Skin': 'Water',
  'Volt Absorb': 'Electric',
  'Lightning Rod': 'Electric',
  'Motor Drive': 'Electric',
  'Sap Sipper': 'Grass',
};
/** Abilities that halve damage from types (on top of type matchups) */
const HALVING_ABILITIES: Record<string, TypeName[]> = {
  'Thick Fat': ['Fire', 'Ice'],
  Heatproof: ['Fire'],
  'Water Bubble': ['Fire'],
  'Purifying Salt': ['Ghost'],
};

export interface Member {
  set: TeamSet;
  species: SpeciesInfo;
}

export function resolveMembers(rs: Ruleset, slots: (TeamSet | null)[]): Member[] {
  return slots.flatMap((set) => {
    const species = set && rs.getSpecies(set.species);
    return set && species ? [{ set, species }] : [];
  });
}

/** Damage multiplier an attacking type deals to a member, including immunity/halving abilities */
export function memberTakes(rs: Ruleset, m: Member, attack: TypeName): number {
  const ability = rs.gen >= 3 ? m.set.ability : undefined;
  if (ability && IMMUNITY_ABILITIES[ability] === attack) return 0;
  const mult = rs.effectiveness(attack, m.species.types);
  return ability && HALVING_ABILITIES[ability]?.includes(attack) ? mult / 2 : mult;
}

export interface DefensiveRow {
  type: TypeName;
  weak: Member[];
  resist: Member[]; // includes immune
  immune: Member[];
}

export function defensiveCoverage(rs: Ruleset, members: Member[]): DefensiveRow[] {
  return rs.types.map((type) => {
    const row: DefensiveRow = { type, weak: [], resist: [], immune: [] };
    for (const m of members) {
      const x = memberTakes(rs, m, type);
      if (x > 1) row.weak.push(m);
      else if (x < 1) row.resist.push(m);
      if (x === 0) row.immune.push(m);
    }
    return row;
  });
}

export interface OffensiveRow {
  type: TypeName;
  /** Best multiplier any member's damaging move gets against this single type */
  best: number;
  /** Members with a super-effective damaging move */
  hitters: Member[];
}

export function offensiveCoverage(rs: Ruleset, members: Member[]): OffensiveRow[] {
  const attacks = members.map((m) => ({
    m,
    types: [
      ...new Set(
        m.set.moves.flatMap((name) => {
          const move = rs.getMove(name);
          return move && move.category !== 'Status' && move.basePower > 0 ? [move.type] : [];
        }),
      ),
    ],
  }));
  return rs.types.map((type) => {
    let best = 0;
    const hitters: Member[] = [];
    for (const { m, types } of attacks) {
      const top = Math.max(0, ...types.map((t) => rs.effectiveness(t, [type])));
      best = Math.max(best, top);
      if (top > 1) hitters.push(m);
    }
    return { type, best, hitters };
  });
}

/** What a warning is about, so advice can target it */
export type TeamIssue =
  | { kind: 'stackedWeakness'; type: TypeName; weak: Member[] }
  | { kind: 'coverageGap'; types: TypeName[] }
  | { kind: 'noAttacks'; member: Member }
  | { kind: 'duplicateItem'; item: string }
  | { kind: 'missingRole'; need: RoleNeed };

export interface TeamWarning {
  severity: 'high' | 'medium';
  message: string;
  issue: TeamIssue;
}

/** Which of the ruleset's role needs the team meets, and who meets each */
export function roleCoverage(rs: Ruleset, members: Member[], meta?: FormatData) {
  const roles = members.map((m) => memberRoles(rs, m.set, m.species, meta));
  return roleNeeds(rs).map((need) => ({
    need,
    providers: members.filter((_, i) => roles[i].some((r) => need.roles.includes(r))),
  }));
}

export function teamWarnings(rs: Ruleset, members: Member[], meta?: FormatData): TeamWarning[] {
  if (!members.length) return [];
  const out: TeamWarning[] = [];
  for (const row of defensiveCoverage(rs, members)) {
    if (row.weak.length >= 3 && row.weak.length > row.resist.length) {
      out.push({
        severity: 'high',
        message: `${row.weak.length} members are weak to ${row.type} and only ${row.resist.length} resist it`,
        issue: { kind: 'stackedWeakness', type: row.type, weak: row.weak },
      });
    } else if (row.weak.length >= 2 && row.resist.length === 0) {
      out.push({
        severity: 'medium',
        message: `${row.weak.length} members are weak to ${row.type} and nothing resists it`,
        issue: { kind: 'stackedWeakness', type: row.type, weak: row.weak },
      });
    }
  }
  const withMoves = members.filter((m) => m.set.moves.length > 0);
  if (withMoves.length) {
    const unhit = offensiveCoverage(rs, members).filter((r) => r.best <= 1).map((r) => r.type);
    if (unhit.length) {
      out.push({
        severity: 'medium',
        message: `Nothing hits ${unhit.join(', ')} super-effectively`,
        issue: { kind: 'coverageGap', types: unhit },
      });
    }
  }
  const noAttacks = members.filter(
    (m) => m.set.moves.length > 0 && !m.set.moves.some((n) => (rs.getMove(n)?.basePower ?? 0) > 0),
  );
  for (const m of noAttacks) {
    out.push({ severity: 'medium', message: `${m.species.name} has no damaging moves`, issue: { kind: 'noAttacks', member: m } });
  }
  // half-built teams would trip every role check, so wait until there are a few members
  if (members.length >= 4) {
    for (const { need, providers } of roleCoverage(rs, members, meta)) {
      if (need.core && !providers.length) {
        out.push({ severity: 'medium', message: `No ${need.label.toLowerCase()}: nothing provides ${need.why}`, issue: { kind: 'missingRole', need } });
      }
    }
  }
  const items = members.map((m) => m.set.item).filter(Boolean);
  const dupItem = items.find((it, i) => items.indexOf(it) !== i);
  if (dupItem) {
    out.push({
      severity: 'medium',
      message: `${dupItem} is held by more than one member (Item Clause in most formats)`,
      issue: { kind: 'duplicateItem', item: dupItem },
    });
  }
  return out.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'high' ? -1 : 1));
}
