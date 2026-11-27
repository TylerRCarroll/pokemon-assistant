// A Showdown sim mod per ruleset: the base gen's mechanics, plus
//  - the bag's helper conditions (see bag.ts),
//  - a format with in-game rules (no team preview),
//  - for a romhack, its changed species, moves, custom moves, and type chart.
// Every battle runs on one of these, so the engine reads our ruleset, not vanilla data.
import { Dex, toID, type ModdedDex } from '@pkmn/sim';
import type { Ruleset } from '../rulesets/types';
import { BAG_CONDITIONS } from './bag';

export interface SimFormat {
  dex: ModdedDex;
  /** Format id to start battles with */
  formatid: string;
}

const cache = new Map<string, SimFormat>();

/** The Showdown mod a ruleset's battles inherit: its gen, or a remake's own (BDSP) */
const parentMod = (rs: Ruleset, game?: string) => (game === 'brilliant-diamond' || game === 'shining-pearl' ? 'gen8bdsp' : `gen${rs.gen}`);

type AnyData = Record<string, Record<string, unknown>>;

/** What a romhack changes about species and moves, in Showdown's data shape */
function romhackData(rs: Ruleset, base: ModdedDex): AnyData {
  const Pokedex: Record<string, unknown> = {};
  for (const sp of rs.species()) {
    const vanilla = base.species.get(sp.id);
    if (!vanilla.exists) continue;
    const patch: Record<string, unknown> = {};
    if (sp.types.join('/') !== vanilla.types.join('/')) patch.types = sp.types;
    const stats = sp.baseStats;
    if (Object.entries(stats).some(([k, v]) => vanilla.baseStats[k as keyof typeof stats] !== v)) patch.baseStats = { ...stats };
    const abilities = Object.values(vanilla.abilities).filter(Boolean);
    if (sp.abilities.length && sp.abilities.join('/') !== abilities.join('/')) {
      patch.abilities = Object.fromEntries(sp.abilities.map((a, i) => [i === 2 ? 'H' : String(i), a]));
    }
    if (Object.keys(patch).length) Pokedex[sp.id] = { inherit: true, ...patch };
  }

  const Moves: Record<string, unknown> = {};
  for (const mv of rs.moves()) {
    const vanilla = base.moves.get(mv.id);
    if (vanilla.exists) {
      const patch: Record<string, unknown> = {};
      if (mv.type !== vanilla.type) patch.type = mv.type;
      if (mv.category !== vanilla.category) patch.category = mv.category;
      if (mv.basePower !== vanilla.basePower) patch.basePower = mv.basePower;
      if (mv.accuracy !== vanilla.accuracy) patch.accuracy = mv.accuracy;
      if (mv.pp !== vanilla.pp) patch.pp = mv.pp;
      if (mv.priority !== vanilla.priority) patch.priority = mv.priority;
      // later-gen moves a hack adds are in the data already, but flagged as not in this gen
      if (vanilla.isNonstandard) patch.isNonstandard = null;
      if (Object.keys(patch).length) Moves[mv.id] = { inherit: true, ...patch };
    } else {
      // a move only the hack has (Unbound's Leech Fang): built from what we know of it
      Moves[mv.id] = {
        num: 10000 + Object.keys(Moves).length,
        name: mv.name,
        type: mv.type,
        category: mv.category,
        basePower: mv.basePower,
        accuracy: mv.accuracy,
        pp: mv.pp,
        priority: mv.priority,
        flags: { protect: 1, mirror: 1, ...(mv.flags ?? {}) },
        ...(mv.drain ? { drain: mv.drain } : {}),
        target: mv.category === 'Status' ? 'self' : 'normal',
        secondary: null,
      };
    }
  }

  const data: AnyData = { Pokedex, Moves };
  if (rs.typeChartGen && rs.typeChartGen !== rs.gen) data.TypeChart = Dex.mod(`gen${rs.typeChartGen}`).data.TypeChart as unknown as Record<string, unknown>;
  return data;
}

/** The sim mod and format for a ruleset (and game, where a remake has its own mechanics), built once */
export type GameType = 'singles' | 'doubles' | 'triples';

/** Battle types each gen has: Doubles from Gen 3, Triples in Gens 5 and 6 */
export const gameTypesFor = (gen: number): GameType[] => ['singles', ...(gen >= 3 ? (['doubles'] as const) : []), ...(gen === 5 || gen === 6 ? (['triples'] as const) : [])];

export function simFormat(rs: Ruleset, game?: string, gameType: GameType = 'singles'): SimFormat {
  const parent = parentMod(rs, game);
  const key = `${rs.id}|${parent}|${gameType}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const base = Dex.mod(parent);
  const modid = toID(`pokeplanner ${rs.id} ${parent}`);
  const name = `[Gen ${rs.gen}] PokePlanner ${rs.id}${parent.endsWith('bdsp') ? ' BDSP' : ''}${gameType === 'singles' ? '' : ` ${gameType}`}`;
  // Custom Game's rules, minus team preview: in-game, the trainer leads with its first Pokémon
  const ruleset = Dex.formats.get(`gen${rs.gen}customgame`).ruleset.filter((r) => r !== 'Team Preview');
  // one mod per ruleset and mechanics; the battle types share it
  const dex = Dex.dexes[modid] ?? Dex.mod(modid, {
    Scripts: { inherit: parent },
    Conditions: BAG_CONDITIONS,
    ...(rs.kind === 'romhack' ? romhackData(rs, base) : {}),
  } as Parameters<typeof Dex.mod>[1]);
  // battles (and clones, via fromJSON) look formats up in the global list
  Dex.formats.extend([{ name, mod: modid, debug: true, battle: { trunc: Math.trunc }, ruleset, ...(gameType === 'singles' ? {} : { gameType }) }]);
  const result = { dex, formatid: toID(name) };
  cache.set(key, result);
  return result;
}
