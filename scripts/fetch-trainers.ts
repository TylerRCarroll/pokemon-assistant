// Fetches the main-story boss teams for Scarlet/Violet and Black/White from Bulbapedia and writes
// data-src/trainers/<ruleset>.json (TrainerInfo[], tagged with the games each fight is in).
// Run: npm run fetch:trainers
//
// Bulbapedia lays each fight out as a {{Party}} header (class, name, game, the starter it depends on)
// followed by {{Pokémon}} blocks. We keep the story fights and drop rematches, the sequels (B2W2),
// DLC, and tournament battles by section heading. Each fight lands in the checkpoint whose level cap
// covers its ace (src/data/games.ts), the same way the Unbound import infers splits.
//
// Bulbapedia doesn't list in-game IVs, so bosses get 31s: if anything that overstates them, which is
// the safer mistake for advice about beating them.
import { mkdir, writeFile } from 'node:fs/promises';
import { GAMES, type Checkpoint } from '../src/data/games';
import { createOfficialRuleset } from '../src/rulesets/official';
import type { Ruleset, TrainerInfo, TrainerMon } from '../src/rulesets/types';

const OUT = 'data-src/trainers';
const BULBAPEDIA = 'https://bulbapedia.bulbagarden.net/w/api.php';
const HEADERS = { 'User-Agent': 'PokePlanner/0.1 (personal non-commercial project)' };
const warnings: string[] = [];

interface Source {
  rulesetId: string;
  gen: number;
  /** Party `game =` codes, mapped to our game ids */
  codes: Record<string, string[]>;
  pages: string[];
}

const SOURCES: Source[] = [
  {
    rulesetId: 'gen9',
    gen: 9,
    codes: { SV: ['scarlet', 'violet'], S: ['scarlet'], V: ['violet'] },
    pages: [
      'Cortondo_Gym', 'Artazon_Gym', 'Levincia_Gym', 'Cascarrafa_Gym', 'Medali_Gym', 'Montenevera_Gym', 'Alfornada_Gym', 'Glaseado_Gym',
      // Penny's Team Star finale isn't laid out as a {{Party}} on her page, so it's left out for now
      'Rika', 'Poppy', 'Larry', 'Hassel', 'Geeta', 'Nemona', 'Arven',
    ],
  },
  {
    rulesetId: 'gen5',
    gen: 5,
    codes: { BW: ['black', 'white'], Bl: ['black'], B: ['black'], Wh: ['white'], W: ['white'] },
    pages: [
      'Striaton_Gym', 'Nacrene_Gym', 'Castelia_Gym', 'Nimbasa_Gym', 'Driftveil_Gym', 'Mistralton_Gym', 'Icirrus_Gym', 'Opelucid_Gym',
      'Shauntal', 'Grimsley', 'Caitlin', 'Marshal', 'N', 'Ghetsis', 'Alder', 'Cheren', 'Bianca',
    ],
  },
];

/** Section headings that mean "not the story fight" */
const SKIP_SECTION = /rematch|club room|academy ace|tournament|indigo disk|teal mask|kitakami|blueberry|mochi|post-?game|season|black 2|white 2|b2w2|pwt|world tournament|masters|anime|manga|animation|tcg|multi battle|traded|challenge mode|easy mode|unova league|subway|stadium|epilogue|after/i;

async function wikitext(page: string): Promise<string> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${BULBAPEDIA}?action=parse&page=${encodeURIComponent(page)}&prop=wikitext&format=json&formatversion=2&redirects=1`, { headers: HEADERS });
    if (res.ok) {
      const json = (await res.json()) as { parse?: { wikitext: string }; error?: { info: string } };
      if (!json.parse) throw new Error(`${page}: ${json.error?.info ?? 'no wikitext'}`);
      return json.parse.wikitext;
    }
    if (attempt >= 2) throw new Error(`${page}: HTTP ${res.status}`);
    await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
  }
}

/** `| key = value` pairs of one template body (nested templates in values are kept as text) */
function fields(body: string): Record<string, string> {
  const out: Record<string, string> = {};
  // split on pipes at nesting depth 0
  let depth = 0;
  let cur = '';
  const parts: string[] = [];
  for (let i = 0; i < body.length; i++) {
    const two = body.slice(i, i + 2);
    if (two === '{{' || two === '[[') {
      depth++;
      cur += two;
      i++;
    } else if (two === '}}' || two === ']]') {
      depth--;
      cur += two;
      i++;
    } else if (body[i] === '|' && depth === 0) {
      parts.push(cur);
      cur = '';
    } else cur += body[i];
  }
  parts.push(cur);
  for (const p of parts) {
    const eq = p.indexOf('=');
    if (eq > 0) out[p.slice(0, eq).trim()] = p.slice(eq + 1).trim();
  }
  return out;
}

/** Wiki markup → plain text: {{color2|000|Katy}} → Katy, [[Link|Text]] → Text, &nbsp; → space */
function plain(s = ''): string {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/\{\{color2\|[^|}]*\|([^}]*)\}\}/g, '$1')
    .replace(/\{\{(?:p|m|i|t|a)\|([^|}]*)(?:\|[^}]*)?\}\}/g, '$1')
    .replace(/\[\[(?:[^|\]]*\|)?([^\]]*)\]\]/g, '$1')
    .replace(/\{\{[^}]*\}\}/g, '')
    .replace(/'''?/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

interface RawParty {
  headings: string[];
  party: Record<string, string>;
  mons: Record<string, string>[];
}

/** Every {{Party}} … {{Party/end}} block in page order, with the headings it sits under */
function parties(text: string): RawParty[] {
  const out: RawParty[] = [];
  const stack: string[] = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const h = /^(=+)\s*(.*?)\s*\1\s*$/.exec(lines[i]);
    if (h) {
      stack.length = h[1].length - 1;
      stack[h[1].length - 2] = plain(h[2]) || h[2];
      continue;
    }
    if (!/^\{\{Party\s*$/.test(lines[i].trim())) continue;
    // the header runs to the first line that is just "}}"
    let j = i + 1;
    while (j < lines.length && lines[j].trim() !== '}}') j++;
    const party = fields(lines.slice(i + 1, j).join('\n'));
    const mons: Record<string, string>[] = [];
    let k = j + 1;
    for (; k < lines.length && !/^\{\{Party\/end/.test(lines[k].trim()); k++) {
      if (!/^\{\{Pok[ée]mon\s*$/.test(lines[k].trim())) continue;
      let e = k + 1;
      while (e < lines.length && lines[e].trim() !== '}}') e++;
      mons.push(fields(lines.slice(k + 1, e).join('\n')));
      k = e;
    }
    out.push({ headings: stack.filter(Boolean), party, mons });
    i = k;
  }
  return out;
}

function monOf(rs: Ruleset, raw: Record<string, string>, where: string): TrainerMon | undefined {
  const name = plain(raw.pokemon);
  // Bulbapedia names forms in a separate field ("form = Paldean Form")
  const form = plain(raw.form ?? '');
  const sp =
    (form && rs.getSpecies(`${name}-${form.replace(/ ?(Form|Forme|Style|Mode)$/i, '').replace(/^Paldean.*$/i, 'Paldea').replace(/^Alolan$/i, 'Alola').replace(/^Galarian$/i, 'Galar').replace(/^Hisuian$/i, 'Hisui')}`)) ||
    rs.getSpecies(name);
  if (!sp) {
    warnings.push(`${where}: unknown species ${name}${form ? ` (${form})` : ''}`);
    return undefined;
  }
  const moves = [1, 2, 3, 4].flatMap((n) => {
    const m = plain(raw[`move${n}`]);
    if (!m) return [];
    const mv = rs.getMove(m);
    if (!mv) warnings.push(`${where}: unknown move ${m}`);
    return mv ? [mv.name] : [];
  });
  const held = plain(raw.held);
  const item = held && held !== 'None' ? rs.getItem(held)?.name : undefined;
  if (held && held !== 'None' && !item) warnings.push(`${where}: unknown item ${held}`);
  const ability = plain(raw.ability);
  const tera = plain(raw.tera);
  return {
    species: sp.name,
    level: Number(plain(raw.level).match(/\d+/)?.[0] ?? 0),
    item,
    ability: ability && rs.getAbility(ability) ? rs.getAbility(ability)!.name : undefined,
    ivs: 31,
    moves,
    ...(tera ? { tera } : {}),
  };
}

function checkpointFor(checkpoints: Checkpoint[], ace: number): Checkpoint | undefined {
  return checkpoints.find((c) => c.levelCap >= ace) ?? checkpoints[checkpoints.length - 1];
}

async function build(src: Source) {
  const rs = createOfficialRuleset(src.gen);
  const games = GAMES.filter((g) => g.rulesetId === src.rulesetId);
  const checkpoints = games[0].checkpoints!;
  const trainers: (TrainerInfo & { games: string[] })[] = [];
  let id = 1;
  const seen = new Set<string>();
  for (const page of src.pages) {
    const text = await wikitext(page);
    await new Promise((r) => setTimeout(r, 700)); // polite pacing
    let kept = 0;
    for (const p of parties(text)) {
      const code = plain(p.party.game);
      const ourGames = src.codes[code];
      if (!ourGames) continue;
      if (p.headings.some((h) => SKIP_SECTION.test(h))) continue;
      const name = plain(p.party.name);
      const cls = plain(p.party.class);
      const where = `${page} / ${name}`;
      const team = p.mons.map((m) => monOf(rs, m, where)).filter((m): m is TrainerMon => !!m);
      if (!team.length) continue;
      const ace = Math.max(...team.map((m) => m.level));
      const cp = checkpointFor(checkpoints, ace)!;
      // "{{PlayerChoice|0495|Snivy}}" → "If you chose Snivy"
      const choice = /PlayerChoice\|[^|}]*\|([^|}]*)/.exec(p.party.caption ?? '')?.[1];
      const battle = p.headings.filter((h) => !/^(Pokémon|Trainers|In the core series games|Scarlet and Violet|Black and White)$/i.test(h) && !/^\{\{/.test(h));
      const gameNote = ourGames.length === 1 ? `Pokémon ${ourGames[0][0].toUpperCase()}${ourGames[0].slice(1)}` : undefined;
      const notes = [...new Set([...battle.slice(-1), ...(choice ? [`If you chose ${choice}`] : []), ...(gameNote ? [gameNote] : [])])].filter(
        (n) => !/^Pokémon (Black and White|Scarlet and Violet)$/.test(n),
      );
      const fullName = `${cls ? `${cls} ` : ''}${name}`.trim();
      // the same fight shows up on the gym's page and the leader's page
      const key = JSON.stringify([fullName, notes, team]);
      if (seen.has(key)) continue;
      seen.add(key);
      trainers.push({
        id: id++,
        name: fullName,
        location: plain(p.party.location),
        split: cp.label,
        levelCap: cp.levelCap,
        notes,
        boss: true,
        team,
        games: ourGames,
      });
      kept++;
    }
    if (!kept) warnings.push(`${page}: no story fights found`);
    console.log(`${src.rulesetId} ${page}: ${kept} fight(s)`);
  }
  // story order: by checkpoint, then ace level
  trainers.sort((a, b) => (a.levelCap ?? 0) - (b.levelCap ?? 0) || Math.max(...a.team.map((m) => m.level)) - Math.max(...b.team.map((m) => m.level)));
  await mkdir(OUT, { recursive: true });
  await writeFile(`${OUT}/${src.rulesetId}.json`, JSON.stringify(trainers, null, 1) + '\n');
  console.log(`${src.rulesetId}: wrote ${trainers.length} fights`);
}

for (const src of SOURCES) await build(src);
if (warnings.length) console.warn(`\n${warnings.length} warning(s):\n  ${warnings.join('\n  ')}`);
