import { describe, expect, it } from 'vitest';
import { GAMES } from '../data/games';
import { getRuleset } from '../rulesets/registry';
import { availablePool, buildAvailability, loadAvailability } from './availability';
import { resolveMembers, teamWarnings } from './coverage';
import { newSet } from './team';
import { suggestSwaps } from './teamAdvice';

async function availability(gameId: string) {
  const game = GAMES.find((g) => g.id === gameId)!;
  const rs = getRuleset(game.rulesetId);
  return { rs, a: buildAvailability(rs, game, (await loadAvailability(game))!) };
}

describe('playthrough availability', () => {
  it('Scarlet: Paradox Pokémon wait for Area Zero and exclusives stay in their version', async () => {
    const { a } = await availability('scarlet');
    const violet = (await availability('violet')).a;
    expect(a.checkpoints[a.at('greattusk')!].label).toBe('Area Zero (ending)');
    expect(a.at('irontreads')).toBeUndefined();
    expect(violet.at('greattusk')).toBeUndefined();
    expect(violet.at('irontreads')).toBeDefined();
  });

  it('gates evolutions by the level cap', async () => {
    const { rs, a } = await availability('scarlet');
    expect(a.at('fletchling')).toBe(0);
    expect(a.checkpoints[a.at('fletchinder')!].levelCap).toBeGreaterThanOrEqual(17);
    expect(a.checkpoints[a.at('talonflame')!].levelCap).toBeGreaterThanOrEqual(35);
    // at the second gym you'd field Fletchinder, not Fletchling or Talonflame
    const pool = availablePool(rs, a, 1).map((s) => s.id);
    expect(pool).toContain('fletchinder');
    expect(pool).not.toContain('fletchling');
    expect(pool).not.toContain('talonflame');
    expect(pool).not.toContain('greattusk');
  });

  it('Black: places Pokémon by story location and level', async () => {
    const { a } = await availability('black');
    expect(a.at('snivy')).toBe(0);
    expect(a.checkpoints[a.at('deino')!].label).toBe('Elite Four, N & Ghetsis');
    expect(a.checkpoints[a.at('hydreigon')!].label).toBe('Post-game');
    expect(a.at('zekrom')).toBeUndefined();
  });

  it('romhacks: starters early, evolutions by level, legendaries post-game', async () => {
    const rp = (await availability('renegade-platinum')).a;
    expect(rp.at('turtwig')).toBe(0);
    expect(rp.checkpoints[rp.at('torterra')!].levelCap).toBeGreaterThanOrEqual(32);
    const ub = (await availability('unbound')).a;
    expect(ub.at('beldum')).toBe(0);
    expect(ub.checkpoints[ub.at('metagross')!].levelCap).toBeGreaterThanOrEqual(45);
    expect(ub.checkpoints[ub.at('rayquaza')!].label).toBe('Post-game');
  });

  it('warns about and swaps out team members you can’t have yet', async () => {
    const { rs, a } = await availability('scarlet');
    const members = resolveMembers(rs, ['Great Tusk', 'Pawmot', 'Skeledirge', 'Tinkaton', 'Garganacl', 'Dondozo'].map((s) => newSet(rs, s)));
    const play = { availability: a, checkpoint: 2 };
    const warnings = teamWarnings(rs, members, undefined, play);
    const notYet = warnings.filter((w) => w.issue.kind === 'notAvailable').map((w) => w.message);
    expect(notYet.some((m) => m.startsWith('Great Tusk'))).toBe(true);
    const pool = availablePool(rs, a, 2);
    const unavailable = new Set(warnings.flatMap((w) => (w.issue.kind === 'notAvailable' ? [w.issue.member] : [])));
    const swaps = suggestSwaps(rs, members, undefined, 3, { pool, level: 24, unavailable });
    expect(swaps.length).toBeGreaterThan(0);
    for (const s of swaps) expect(pool.map((p) => p.id)).toContain(s.incoming.id);
    // Garganacl, Skeledirge, and Tinkaton evolve above level 24 too, so any of them may go first
    expect(unavailable.has(swaps[0].out)).toBe(true);
    expect(notYet.length).toBeGreaterThanOrEqual(3);
    expect(swaps[0].set.level).toBe(24);
  });
});
