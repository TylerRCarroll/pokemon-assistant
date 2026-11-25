import type { LearnsetEntry, Ruleset } from '../rulesets/types';
import { evTotal, genFeatures, STAT_IDS, type TeamSet } from './team';

export interface SetIssue {
  field: 'species' | 'ability' | 'moves' | 'evs' | 'level' | 'item';
  message: string;
}

/** Problems with a set under this ruleset. `learnset` is passed in because it loads async. */
export function checkSet(rs: Ruleset, set: TeamSet, learnset?: LearnsetEntry[]): SetIssue[] {
  const issues: SetIssue[] = [];
  const sp = rs.getSpecies(set.species);
  if (!sp) return [{ field: 'species', message: `${set.species} isn't in ${rs.name}` }];
  const f = genFeatures(rs);

  if (f.abilities && set.ability && !sp.abilities.includes(set.ability)) {
    issues.push({ field: 'ability', message: `${sp.name} can't have ${set.ability}` });
  }
  if (learnset) {
    const learnable = new Set(learnset.map((e) => e.move));
    for (const m of set.moves) {
      const move = rs.getMove(m);
      if (move && !learnable.has(move.id)) issues.push({ field: 'moves', message: `${sp.name} can't learn ${move.name} in ${rs.name}` });
    }
  }
  const dupes = set.moves.filter((m, i) => set.moves.indexOf(m) !== i);
  if (dupes.length) issues.push({ field: 'moves', message: `${dupes[0]} is listed twice` });
  if (STAT_IDS.some((s) => set.evs[s] > 252 || set.evs[s] < 0)) issues.push({ field: 'evs', message: 'EVs must be 0–252 per stat' });
  if (f.evTotalCap && evTotal(set.evs) > f.evTotalCap) {
    issues.push({ field: 'evs', message: `EVs total ${evTotal(set.evs)} (max ${f.evTotalCap})` });
  }
  if (set.level < 1 || set.level > 100) issues.push({ field: 'level', message: 'Level must be 1–100' });
  if (set.item && !rs.getItem(set.item)) issues.push({ field: 'item', message: `${set.item} isn't in ${rs.name}` });
  return issues;
}
