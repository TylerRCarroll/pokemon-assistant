import { describe, expect, it } from 'vitest';
import { getRuleset } from '../rulesets/registry';
import { evolutionTree } from './evolution';
import { findLearners, groupLearnset } from './learnsets';

describe('evolution', () => {
  it('describes evolution methods', () => {
    const rs = getRuleset('gen9');
    expect(rs.getSpecies('Gardevoir')!.evoMethod).toBe('Level 30');
    expect(rs.getSpecies('Gallade')!.evoMethod).toBe('Use Dawn Stone (male)');
    expect(rs.getSpecies('Umbreon')!.evoMethod).toBe('Level up with high friendship at night');
    expect(rs.getSpecies('Eevee')!.evoMethod).toBeUndefined();
  });

  it('builds the whole family tree from any member', () => {
    const tree = evolutionTree(getRuleset('gen9'), 'Gallade')!;
    expect(tree.species.name).toBe('Ralts');
    expect(tree.children[0].species.name).toBe('Kirlia');
    expect(tree.children[0].children.map((c) => c.species.name)).toEqual(['Gardevoir', 'Gallade']);
  });

  it('builds sprite ids Showdown-style', () => {
    const rs = getRuleset('gen9');
    expect(rs.getSpecies('Raichu-Alola')!.spriteId).toBe('raichu-alola');
    expect(getRuleset('gen8').getSpecies('Mr. Mime')!.spriteId).toBe('mrmime');
  });
});

describe('learnsets', () => {
  it('groups level-up moves in level order', async () => {
    const grouped = groupLearnset(await getRuleset('gen4').learnset('Garchomp'));
    const levels = grouped.level.map((l) => l.level);
    expect(levels).toEqual([...levels].sort((a, b) => a - b));
    expect(grouped.tm.some((e) => e.move === 'earthquake')).toBe(true);
    expect(grouped.egg.length).toBeGreaterThan(0);
  });

  it('finds every species that learns a move', async () => {
    const learners = await findLearners(getRuleset('gen4'), 'spore');
    const names = learners.map((l) => l.species.name);
    expect(names).toEqual(expect.arrayContaining(['Paras', 'Parasect', 'Breloom']));
    expect(names).not.toContain('Pikachu');
  });
});

describe('Unbound abilities', () => {
  it("uses the name the game shows, not the twin ability the source reuses for its effect", () => {
    const ub = getRuleset('unbound');
    // Base_Stats.c: `.ability1 = ABILITY_INSOMNIA, //-ABILITY_VITALSPIRIT`
    expect(ub.getSpecies('Delibird')?.abilities).toEqual(['Vital Spirit', 'Hustle', 'Prankster']);
    expect(ub.getSpecies('Zekrom')?.abilities).toContain('Teravolt');
    expect(ub.getSpecies('Cinderace')?.abilities).toContain('Libero');
  });
});
