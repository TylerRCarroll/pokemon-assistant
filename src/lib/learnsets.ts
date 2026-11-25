import type { LearnMethod, LearnsetEntry, Ruleset, SpeciesInfo } from '../rulesets/types';

export interface Learner {
  species: SpeciesInfo;
  methods: LearnMethod[];
  viaPrevo?: boolean;
}

const learnerCache = new WeakMap<Ruleset, Map<string, Promise<Learner[]>>>();

async function scanLearners(rs: Ruleset, moveId: string): Promise<Learner[]> {
  const rows = await Promise.all(
    rs.species().map(async (species): Promise<Learner | undefined> => {
      const entry = (await rs.learnset(species.name)).find((e) => e.move === moveId);
      return entry && { species, methods: entry.methods, viaPrevo: entry.viaPrevo };
    }),
  );
  return rows.filter((r): r is Learner => !!r);
}

/** Every species in the ruleset that can learn `moveId`. Scans all learnsets once per move, then caches. */
export function findLearners(rs: Ruleset, moveId: string): Promise<Learner[]> {
  let byMove = learnerCache.get(rs);
  if (!byMove) learnerCache.set(rs, (byMove = new Map()));
  let result = byMove.get(moveId);
  if (!result) byMove.set(moveId, (result = scanLearners(rs, moveId)));
  return result;
}

export interface GroupedLearnset {
  level: { move: string; level: number; viaPrevo?: boolean }[];
  tm: LearnsetEntry[];
  tutor: LearnsetEntry[];
  egg: LearnsetEntry[];
  event: LearnsetEntry[];
}

/** Split a learnset into display sections; a move can appear in several */
export function groupLearnset(entries: LearnsetEntry[]): GroupedLearnset {
  const out: GroupedLearnset = { level: [], tm: [], tutor: [], egg: [], event: [] };
  for (const e of entries) {
    for (const m of e.methods) {
      if (m.kind === 'level') out.level.push({ move: e.move, level: m.level, viaPrevo: e.viaPrevo });
      else if (m.kind !== 'other' && !out[m.kind].includes(e)) out[m.kind].push(e);
    }
  }
  out.level.sort((a, b) => a.level - b.level || a.move.localeCompare(b.move));
  for (const k of ['tm', 'tutor', 'egg', 'event'] as const) out[k].sort((a, b) => a.move.localeCompare(b.move));
  return out;
}

export function methodLabel(m: LearnMethod): string {
  switch (m.kind) {
    case 'level':
      return m.level <= 1 ? 'Start' : `Lv ${m.level}`;
    case 'tm':
      return 'TM';
    case 'tutor':
      return 'Tutor';
    case 'egg':
      return 'Egg';
    case 'event':
      return 'Event';
    default:
      return 'Other';
  }
}
