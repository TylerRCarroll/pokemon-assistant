import type { Ruleset, SpeciesInfo } from '../rulesets/types';

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
