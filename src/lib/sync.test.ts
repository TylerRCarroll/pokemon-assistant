import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { connect, loadConfig, saveConfig, syncNow } from './sync';

/** A Map-backed Storage, so each simulated device has its own localStorage */
class MemoryStorage {
  private m = new Map<string, string>();
  get length() {
    return this.m.size;
  }
  key(i: number) {
    return [...this.m.keys()][i] ?? null;
  }
  getItem(k: string) {
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, v);
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
}

/** One in-memory gist standing in for GitHub's API */
function fakeGitHub() {
  let gist: { id: string; files: Record<string, { content: string }> } | undefined;
  let patches = 0;
  const fetchMock = vi.fn(async (url: string, init: RequestInit = {}) => {
    const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
    const body = init.body ? JSON.parse(init.body as string) : undefined;
    if (url.includes('/gists?')) return json(gist ? [gist] : []);
    if (init.method === 'POST') {
      gist = { id: 'g1', files: body.files };
      return json(gist);
    }
    if (init.method === 'PATCH') {
      patches++;
      gist = { ...gist!, files: body.files };
      return json(gist);
    }
    return json(gist);
  });
  return { fetchMock, patches: () => patches };
}

const team = (id: string, updatedAt: number, name = id) => ({ id, name, rulesetId: 'gen9', slots: [], updatedAt });
const setTeams = (s: MemoryStorage, teams: unknown[], deleted: Record<string, number> = {}) =>
  s.setItem('pokeplanner:teams', JSON.stringify({ state: { teams, activeByRuleset: {}, deleted }, version: 0 }));
const teamNames = (s: MemoryStorage) => JSON.parse(s.getItem('pokeplanner:teams')!).state.teams.map((t: { name: string }) => t.name).sort();

describe('gist sync', () => {
  const pc = new MemoryStorage();
  const handheld = new MemoryStorage();
  let gh: ReturnType<typeof fakeGitHub>;
  const on = (device: MemoryStorage) => vi.stubGlobal('localStorage', device);

  beforeEach(() => {
    gh = fakeGitHub();
    vi.stubGlobal('fetch', gh.fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('moves teams between devices, keeps deletions, and never stores the token in the gist', async () => {
    on(pc);
    setTeams(pc, [team('a', 1, 'PC team')]);
    const config = await connect('secret-token');
    saveConfig(config);
    await syncNow(config);

    on(handheld);
    setTeams(handheld, [team('b', 2, 'Handheld team')]);
    expect((await connect('secret-token')).gistId).toBe(config.gistId); // finds the same gist
    const result = await syncNow(config);
    expect(teamNames(handheld)).toEqual(['Handheld team', 'PC team']);
    expect(result.changes[0]).toMatch(/1 new team/);

    // edit on the handheld, delete on the PC
    setTeams(handheld, [team('a', 5, 'PC team, edited on handheld'), team('b', 2, 'Handheld team')]);
    await syncNow(config);
    on(pc);
    expect(loadConfig()?.token).toBe('secret-token');
    await syncNow(config);
    expect(teamNames(pc)).toEqual(['Handheld team', 'PC team, edited on handheld']);
    setTeams(pc, [team('a', 5, 'PC team, edited on handheld')], { b: 10 });
    await syncNow(config);
    on(handheld);
    await syncNow(config);
    expect(teamNames(handheld)).toEqual(['PC team, edited on handheld']);

    const gistText = JSON.stringify(await (await gh.fetchMock('https://api.github.com/gists/g1')).json());
    expect(gistText).not.toContain('secret-token');
  });

  it('skips the push when nothing changed', async () => {
    const device = new MemoryStorage();
    on(device);
    setTeams(device, [team('x', 1)]);
    const config = await connect('t');
    await syncNow(config);
    const before = gh.patches();
    await syncNow(config);
    expect(gh.patches()).toBe(before);
  });
});
