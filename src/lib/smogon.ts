import type { Ruleset, StatsTable } from '../rulesets/types';
import type { FormatData, SampleTeam, SmogonSet, UsageEntry } from './smogonTypes';
import { newSet, STAT_IDS, type TeamSet } from './team';

// One lazy chunk per format, so only the format you open gets downloaded
const loaders = import.meta.glob<FormatData>('../../data-src/smogon/*.json', { import: 'default' });

export function loadFormat(formatId: string): Promise<FormatData | undefined> {
  const load = loaders[`../../data-src/smogon/${formatId}.json`];
  return load ? load() : Promise.resolve(undefined);
}

const toID = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Usage entry for a species, tolerating naming differences between data sources */
export function findUsage(data: FormatData, species: string): UsageEntry | undefined {
  if (data.pokemon[species]) return data.pokemon[species];
  const id = toID(species);
  return Object.entries(data.pokemon).find(([name]) => toID(name) === id)?.[1];
}

export function findSets(data: FormatData, species: string): Record<string, SmogonSet> {
  if (data.sets[species]) return data.sets[species];
  const id = toID(species);
  return Object.entries(data.sets).find(([name]) => toID(name) === id)?.[1] ?? {};
}

/** "Jolly:0/252/4/0/0/252" → nature + EVs */
export function parseSpread(spread: string): { nature: string; evs: StatsTable } | undefined {
  const [nature, nums] = spread.split(':');
  const values = nums?.split('/').map(Number);
  if (!nature || values?.length !== 6 || values.some(Number.isNaN)) return undefined;
  return { nature, evs: Object.fromEntries(STAT_IDS.map((s, i) => [s, values[i]])) as unknown as StatsTable };
}

const first = <T,>(v: T | T[] | undefined): T | undefined => (Array.isArray(v) ? v[0] : v);
const knownMoves = (rs: Ruleset, names: string[]) =>
  [...new Set(names.flatMap((n) => (rs.getMove(n) ? [rs.getMove(n)!.name] : [])))].slice(0, 4);

/** The "standard" set: most-used moves, item, ability, spread, and Tera */
export function setFromUsage(rs: Ruleset, species: string, u: UsageEntry): TeamSet {
  const base = newSet(rs, species);
  const spread = u.spreads[0] && parseSpread(u.spreads[0][0]);
  return {
    ...base,
    moves: knownMoves(rs, u.moves.map(([m]) => m)),
    item: u.items[0]?.[0] ?? base.item,
    ability: u.abilities[0]?.[0] ?? base.ability,
    nature: spread?.nature ?? base.nature,
    evs: spread?.evs ?? base.evs,
    teraType: base.teraType && (u.teraTypes[0]?.[0] ?? base.teraType),
  };
}

/** A Smogon analysis set, taking the first choice wherever it offers options */
export function setFromSmogon(rs: Ruleset, species: string, s: SmogonSet): TeamSet {
  const base = newSet(rs, species);
  const evs = first(s.evs);
  const ivs = first(s.ivs);
  return {
    ...base,
    moves: knownMoves(rs, s.moves.map((m) => first(m) ?? '')),
    item: first(s.item) ?? base.item,
    ability: first(s.ability) ?? base.ability,
    nature: first(s.nature) ?? base.nature,
    evs: evs ? { ...base.evs, ...Object.fromEntries(STAT_IDS.map((k) => [k, evs[k] ?? 0])) } : base.evs,
    ivs: ivs ? { ...base.ivs, ...ivs } : base.ivs,
    level: s.level ?? base.level,
    teraType: base.teraType && (first(s.teratypes) ?? base.teraType),
  };
}

/** A sample team's members as builder sets; species missing from the ruleset are dropped */
export function setsFromSample(rs: Ruleset, team: SampleTeam): TeamSet[] {
  return team.data.flatMap((m) => {
    const sp = rs.getSpecies(m.species);
    if (!sp) return [];
    const base = newSet(rs, sp.name);
    return [
      {
        ...base,
        moves: knownMoves(rs, m.moves),
        item: m.item ?? base.item,
        ability: m.ability ?? base.ability,
        nature: m.nature ?? base.nature,
        evs: m.evs ? { ...base.evs, ...Object.fromEntries(STAT_IDS.map((k) => [k, m.evs?.[k] ?? 0])) } : base.evs,
        ivs: m.ivs ? { ...base.ivs, ...m.ivs } : base.ivs,
        level: m.level ?? base.level,
        teraType: base.teraType && (m.teraType ?? base.teraType),
        gender: m.gender,
      },
    ];
  });
}

/** Format option labels like "Close Combat / Stealth Rock" */
export const optionLabel = (v: string | string[] | undefined) => (Array.isArray(v) ? v.join(' / ') : (v ?? ''));
