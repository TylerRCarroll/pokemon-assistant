import { describe, expect, it } from 'vitest';
import { getRuleset } from '../rulesets/registry';
import { newSet, type TeamSet } from '../lib/team';
import { BattleSession, type Action, type BattleSetup } from './engine';
import { pickSlots } from './ai/multi';
import { player, playOut } from './ai/players';

const evs = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
const mon = (rulesetId: string, species: string, moves: string[], extra: Partial<TeamSet> = {}): TeamSet => ({
  ...newSet(getRuleset(rulesetId), species),
  moves,
  evs,
  level: 50,
  ...extra,
});
const setup = (rulesetId: string, gameType: BattleSetup['gameType'], p1: TeamSet[], p2: TeamSet[], extra: Partial<BattleSetup> = {}): BattleSetup => ({
  rulesetId,
  gameType,
  seed: [3, 1, 4, 1],
  sides: [
    { name: 'You', team: p1 },
    { name: 'Boss', team: p2 },
  ],
  ...extra,
});

const four = (id: string) => [
  mon(id, 'Garchomp', ['Earthquake', 'Dragon Claw', 'Rock Slide']),
  mon(id, 'Salamence', ['Dragon Claw', 'Flamethrower', 'Protect']),
  mon(id, 'Metagross', ['Meteor Mash', 'Earthquake', 'Zen Headbutt']),
  mon(id, 'Milotic', ['Surf', 'Ice Beam', 'Recover']),
];

describe('doubles and triples', () => {
  it('two Pokémon per side, with targets for single-target moves and none for spread moves', () => {
    const s = BattleSession.start(setup('gen9', 'doubles', four('gen9'), four('gen9')));
    expect(s.slots).toBe(2);
    expect(s.active('p1', 1)?.name).toBe('Salamence');
    const moves = s.legalSlot('p1', 0).filter((a): a is Extract<Action, { kind: 'move' }> => a.kind === 'move' && !a.gimmick);
    // Dragon Claw can go at either foe or the partner; Earthquake and Rock Slide hit everyone in reach
    expect(moves.filter((a) => a.move === 2).map((a) => a.target).sort()).toEqual([-2, 1, 2]);
    expect(moves.filter((a) => a.move === 1).map((a) => a.target)).toEqual([undefined]);
    expect(moves.filter((a) => a.move === 3).map((a) => a.target)).toEqual([undefined]);
  });

  it("plays doubles and triples out, AI against AI, in each gen that has them", () => {
    for (const [id, type] of [['gen3', 'doubles'], ['gen9', 'doubles'], ['gen5', 'triples']] as const) {
      const team = type === 'triples' ? [...four(id), mon(id, 'Scizor', ['Bullet Punch', 'X-Scissor']), mon(id, 'Tyranitar', ['Crunch', 'Stone Edge'])] : four(id);
      for (const [a, b] of [['smart', 'ingame'], ['ingame', 'smart']] as const) {
        const s = playOut(BattleSession.start(setup(id, type, team, team)), player(a), player(b));
        expect(s.ended, `${id} ${type} ${a} vs ${b}`).toBe(true);
      }
    }
  });

  it("doesn't Earthquake its partner unless the partner is immune", () => {
    // Salamence flies over Earthquake; Metagross doesn't
    const flying = BattleSession.start(setup('gen9', 'doubles', [mon('gen9', 'Garchomp', ['Earthquake', 'Dragon Claw']), mon('gen9', 'Salamence', ['Dragon Claw'])], [mon('gen9', 'Heatran', ['Flamethrower']), mon('gen9', 'Raichu', ['Thunderbolt'])]));
    expect(pickSlots(flying, 'p1', 'smart')[0]).toMatchObject({ kind: 'move', move: 1 });
    const grounded = BattleSession.start(setup('gen9', 'doubles', [mon('gen9', 'Garchomp', ['Earthquake', 'Dragon Claw']), mon('gen9', 'Raichu', ['Thunderbolt'])], [mon('gen9', 'Snorlax', ['Body Slam']), mon('gen9', 'Snorlax', ['Body Slam'])]));
    expect(pickSlots(grounded, 'p1', 'smart')[0]).toMatchObject({ kind: 'move', move: 2 });
  });

  it('uses the bag in doubles: a Revive on the bench costs one Pokémon its turn', () => {
    const s = BattleSession.start(
      setup('gen9', 'doubles', [], [], {
        sides: [
          { name: 'You', team: [mon('gen9', 'Pikachu', ['Thunderbolt'], { level: 1 }), mon('gen9', 'Salamence', ['Dragon Claw']), mon('gen9', 'Metagross', ['Meteor Mash'])], bag: { revive: 1 } },
          { name: 'Boss', team: [mon('gen9', 'Garchomp', ['Earthquake']), mon('gen9', 'Snorlax', ['Body Slam'])] },
        ],
      }),
    );
    // Earthquake knocks out the level-1 Pikachu; Salamence flies over it
    s.submit({ p1: [{ kind: 'move', move: 1, target: 1 }, { kind: 'move', move: 1, target: 1 }], p2: [{ kind: 'move', move: 1 }, { kind: 'move', move: 1, target: 2 }] });
    expect(s.side('p1').pokemon.find((p) => p.name === 'Pikachu')!.fainted).toBe(true);
    expect(s.pending()).toEqual(['p1']);
    s.submit({ p1: [{ kind: 'switch', to: 2 }, { kind: 'pass' }] });
    const revive = s.legalSlot('p1', 1).find((a) => a.kind === 'bag');
    expect(revive).toMatchObject({ kind: 'bag', use: { item: 'revive' } });
    s.submit({ p1: [{ kind: 'move', move: 1, target: 1 }, revive!], p2: pickSlots(s, 'p2', 'smart') });
    expect(s.side('p1').pokemon.find((p) => p.name === 'Pikachu')!.fainted).toBe(false);
  });
});

describe('carrying a battle over into the next', () => {
  it('starts with the HP, PP, status, and faints given, and the first healthy Pokémon leads', () => {
    const team = [mon('gen9', 'Pikachu', ['Thunderbolt']), mon('gen9', 'Snorlax', ['Body Slam', 'Rest']), mon('gen9', 'Garchomp', ['Earthquake'])];
    const s = BattleSession.start({
      rulesetId: 'gen9',
      seed: [1, 2, 3, 4],
      sides: [
        { name: 'You', team, state: [{ hp: 0 }, { hp: 50, status: 'par', pp: [3, 10] }, undefined] },
        { name: 'Boss', team: [mon('gen9', 'Machamp', ['Close Combat'])] },
      ],
    });
    const snorlax = s.active('p1')!;
    expect(snorlax.name).toBe('Snorlax');
    expect(snorlax.hp).toBe(50);
    expect(snorlax.status).toBe('par');
    // PP is capped at the move's max (Rest has 8)
    expect(snorlax.moveSlots.map((m) => m.pp)).toEqual([3, 8]);
    expect(s.side('p1').pokemonLeft).toBe(2);
    // and the state reads back in the setup's team order
    const after = s.state('p1');
    expect(after[0].hp).toBe(0);
    expect(after[1]).toMatchObject({ hp: 50, status: 'par' });
    expect(after[2].hp).toBe(s.side('p1').pokemon.find((p) => p.name === 'Garchomp')!.maxhp);
    // a battle with carried-in state replays the same way
    s.submit({ p1: { kind: 'move', move: 1 }, p2: { kind: 'move', move: 1 } });
    expect(BattleSession.replay(s.setup, s.decisions).log()).toEqual(s.log());
  });
});

describe('names', () => {
  it('tells two forms of one species apart, and reads their state back by position', () => {
    const s = BattleSession.start({
      rulesetId: 'gen9',
      seed: [1, 1, 1, 1],
      sides: [
        { name: 'You', team: [mon('gen9', 'Rotom-Wash', ['Hydro Pump']), mon('gen9', 'Rotom-Heat', ['Overheat'])], state: [undefined, { hp: 30 }] },
        { name: 'Boss', team: [mon('gen9', 'Snorlax', ['Body Slam'])] },
      ],
    });
    expect(s.side('p1').pokemon.map((p) => p.name)).toEqual(['Rotom', 'Rotom 2']);
    expect(s.state('p1').map((m) => m.hp)).toEqual([s.active('p1')!.maxhp, 30]);
  });
});
