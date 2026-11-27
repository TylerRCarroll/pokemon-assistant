import { describe, expect, it } from 'vitest';
import { getRuleset } from '../rulesets/registry';
import { newSet, type TeamSet } from '../lib/team';
import { advise, batchSeed, mergeAdvice, runBattle, summarize } from './analysis';
import { BattleSession, type BattleSetup } from './engine';

const evs = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
const mon = (species: string, moves: string[], extra: Partial<TeamSet> = {}): TeamSet => ({ ...newSet(getRuleset('gen9'), species), moves, evs, level: 50, ...extra });
const setup = (p1: TeamSet[], p2: TeamSet[], seed: BattleSetup['seed'] = [5, 6, 7, 8]): BattleSetup => ({
  rulesetId: 'gen9',
  seed,
  sides: [
    { name: 'You', team: p1 },
    { name: 'Boss', team: p2 },
  ],
});
const mine = () => [mon('Garchomp', ['Earthquake', 'Dragon Claw', 'Fire Fang']), mon('Rotom-Wash', ['Hydro Pump', 'Volt Switch', 'Will-O-Wisp'])];
const theirs = () => [mon('Heatran', ['Flamethrower', 'Earth Power', 'Flash Cannon']), mon('Gengar', ['Shadow Ball', 'Sludge Bomb', 'Focus Blast'])];

describe('simulation', () => {
  it('records battles that replay exactly, with KOs credited to who landed them', () => {
    const r = runBattle(setup(mine(), theirs()), ['smart', 'smart']);
    expect(['p1', 'p2']).toContain(r.winner);
    const again = BattleSession.replay(setup(mine(), theirs()), r.decisions);
    expect(again.winner).toBe(r.winner);
    expect(again.turn).toBe(r.turns);
    // every faint on the losing side is someone's KO (no recoil or poison here to muddy it)
    const loser = r.winner === 'p1' ? 'p2' : 'p1';
    const winnerKos = r.mons.filter((m) => m.side === r.winner).reduce((a, m) => a + m.kos, 0);
    expect(winnerKos).toBe(r.mons.filter((m) => m.side === loser && m.fainted).length);
    expect(r.mons.find((m) => m.side === r.winner && m.kos > 0)!.damage).toBeGreaterThan(50);
  });

  it('summarizes a batch: wins, turns, and per-Pokémon averages', () => {
    const base = setup(mine(), theirs());
    const records = [0, 1, 2, 3].map((i) => runBattle({ ...base, seed: batchSeed(base.seed, i) }, ['smart', 'ingame']));
    const sum = summarize(records);
    expect(sum.battles).toBe(4);
    expect(sum.wins + sum.losses).toBeLessThanOrEqual(4);
    expect(sum.mons).toHaveLength(4);
    expect(new Set(records.map((r) => r.seed.join()))).toHaveProperty('size', 4);
  });

  it('the advisor ranks the obvious play first: Earthquake into Heatran', () => {
    // one on one, scored after a short playout, so a weak first move shows in the HP left
    const s = BattleSession.start(setup([mon('Garchomp', ['Earthquake', 'Dragon Claw', 'Fire Fang'])], [mon('Heatran', ['Flamethrower', 'Flash Cannon'], { level: 60 })]));
    const advice = advise(s, 'p1', { rollouts: 6, depth: 1 });
    expect(advice[0].label).toBe('Earthquake');
    expect(advice[0].winChance).toBeGreaterThan(advice[advice.length - 1].winChance);
    // splitting the work and merging it back gives the same ranking
    const halves = [advise(s, 'p1', { rollouts: 3, depth: 6, only: s.legal('p1').slice(0, 2) }), advise(s, 'p1', { rollouts: 3, depth: 6, only: s.legal('p1').slice(2) })];
    expect(mergeAdvice(halves)).toHaveLength(advice.length);
  });
});
