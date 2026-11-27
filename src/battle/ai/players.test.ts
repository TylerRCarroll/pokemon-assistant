import { describe, expect, it } from 'vitest';
import { getRuleset } from '../../rulesets/registry';
import { newSet, type TeamSet } from '../../lib/team';
import { BattleSession, type BattleSetup } from '../engine';
import { player, playOut } from './players';

const evs = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
const mon = (rulesetId: string, species: string, moves: string[], extra: Partial<TeamSet> = {}): TeamSet => ({
  ...newSet(getRuleset(rulesetId), species),
  moves,
  evs,
  level: 50,
  ...extra,
});
const setup = (rulesetId: string, p1: TeamSet[], p2: TeamSet[], seed: BattleSetup['seed'] = [1, 2, 3, 4], bags: BattleSetup['sides'][0]['bag'][] = []): BattleSetup => ({
  rulesetId,
  seed,
  sides: [
    { name: 'Player', team: p1, bag: bags[0] },
    { name: 'Boss', team: p2, bag: bags[1] },
  ],
});

describe('AI players', () => {
  it('both go for the super-effective hit over a resisted one', () => {
    for (const kind of ['ingame', 'smart'] as const) {
      const s = BattleSession.start(setup('gen9', [mon('gen9', 'Garchomp', ['Dragon Claw', 'Earthquake'])], [mon('gen9', 'Heatran', ['Flamethrower'])]));
      expect(player(kind).pick(s, 'p1'), kind).toEqual({ kind: 'move', move: 2 });
    }
  });

  it('smart switches out of a matchup it loses, to a Pokémon that wins it', () => {
    const s = BattleSession.start(
      setup('gen9', [mon('gen9', 'Scizor', ['Bullet Punch', 'X-Scissor']), mon('gen9', 'Gastrodon', ['Earth Power', 'Scald'])], [mon('gen9', 'Heatran', ['Flamethrower', 'Earth Power'])]),
    );
    expect(player('smart').pick(s, 'p1')).toEqual({ kind: 'switch', to: 1 });
    // the in-game AI never switches by choice
    expect(player('ingame').pick(s, 'p1').kind).toBe('move');
  });

  it('heals with the bag when low: smart when the heal outlasts the hit, in-game most of the time', () => {
    const low = (seed: BattleSetup['seed']) => {
      const s = BattleSession.start(setup('gen9', [mon('gen9', 'Snorlax', ['Body Slam'])], [mon('gen9', 'Machamp', ['Close Combat'], { level: 35 })], seed, [{ hyperpotion: 1 }]));
      const snorlax = s.active('p1')!;
      snorlax.sethp(Math.floor(snorlax.maxhp * 0.15));
      return s;
    };
    expect(player('smart').pick(low([1, 2, 3, 4]), 'p1')).toMatchObject({ kind: 'bag', use: { item: 'hyperpotion', target: 0 } });
    const seeds = Array.from({ length: 10 }, (_, i) => [i, 7, 7, 7] as BattleSetup['seed']);
    const heals = seeds.filter((seed) => player('ingame').pick(low(seed), 'p1').kind === 'bag').length;
    expect(heals).toBeGreaterThanOrEqual(4);
    expect(heals).toBeLessThan(10);
  });

  it('plays whole battles out in every kind of ruleset, quickly', () => {
    const t0 = performance.now();
    const battles = [
      setup('gen1', [mon('gen1', 'Alakazam', ['Psychic', 'Thunder Wave']), mon('gen1', 'Tauros', ['Body Slam', 'Earthquake'])], [mon('gen1', 'Gengar', ['Night Shade', 'Hypnosis']), mon('gen1', 'Snorlax', ['Body Slam', 'Rest'])]),
      setup('renegade-platinum', [mon('renegade-platinum', 'Infernape', ['Flare Blitz', 'Close Combat']), mon('renegade-platinum', 'Clefable', ['Moonblast', 'Calm Mind'])], [mon('renegade-platinum', 'Garchomp', ['Dragon Claw', 'Earthquake'])]),
      setup('gen9', [mon('gen9', 'Garchomp', ['Earthquake', 'Swords Dance'], { teraType: 'Steel' })], [mon('gen9', 'Kingambit', ['Kowtow Cleave', 'Sucker Punch'], { teraType: 'Dark' })]),
    ];
    for (const b of battles) {
      for (const [a, c] of [['ingame', 'smart'], ['smart', 'ingame'], ['smart', 'smart']] as const) {
        const s = playOut(BattleSession.start(b), player(a), player(c));
        expect(s.ended, `${b.rulesetId} ${a} vs ${c}`).toBe(true);
      }
    }
    expect(performance.now() - t0).toBeLessThan(15000);
  });

  it('smart beats random play nearly every time with equal teams', () => {
    const team = () => [mon('gen9', 'Garchomp', ['Earthquake', 'Dragon Claw', 'Swords Dance', 'Fire Fang']), mon('gen9', 'Rotom-Wash', ['Hydro Pump', 'Volt Switch', 'Will-O-Wisp', 'Protect']), mon('gen9', 'Ferrothorn', ['Power Whip', 'Gyro Ball', 'Leech Seed', 'Spikes'])];
    let wins = 0;
    for (let i = 0; i < 10; i++) {
      const s = playOut(BattleSession.start(setup('gen9', team(), team(), [i, i + 1, i + 2, i + 3])), player('smart'), player('random'));
      if (s.winner === 'p1') wins++;
    }
    expect(wins).toBeGreaterThanOrEqual(8);
  });
});
