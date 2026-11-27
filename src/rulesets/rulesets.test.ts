import { describe, expect, it } from 'vitest';
import { getRuleset, RULESETS } from './registry';
import { methodsFor } from './official';
import { bucketProfile, defensiveProfile } from '../lib/typechart';

describe('official rulesets', () => {
  it('registers every gen plus romhacks', () => {
    const ids = RULESETS.map((r) => r.id);
    for (let g = 1; g <= 9; g++) expect(ids).toContain(`gen${g}`);
    expect(ids).toContain('renegade-platinum');
    expect(ids).toContain('unbound');
  });

  it('keeps the Gen 1 Ghost→Psychic bug', () => {
    expect(getRuleset('gen1').effectiveness('Ghost', ['Psychic'])).toBe(0);
    expect(getRuleset('gen2').effectiveness('Ghost', ['Psychic'])).toBe(2);
  });

  it('only has Fairy from Gen 6', () => {
    expect(getRuleset('gen5').types).not.toContain('Fairy');
    expect(getRuleset('gen6').types).toContain('Fairy');
    expect(getRuleset('gen9').types).not.toContain('Stellar');
  });

  it('computes dual-type matchups', () => {
    const rs = getRuleset('gen9');
    expect(rs.effectiveness('Ground', ['Fire', 'Steel'])).toBe(4);
    const buckets = bucketProfile(defensiveProfile(rs, ['Ground', 'Flying']));
    expect(buckets.immune).toEqual(expect.arrayContaining(['Ground', 'Electric']));
    expect(buckets.quad).toEqual(['Ice']);
  });

  it('returns species with stats and abilities', () => {
    const tusk = getRuleset('gen9').getSpecies('Great Tusk')!;
    expect(tusk.types).toEqual(['Ground', 'Fighting']);
    expect(tusk.baseStats.atk).toBe(131);
    expect(tusk.abilities).toEqual(['Protosynthesis']);
  });

  it('National Dex includes species cut from the games', () => {
    expect(getRuleset('gen8').getSpecies('Empoleon')).toBeUndefined();
    expect(getRuleset('gen8natdex').getSpecies('Empoleon')).toBeDefined();
  });
});

describe('learnsets', () => {
  it('parses methods for the requested gen only', () => {
    expect(methodsFor(['9L42', '8L40', '4M'], 4)).toEqual([{ kind: 'tm' }]);
    expect(methodsFor(['9L42', '9M'], 9)).toEqual([{ kind: 'level', level: 42 }, { kind: 'tm' }]);
    expect(methodsFor(['9M'], 4)).toEqual([]);
  });

  it('marks moves only available via a pre-evolution', async () => {
    const ls = await getRuleset('gen4').learnset('Garchomp');
    const eq = ls.find((e) => e.move === 'earthquake');
    expect(eq?.methods).toContainEqual({ kind: 'tm' });
    expect(eq?.viaPrevo).toBeUndefined();
    expect(ls.some((e) => e.viaPrevo && e.methods.some((m) => m.kind === 'egg'))).toBe(true);
  });
});

describe('romhack overlays', () => {
  it('Renegade Platinum backports Fairy onto a Gen 4 base', () => {
    const rp = getRuleset('renegade-platinum');
    expect(rp.kind).toBe('romhack');
    expect(rp.gen).toBe(4);
    expect(rp.types).toContain('Fairy');
    expect(rp.getSpecies('Clefable')!.types).toEqual(['Fairy']);
    expect(rp.getSpecies('Togekiss')!.types).toEqual(['Fairy', 'Flying']);
    expect(rp.getMove('Charm')!.type).toBe('Fairy');
    expect(rp.effectiveness('Dragon', ['Fairy'])).toBe(0);
    // base gen stays untouched
    expect(getRuleset('gen4').getSpecies('Clefable')!.types).toEqual(['Normal']);
  });

  it('Renegade Platinum uses the Complete patch data from the docs', () => {
    const rp = getRuleset('renegade-platinum');
    expect(rp.getSpecies('Charizard')!.types).toEqual(['Fire', 'Dragon']);
    expect(rp.getSpecies('Feraligatr')!.types).toEqual(['Water', 'Dark']);
    expect(rp.getSpecies('Ninetales')!.types).toEqual(['Fire', 'Fairy']);
    expect(rp.getSpecies('Venusaur')!.baseStats.spa).toBe(110);
    expect(rp.getSpecies('Venusaur')!.abilities).toEqual(['Thick Fat', 'Overgrow']);
    expect(rp.getSpecies('Whiscash')!.abilities).toContain('Anticipation');
    // vanilla Gen 4 is untouched
    expect(getRuleset('gen4').getSpecies('Charizard')!.types).toEqual(['Fire', 'Flying']);
  });

  it('Renegade Platinum has the hack’s moves, learnsets, and TMs', async () => {
    const rp = getRuleset('renegade-platinum');
    // moves replaced with later-gen ones
    expect(rp.getMove('Moonblast')).toMatchObject({ type: 'Fairy', basePower: 95, category: 'Special' });
    expect(rp.getMove('Hurricane')).toMatchObject({ type: 'Flying', basePower: 110 });
    expect(rp.moves().some((m) => m.id === 'twister')).toBe(false);
    expect(rp.getMove('Cross Poison')).toMatchObject({ basePower: 90, pp: 15 });
    // learnsets come from the doc, egg moves from vanilla
    const zard = await rp.learnset('Charizard');
    expect(zard.find((e) => e.move === 'hurricane')?.methods).toContainEqual({ kind: 'tm' });
    expect(zard.find((e) => e.move === 'dragonclaw')?.methods).toContainEqual({ kind: 'level', level: 1 });
    expect((await rp.learnset('Bulbasaur')).some((e) => e.methods.some((m) => m.kind === 'egg'))).toBe(true);
    expect(rp.tms?.find((t) => t.num === 50)).toMatchObject({ name: 'Overheat', location: expect.stringContaining('Sunyshore') });
  });

  it('Renegade Platinum loads trainer teams', async () => {
    const trainers = await getRuleset('renegade-platinum').loadTrainers!();
    const roark = trainers.find((t) => /LEADER ROARK/.test(t.name))!;
    expect(roark.boss).toBe(true);
    expect(roark.levelCap).toBe(16);
    expect(roark.team.map((m) => m.species)).toEqual(['Nosepass', 'Bonsly', 'Geodude', 'Onix', 'Larvitar', 'Cranidos']);
    expect(roark.team[0]).toMatchObject({ level: 15, item: 'Smooth Rock', ability: 'Sturdy', nature: 'Modest' });
    expect(trainers.every((t) => t.team.length >= 1 && t.team.length <= 6)).toBe(true);
    // official Gen 4 has its own (Bulbapedia) bosses, never the romhack's
    const official = await getRuleset('gen4').loadTrainers!();
    expect(official.every((t) => t.games?.length)).toBe(true);
    expect(official.some((t) => /Roark/.test(t.name) && t.team.some((m) => m.item === 'Smooth Rock'))).toBe(false);
  });

  it('Unbound uses Gen 8 mechanics with the National Dex pool', () => {
    const ub = getRuleset('unbound');
    expect(ub.gen).toBe(8);
    expect(ub.getSpecies('Empoleon')).toBeDefined();
    expect(ub.verified).toBe(false);
  });

  it('Unbound applies the balanced base stats from the docs', () => {
    const ub = getRuleset('unbound');
    expect(ub.getSpecies('Venusaur')!.baseStats).toEqual({ hp: 80, atk: 95, def: 96, spa: 116, spd: 116, spe: 93 });
    expect(ub.getSpecies('Venusaur-Mega')!.baseStats.def).toBe(117);
    expect(ub.getSpecies('Gourgeist-Small')!.baseStats).toMatchObject({ hp: 55, spe: 122 });
    expect(ub.getSpecies('Gourgeist')!.baseStats).toMatchObject({ hp: 65, spe: 104 });
    // "Pikachu Alt Form" row covers the cap Pikachu; base Pikachu keeps its own row
    expect(ub.getSpecies('Pikachu-Partner')!.baseStats).toEqual({ hp: 35, atk: 109, def: 79, spa: 99, spd: 99, spe: 178 });
    expect(ub.getSpecies('Pikachu')!.baseStats.spe).toBe(90);
    expect(ub.species().find((s) => s.id === 'smeargle')!.baseStats).toEqual(
      ub.getSpecies('Smeargle')!.baseStats,
    );
    // Unbound-only move, taught by TM49
    const fang = ub.getMove('Leech Fang')!;
    expect(fang).toMatchObject({ type: 'Bug', basePower: 80, pp: 10, drain: [1, 2] });
    expect(fang.flags?.bite).toBe(1);
    expect(ub.moves().some((m) => m.id === 'leechfang')).toBe(true);
    expect(getRuleset('gen8natdex').getMove('Leech Fang')).toBeUndefined();
    // other rulesets keep official stats
    expect(getRuleset('gen8natdex').getSpecies('Venusaur')!.baseStats.atk).toBe(82);
  });
});

describe('Unbound game data', () => {
  const ub = getRuleset('unbound');

  it('uses Unbound abilities', () => {
    expect(ub.getSpecies('Typhlosion')!.abilities).toContain('Drought');
    expect(getRuleset('gen8natdex').getSpecies('Typhlosion')!.abilities).not.toContain('Drought');
  });

  it('includes Legends: Arceus species and moves, which Gen 8 National Dex does not', () => {
    expect(ub.getSpecies('Sneasler')).toBeDefined();
    expect(ub.getSpecies('Typhlosion-Hisui')).toBeDefined();
    expect(ub.getMove('Wave Crash')).toBeDefined();
    expect(getRuleset('gen8natdex').getSpecies('Sneasler')).toBeUndefined();
    // but not Scarlet/Violet species
    expect(ub.getSpecies('Great Tusk')).toBeUndefined();
  });

  it('has Unbound learnsets with level-up, TM, and inherited egg moves', async () => {
    const venusaur = await ub.learnset('Venusaur');
    const leechFang = (await ub.learnset('Ariados')).find((e) => e.move === 'leechfang');
    expect(venusaur.find((e) => e.move === 'leechseed')?.methods).toContainEqual({ kind: 'level', level: 9 });
    // Bulbasaur's egg moves carry through to Venusaur
    expect(venusaur.find((e) => e.move === 'leafstorm')?.methods).toContainEqual({ kind: 'egg' });
    expect(leechFang?.methods).toContainEqual({ kind: 'tm' });
  });

  it('has boss teams for each difficulty', async () => {
    const trainers = await ub.loadTrainers!();
    expect(new Set(trainers.map((t) => t.difficulty))).toEqual(new Set(['Insane', 'Expert', 'Difficult']));
    const mirskle = trainers.find((t) => t.difficulty === 'Insane' && t.name === 'Leader Mirskle')!;
    expect(mirskle.split).toBe('Gym 1: Mirskle');
    const floette = mirskle.team.find((m) => m.species === 'Floette')!;
    expect(floette.moves).toContain('Moonblast');
    expect(floette.evs?.hp).toBe(252);
    expect(new Set(trainers.map((t) => t.id)).size).toBe(trainers.length);
  });
});
