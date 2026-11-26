import { describe, expect, it } from 'vitest';
import { getRuleset } from '../rulesets/registry';
import { counterFixes } from './counters';
import { newSet, type TeamSet } from './team';
import { knocksOff, matchupOf } from './threats';

const rs = getRuleset('gen9');
const noEvs = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
const set = (species: string, patch: Partial<TeamSet>): TeamSet => ({ ...newSet(rs, species), level: 50, evs: noEvs, ...patch });

const weavile = set('Weavile', { moves: ['Knock Off', 'Ice Shard', 'Triple Axel'] });
const weavileNoKnock = set('Weavile', { moves: ['Ice Shard', 'Triple Axel'] });
const piloswine = set('Piloswine', { item: 'Eviolite', moves: ['Earthquake'] });

describe('Knock Off', () => {
  it('turns an Eviolite wall into a non-wall: the item only covers the first hit', () => {
    const without = matchupOf(rs, { set: weavileNoKnock }, { set: piloswine });
    expect(without.walls).toBe(true);
    expect(without.losesItem).toBeUndefined();

    const knocked = matchupOf(rs, { set: weavile }, { set: piloswine });
    expect(knocked.losesItem).toBe('Eviolite');
    expect(knocked.walls).toBe(false);
    // the follow-up hit, without Eviolite, is what it has to survive
    expect(knocked.theirBest!.maxPct).toBeGreaterThan(without.theirBest!.maxPct);
  });

  it("keeps items Knock Off can't take, and holders with Sticky Hold", () => {
    expect(knocksOff(rs, weavile, set('Gengar', { item: 'Gengarite' }))).toBe(false);
    expect(knocksOff(rs, weavile, set('Charizard', { item: 'Charizardite X' }))).toBe(false);
    expect(knocksOff(rs, weavile, set('Arceus', { item: 'Flame Plate' }))).toBe(false);
    expect(knocksOff(rs, weavile, set('Muk', { item: 'Black Sludge', ability: 'Sticky Hold' }))).toBe(false);
    expect(knocksOff(rs, weavile, set('Muk', { item: 'Black Sludge', ability: 'Stench' }))).toBe(true);
    expect(knocksOff(rs, weavile, set('Piloswine', { item: 'Eviolite' }))).toBe(true); // ends in "-ite" but isn't a Mega Stone
    expect(knocksOff(rs, weavile, set('Piloswine', {}))).toBe(false); // nothing to take
    expect(knocksOff(rs, weavileNoKnock, piloswine)).toBe(false);
  });

  it("doesn't count on an item the boss will knock off", () => {
    // a bare Piloswine: the advisor may suggest Eviolite against the Knock Off-less Weavile, never against this one
    const bare = set('Piloswine', { moves: ['Earthquake'] });
    const ideas = (threat: TeamSet) => counterFixes({ rs, threat, team: [bare], cap: 50, learnsets: new Map() }).filter((f) => f.kind === 'item' && f.checks);
    expect(ideas(weavileNoKnock).some((f) => f.set.item === 'Eviolite')).toBe(true);
    expect(ideas(weavile).some((f) => f.set.item === 'Eviolite')).toBe(false);
  });
});
