import { describe, expect, it } from 'vitest';
import { getRuleset } from '../rulesets/registry';
import { calcAll, calcMove, effectiveSpeed } from './calc';
import { newSet, type TeamSet } from './team';
import { importPaste } from './teamio';
import { analyzeThreat } from './threats';

const gen9 = getRuleset('gen9');
const set = (rs: typeof gen9, species: string, patch: Partial<TeamSet> = {}) => ({ ...newSet(rs, species), ...patch });

describe('damage calc', () => {
  it('matches the Smogon calc for a reference case', () => {
    const tusk = set(gen9, 'Great Tusk', { nature: 'Jolly', evs: { hp: 0, atk: 252, def: 0, spa: 0, spd: 0, spe: 252 }, moves: ['Headlong Rush'] });
    const gold = set(gen9, 'Gholdengo', { nature: 'Timid', evs: { hp: 252, atk: 0, def: 0, spa: 0, spd: 0, spe: 252 } });
    const r = calcMove(gen9, { set: tusk }, { set: gold }, 'Headlong Rush')!;
    expect([r.minPct, r.maxPct]).toEqual([109.5, 129.1]);
    expect(r.koText).toBe('guaranteed OHKO');
  });

  it('handles immunities without crashing', () => {
    const r = calcMove(gen9, { set: set(gen9, 'Garchomp') }, { set: set(gen9, 'Rotom-Wash', { ability: 'Levitate' }) }, 'Earthquake')!;
    expect(r.maxPct).toBe(0);
    expect(r.koText).toBe('No damage');
  });

  it('skips status moves and sorts strongest first', () => {
    const chomp = set(gen9, 'Garchomp', { moves: ['Swords Dance', 'Earthquake', 'Dragon Claw'] });
    const results = calcAll(gen9, { set: chomp }, { set: set(gen9, 'Heatran') });
    expect(results.map((r) => r.move)).toEqual(['Earthquake', 'Dragon Claw']);
  });

  it('applies boosts, Tera, and screens', () => {
    const chomp = set(gen9, 'Garchomp', { teraType: 'Dragon' });
    const target = { set: set(gen9, 'Corviknight') };
    const base = calcMove(gen9, { set: chomp }, target, 'Dragon Claw')!;
    expect(calcMove(gen9, { set: chomp, boosts: { atk: 2 } }, target, 'Dragon Claw')!.maxPct).toBeGreaterThan(base.maxPct * 1.9);
    expect(calcMove(gen9, { set: chomp, tera: true }, target, 'Dragon Claw')!.maxPct).toBeGreaterThan(base.maxPct);
    expect(calcMove(gen9, { set: chomp }, { ...target, reflect: true }, 'Dragon Claw')!.maxPct).toBeLessThan(base.maxPct);
  });

  it('computes effective speed with Scarf and boosts', () => {
    const jolly = set(gen9, 'Garchomp', { nature: 'Jolly', evs: { hp: 0, atk: 252, def: 0, spa: 0, spd: 0, spe: 252 } });
    expect(effectiveSpeed(gen9, { set: jolly })).toBe(333);
    expect(effectiveSpeed(gen9, { set: { ...jolly, item: 'Choice Scarf' } })).toBe(499);
    expect(effectiveSpeed(gen9, { set: jolly, boosts: { spe: 1 } })).toBe(499);
  });
});

describe('romhack calcs', () => {
  it('uses Unbound balanced stats', () => {
    const ub = getRuleset('unbound');
    const off = getRuleset('gen8natdex');
    const hit = (rs: typeof ub) => calcMove(rs, { set: set(rs, 'Garchomp') }, { set: set(rs, 'Venusaur') }, 'Earthquake')!.maxPct;
    // Unbound Venusaur is bulkier, so it takes less
    expect(hit(ub)).toBeLessThan(hit(off));
  });

  it('calcs hack-only moves with their own flags', () => {
    const ub = getRuleset('unbound');
    const jaw = set(ub, 'Sharpedo', { ability: 'Strong Jaw' });
    const plain = set(ub, 'Sharpedo', { ability: 'Speed Boost' });
    const target = { set: set(ub, 'Venusaur') };
    const boosted = calcMove(ub, { set: jaw }, target, 'Leech Fang')!;
    const normal = calcMove(ub, { set: plain }, target, 'Leech Fang')!;
    expect(boosted.move).toBe('Leech Fang');
    expect(boosted.maxPct).toBeGreaterThan(normal.maxPct * 1.4);
  });

  it('gives Renegade Platinum the Fairy type chart', () => {
    const rp = getRuleset('renegade-platinum');
    const r = calcMove(rp, { set: set(rp, 'Garchomp') }, { set: set(rp, 'Clefable') }, 'Dragon Claw')!;
    expect(r.maxPct).toBe(0); // Fairy is immune to Dragon
  });
});

describe('threats', () => {
  it('flags a threat that sweeps the team and nothing checks', () => {
    const team = importPaste(
      gen9,
      ['Abomasnow', 'Arboliva', 'Amoonguss'].map((s) => `${s}\n- Giga Drain`).join('\n\n'),
    ).sets;
    const volcarona = set(gen9, 'Volcarona', { moves: ['Fiery Dance', 'Bug Buzz'], nature: 'Timid', evs: { hp: 0, atk: 0, def: 0, spa: 252, spd: 0, spe: 252 } });
    const report = analyzeThreat(gen9, volcarona, 0.1, team);
    expect(report.matchups).toHaveLength(3);
    expect(report.checks).toBe(0);
    expect(report.danger).toBe('high');
  });

  it('counts a faster Pokémon that OHKOs as a check', () => {
    const scarfGold = set(gen9, 'Gholdengo', {
      item: 'Choice Scarf',
      nature: 'Timid',
      evs: { hp: 0, atk: 0, def: 0, spa: 252, spd: 4, spe: 252 },
      moves: ['Make It Rain'],
    });
    const kyurem = set(gen9, 'Kyurem', { moves: ['Ice Beam', 'Earth Power'], nature: 'Timid', evs: { hp: 0, atk: 0, def: 0, spa: 252, spd: 4, spe: 252 } });
    const m = analyzeThreat(gen9, kyurem, 0.1, [scarfGold]).matchups[0];
    expect(m.walls).toBe(false);
    expect(m.revengeKills).toBe(true);
    expect(m.checks).toBe(true);
  });
});
