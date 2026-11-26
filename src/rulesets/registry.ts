import type { GenerationNum } from '@pkmn/data';
import { createOfficialRuleset } from './official';
import { createRomhackRuleset, type CompactLearnset, type RomhackOverlay } from './romhack';
import type { Ruleset, TrainerInfo } from './types';
import rpBase from '../../data-src/romhacks/renegade-platinum/overlay.json';
import rpSpecies from '../../data-src/romhacks/renegade-platinum/generated/species.json';
import rpMoves from '../../data-src/romhacks/renegade-platinum/generated/moves.json';
import rpTMs from '../../data-src/romhacks/renegade-platinum/generated/tms.json';
import unboundBase from '../../data-src/romhacks/unbound/overlay.json';
import unboundSpecies from '../../data-src/romhacks/unbound/generated/species.json';
import unboundTMs from '../../data-src/romhacks/unbound/generated/tms.json';

export interface RulesetMeta {
  id: string;
  name: string;
  group: 'Official' | 'Romhacks';
}

const factories = new Map<string, () => Ruleset>();

/** Story boss teams for the games with playthrough support (npm run fetch:trainers) */
const OFFICIAL_TRAINERS: Record<number, () => Promise<TrainerInfo[]>> = {
  9: () => import('../../data-src/trainers/gen9.json').then((m) => m.default as unknown as TrainerInfo[]),
  5: () => import('../../data-src/trainers/gen5.json').then((m) => m.default as unknown as TrainerInfo[]),
};
const metas: RulesetMeta[] = [];

for (let g = 9; g >= 1; g--) {
  const num = g as GenerationNum;
  metas.push({ id: `gen${g}`, name: `Gen ${g}`, group: 'Official' });
  factories.set(`gen${g}`, () => ({ ...createOfficialRuleset(num), ...(OFFICIAL_TRAINERS[g] ? { loadTrainers: OFFICIAL_TRAINERS[g] } : {}) }));
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
  loadLearnsets: () =>
    import('../../data-src/romhacks/unbound/generated/learnsets.json').then((m) => m.default as unknown as Record<string, CompactLearnset>),
  loadTrainers: () => import('../../data-src/romhacks/unbound/generated/trainers.json').then((m) => m.default as unknown as TrainerInfo[]),
};

// Complete patch data from the community doc (npm run import:rp); hand edits win.
// Learnsets and trainers are big, so they load on first use.
const rpOverlay = rpBase as unknown as RomhackOverlay;
const rpMoveData = rpMoves as unknown as Pick<RomhackOverlay, 'customMoves' | 'removedMoves'> & { overrides: RomhackOverlay['moves'] };
const renegadePlatinum: RomhackOverlay = {
  ...rpOverlay,
  species: { ...rpSpecies, ...rpOverlay.species },
  moves: { ...rpMoveData.overrides, ...rpOverlay.moves },
  customMoves: { ...rpMoveData.customMoves, ...rpOverlay.customMoves },
  removedMoves: rpMoveData.removedMoves,
  tms: rpTMs,
  loadLearnsets: () =>
    import('../../data-src/romhacks/renegade-platinum/generated/learnsets.json').then((m) => m.default as unknown as Record<string, CompactLearnset>),
  loadTrainers: () =>
    import('../../data-src/romhacks/renegade-platinum/generated/trainers.json').then((m) => m.default as unknown as TrainerInfo[]),
};

for (const overlay of [renegadePlatinum, unbound]) {
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
