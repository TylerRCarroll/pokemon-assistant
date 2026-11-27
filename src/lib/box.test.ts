import { beforeEach, describe, expect, it } from 'vitest';
import { getRuleset } from '../rulesets/registry';
import { useBoxStore } from '../state/box';
import { useTeamsStore } from '../state/teams';
import { ownedMatch } from './box';
import { evolutionPath, evolveSet, familyOf } from './evolution';
import { newSet, type TeamSet } from './team';
import { exportPaste } from './teamio';

const rs = getRuleset('gen9natdex');
const raised = (species: string, patch: Partial<TeamSet> = {}): TeamSet => ({
  ...newSet(rs, species),
  level: 31,
  item: 'Eviolite',
  nature: 'Adamant',
  moves: ['Low Kick', 'Knock Off', 'Bullet Punch', 'Bulk Up'],
  evs: { hp: 4, atk: 252, def: 0, spa: 0, spd: 0, spe: 252 },
  ivs: { hp: 31, atk: 31, def: 20, spa: 0, spd: 31, spe: 31 },
  ...patch,
});

describe('evolving a set', () => {
  it('keeps everything but the species', () => {
    const machop = raised('Machop', { ability: 'No Guard', monId: 'm1', teraType: 'Steel' });
    const machoke = evolveSet(rs, machop, 'Machoke');
    expect(machoke).toEqual({ ...machop, species: 'Machoke' });
  });

  it('maps a lost ability by its slot, and a hidden ability to the hidden one', () => {
    // Eevee: Run Away / Adaptability / Anticipation (hidden); Vaporeon: Water Absorb / Hydration (hidden)
    expect(evolveSet(rs, raised('Eevee', { ability: 'Run Away' }), 'Vaporeon').ability).toBe('Water Absorb');
    expect(evolveSet(rs, raised('Eevee', { ability: 'Anticipation' }), 'Vaporeon').ability).toBe('Hydration');
  });

  it('knows families and evolution paths', () => {
    expect(familyOf(rs, 'Machamp')).toBe('Machop');
    expect(evolutionPath(rs, 'Machop', 'Machamp')?.map((s) => s.name)).toEqual(['Machop', 'Machoke', 'Machamp']);
    expect(evolutionPath(rs, 'Machamp', 'Machop')).toBeUndefined();
  });
});

describe('PC matches', () => {
  const mons = [
    { id: 'a', set: raised('Machop', { level: 20 }) },
    { id: 'b', set: raised('Machoke', { level: 28 }) },
    { id: 'c', set: raised('Eevee') },
  ];

  it('finds the same species first', () => {
    expect(ownedMatch(rs, mons, 'Machoke')).toMatchObject({ mon: { id: 'b' }, evolvesFrom: undefined });
  });

  it('finds the nearest earlier stage, evolved, with its set intact', () => {
    const m = ownedMatch(rs, mons, 'Machamp')!;
    expect(m.mon.id).toBe('b');
    expect(m.evolvesFrom).toBe('Machoke');
    expect(m.set).toMatchObject({ species: 'Machamp', level: 28, moves: mons[1].set.moves, evs: mons[1].set.evs });
  });

  it("doesn't match other families or earlier stages", () => {
    expect(ownedMatch(rs, mons, 'Garchomp')).toBeUndefined();
    expect(ownedMatch(rs, [mons[1]], 'Machop')).toBeUndefined();
  });

  it('leaves the PC link out of Showdown pastes', () => {
    expect(exportPaste([raised('Machop', { monId: 'secret-id' })])).not.toContain('secret-id');
  });
});

describe('PC store', () => {
  beforeEach(() => {
    useBoxStore.setState({ mons: [], deleted: {} });
    useTeamsStore.setState({ teams: [], activeByRuleset: {}, deleted: {} });
  });

  it('adopts unlinked team members once, however often it runs, and drops released ones', () => {
    const teamId = useTeamsStore.getState().createTeam('gen9', 'Old', [raised('Machop'), { ...raised('Eevee'), monId: 'released' }, raised('Pikachu')]);
    useBoxStore.setState({ deleted: { released: 1 } });
    const { adoptTeam } = useBoxStore.getState();
    adoptTeam(teamId, 'gen9', 'sv');
    adoptTeam(teamId, 'gen9', 'sv');
    const mons = useBoxStore.getState().mons;
    expect(mons.map((m) => m.set.species)).toEqual(['Machop', 'Pikachu']);
    const slots = useTeamsStore.getState().teams[0].slots;
    expect(slots.slice(0, 3).map((s) => s?.monId)).toEqual([mons[0].id, undefined, mons[1].id]);
    expect(slots[1]).toBeNull();
  });

  it('saves an edit to every team slot holding the mon, and empties them on release', () => {
    const box = useBoxStore.getState();
    const id = box.createMon('gen9', 'sv', raised('Machop'));
    const mon = useBoxStore.getState().mons[0];
    expect(mon.set.monId).toBe(id);
    const teamId = useTeamsStore.getState().createTeam('gen9', 'Main', [mon.set, newSet(rs, 'Pikachu')]);

    box.updateMon(id, evolveSet(rs, mon.set, 'Machoke'));
    const slots = () => useTeamsStore.getState().teams.find((t) => t.id === teamId)!.slots;
    expect(slots()[0]).toMatchObject({ species: 'Machoke', monId: id, evs: mon.set.evs });
    expect(slots()[1]?.species).toBe('Pikachu');

    box.releaseMon(id);
    expect(useBoxStore.getState().mons).toEqual([]);
    expect(useBoxStore.getState().deleted[id]).toBeGreaterThan(0);
    expect(slots()[0]).toBeNull();
    expect(slots()[1]?.species).toBe('Pikachu');
  });
});
