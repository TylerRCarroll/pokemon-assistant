import type { Ruleset, TypeName } from '../rulesets/types';

/** Multiplier each attacking type deals to a defender with `types` */
export function defensiveProfile(rs: Ruleset, types: TypeName[]): Record<TypeName, number> {
  const out: Record<TypeName, number> = {};
  for (const attack of rs.types) out[attack] = rs.effectiveness(attack, types);
  return out;
}

/** Single-type matrix: chart[attack][defend] */
export function typeMatrix(rs: Ruleset): Record<TypeName, Record<TypeName, number>> {
  const out: Record<TypeName, Record<TypeName, number>> = {};
  for (const attack of rs.types) {
    out[attack] = {};
    for (const defend of rs.types) out[attack][defend] = rs.effectiveness(attack, [defend]);
  }
  return out;
}

/** Group a defensive profile into buckets for display: 4x, 2x, 0.5x, 0.25x, 0x */
export function bucketProfile(profile: Record<TypeName, number>) {
  const buckets: Record<'quad' | 'weak' | 'resist' | 'quarter' | 'immune', TypeName[]> = {
    quad: [],
    weak: [],
    resist: [],
    quarter: [],
    immune: [],
  };
  for (const [type, mult] of Object.entries(profile)) {
    if (mult === 0) buckets.immune.push(type);
    else if (mult >= 4) buckets.quad.push(type);
    else if (mult >= 2) buckets.weak.push(type);
    else if (mult <= 0.25) buckets.quarter.push(type);
    else if (mult < 1) buckets.resist.push(type);
  }
  return buckets;
}
