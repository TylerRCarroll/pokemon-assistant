import { describe, expect, it } from 'vitest';
import { getRuleset } from '../rulesets/registry';
import { defensiveCoverage, memberTakes, offensiveCoverage, resolveMembers, teamWarnings } from './coverage';
import { checkSet } from './legality';
import { finalStats, newSet } from './team';
import { exportPaste, importPaste } from './teamio';

const PASTE = `Garchomp @ Rocky Helmet
Ability: Rough Skin
Tera Type: Steel
EVs: 252 HP / 4 Def / 252 Spe
Jolly Nature
- Stealth Rock
- Earthquake
- Dragon Tail
- Spikes

Rotom-Wash @ Leftovers
Ability: Levitate
EVs: 252 HP / 252 Def / 4 SpA
Bold Nature
IVs: 0 Atk
- Hydro Pump
- Volt Switch
- Will-O-Wisp
- Pain Split`;

describe('team import/export', () => {
  const rs = getRuleset('gen9');

  it('imports a Showdown paste', () => {
    const { sets, warnings } = importPaste(rs, PASTE);
    expect(warnings).toEqual([]);
    expect(sets).toHaveLength(2);
    expect(sets[0]).toMatchObject({ species: 'Garchomp', item: 'Rocky Helmet', nature: 'Jolly', teraType: 'Steel' });
    expect(sets[0].evs).toMatchObject({ hp: 252, def: 4, spe: 252, atk: 0 });
    expect(sets[1].ivs.atk).toBe(0);
  });

  it('round-trips through export', () => {
    const once = importPaste(rs, PASTE).sets;
    const again = importPaste(rs, exportPaste(once)).sets;
    expect(again).toEqual(once);
  });

  it('warns about things not in the ruleset', () => {
    const { sets, warnings } = importPaste(getRuleset('gen4'), PASTE.replace('Garchomp', 'Gholdengo'));
    expect(sets.map((s) => s.species)).toEqual(['Rotom-Wash']);
    expect(warnings[0]).toMatch(/Gholdengo isn't in Gen 4/);
  });
});

describe('stats and legality', () => {
  const rs = getRuleset('gen9');

  it('computes final stats', () => {
    const chomp = importPaste(rs, PASTE).sets[0];
    expect(finalStats(rs, chomp)).toMatchObject({ hp: 420, spe: 333 });
  });

  it('flags moves outside the learnset and EV overflow', async () => {
    const set = { ...newSet(rs, 'Garchomp'), moves: ['Earthquake', 'Spore'], evs: { hp: 252, atk: 252, def: 252, spa: 0, spd: 0, spe: 0 } };
    const issues = checkSet(rs, set, await rs.learnset('Garchomp'));
    expect(issues.map((i) => i.message)).toEqual(
      expect.arrayContaining([expect.stringMatching(/can't learn Spore/), expect.stringMatching(/EVs total 756/)]),
    );
    expect(issues.some((i) => /Earthquake/.test(i.message))).toBe(false);
  });

  it('flags abilities the species cannot have', () => {
    const issues = checkSet(rs, { ...newSet(rs, 'Garchomp'), ability: 'Levitate' }, []);
    expect(issues[0].message).toMatch(/can't have Levitate/);
  });
});

describe('coverage', () => {
  const rs = getRuleset('gen9');
  const members = resolveMembers(rs, importPaste(rs, PASTE).sets);

  it('applies ability immunities', () => {
    const rotom = members[1];
    expect(memberTakes(rs, rotom, 'Ground')).toBe(0); // Levitate
    expect(memberTakes(rs, rotom, 'Grass')).toBe(2);
    expect(memberTakes(rs, members[0], 'Ice')).toBe(4);
  });

  it('counts weaknesses and resistances per type', () => {
    const ground = defensiveCoverage(rs, members).find((r) => r.type === 'Ground')!;
    expect(ground.immune.map((m) => m.species.name)).toEqual(['Rotom-Wash']);
    const ice = defensiveCoverage(rs, members).find((r) => r.type === 'Ice')!;
    expect(ice.weak.map((m) => m.species.name)).toEqual(['Garchomp']);
  });

  it('finds offensive gaps from damaging moves only', () => {
    const rows = offensiveCoverage(rs, members);
    expect(rows.find((r) => r.type === 'Fire')!.best).toBe(2); // Earthquake, Hydro Pump
    expect(rows.find((r) => r.type === 'Dragon')!.best).toBe(2); // Dragon Tail
    expect(rows.find((r) => r.type === 'Grass')!.best).toBeLessThanOrEqual(1);
  });

  it('warns about stacked weaknesses', () => {
    const icy = resolveMembers(rs, ['Garchomp', 'Dragonite', 'Landorus-Therian'].map((n) => newSet(rs, n)));
    const warnings = teamWarnings(rs, icy).map((w) => w.message);
    expect(warnings.some((w) => /3 members are weak to Ice/.test(w))).toBe(true);
  });
});
