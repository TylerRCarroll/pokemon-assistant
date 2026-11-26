import { describe, expect, it } from 'vitest';
import { getRuleset } from '../rulesets/registry';
import { resolveMembers, teamWarnings } from './coverage';
import { loadFormat } from './smogon';
import { newSet } from './team';
import { suggestSwaps, tipFor } from './teamAdvice';

const rs = getRuleset('gen9');
// four Ice-weak members and nothing that resists Ice
const team = (['Garchomp', 'Landorus-Therian', 'Dragonite', 'Gliscor', 'Great Tusk', 'Toxapex'] as const).map((s) => ({
  ...newSet(rs, s),
  moves: s === 'Toxapex' ? ['Toxic', 'Recover'] : ['Earthquake'],
}));
const members = resolveMembers(rs, team);

describe('team advice', () => {
  it('suggests swaps that fix the stacked weakness', async () => {
    const meta = await loadFormat('gen9ou');
    const swaps = suggestSwaps(rs, members, meta);
    expect(swaps.length).toBeGreaterThan(0);
    for (const s of swaps) {
      expect(members.map((m) => m.species.name)).not.toContain(s.incoming.name);
      expect(s.fixes.length).toBeGreaterThan(0);
    }
    // at least one swap brings an Ice resist and says so
    expect(swaps.some((s) => s.fixes.some((f) => f.startsWith('Ice:')))).toBe(true);
    expect(swaps.every((s) => !s.incoming.battleOnly)).toBe(true);
  });

  it('falls back to non-legendary fully evolved Pokémon without usage stats', () => {
    const ub = getRuleset('unbound');
    const swaps = suggestSwaps(ub, resolveMembers(ub, team.map((s) => ({ ...s }))));
    expect(swaps.length).toBeGreaterThan(0);
    expect(swaps.every((s) => !s.incoming.legendary && !s.incoming.evos?.length)).toBe(true);
  });

  it('points to learnable moves for coverage gaps and moveless members', async () => {
    const learnsets = await Promise.all(members.map((m) => rs.learnset(m.species.name)));
    const learnsetOf = (m: (typeof members)[number]) => learnsets[members.indexOf(m)];
    const warnings = teamWarnings(rs, members);
    const gap = warnings.find((w) => w.issue.kind === 'coverageGap')!;
    const tip = tipFor(rs, gap.issue, members, learnsetOf);
    expect(tip.moves?.length).toBeGreaterThan(0);
    for (const t of tip.moves!) {
      expect(learnsetOf(t.member)!.some((e) => e.move === t.move.id)).toBe(true);
      expect(t.hits.every((h) => rs.effectiveness(t.move.type, [h]) > 1)).toBe(true);
    }
    const moveless = warnings.find((w) => w.issue.kind === 'noAttacks')!;
    expect(tipFor(rs, moveless.issue, members, learnsetOf).moves?.[0].move.basePower).toBeGreaterThan(0);
    const stacked = warnings.find((w) => w.issue.kind === 'stackedWeakness' && w.issue.type === 'Ice')!;
    expect(tipFor(rs, stacked.issue, members, learnsetOf).text).toMatch(/Steel/);
  });
});
