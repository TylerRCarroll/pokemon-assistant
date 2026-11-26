import { createBackup, parseBackup, planImport, readStores, type Backup } from './backup';

/**
 * Sync through a private GitHub Gist: every device pulls the gist, merges it into its own data (teams
 * by id, newer edit wins, deletions stick; see planImport), then pushes the merged result back. The
 * token and gist id live under their own key, outside the `pokeplanner:` stores, so backups and the
 * gist itself never contain them.
 */
const CONFIG_KEY = 'pokeplanner-sync';
const FILE = 'pokeplanner-sync.json';
const API = 'https://api.github.com';

export interface SyncConfig {
  token: string;
  gistId: string;
  lastSync?: number;
}

export function loadConfig(): SyncConfig | undefined {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    return raw ? (JSON.parse(raw) as SyncConfig) : undefined;
  } catch {
    return undefined;
  }
}

export function saveConfig(config: SyncConfig | undefined) {
  if (config) localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
  else localStorage.removeItem(CONFIG_KEY);
}

async function github<T>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
  if (res.status === 401) throw new Error('GitHub rejected the token. It may have expired or been revoked.');
  if (res.status === 403 || res.status === 404) throw new Error("The token can't reach your gists. It needs the Gists read and write permission.");
  if (!res.ok) throw new Error(`GitHub error ${res.status}`);
  return res.json() as Promise<T>;
}

interface GistFile {
  content?: string;
  truncated?: boolean;
  raw_url?: string;
}
interface Gist {
  id: string;
  files: Record<string, GistFile>;
}

/** Find this app's sync gist on the account, or create a private one seeded with this device's data */
export async function connect(token: string): Promise<SyncConfig> {
  for (let page = 1; page <= 10; page++) {
    const gists = await github<Gist[]>(token, `/gists?per_page=100&page=${page}`);
    const mine = gists.find((g) => FILE in g.files);
    if (mine) return { token, gistId: mine.id };
    if (gists.length < 100) break;
  }
  const created = await github<Gist>(token, '/gists', {
    method: 'POST',
    body: JSON.stringify({
      description: 'PokéPlanner sync (teams, quiz progress, settings)',
      public: false,
      files: { [FILE]: { content: JSON.stringify(createBackup(localStorage)) } },
    }),
  });
  return { token, gistId: created.id };
}

async function pull(config: SyncConfig): Promise<Backup | undefined> {
  const gist = await github<Gist>(config.token, `/gists/${config.gistId}`);
  const file = gist.files[FILE];
  if (!file) return undefined;
  // the API cuts files off at 1 MB; the raw URL has the rest
  const text = file.truncated && file.raw_url ? await (await fetch(file.raw_url)).text() : (file.content ?? '');
  return parseBackup(text).backup;
}

export interface SyncResult {
  /** What changed here from the other devices, e.g. "1 new team, 2 updated" */
  changes: string[];
  /** Stores whose saved data changed, so the app can reload them */
  changedKeys: string[];
}

/** Pull, merge into this device's storage, push the merged data back */
export async function syncNow(config: SyncConfig): Promise<SyncResult> {
  const remote = await pull(config);
  const changedKeys: string[] = [];
  let changes: string[] = [];
  if (remote) {
    const plan = planImport(readStores(localStorage), remote, 'merge');
    for (const [key, value] of Object.entries(plan.writes)) {
      if (localStorage.getItem(key) === value) continue;
      localStorage.setItem(key, value);
      changedKeys.push(key);
    }
    changes = changedKeys.length ? plan.summary : [];
  }
  const merged = createBackup(localStorage);
  // skip the push when nothing differs (exportedAt aside), to keep the gist's history quiet
  if (!remote || JSON.stringify(remote.data) !== JSON.stringify(merged.data)) {
    await github(config.token, `/gists/${config.gistId}`, {
      method: 'PATCH',
      body: JSON.stringify({ files: { [FILE]: { content: JSON.stringify(merged) } } }),
    });
  }
  saveConfig({ ...config, lastSync: Date.now() });
  return { changes, changedKeys };
}
