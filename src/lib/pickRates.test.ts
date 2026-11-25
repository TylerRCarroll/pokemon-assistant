import { describe, expect, it } from 'vitest';
import { getRuleset } from '../rulesets/registry';
import { pickRatesFromTrainers, pickRatesFromUsage } from './pickRates';
import { loadFormat } from './smogon';

describe('pick rates', () => {
  it('weights Smogon usage by how often each Pokémon is used', async () => {
    const rs = getRuleset('gen9');
    const picks = pickRatesFromUsage(rs, (await loadFormat('gen9ou'))!);
    const boots = picks.items.get('heavydutyboots')!;
    const lefties = picks.items.get('leftovers')!;
    // the two staple OU items; each on a real slice of the metagame, neither on everything
    for (const p of [boots, lefties]) {
      expect(p.rate).toBeGreaterThan(0.05);
      expect(p.rate).toBeLessThan(0.6);
    }
    expect(boots.users.length).toBeGreaterThan(0);
    expect(picks.abilities.get('protosynthesis')!.users.map(([s]) => s)).toContain('Great Tusk');
    const natures = [...picks.natures.values()].reduce((sum, p) => sum + p.rate, 0);
    expect(natures).toBeGreaterThan(0.8);
    expect(natures).toBeLessThanOrEqual(1.0001);
    expect(picks.natures.get('Jolly')!.rate).toBeGreaterThan(picks.natures.get('Quirky')?.rate ?? 0);
  });

  it('counts romhack trainer teams', async () => {
    const rs = getRuleset('renegade-platinum');
    const picks = pickRatesFromTrainers(rs, await rs.loadTrainers!());
    expect(picks.items.size).toBeGreaterThan(10);
    expect(picks.natures.size).toBeGreaterThan(10);
    const all = [...picks.natures.values()].reduce((sum, p) => sum + p.rate, 0);
    expect(all).toBeLessThanOrEqual(1.0001);
  });
});
