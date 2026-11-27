import type { Ruleset, SpeciesInfo } from '../rulesets/types';
import type { TeamSet } from './team';

export interface EvoNode {
  species: SpeciesInfo;
  children: EvoNode[];
}

/** The full evolution family containing `name`, rooted at its earliest stage */
export function evolutionTree(rs: Ruleset, name: string): EvoNode | undefined {
  let root = rs.getSpecies(name);
  if (!root) return undefined;
  for (let p = root.prevo && rs.getSpecies(root.prevo); p; p = p.prevo && rs.getSpecies(p.prevo)) root = p;

  const build = (s: SpeciesInfo): EvoNode => ({
    species: s,
    children: (s.evos ?? [])
      .map((n) => rs.getSpecies(n))
      .filter((e): e is SpeciesInfo => !!e)
      .map(build),
  });
  return build(root);
}

/** The name of a species' earliest stage, without its form suffix: Gible, Gabite and Garchomp-Mega are all "Gible" */
export function familyOf(rs: Ruleset, name: string): string {
  let sp = rs.getSpecies(name);
  for (let p = sp?.prevo && rs.getSpecies(sp.prevo); p; p = p.prevo && rs.getSpecies(p.prevo)) sp = p;
  return (sp?.name ?? name).split('-')[0];
}

/** What `name` can evolve into in this ruleset, with how ("Level 30", "Use Thunder Stone") */
export function evolutionsOf(rs: Ruleset, name: string): SpeciesInfo[] {
  return (rs.getSpecies(name)?.evos ?? []).map((n) => rs.getSpecies(n)).filter((s): s is SpeciesInfo => !!s && !s.battleOnly);
}

/** Every later stage reachable from `name` (Machop → Machoke, Machamp) */
export function laterStages(rs: Ruleset, name: string): SpeciesInfo[] {
  return evolutionsOf(rs, name).flatMap((e) => [e, ...laterStages(rs, e.name)]);
}

/** The steps from `from` up to `to`, both included, or undefined when `to` isn't a later stage of `from` */
export function evolutionPath(rs: Ruleset, from: string, to: string): SpeciesInfo[] | undefined {
  const start = rs.getSpecies(from);
  if (!start) return undefined;
  if (start.name === rs.getSpecies(to)?.name) return [start];
  for (const e of evolutionsOf(rs, from)) {
    const rest = evolutionPath(rs, e.name, to);
    if (rest) return [start, ...rest];
  }
  return undefined;
}

/**
 * The same Pokémon after evolving: moves, EVs, IVs, nature, item, level and everything else stay; only the
 * species (and so the base stats) changes. The ability is kept by name when the evolution has it, otherwise
 * by its position in the species' ability list (first, second, hidden), otherwise the first.
 */
export function evolveSet(rs: Ruleset, set: TeamSet, into: string): TeamSet {
  const from = rs.getSpecies(set.species);
  const to = rs.getSpecies(into);
  if (!to) return set;
  let ability = set.ability;
  if (ability !== undefined && !to.abilities.includes(ability)) {
    const list = from?.abilities ?? [];
    const i = list.indexOf(ability);
    // the last of several is usually the hidden ability, so it maps to the evolution's last
    const at = i < 0 ? 0 : list.length > 1 && i === list.length - 1 ? to.abilities.length - 1 : Math.min(i, to.abilities.length - 1);
    ability = to.abilities[at] ?? ability;
  }
  return { ...set, species: to.name, ability };
}
