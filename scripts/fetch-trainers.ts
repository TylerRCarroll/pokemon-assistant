// Fetches the main-story boss teams for every official game with playthrough support from Bulbapedia
// and writes data-src/trainers/<ruleset>.json (TrainerInfo[], tagged with the games each fight is in).
// Run: npm run fetch:trainers   (pages are cached in node_modules/.cache/bulbapedia; --fresh refetches)
//
// Bulbapedia lays each fight out as a {{Party}} header (class, name, game, the starter it depends on)
// followed by {{Pokémon}} blocks. A page covers every game the trainer is in, so the Party's game code
// (RGB, HGSS, B2W2, Sw, ...) says which of our games a fight belongs to. We keep the story fights and
// drop rematches, facilities, and tournaments by section heading. A fight from a checkpoint's own page
// (src/data/games.ts `bosses`) lands in that checkpoint; any other lands in the first one whose level
// cap covers its ace, the same way the Unbound import infers splits.
//
// Where Bulbapedia gives levels per mode ({{tt|15|Easy Mode}}/{{tt|16|Normal Mode}}, or before/after
// Stark Mountain), we take Normal Mode and the first story fight.
//
// Bulbapedia doesn't list in-game IVs, so bosses get 31s: if anything that overstates them, which is
// the safer mistake for advice about beating them.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import type { GenerationNum } from '@pkmn/data';
import { GAMES, type Checkpoint, type GameInfo } from '../src/data/games';
import { createOfficialRuleset } from '../src/rulesets/official';
import type { Ruleset, TrainerInfo, TrainerMon } from '../src/rulesets/types';

const OUT = 'data-src/trainers';
const CACHE = 'node_modules/.cache/bulbapedia';
const FRESH = process.argv.includes('--fresh');
const BULBAPEDIA = 'https://bulbapedia.bulbagarden.net/w/api.php';
const HEADERS = { 'User-Agent': 'PokePlanner/0.1 (personal non-commercial project)' };
const warnings: string[] = [];

/** Party `game =` codes → our game ids. Single letters mean different games by generation, so those are keyed `code@gen` */
const CODES: Record<string, string[]> = {
  RGB: ['red', 'blue'], RB: ['red', 'blue'], RBY: ['red', 'blue', 'yellow'], RGBY: ['red', 'blue', 'yellow'], Yellow: ['yellow'], 'Y@1': ['yellow'],
  GSC: ['gold', 'silver', 'crystal'], GS: ['gold', 'silver'], 'G@2': ['gold'], 'S@2': ['silver'], 'C@2': ['crystal'], Crystal: ['crystal'],
  RSE: ['ruby', 'sapphire', 'emerald'], RS: ['ruby', 'sapphire'], Ru: ['ruby'], Sa: ['sapphire'], E: ['emerald'],
  FRLG: ['firered', 'leafgreen'], FR: ['firered'], LG: ['leafgreen'],
  DPPt: ['diamond', 'pearl', 'platinum'], DP: ['diamond', 'pearl'], 'D@4': ['diamond'], 'P@4': ['pearl'], Pt: ['platinum'],
  HGSS: ['heartgold', 'soulsilver'], HG: ['heartgold'], SS: ['soulsilver'],
  BW: ['black', 'white'], Bl: ['black'], 'B@5': ['black'], Wh: ['white'], 'W@5': ['white'],
  B2W2: ['black-2', 'white-2'], B2: ['black-2'], W2: ['white-2'],
  XY: ['x', 'y'], 'X@6': ['x'], 'Y@6': ['y'],
  ORAS: ['omega-ruby', 'alpha-sapphire'], OR: ['omega-ruby'], AS: ['alpha-sapphire'],
  SMUSUM: ['sun', 'moon', 'ultra-sun', 'ultra-moon'], SM: ['sun', 'moon'], 'S@7': ['sun'], 'M@7': ['moon'],
  USUM: ['ultra-sun', 'ultra-moon'], US: ['ultra-sun'], UM: ['ultra-moon'],
  SwSh: ['sword', 'shield'], Sw: ['sword'], Sh: ['shield'],
  BDSP: ['brilliant-diamond', 'shining-pearl'], BD: ['brilliant-diamond'], SP: ['shining-pearl'],
  SV: ['scarlet', 'violet'], 'S@9': ['scarlet'], 'V@9': ['violet'],
};

/** Gym pages first, so a fight that's on both the gym's and the leader's page is read with its gym */
const PAGES = [
  // Kanto
  'Pewter_Gym', 'Cerulean_Gym', 'Vermilion_Gym', 'Celadon_Gym', 'Fuchsia_Gym', 'Saffron_Gym', 'Cinnabar_Gym', 'Viridian_Gym',
  'Lorelei', 'Bruno', 'Agatha', 'Lance', 'Blue_(game)', 'Giovanni',
  // Johto
  'Violet_Gym', 'Azalea_Gym', 'Goldenrod_Gym', 'Ecruteak_Gym', 'Cianwood_Gym', 'Olivine_Gym', 'Mahogany_Gym', 'Blackthorn_Gym',
  'Will', 'Koga', 'Karen', 'Silver_(game)', 'Red_(game)',
  // Hoenn
  'Rustboro_Gym', 'Dewford_Gym', 'Mauville_Gym', 'Lavaridge_Gym', 'Petalburg_Gym', 'Fortree_Gym', 'Mossdeep_Gym', 'Sootopolis_Gym',
  'Sidney', 'Phoebe', 'Glacia', 'Drake', 'Steven_Stone', 'Wallace', 'Wally', 'Maxie', 'Archie',
  // Sinnoh
  'Oreburgh_Gym', 'Eterna_Gym', 'Veilstone_Gym', 'Pastoria_Gym', 'Hearthome_Gym', 'Canalave_Gym', 'Snowpoint_Gym', 'Sunyshore_Gym',
  'Aaron', 'Bertha', 'Flint', 'Lucian', 'Cynthia', 'Cyrus',
  // Unova
  'Striaton_Gym', 'Nacrene_Gym', 'Castelia_Gym', 'Nimbasa_Gym', 'Driftveil_Gym', 'Mistralton_Gym', 'Icirrus_Gym', 'Opelucid_Gym',
  'Aspertia_Gym', 'Virbank_Gym', 'Humilau_Gym',
  'Shauntal', 'Grimsley', 'Caitlin', 'Marshal', 'N', 'Ghetsis', 'Alder', 'Iris', 'Cheren', 'Bianca', 'Hugh', 'Colress',
  // Kalos
  'Santalune_Gym', 'Cyllage_Gym', 'Shalour_Gym', 'Coumarine_Gym', 'Lumiose_Gym', 'Laverre_Gym', 'Anistar_Gym', 'Snowbelle_Gym',
  'Malva', 'Siebold', 'Wikstrom', 'Drasna', 'Diantha', 'Lysandre',
  // Alola
  'Ilima', 'Hala', 'Olivia', 'Nanu', 'Hapu', 'Molayne', 'Acerola', 'Kahili', 'Kukui', 'Hau', 'Gladion', 'Guzma', 'Lusamine',
  // Galar
  'Milo', 'Nessa', 'Kabu', 'Bea', 'Allister', 'Opal', 'Gordie', 'Melony', 'Piers', 'Raihan', 'Leon', 'Hop', 'Bede', 'Marnie', 'Rose',
  // Paldea (Penny's Team Star finale isn't laid out as a {{Party}} on her page, so it's left out for now)
  'Cortondo_Gym', 'Artazon_Gym', 'Levincia_Gym', 'Cascarrafa_Gym', 'Medali_Gym', 'Montenevera_Gym', 'Alfornada_Gym', 'Glaseado_Gym',
  'Rika', 'Poppy', 'Larry', 'Hassel', 'Geeta', 'Nemona', 'Arven',
];

/** Section headings that mean "not the story fight" */
const SKIP_SECTION =
  /rematch|club room|academy ace|tournament|indigo disk|teal mask|kitakami|blueberry|mochi|post-?game|season|pwt|masters|anime|manga|animation|tcg|multi battle|traded|challenge mode|unova league|subway|epilogue|after|battle (tree|maison|chateau|royal|frontier|tower|resort)|title defense|max raid|tutorial|master class|hotel|writ of|second battle and|delta episode|lets go|let's go/i;
/** Locations that mean a facility or exhibition, not the story (the Pokémon World Tournament's legends) */
const SKIP_LOCATION = /world tournament|battle (tree|maison|chateau|frontier|subway|tower)|pwt/i;

async function wikitext(page: string): Promise<string> {
  const file = `${CACHE}/${page.replace(/[^\w()-]/g, '_')}.txt`;
  if (!FRESH) {
    try {
      return await readFile(file, 'utf8');
    } catch {
      // not cached yet
    }
  }
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${BULBAPEDIA}?action=parse&page=${encodeURIComponent(page)}&prop=wikitext&format=json&formatversion=2&redirects=1`, { headers: HEADERS });
    if (res.ok) {
      const json = (await res.json()) as { parse?: { wikitext: string }; error?: { info: string } };
      if (!json.parse) throw new Error(`${page}: ${json.error?.info ?? 'no wikitext'}`);
      await mkdir(CACHE, { recursive: true });
      await writeFile(file, json.parse.wikitext);
      await new Promise((r) => setTimeout(r, 700)); // polite pacing
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

/** Wiki markup → plain text: {{color2|000|Katy}} → Katy, [[Link|Text]] → Text, {{tt|Shown|hint}} → Shown, &nbsp; → space */
function plain(s = ''): string {
  return s
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/&nbsp;/g, ' ')
    // {{color2|000|Silver (game)|Silver}} links its first part and shows the last
    .replace(/\{\{color2\|[^|}]*\|([^}]*)\}\}/g, (_, rest: string) => rest.split('|').pop()!)
    .replace(/\{\{tt\|([^|}]*)\|[^}]*\}\}/g, '$1')
    .replace(/\{\{(?:p|m|i|t|a)\|([^|}]*)(?:\|[^}]*)?\}\}/g, '$1')
    .replace(/\[\[(?:[^|\]]*\|)?([^\]]*)\]\]/g, '$1')
    .replace(/\{\{[^}]*\}\}/g, '')
    .replace(/'''?/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** "{{tt|15|Easy Mode}}/{{tt|16|Normal Mode}}" → 16; "{{tt|49|before Stark Mountain}}/{{tt|65|after …}}" → 49; "38" → 38 */
function levelOf(raw = ''): number {
  const variants = [...raw.matchAll(/\{\{tt\|(\d+)\|([^}]*)\}\}/g)].map((m) => ({ level: Number(m[1]), hint: m[2] }));
  const pick = variants.find((v) => /normal/i.test(v.hint)) ?? variants.find((v) => /before|first/i.test(v.hint)) ?? variants[0];
  return pick?.level ?? Number(plain(raw).match(/\d+/)?.[0] ?? 0);
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
    if (!m || m === '—' || m === '-') return [];
    const mv = rs.getMove(m);
    if (!mv) warnings.push(`${where}: unknown move ${m}`);
    return mv ? [mv.name] : [];
  });
  const held = plain(raw.held);
  const item = held && held !== 'None' ? rs.getItem(held)?.name : undefined;
  if (held && held !== 'None' && !item && rs.gen >= 2) warnings.push(`${where}: unknown item ${held}`);
  const ability = plain(raw.ability);
  const tera = plain(raw.tera);
  return {
    species: sp.name,
    level: levelOf(raw.level),
    item,
    ability: ability && rs.getAbility(ability) ? rs.getAbility(ability)!.name : undefined,
    ivs: 31,
    moves,
    ...(tera ? { tera } : {}),
  };
}

/** The fight's own checkpoint if it's that boss's page and its ace fits; else the first whose cap covers the ace */
function checkpointFor(checkpoints: Checkpoint[], page: string, ace: number): Checkpoint {
  return (
    checkpoints.find((c) => c.bosses?.includes(page) && ace <= c.levelCap) ??
    checkpoints.find((c) => c.levelCap >= ace) ??
    checkpoints[checkpoints.length - 1]
  );
}

const rulesets = new Map<string, Ruleset>();
function rulesetFor(id: string): Ruleset {
  let rs = rulesets.get(id);
  if (!rs) {
    const gen = Number(id.match(/^gen(\d)/)![1]) as GenerationNum;
    rs = createOfficialRuleset(gen, { natDex: id.endsWith('natdex') });
    rulesets.set(id, rs);
  }
  return rs;
}

const gameById = new Map(GAMES.map((g) => [g.id, g]));
const titleOf = (g: GameInfo) => `Pokémon ${g.name}`;

async function build() {
  const out = new Map<string, (TrainerInfo & { games: string[] })[]>();
  const seen = new Set<string>();
  for (const page of PAGES) {
    let text: string;
    try {
      text = await wikitext(page);
    } catch (e) {
      warnings.push(String(e));
      continue;
    }
    let kept = 0;
    for (const p of parties(text)) {
      const code = plain(p.party.game);
      const gen = plain(p.mons[0]?.gen ?? '');
      const games = (CODES[`${code}@${gen}`] ?? CODES[code])?.map((id) => gameById.get(id)!).filter(Boolean);
      if (!games?.length) continue;
      if (p.headings.some((h) => SKIP_SECTION.test(h)) || SKIP_LOCATION.test(plain(p.party.location))) continue;
      const name = plain(p.party.name);
      const cls = plain(p.party.class);
      // one fight per ruleset and checkpoint list (Yellow's caps differ from Red and Blue's)
      const groups = new Map<string, GameInfo[]>();
      for (const g of games) {
        const key = `${g.rulesetId}|${GAMES.findIndex((x) => x.checkpoints === g.checkpoints)}`;
        groups.set(key, [...(groups.get(key) ?? []), g]);
      }
      for (const group of groups.values()) {
        const rs = rulesetFor(group[0].rulesetId);
        const where = `${page} / ${name} (${code})`;
        const team = p.mons.map((m) => monOf(rs, m, where)).filter((m): m is TrainerMon => !!m);
        if (!team.length || team.some((m) => !m.level)) {
          if (team.length) warnings.push(`${where}: a Pokémon has no level`);
          continue;
        }
        const ace = Math.max(...team.map((m) => m.level));
        const cp = checkpointFor(group[0].checkpoints!, page, ace);
        // "{{PlayerChoice|0495|Snivy}}" → "If you chose Snivy"
        const choice = /PlayerChoice\|[^|}]*\|([^|}]*)/.exec(p.party.caption ?? '')?.[1];
        const battle = p.headings.filter((h) => !/^(Pokémon\b|Trainers$|In the core series games$|Party$)/i.test(h) && !/^\{\{/.test(h));
        // name the version when the fight isn't in every game that shares these checkpoints
        const siblings = GAMES.filter((g) => g.checkpoints === group[0].checkpoints && g.rulesetId === group[0].rulesetId);
        const gameNote = group.length < siblings.length ? group.map(titleOf).join(' & ') : undefined;
        const notes = [...new Set([...battle.slice(-1), ...(choice ? [`If you chose ${choice}`] : []), ...(gameNote ? [gameNote] : [])])];
        const fullName = `${cls ? `${cls} ` : ''}${name}`.trim();
        const ids = group.map((g) => g.id);
        // the same fight shows up on the gym's page and the leader's page
        const key = JSON.stringify([fullName, team, ids]);
        if (seen.has(key)) continue;
        seen.add(key);
        const list = out.get(group[0].rulesetId) ?? [];
        out.set(group[0].rulesetId, list);
        list.push({
          id: list.length + 1, // page order for now; renumbered below
          name: fullName,
          location: plain(p.party.location),
          split: cp.label,
          levelCap: cp.levelCap,
          notes,
          boss: true,
          team,
          games: ids,
        });
        kept++;
      }
    }
    if (!kept) warnings.push(`${page}: no story fights found`);
    console.log(`${page}: ${kept} fight(s)`);
  }

  await mkdir(OUT, { recursive: true });
  for (const [rulesetId, trainers] of out) {
    // ids are saved with a selected boss, so number game by game in page order: a game's ids
    // stay put when another game joins its ruleset (Black/White kept theirs when Black 2/White 2 came)
    const rank = (t: { games: string[] }) => GAMES.findIndex((g) => g.checkpoints === gameById.get(t.games[0])!.checkpoints);
    [...trainers].sort((a, b) => rank(a) - rank(b) || a.id - b.id).forEach((t, i) => (t.id = i + 1));
    // story order: by checkpoint, then ace level; checkpoints differ between a ruleset's games, so by cap first
    trainers.sort((a, b) => (a.levelCap ?? 0) - (b.levelCap ?? 0) || Math.max(...a.team.map((m) => m.level)) - Math.max(...b.team.map((m) => m.level)));
    await writeFile(`${OUT}/${rulesetId}.json`, JSON.stringify(trainers, null, 1) + '\n');
    console.log(`${rulesetId}: wrote ${trainers.length} fights`);
  }
  // every checkpoint should have its boss
  for (const g of GAMES.filter((x) => x.checkpoints && gameById.get(x.id))) {
    const fights = out.get(g.rulesetId)?.filter((t) => t.games.includes(g.id)) ?? [];
    for (const c of g.checkpoints!) {
      if (c.bosses && !fights.some((t) => t.split === c.label)) warnings.push(`${g.name}: no fight for ${c.label}`);
    }
  }
}

await build();
if (warnings.length) console.warn(`\n${warnings.length} warning(s):\n  ${warnings.join('\n  ')}`);
