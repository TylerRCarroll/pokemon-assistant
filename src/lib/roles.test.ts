import { describe, expect, it } from 'vitest';
import { getRuleset } from '../rulesets/registry';
import { resolveMembers, roleCoverage, teamWarnings } from './coverage';
import { memberRoles } from './roles';
import { loadFormat } from './smogon';
import { newSet, type TeamSet } from './team';
import { suggestSwaps, tipFor } from './teamAdvice';

const rs = getRuleset('gen9');
const set = (species: string, moves: string[], item?: string, ability?: string): TeamSet => ({
  ...newSet(rs, species),
  moves,
  item,
  ability: ability ?? newSet(rs, species).ability,
});
const roles = (s: TeamSet) => memberRoles(rs, s, rs.getSpecies(s.species)!);

describe('role detection', () => {
  it('reads roles from moves, items, abilities, and stats', () => {
    expect(roles(set('Corviknight', ['Roost', 'Brave Bird', 'U-turn', 'Defog'], 'Rocky Helmet'))).toEqual(
      expect.arrayContaining(['removal', 'pivot', 'physicalWall']),
    );
    expect(roles(set('Ting-Lu', ['Earthquake', 'Ruination', 'Stealth Rock', 'Whirlwind'], 'Leftovers'))).toEqual(
      expect.arrayContaining(['hazards', 'physicalWall', 'antiSetup']),
    );
    expect(roles(set('Kingambit', ['Swords Dance', 'Sucker Punch', 'Kowtow Cleave', 'Iron Head'], 'Leftovers'))).toEqual(
      expect.arrayContaining(['setup', 'speed']),
    );
    expect(roles(set('Kyurem', ['Freeze-Dry', 'Earth Power', 'Ice Beam', 'Draco Meteor'], 'Choice Specs'))).toContain('breaker');
  });

  it('does not call a bulky attacker a wall without recovery', () => {
    const tusk = roles(set('Great Tusk', ['Headlong Rush', 'Rapid Spin', 'Ice Spinner', 'Stealth Rock'], 'Heavy-Duty Boots'));
    expect(tusk).toEqual(expect.arrayContaining(['hazards', 'removal']));
    expect(tusk).not.toContain('physicalWall');
  });

  it('uses the format’s common moves while a slot has none', async () => {
    const meta = await loadFormat('gen9ou');
    expect(memberRoles(rs, set('Corviknight', []), rs.getSpecies('Corviknight')!, meta)).toContain('removal');
  });
});

describe('role advice', () => {
  // six attackers: no hazards, no removal, no walls
  const team = ['Dragapult', 'Iron Valiant', 'Garchomp', 'Darkrai', 'Raging Bolt', 'Gholdengo'].map((s) =>
    set(s, s === 'Gholdengo' ? ['Make It Rain', 'Shadow Ball'] : ['Draco Meteor']),
  );
  const members = resolveMembers(rs, team);

  it('warns about missing core roles once the team has a few members', () => {
    const missing = teamWarnings(rs, members).flatMap((w) => (w.issue.kind === 'missingRole' ? [w.issue.need.id] : []));
    expect(missing).toEqual(expect.arrayContaining(['hazards', 'removal']));
    expect(teamWarnings(rs, members.slice(0, 2)).some((w) => w.issue.kind === 'missingRole')).toBe(false);
  });

  it('suggests a teammate that can learn the missing role', async () => {
    const learnsets = await Promise.all(members.map((m) => rs.learnset(m.species.name)));
    const learnsetOf = (m: (typeof members)[number]) => learnsets[members.indexOf(m)];
    const hazards = teamWarnings(rs, members).find((w) => w.issue.kind === 'missingRole' && w.issue.need.id === 'hazards')!;
    const tip = tipFor(rs, hazards.issue, members, learnsetOf);
    expect(tip.moves?.[0]).toBeDefined();
    expect(learnsetOf(tip.moves![0].member)!.some((e) => e.move === tip.moves![0].move.id)).toBe(true);
  });

  it('never swaps out the only provider of a core role without saying so', async () => {
    const meta = await loadFormat('gen9ou');
    const withRemover = resolveMembers(rs, [...team.slice(0, 5), set('Corviknight', ['Defog', 'Roost', 'Brave Bird', 'U-turn'], 'Rocky Helmet')]);
    expect(roleCoverage(rs, withRemover, meta).find((r) => r.need.id === 'removal')!.providers).toHaveLength(1);
    for (const s of suggestSwaps(rs, withRemover, meta)) {
      if (s.out.species.name === 'Corviknight') expect(s.fixes.join(' ')).toMatch(/loses|adds hazard removal/);
    }
  });

  it('credits swaps that bring a missing role', async () => {
    const meta = await loadFormat('gen9ou');
    const swaps = suggestSwaps(rs, members, meta);
    expect(swaps.some((s) => s.fixes.some((f) => f.startsWith('adds')))).toBe(true);
  });
});

describe('romhack role needs', () => {
  it('treat a setup answer as core and hazards as optional', () => {
    const needs = roleCoverage(getRuleset('unbound'), []).map((r) => r.need);
    expect(needs.find((n) => n.id === 'antiSetup')?.core).toBe(true);
    expect(needs.find((n) => n.id === 'hazards')).toBeUndefined();
    expect(needs.find((n) => n.id === 'removal')?.core).toBe(false);
  });
});

