import type { Ruleset } from '../rulesets/types';
import { evolutionPath, evolveSet } from './evolution';
import type { TeamSet } from './team';

/** A PC mon, as far as advice cares: which one it is and its real set */
export interface OwnedMon {
  id: string;
  set: TeamSet;
}

export interface OwnedMatch {
  mon: OwnedMon;
  /** The mon's set as `species`: evolved when the PC holds an earlier stage, otherwise unchanged */
  set: TeamSet;
  /** The species it evolves from, when it has to evolve first */
  evolvesFrom?: string;
}

/**
 * The PC mon that is (or can evolve into) `species`: the same species first, then an earlier stage of its
 * family, the highest level winning a tie. A Machoke in the PC matches a suggested Machamp.
 */
export function ownedMatch(rs: Ruleset, mons: OwnedMon[], species: string): OwnedMatch | undefined {
  const target = rs.getSpecies(species);
  if (!target) return undefined;
  let best: (OwnedMatch & { steps: number }) | undefined;
  for (const mon of mons) {
    const path = evolutionPath(rs, mon.set.species, target.name);
    if (!path) continue;
    const steps = path.length - 1;
    if (best && (steps > best.steps || (steps === best.steps && mon.set.level <= best.mon.set.level))) continue;
    best = steps ? { mon, set: evolveSet(rs, mon.set, target.name), evolvesFrom: mon.set.species, steps } : { mon, set: mon.set, steps };
  }
  return best && { mon: best.mon, set: best.set, evolvesFrom: best.evolvesFrom };
}
