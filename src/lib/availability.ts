import { type AvailabilityFile, type Checkpoint, type GameInfo } from '../data/games';
import type { Ruleset, SpeciesInfo } from '../rulesets/types';

// official games: npm run fetch:availability; romhacks: their import scripts
const files = import.meta.glob<AvailabilityFile>(['../../data-src/availability/*.json', '../../data-src/romhacks/*/generated/availability.json'], {
  import: 'default',
});

export async function loadAvailability(game: GameInfo): Promise<AvailabilityFile | undefined> {
  const key = Object.keys(files).find((k) => k.endsWith(`/availability/${game.id}.json`) || k.includes(`/romhacks/${game.id}/`));
  return key ? files[key]() : undefined;
}

export interface Availability {
  game: GameInfo;
  checkpoints: Checkpoint[];
  /** Earliest checkpoint a species can be on your team, counting evolution; undefined if never */
  at: (speciesId: string) => number | undefined;
}

const levelOf = (method?: string) => Number(method?.match(/^Level (\d+)/)?.[1]) || undefined;

/**
 * Raw availability (caught or received) plus evolution: an evolution is available once its
 * pre-evolution is, and for level-up evolutions once the level cap reaches the evolution level.
 * Trade evolutions only count where the game replaces them (romhacks).
 */
export function buildAvailability(rs: Ruleset, game: GameInfo, file: AvailabilityFile): Availability {
  const checkpoints = file.checkpoints ?? game.checkpoints ?? [];
  const capIndex = (level: number) => {
    const i = checkpoints.findIndex((c) => level <= c.levelCap);
    return i < 0 ? checkpoints.length - 1 : i;
  };
  const memo = new Map<string, number | undefined>();
  const at = (id: string, depth = 0): number | undefined => {
    if (memo.has(id)) return memo.get(id);
    memo.set(id, undefined); // cycle guard
    const sp = rs.getSpecies(id);
    let best = file.species[id];
    if (sp?.prevo && depth < 4) {
      const prevo = rs.getSpecies(sp.prevo);
      const from = prevo && at(prevo.id, depth + 1);
      const trade = /^Trade/.test(sp.evoMethod ?? '');
      if (from !== undefined && (game.tradeEvolutions || !trade)) {
        const level = levelOf(sp.evoMethod);
        const evolved = level ? Math.max(from, capIndex(level)) : from;
        best = best === undefined ? evolved : Math.min(best, evolved);
      }
    }
    memo.set(id, best);
    return best;
  };
  return { game, checkpoints, at: (id) => at(id) };
}

/**
 * The Pokémon you could field at a checkpoint: obtainable by then, in the furthest stage reachable
 * (Fletchinder rather than Fletchling once it can evolve, but not Talonflame before the cap allows).
 */
export function availablePool(rs: Ruleset, availability: Availability, checkpoint: number): SpeciesInfo[] {
  const ok = (s: SpeciesInfo) => {
    const a = availability.at(s.id);
    return a !== undefined && a <= checkpoint;
  };
  return rs.species().filter((s) => !s.battleOnly && ok(s) && !(s.evos ?? []).some((e) => {
    const evo = rs.getSpecies(e);
    return evo && ok(evo);
  }));
}
