// Fetches Smogon usage stats, analysis sets, and sample teams (via pkmn's processed
// mirror of smogon.com data) and writes compact per-format JSON to data-src/smogon/.
// Run: npm run fetch:smogon [formatId ...]   (defaults to every format in src/data/formats.ts)
import { mkdir, writeFile } from 'node:fs/promises';
import { z } from 'zod';
import { FORMATS } from '../src/data/formats';
import type { FormatData, Share, UsageEntry } from '../src/lib/smogonTypes';

const BASE = 'https://pkmn.github.io/smogon/data';
const OUT = 'data-src/smogon';
/** Drop Pokémon below this weighted usage; they're noise in the planner */
const MIN_USAGE = 0.001;

const shares = z.record(z.string(), z.number());
const statsSchema = z.object({
  battles: z.number(),
  pokemon: z.record(
    z.string(),
    z.object({
      usage: z.object({ weighted: z.number() }),
      abilities: shares,
      items: shares,
      moves: shares,
      teammates: shares,
      spreads: shares,
      teraTypes: shares.optional(),
      counters: z.record(z.string(), z.array(z.number())).optional(),
    }),
  ),
});
const setsSchema = z.record(z.string(), z.record(z.string(), z.looseObject({ moves: z.array(z.unknown()) })));
const teamsSchema = z.array(z.looseObject({ name: z.string().optional(), author: z.string().optional(), data: z.array(z.looseObject({ species: z.string() })) }));

async function get(kind: string, format: string): Promise<unknown | undefined> {
  const res = await fetch(`${BASE}/${kind}/${format}.json`);
  if (res.status === 404) return undefined;
  if (!res.ok) throw new Error(`${kind}/${format}: HTTP ${res.status}`);
  return res.json();
}

const top = (o: Record<string, number> | undefined, n: number): Share[] =>
  Object.entries(o ?? {})
    .filter(([k, v]) => v > 0.005 && k !== 'Nothing' && k !== '')
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([k, v]) => [k, Math.round(v * 1000) / 1000]);

/** Smogon's checks-and-counters score: KO-or-switch rate minus 4 std devs, as in their reports */
function counters(raw: Record<string, number[]> | undefined): Share[] {
  return Object.entries(raw ?? {})
    .map(([name, [, p, d]]) => ({ name, p, score: p - 4 * d }))
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
    .map((c) => [c.name, Math.round(c.p * 1000) / 1000]);
}

async function fetchFormat(format: string): Promise<FormatData | undefined> {
  const [statsRaw, setsRaw, teamsRaw] = await Promise.all([get('stats', format), get('sets', format), get('teams', format)]);
  if (!statsRaw) {
    console.warn(`${format}: no usage stats published, skipped`);
    return undefined;
  }
  const stats = statsSchema.parse(statsRaw);
  const ranked = Object.entries(stats.pokemon)
    .filter(([, p]) => p.usage.weighted >= MIN_USAGE)
    .sort((a, b) => b[1].usage.weighted - a[1].usage.weighted);

  const pokemon: Record<string, UsageEntry> = {};
  ranked.forEach(([name, p], i) => {
    pokemon[name] = {
      usage: Math.round(p.usage.weighted * 10000) / 10000,
      rank: i + 1,
      moves: top(p.moves, 12),
      items: top(p.items, 8),
      abilities: top(p.abilities, 3),
      teraTypes: top(p.teraTypes, 8),
      spreads: top(p.spreads, 6),
      teammates: top(p.teammates, 12),
      counters: counters(p.counters),
    };
  });

  return {
    format,
    fetchedAt: new Date().toISOString().slice(0, 10),
    battles: stats.battles,
    pokemon,
    sets: (setsRaw ? setsSchema.parse(setsRaw) : {}) as FormatData['sets'],
    teams: (teamsRaw ? teamsSchema.parse(teamsRaw) : []).map((t, i) => ({ ...t, name: t.name || `Sample team ${i + 1}` })) as FormatData['teams'],
  };
}

const wanted = process.argv.slice(2);
const formats = wanted.length ? FORMATS.filter((f) => wanted.includes(f.id)) : FORMATS;
await mkdir(OUT, { recursive: true });
for (const f of formats) {
  const data = await fetchFormat(f.id);
  if (!data) continue;
  const json = JSON.stringify(data);
  await writeFile(`${OUT}/${f.id}.json`, json);
  console.log(
    `${f.id}: ${Object.keys(data.pokemon).length} Pokémon, ${Object.keys(data.sets).length} with sets, ${data.teams.length} teams, ${(json.length / 1024).toFixed(0)} KB`,
  );
}
