import type { Ruleset, TrainerInfo, TrainerMon } from '../rulesets/types';
import { newSet, STAT_IDS, type TeamSet } from './team';

/** A trainer's Pokémon as a builder/calc set. In-game trainers have no EVs and one IV for every stat. */
export function setFromTrainerMon(rs: Ruleset, m: TrainerMon): TeamSet {
  const base = newSet(rs, m.species);
  return {
    ...base,
    level: m.level,
    item: m.item ?? undefined,
    ability: m.ability ?? base.ability,
    nature: m.nature ?? base.nature,
    ivs: Object.fromEntries(STAT_IDS.map((s) => [s, m.ivs])) as unknown as TeamSet['ivs'],
    evs: Object.fromEntries(STAT_IDS.map((s) => [s, 0])) as unknown as TeamSet['evs'],
    moves: m.moves.filter((n) => rs.getMove(n)).slice(0, 4),
  };
}

export interface SplitGroup {
  split: string;
  levelCap?: number;
  trainers: TrainerInfo[];
}

/** Trainers grouped by progress split, in level-cap order (splits without a cap last) */
export function groupBySplit(trainers: TrainerInfo[]): SplitGroup[] {
  const groups = new Map<string, SplitGroup>();
  for (const t of trainers) {
    const g = groups.get(t.split) ?? { split: t.split, levelCap: t.levelCap, trainers: [] };
    g.trainers.push(t);
    groups.set(t.split, g);
  }
  return [...groups.values()].sort((a, b) => (a.levelCap ?? Infinity) - (b.levelCap ?? Infinity));
}

/** "GYM LEADER ROARK" → "Gym Leader Roark" */
export const trainerName = (t: TrainerInfo) => t.name.toLowerCase().replace(/(^|[\s/(-])(\S)/g, (_, sep: string, ch: string) => sep + ch.toUpperCase());
