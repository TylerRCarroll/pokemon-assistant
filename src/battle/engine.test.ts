import { Dex } from '@pkmn/sim';
import { describe, expect, it } from 'vitest';
import { getRuleset } from '../rulesets/registry';
import { newSet, type TeamSet } from '../lib/team';
import { BattleSession, SIDES, type Action, type BattleSetup, type Decision } from './engine';

const evs = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
const ivs = { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 };
const mon = (rulesetId: string, species: string, moves: string[], extra: Partial<TeamSet> = {}): TeamSet => ({
  ...newSet(getRuleset(rulesetId), species),
  moves,
  evs,
  ivs,
  level: 50,
  ...extra,
});

const setup = (rulesetId: string, p1: TeamSet[], p2: TeamSet[], extra: Partial<BattleSetup> = {}): BattleSetup => ({
  rulesetId,
  seed: [1, 2, 3, 4],
  sides: [
    { name: 'Player', team: p1 },
    { name: 'Boss', team: p2 },
  ],
  ...extra,
});

/** Both sides pick their first legal move (or switch when they must) */
const firstMoves = (s: BattleSession): Decision =>
  Object.fromEntries(s.pending().map((side) => [side, s.legal(side).find((a) => a.kind === 'move') ?? s.legal(side)[0]]));

function playOut(s: BattleSession, pick = firstMoves, max = 200) {
  for (let i = 0; i < max && !s.ended; i++) s.submit(pick(s));
  return s;
}

const gen9 = () =>
  setup(
    'gen9',
    [mon('gen9', 'Garchomp', ['Earthquake', 'Dragon Claw'], { item: 'Choice Scarf', teraType: 'Steel' }), mon('gen9', 'Rotom-Wash', ['Hydro Pump', 'Volt Switch'])],
    [mon('gen9', 'Snorlax', ['Body Slam', 'Rest']), mon('gen9', 'Gengar', ['Shadow Ball', 'Sludge Bomb'])],
  );

describe('battle engine', () => {
  it('runs a seeded battle to the end, and replays it exactly from its decisions', () => {
    const s = playOut(BattleSession.start(gen9()));
    expect(s.ended).toBe(true);
    expect(['p1', 'p2']).toContain(s.winner);
    const again = BattleSession.replay(s.setup, s.decisions);
    expect(again.log()).toEqual(s.log());
    // and rewinding to an earlier point gives that point
    const early = BattleSession.replay(s.setup, s.decisions, 1);
    expect(early.turn).toBe(2);
    expect(early.ended).toBe(false);
  });

  it('clones a battle that then plays out the same as the original', () => {
    const s = BattleSession.start(gen9());
    s.submit(firstMoves(s));
    const copy = s.clone();
    playOut(s);
    playOut(copy);
    expect(copy.winner).toBe(s.winner);
    expect(copy.turn).toBe(s.turn);
  });

  it('offers each gen its gimmicks: Tera in Gen 9, Mega in Gen 6, none in Gen 4', () => {
    const tera = BattleSession.start(gen9()).legal('p1');
    expect(tera.some((a) => a.kind === 'move' && a.gimmick === 'terastallize')).toBe(true);
    const mega = BattleSession.start(setup('gen6', [mon('gen6', 'Charizard', ['Flamethrower'], { item: 'Charizardite Y' })], [mon('gen6', 'Venusaur', ['Giga Drain'])]));
    expect(mega.legal('p1').some((a) => a.kind === 'move' && a.gimmick === 'mega')).toBe(true);
    const gen4 = BattleSession.start(setup('gen4', [mon('gen4', 'Garchomp', ['Earthquake'])], [mon('gen4', 'Snorlax', ['Body Slam'])]));
    expect(gen4.legal('p1').every((a) => a.kind !== 'move' || !a.gimmick)).toBe(true);
  });

  it('runs every generation', () => {
    for (const [id, a, b] of [
      ['gen1', 'Alakazam', 'Tauros'],
      ['gen2', 'Typhlosion', 'Feraligatr'],
      ['gen3', 'Blaziken', 'Swampert'],
      ['gen5', 'Excadrill', 'Ferrothorn'],
      ['gen7', 'Decidueye', 'Incineroar'],
      ['gen8', 'Dragapult', 'Corviknight'],
    ]) {
      const rs = getRuleset(id);
      const moves = (sp: string) => [rs.moves().find((m) => m.basePower >= 60 && rs.getSpecies(sp)!.types.includes(m.type))?.name ?? 'Tackle'];
      const s = playOut(BattleSession.start(setup(id, [mon(id, a, moves(a))], [mon(id, b, moves(b))])));
      expect(s.ended, id).toBe(true);
    }
  });
});

describe('the bag', () => {
  it('heals at the start of the turn, takes the turn, and spends no PP and sets no choice lock', () => {
    const s = BattleSession.start(
      setup('gen9', [], [], {
        sides: [
          { name: 'Player', team: [mon('gen9', 'Pikachu', ['Thunderbolt']), mon('gen9', 'Snorlax', ['Body Slam', 'Rest'], { item: 'Choice Band' })], bag: { hyperpotion: 2 } },
          { name: 'Boss', team: [mon('gen9', 'Machamp', ['Close Combat'], { level: 30 })] },
        ],
      }),
    );
    // Snorlax switches in and takes the hit, so it has HP to heal and hasn't moved yet
    s.submit({ p1: { kind: 'switch', to: 1 }, p2: { kind: 'move', move: 1 } });
    const snorlax = s.active('p1')!;
    expect(snorlax.name).toBe('Snorlax');
    const hurt = snorlax.hp;
    expect(hurt).toBeLessThan(snorlax.maxhp);
    const pp = snorlax.moveSlots.map((m) => m.pp);
    const lines = s.log().length;

    s.submit({ p1: { kind: 'bag', use: { item: 'hyperpotion', target: 0 } }, p2: { kind: 'move', move: 1 } });
    const turn = s.log().slice(lines);
    expect(turn.some((l) => /used a Hyper Potion on Snorlax/.test(l))).toBe(true);
    // the item comes before Machamp's attack, and Snorlax doesn't move
    expect(turn.findIndex((l) => /Hyper Potion/.test(l))).toBeLessThan(turn.findIndex((l) => /\|move\|p2a/.test(l)));
    expect(turn.some((l) => /\|move\|p1a/.test(l))).toBe(false);
    expect(snorlax.moveSlots.map((m) => m.pp)).toEqual(pp);
    expect(snorlax.volatiles.choicelock).toBeUndefined();
    expect(s.bags[0].hyperpotion).toBe(1);
  });

  it("revives a fainted Pokémon on the bench, and won't waste an item that does nothing", () => {
    const s = BattleSession.start(
      setup('gen9', [], [], {
        sides: [
          { name: 'Player', team: [mon('gen9', 'Pikachu', ['Thunderbolt'], { level: 5 }), mon('gen9', 'Snorlax', ['Body Slam'])], bag: { revive: 1, potion: 1 } },
          { name: 'Boss', team: [mon('gen9', 'Machamp', ['Close Combat'])] },
        ],
      }),
    );
    // a Potion on full-HP Pokémon isn't offered
    expect(s.legal('p1').some((a) => a.kind === 'bag' && a.use.item === 'potion')).toBe(false);
    s.submit({ p1: { kind: 'move', move: 1 }, p2: { kind: 'move', move: 1 } });
    expect(s.pending()).toEqual(['p1']); // Pikachu fainted: Snorlax has to come in
    s.submit({ p1: { kind: 'switch', to: 1 } });
    const pikachu = s.side('p1').pokemon.find((p) => p.name === 'Pikachu')!;
    expect(pikachu.fainted).toBe(true);
    const revive = s.legal('p1').find((a): a is Extract<Action, { kind: 'bag' }> => a.kind === 'bag' && a.use.item === 'revive')!;
    expect(revive).toBeDefined();
    s.submit({ p1: revive, p2: { kind: 'move', move: 1 } });
    expect(pikachu.fainted).toBe(false);
    expect(pikachu.hp).toBe(Math.floor(pikachu.maxhp / 2));
    // and the replay does the same
    const again = BattleSession.replay(s.setup, s.decisions);
    expect(again.side('p1').pokemon.find((p) => p.name === 'Pikachu')!.hp).toBe(pikachu.hp);
  });
});

describe('romhacks', () => {
  it("battles with Renegade Platinum's own stats, types, and Fairy", () => {
    const rs = getRuleset('renegade-platinum');
    const vanilla = Dex.mod('gen4');
    const changed = rs.species().find((sp) => {
      const v = vanilla.species.get(sp.id);
      return v.exists && (sp.types.join() !== v.types.join() || sp.baseStats.spe !== v.baseStats.spe);
    })!;
    expect(changed).toBeDefined();
    const s = BattleSession.start(setup('renegade-platinum', [mon('renegade-platinum', changed.name, ['Tackle'])], [mon('renegade-platinum', 'Garchomp', ['Dragon Claw'])]));
    const inBattle = s.active('p1')!;
    expect(inBattle.species.types).toEqual(changed.types);
    expect(inBattle.species.baseStats).toEqual(changed.baseStats);
    // Moonblast is a Fairy move the hack adds, and Fairy beats Dragon there
    const fairy = BattleSession.start(setup('renegade-platinum', [mon('renegade-platinum', 'Clefable', ['Moonblast'])], [mon('renegade-platinum', 'Garchomp', ['Dragon Claw'], { level: 100 })]));
    fairy.submit({ p1: { kind: 'move', move: 1 }, p2: { kind: 'move', move: 1 } });
    expect(fairy.log().some((l) => /\|-supereffective\|p2a/.test(l))).toBe(true);
  });

  it("knows Unbound's custom move", () => {
    const s = BattleSession.start(setup('unbound', [mon('unbound', 'Zubat', ['Leech Fang'])], [mon('unbound', 'Bulbasaur', ['Tackle'])]));
    s.submit({ p1: { kind: 'move', move: 1 }, p2: { kind: 'move', move: 1 } });
    expect(s.log().some((l) => /\|move\|p1a: Zubat\|Leech Fang/.test(l))).toBe(true);
    expect(SIDES).toHaveLength(2);
  });
});

describe('battle text', () => {
  it('reads like the game, turn by turn, bag included', async () => {
    const { battleText } = await import('./log');
    const s = BattleSession.start({
      rulesetId: 'gen9',
      seed: [1, 2, 3, 4],
      sides: [
        { name: 'Player', team: [mon('gen9', 'Pikachu', ['Thunderbolt']), mon('gen9', 'Snorlax', ['Body Slam'])], bag: { potion: 1 } },
        { name: 'Boss', team: [mon('gen9', 'Machamp', ['Close Combat'], { level: 30 })] },
      ],
    });
    s.submit({ p1: { kind: 'switch', to: 1 }, p2: { kind: 'move', move: 1 } });
    s.submit({ p1: { kind: 'bag', use: { item: 'potion', target: 0 } }, p2: { kind: 'move', move: 1 } });
    const text = battleText(s.log());
    expect(text[1]).toEqual(expect.arrayContaining(['Go! Snorlax!', 'The opposing Machamp used Close Combat!']));
    expect(text[2][0]).toBe('Player used a Potion on Snorlax!');
    expect(text[2]).toContain('Snorlax had its HP restored.');
  });
});
