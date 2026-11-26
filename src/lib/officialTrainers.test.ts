import { describe, expect, it } from 'vitest';
import { GAMES } from '../data/games';
import { getRuleset } from '../rulesets/registry';
import { counterFixes } from './counters';
import { newSet } from './team';
import { analyzeThreat } from './threats';
import { setFromTrainerMon } from './trainers';

// data-src/trainers/*.json, from npm run fetch:trainers (Bulbapedia)
describe.each(['gen9', 'gen5'])('%s story bosses', (id) => {
  const rs = getRuleset(id);

  it('resolve against the ruleset and sit in a checkpoint that covers them', async () => {
    const trainers = await rs.loadTrainers!();
    expect(trainers.length).toBeGreaterThan(20);
    const checkpoints = GAMES.find((g) => g.rulesetId === id)!.checkpoints!;
    for (const t of trainers) {
      const cp = checkpoints.find((c) => c.label === t.split);
      expect(cp, `${t.name}: ${t.split}`).toBeDefined();
      for (const m of t.team) {
        expect(rs.getSpecies(m.species), `${t.name}: ${m.species}`).toBeDefined();
        expect(m.level).toBeGreaterThan(0);
        for (const mv of m.moves) expect(rs.getMove(mv), `${t.name}: ${m.species} ${mv}`).toBeDefined();
      }
      // the checkpoint's cap is at least the ace's level, except the last one (anything goes post-game)
      if (cp !== checkpoints[checkpoints.length - 1]) expect(cp!.levelCap).toBeGreaterThanOrEqual(Math.max(...t.team.map((m) => m.level)));
      expect(t.games?.length).toBeGreaterThan(0);
    }
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
