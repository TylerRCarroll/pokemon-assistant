import { describe, expect, it } from 'vitest';
import { FORMATS } from '../data/formats';
import { getRuleset } from '../rulesets/registry';
import { findSets, findUsage, loadFormat, parseSpread, setFromSmogon, setFromUsage, setsFromSample } from './smogon';

describe('smogon data', () => {
  it('has data for every configured format', async () => {
    for (const f of FORMATS) {
      const data = await loadFormat(f.id);
      expect(data, f.id).toBeDefined();
      expect(Object.keys(data!.pokemon).length, f.id).toBeGreaterThan(20);
      // every usage name should resolve in the format's ruleset (catches naming drift)
      const rs = getRuleset(f.rulesetId);
      const missing = Object.keys(data!.pokemon).filter((n) => !rs.getSpecies(n));
      expect(missing.length, `${f.id} unresolved: ${missing.slice(0, 5)}`).toBeLessThan(5);
    }
  });

  it('parses EV spreads', () => {
    expect(parseSpread('Jolly:0/252/4/0/0/252')).toEqual({
      nature: 'Jolly',
      evs: { hp: 0, atk: 252, def: 4, spa: 0, spd: 0, spe: 252 },
    });
    expect(parseSpread('garbage')).toBeUndefined();
  });

  it('builds a standard set from usage', async () => {
    const rs = getRuleset('gen9');
    const data = (await loadFormat('gen9ou'))!;
    const top = Object.entries(data.pokemon).find(([, u]) => u.rank === 1)![0];
    const set = setFromUsage(rs, top, findUsage(data, top)!);
    expect(set.species).toBe(rs.getSpecies(top)!.name);
    expect(set.moves).toHaveLength(4);
    expect(new Set(set.moves).size).toBe(4);
    expect(set.item).toBeTruthy();
  });

  it('converts Smogon sets and sample teams', async () => {
    const rs = getRuleset('gen9');
    const data = (await loadFormat('gen9ou'))!;
    const [species, sets] = Object.entries(data.sets)[0];
    const set = setFromSmogon(rs, species, Object.values(findSets(data, species) ?? sets)[0]);
    expect(set.moves.length).toBeGreaterThan(0);
    const team = setsFromSample(rs, data.teams[0]);
    expect(team.length).toBeGreaterThanOrEqual(5);
  });
});
