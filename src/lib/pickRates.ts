import type { Ruleset, TrainerInfo } from '../rulesets/types';
import { parseSpread } from './smogon';
import type { FormatData, Share } from './smogonTypes';

export interface PickStat {
  /** Share of all Pokémon in the source that use it, 0-1 */
  rate: number;
  /** Biggest users: [species, share of that species' sets using it], most total picks first */
  users: Share[];
}

export type PickCategory = 'items' | 'abilities' | 'natures';

/** Pick rates keyed by item/ability id or nature name */
export type PickRates = Record<PickCategory, Map<string, PickStat>>;

const MAX_USERS = 6;

class Tally {
  private picks = new Map<string, { weight: number; users: { species: string; share: number; weight: number }[] }>();

  add(key: string, species: string, share: number, weight: number) {
    const entry = this.picks.get(key) ?? { weight: 0, users: [] };
    entry.weight += weight;
    const user = entry.users.find((u) => u.species === species);
    if (user) {
      user.share += share;
      user.weight += weight;
    } else entry.users.push({ species, share, weight });
    this.picks.set(key, entry);
  }

  finish(total: number): Map<string, PickStat> {
    const out = new Map<string, PickStat>();
    for (const [key, { weight, users }] of this.picks) {
      out.set(key, {
        rate: total ? weight / total : 0,
        users: users
          .sort((a, b) => b.weight - a.weight)
          .slice(0, MAX_USERS)
          .map((u): Share => [u.species, u.share]),
      });
    }
    return out;
  }
}

const tallies = () => ({ items: new Tally(), abilities: new Tally(), natures: new Tally() });
const itemKey = (rs: Ruleset, name: string) => rs.getItem(name)?.id;
const abilityKey = (rs: Ruleset, name: string) => rs.getAbility(name)?.id;

/**
 * Smogon usage: each Pokémon's item/ability/nature shares weighted by how often the Pokémon is used.
 * The stats files keep only each Pokémon's top items and spreads, so rare picks are slightly undercounted.
 */
export function pickRatesFromUsage(rs: Ruleset, data: FormatData): PickRates {
  const t = tallies();
  let total = 0;
  for (const [species, u] of Object.entries(data.pokemon)) {
    total += u.usage;
    for (const [name, share] of u.items) {
      const key = itemKey(rs, name);
      if (key) t.items.add(key, species, share, u.usage * share);
    }
    for (const [name, share] of u.abilities) {
      const key = abilityKey(rs, name);
      if (key) t.abilities.add(key, species, share, u.usage * share);
    }
    // only the top few spreads are kept (about two thirds of sets), so scale natures up to the whole Pokémon
    const covered = u.spreads.reduce((sum, [, share]) => sum + share, 0);
    for (const [spread, raw] of u.spreads) {
      const nature = parseSpread(spread)?.nature;
      const share = raw / covered;
      if (nature) t.natures.add(nature, species, share, u.usage * share);
    }
  }
  return { items: t.items.finish(total), abilities: t.abilities.finish(total), natures: t.natures.finish(total) };
}

/** Romhack trainer teams: how many of the game's trainer Pokémon carry each item/ability/nature */
export function pickRatesFromTrainers(rs: Ruleset, trainers: TrainerInfo[]): PickRates {
  const t = tallies();
  const perSpecies = new Map<string, number>();
  const mons = trainers.flatMap((tr) => tr.team);
  for (const m of mons) perSpecies.set(m.species, (perSpecies.get(m.species) ?? 0) + 1);
  for (const m of mons) {
    const share = 1 / perSpecies.get(m.species)!;
    const item = m.item && itemKey(rs, m.item);
    if (item) t.items.add(item, m.species, share, 1);
    const ability = m.ability && abilityKey(rs, m.ability);
    if (ability) t.abilities.add(ability, m.species, share, 1);
    if (m.nature) t.natures.add(m.nature, m.species, share, 1);
  }
  return { items: t.items.finish(mons.length), abilities: t.abilities.finish(mons.length), natures: t.natures.finish(mons.length) };
}
