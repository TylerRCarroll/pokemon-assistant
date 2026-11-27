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

  it('prefers PC mons, with their real sets, evolving them when the pool lists a later stage', () => {
    const cetoddle = { ...newSet(rs, 'Cetoddle'), level: 41, moves: ['Surf', 'Ice Beam', 'Rest', 'Sleep Talk'], evs: { ...newSet(rs, 'Cetoddle').evs, spd: 252 } };
    const lapras = { ...newSet(rs, 'Lapras'), level: 38, moves: ['Freeze-Dry', 'Surf'] };
    const owned = [
      { id: 'pc-cetoddle', set: { ...cetoddle, monId: 'pc-cetoddle' } },
      { id: 'pc-lapras', set: { ...lapras, monId: 'pc-lapras' } },
    ];
    // Cetitan is in the pool (the PC has its Cetoddle); Lapras isn't, but it's in the PC
    const pool = ['Cetitan', 'Pikachu'].map((n) => rs.getSpecies(n)!);
    const swaps = suggestSwaps(rs, members, undefined, 3, { pool, level: 50, owned });
    const cetitan = swaps.find((s) => s.incoming.name === 'Cetitan')!;
    expect(cetitan.owned).toEqual({ monId: 'pc-cetoddle', evolvesFrom: 'Cetoddle' });
    expect(cetitan.set).toMatchObject({ species: 'Cetitan', level: 41, moves: cetoddle.moves, evs: cetoddle.evs });
    const fromPc = swaps.find((s) => s.incoming.name === 'Lapras')!;
    expect(fromPc.owned).toEqual({ monId: 'pc-lapras' });
    expect(fromPc.set.level).toBe(38);
    // a PC mon already on the team isn't a newcomer
    const onTeam = resolveMembers(rs, [...team.slice(0, 5), lapras && { ...lapras, monId: 'pc-lapras' }]);
    expect(suggestSwaps(rs, onTeam, undefined, 3, { pool, level: 50, owned }).some((s) => s.owned?.monId === 'pc-lapras')).toBe(false);
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
