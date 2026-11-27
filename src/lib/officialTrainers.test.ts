import { describe, expect, it } from 'vitest';
import { GAMES } from '../data/games';
import { getRuleset } from '../rulesets/registry';
import { counterFixes } from './counters';
import { newSet } from './team';
import { analyzeThreat } from './threats';
import { setFromTrainerMon } from './trainers';

// data-src/trainers/*.json, from npm run fetch:trainers (Bulbapedia)
const TRAINER_RULESETS = [...new Set(GAMES.filter((g) => g.checkpoints).map((g) => g.rulesetId))];

describe.each(TRAINER_RULESETS)('%s story bosses', (id) => {
  const rs = getRuleset(id);

  it('resolve against the ruleset and sit in a checkpoint of their game that covers them', async () => {
    const trainers = await rs.loadTrainers!();
    expect(trainers.length).toBeGreaterThan(10);
    for (const t of trainers) {
      expect(t.games?.length, t.name).toBeGreaterThan(0);
      for (const gameId of t.games!) {
        const checkpoints = GAMES.find((g) => g.id === gameId)!.checkpoints!;
        const cp = checkpoints.find((c) => c.label === t.split);
        expect(cp, `${t.name} (${gameId}): ${t.split}`).toBeDefined();
        // the checkpoint's cap is at least the ace's level, except the last one (anything goes post-game)
        if (cp !== checkpoints[checkpoints.length - 1]) expect(cp!.levelCap, `${t.name} (${gameId})`).toBeGreaterThanOrEqual(Math.max(...t.team.map((m) => m.level)));
      }
      for (const m of t.team) {
        expect(rs.getSpecies(m.species), `${t.name}: ${m.species}`).toBeDefined();
        expect(m.level).toBeGreaterThan(0);
        for (const mv of m.moves) expect(rs.getMove(mv), `${t.name}: ${m.species} ${mv}`).toBeDefined();
      }
    }
  });

  it("put each gym leader, kahuna, and Kanto leader in the game's own checkpoint for them", async () => {
    const trainers = await rs.loadTrainers!();
    for (const game of GAMES.filter((g) => g.rulesetId === id)) {
      for (const c of game.checkpoints!.filter((x) => x.bosses)) {
        expect(trainers.some((t) => t.games!.includes(game.id) && t.split === c.label), `${game.name}: ${c.label}`).toBe(true);
      }
    }
  });
});

describe('every official game', () => {
  it('has boss fights and an availability file, and the starters are there from the start', async () => {
    const { loadAvailability } = await import('./availability');
    for (const game of GAMES.filter((g) => g.checkpoints)) {
      const file = await loadAvailability(game);
      expect(file, game.name).toBeDefined();
      expect(Object.keys(file!.species).length, game.name).toBeGreaterThan(50);
      expect(Object.values(file!.species).filter((at) => at === 0).length, game.name).toBeGreaterThan(5);
    }
  });

  it('keeps versions apart where their fights differ', async () => {
    const gen1 = await getRuleset('gen1').loadTrainers!();
    // Yellow's leaders run higher, and its checkpoints with them
    expect(gen1.find((t) => /Erika/.test(t.name) && t.games!.includes('yellow'))!.levelCap).toBe(32);
    expect(gen1.find((t) => /Erika/.test(t.name) && t.games!.includes('red'))!.levelCap).toBe(29);
    const gen8 = await getRuleset('gen8').loadTrainers!();
    expect(gen8.find((t) => /Bea$/.test(t.name) && t.split === 'Gym 4: Bea')?.games).toEqual(['sword']);
    expect(gen8.find((t) => /Allister$/.test(t.name) && t.split === 'Gym 4: Allister')?.games).toEqual(['shield']);
    // the Johto games' Kanto leaders are their post-game, not part of the Elite Four run
    const gen2 = await getRuleset('gen2').loadTrainers!();
    expect(gen2.find((t) => /Brock/.test(t.name))!.split).toBe('Kanto Gyms');
    // Black 2/White 2 take Normal Mode, and leave out the World Tournament's exhibition fights
    const gen5 = await getRuleset('gen5').loadTrainers!();
    const roxie = gen5.find((t) => /Roxie/.test(t.name))!;
    expect(Math.max(...roxie.team.map((m) => m.level))).toBe(18);
    expect(gen5.some((t) => t.games!.includes('black-2') && t.location === 'Pokémon World Tournament')).toBe(false);
    // BDSP plays under the National Dex ruleset
    expect((await getRuleset('gen8natdex').loadTrainers!()).some((t) => /Cynthia/.test(t.name))).toBe(true);
  });
});

describe('version and starter differences', () => {
  it('splits Black and White where the fights differ', async () => {
    const bw = await getRuleset('gen5').loadTrainers!();
    expect(bw.find((t) => /Drayden/.test(t.name))?.games).toEqual(['black']);
    expect(bw.find((t) => /Iris/.test(t.name))?.games).toEqual(['white']);
    // the Striaton leader you face depends on your starter
    const striaton = bw.filter((t) => /Chili|Cress|Cilan/.test(t.name));
    expect(striaton.map((t) => t.notes.join(' ')).sort()).toEqual(['If you chose Oshawott', 'If you chose Snivy', 'If you chose Tepig']);
  });

  it('keeps Tera types and the advisor fights the Terastallized ace', async () => {
    const rs = getRuleset('gen9');
    const sv = await rs.loadTrainers!();
    const katy = sv.find((t) => /Katy/.test(t.name))!;
    const teddiursa = katy.team.find((m) => m.species === 'Teddiursa')!;
    expect(teddiursa.tera).toBe('Bug');
    const threat = setFromTrainerMon(rs, teddiursa);
    expect(threat.teraType).toBe('Bug');

    // Tera Bug turns Fire super effective, so Fletchinder's Ember hits harder once Tera is counted
    const fletch = { ...newSet(rs, 'Fletchinder'), level: 15, evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 }, moves: ['Ember', 'Peck'] };
    const asBug = analyzeThreat(rs, threat, 0, [fletch], {}, true).matchups[0];
    const asNormal = analyzeThreat(rs, threat, 0, [fletch], {}, false).matchups[0];
    expect(asBug.yourBest!.maxPct).toBeGreaterThan(asNormal.yourBest!.maxPct);
    // and the advisor runs against it without the team or pool data it doesn't need
    expect(() => counterFixes({ rs, threat, threatTera: true, team: [fletch], cap: katy.levelCap!, learnsets: new Map() })).not.toThrow();
  });
});
