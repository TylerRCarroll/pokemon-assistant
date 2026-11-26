import { z } from 'zod';

/**
 * Backups of everything the app keeps in localStorage (teams, quiz progress, playthrough and trainer
 * settings, chosen ruleset), so it can move between sites (localhost → GitHub Pages) or browsers.
 * Each store is saved by zustand's persist middleware as `{ state, version }` under a `pokeplanner:` key.
 */
export const PREFIX = 'pokeplanner:';

const backupSchema = z.object({
  app: z.literal('pokeplanner'),
  version: z.literal(1),
  exportedAt: z.string(),
  data: z.record(z.string(), z.object({ state: z.record(z.string(), z.unknown()), version: z.number().optional() })),
});
export type Backup = z.infer<typeof backupSchema>;
type Stored = Backup['data'][string];

/** Read every pokeplanner store out of `storage` */
export function createBackup(storage: Pick<Storage, 'length' | 'key' | 'getItem'>, now = new Date()): Backup {
  const data: Backup['data'] = {};
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (!key?.startsWith(PREFIX)) continue;
    try {
      data[key] = JSON.parse(storage.getItem(key)!);
    } catch {
      // a corrupt entry isn't worth failing the whole backup over
    }
  }
  return { app: 'pokeplanner', version: 1, exportedAt: now.toISOString(), data };
}

export function parseBackup(text: string): { backup?: Backup; error?: string } {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { error: "That isn't valid JSON. Pick the file this page exported, or paste its full contents." };
  }
  const result = backupSchema.safeParse(json);
  return result.success ? { backup: result.data } : { error: "That JSON isn't a PokéPlanner backup." };
}

interface TeamLike {
  id: string;
  name: string;
  rulesetId: string;
  updatedAt: number;
}

export interface ImportPlan {
  /** New localStorage values to write, keyed by store */
  writes: Record<string, string>;
  summary: string[];
}

export type ImportMode = 'merge' | 'replace';

/**
 * Merge keeps everything already here and adds what's missing: teams are matched by id (the newer edit
 * wins), quiz progress keeps whichever side has answered more, and settings only fill in rulesets that
 * have none. Replace makes this browser match the backup exactly.
 */
export function planImport(current: Record<string, Stored | undefined>, backup: Backup, mode: ImportMode): ImportPlan {
  const writes: Record<string, string> = {};
  const summary: string[] = [];
  const keys = new Set([...Object.keys(backup.data), ...(mode === 'replace' ? Object.keys(current) : [])]);

  for (const key of keys) {
    const incoming = backup.data[key];
    const local = current[key];
    if (mode === 'replace' || !local) {
      if (incoming) writes[key] = JSON.stringify(incoming);
      else writes[key] = ''; // replace: drop stores the backup doesn't have
      continue;
    }
    if (!incoming) continue;
    const merged = mergeStore(key, local, incoming, summary);
    if (merged) writes[key] = JSON.stringify(merged);
  }

  const teams = (backup.data[`${PREFIX}teams`]?.state.teams ?? []) as TeamLike[];
  if (mode === 'replace' || !current[`${PREFIX}teams`]) summary.unshift(`${teams.length} team${teams.length === 1 ? '' : 's'} from the backup`);
  return { writes, summary };
}

function mergeStore(key: string, local: Stored, incoming: Stored, summary: string[]): Stored | undefined {
  const name = key.slice(PREFIX.length);
  if (name === 'teams') {
    const mine = (local.state.teams ?? []) as TeamLike[];
    const theirs = (incoming.state.teams ?? []) as TeamLike[];
    const byId = new Map(mine.map((t) => [t.id, t]));
    let added = 0;
    let updated = 0;
    for (const t of theirs) {
      const existing = byId.get(t.id);
      if (!existing) added++;
      else if (t.updatedAt > existing.updatedAt) updated++;
      else continue;
      byId.set(t.id, t);
    }
    summary.push(`${added} new team${added === 1 ? '' : 's'}, ${updated} updated, ${theirs.length - added - updated} already up to date`);
    const active = { ...(incoming.state.activeByRuleset as object), ...(local.state.activeByRuleset as object) };
    return { ...local, state: { ...local.state, teams: [...byId.values()], activeByRuleset: active } };
  }
  if (name === 'quiz') {
    type Progress = { answered: number };
    const mine = (local.state.byRuleset ?? {}) as Record<string, Progress>;
    const theirs = (incoming.state.byRuleset ?? {}) as Record<string, Progress>;
    const out = { ...mine };
    let taken = 0;
    for (const [rs, p] of Object.entries(theirs)) {
      if (!out[rs] || p.answered > out[rs].answered) {
        out[rs] = p;
        taken++;
      }
    }
    if (taken) summary.push(`quiz progress for ${taken} ruleset${taken === 1 ? '' : 's'}`);
    return { ...local, state: { ...local.state, byRuleset: out } };
  }
  // per-ruleset settings (playthrough, trainer difficulty): fill in what's missing, keep the rest
  for (const field of ['byRuleset', 'difficulty']) {
    if (field in incoming.state) {
      const merged = { ...(incoming.state[field] as object), ...(local.state[field] as object) };
      return { ...local, state: { ...local.state, [field]: merged } };
    }
  }
  // anything else (the chosen ruleset): keep this browser's
  return undefined;
}
