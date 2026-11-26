import { describe, expect, it } from 'vitest';
import { createBackup, parseBackup, planImport } from './backup';

const team = (id: string, updatedAt: number, name = id) => ({ id, name, rulesetId: 'gen9', slots: [], updatedAt });
const store = (state: Record<string, unknown>) => ({ state, version: 0 });

function fakeStorage(entries: Record<string, string>) {
  const keys = Object.keys(entries);
  return { length: keys.length, key: (i: number) => keys[i] ?? null, getItem: (k: string) => entries[k] ?? null };
}

describe('backups', () => {
  it('exports only pokeplanner stores and reads them back', () => {
    const backup = createBackup(
      fakeStorage({
        'pokeplanner:teams': JSON.stringify(store({ teams: [team('a', 1)], activeByRuleset: {} })),
        'other-app': 'x',
      }),
      new Date('2026-11-25T00:00:00Z'),
    );
    expect(Object.keys(backup.data)).toEqual(['pokeplanner:teams']);
    expect(parseBackup(JSON.stringify(backup)).backup).toEqual(backup);
    expect(parseBackup('{"nope": 1}').error).toBeDefined();
    expect(parseBackup('not json').error).toMatch(/valid JSON/);
  });

  it('merges teams by id, newer edit wins, and keeps local-only teams', () => {
    const local = { 'pokeplanner:teams': store({ teams: [team('a', 5, 'local A'), team('b', 1, 'local B'), team('c', 1)], activeByRuleset: { gen9: 'c' } }) };
    const backup = createBackup(
      fakeStorage({
        'pokeplanner:teams': JSON.stringify(store({ teams: [team('a', 9, 'newer A'), team('b', 0, 'older B'), team('d', 3)], activeByRuleset: { gen9: 'd', gen5: 'x' } })),
      }),
    );
    const plan = planImport(local, backup, 'merge');
    const teams = JSON.parse(plan.writes['pokeplanner:teams']).state;
    expect(teams.teams.map((t: { name: string }) => t.name).sort()).toEqual(['c', 'd', 'local B', 'newer A']);
    // this browser's active team choices win; missing rulesets are filled in
    expect(teams.activeByRuleset).toEqual({ gen9: 'c', gen5: 'x' });
    expect(plan.summary[0]).toBe('1 new team, 1 updated');
  });

  it('keeps deleted teams deleted, unless edited after the deletion', () => {
    // this browser deleted "a" at t=10; the other side still has it (last edited t=5) and edited "b" at t=20
    const local = { 'pokeplanner:teams': store({ teams: [team('b', 1)], activeByRuleset: {}, deleted: { a: 10, b: 15 } }) };
    const backup = createBackup(fakeStorage({ 'pokeplanner:teams': JSON.stringify(store({ teams: [team('a', 5), team('b', 20, 'edited later')] })) }));
    const merged = JSON.parse(planImport(local, backup, 'merge').writes['pokeplanner:teams']).state;
    expect(merged.teams.map((t: { name: string }) => t.name)).toEqual(['edited later']);
    expect(merged.deleted).toEqual({ a: 10, b: 15 });
    // and a deletion made elsewhere removes the team here
    const other = createBackup(fakeStorage({ 'pokeplanner:teams': JSON.stringify(store({ teams: [], deleted: { b: 30 } })) }));
    const after = JSON.parse(planImport({ 'pokeplanner:teams': store({ teams: [team('b', 20)] }) }, other, 'merge').writes['pokeplanner:teams']).state;
    expect(after.teams).toEqual([]);
  });

  it('keeps the quiz progress with more answers and fills in missing settings', () => {
    const local = {
      'pokeplanner:quiz': store({ byRuleset: { gen9: { answered: 50 }, gen5: { answered: 2 } } }),
      'pokeplanner:playthrough': store({ byRuleset: { gen9: { mode: 'playthrough', game: 'scarlet', checkpoint: 3 } } }),
      'pokeplanner:ruleset': store({ rulesetId: 'gen9' }),
    };
    const backup = createBackup(
      fakeStorage({
        'pokeplanner:quiz': JSON.stringify(store({ byRuleset: { gen9: { answered: 10 }, gen5: { answered: 20 } } })),
        'pokeplanner:playthrough': JSON.stringify(store({ byRuleset: { gen9: { checkpoint: 0 }, unbound: { checkpoint: 4 } } })),
        'pokeplanner:ruleset': JSON.stringify(store({ rulesetId: 'unbound' })),
      }),
    );
    const { writes } = planImport(local, backup, 'merge');
    expect(JSON.parse(writes['pokeplanner:quiz']).state.byRuleset).toEqual({ gen9: { answered: 50 }, gen5: { answered: 20 } });
    expect(JSON.parse(writes['pokeplanner:playthrough']).state.byRuleset.gen9.checkpoint).toBe(3);
    expect(JSON.parse(writes['pokeplanner:playthrough']).state.byRuleset.unbound.checkpoint).toBe(4);
    expect(writes['pokeplanner:ruleset']).toBeUndefined();
  });

  it('replace makes this browser match the backup, removing stores it lacks', () => {
    const local = { 'pokeplanner:teams': store({ teams: [team('a', 1)] }), 'pokeplanner:quiz': store({ byRuleset: {} }) };
    const backup = createBackup(fakeStorage({ 'pokeplanner:teams': JSON.stringify(store({ teams: [team('z', 1)] })) }));
    const { writes } = planImport(local, backup, 'replace');
    expect(JSON.parse(writes['pokeplanner:teams']).state.teams.map((t: { id: string }) => t.id)).toEqual(['z']);
    expect(writes['pokeplanner:quiz']).toBe('');
  });
});
