import type { GenerationNum } from '@pkmn/data';
import { createOfficialRuleset } from './official';
import { createRomhackRuleset, type RomhackOverlay } from './romhack';
import type { Ruleset } from './types';
import renegadePlatinum from '../../data-src/romhacks/renegade-platinum/overlay.json';
import unboundBase from '../../data-src/romhacks/unbound/overlay.json';
import unboundSpecies from '../../data-src/romhacks/unbound/generated/species.json';
import unboundTMs from '../../data-src/romhacks/unbound/generated/tms.json';

export interface RulesetMeta {
  id: string;
  name: string;
  group: 'Official' | 'Romhacks';
}

const factories = new Map<string, () => Ruleset>();
const metas: RulesetMeta[] = [];

for (let g = 9; g >= 1; g--) {
  const num = g as GenerationNum;
  metas.push({ id: `gen${g}`, name: `Gen ${g}`, group: 'Official' });
  factories.set(`gen${g}`, () => createOfficialRuleset(num));
  if (g >= 8) {
    metas.push({ id: `gen${g}natdex`, name: `Gen ${g} National Dex`, group: 'Official' });
    factories.set(`gen${g}natdex`, () => createOfficialRuleset(num, { natDex: true }));
  }
}

// JSON imports widen tuples (drain: [1, 2] becomes number[]), so overlay files are cast via unknown
const unboundOverlay = unboundBase as unknown as RomhackOverlay;

// Generated data (npm run import:unbound) merges under the hand-curated overlay; hand edits win
const unbound: RomhackOverlay = {
  ...unboundOverlay,
  species: { ...unboundSpecies, ...unboundOverlay.species },
  tms: unboundTMs,
};

for (const overlay of [renegadePlatinum as RomhackOverlay, unbound]) {
  metas.push({ id: overlay.id, name: overlay.name, group: 'Romhacks' });
  factories.set(overlay.id, () => createRomhackRuleset(overlay));
}

export const RULESETS: readonly RulesetMeta[] = metas;
export const DEFAULT_RULESET = 'gen9';

const cache = new Map<string, Ruleset>();

export function getRuleset(id: string): Ruleset {
  let rs = cache.get(id);
  if (!rs) {
    const make = factories.get(id) ?? factories.get(DEFAULT_RULESET)!;
    rs = make();
    cache.set(id, rs);
  }
  return rs;
}
