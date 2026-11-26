// Boss teams from hzla's Unbound damage calc (backups/unbound.js in hzla/Dynamic-Calc-Unbound).
// The file is JavaScript assigning JSON objects; it's read as text and JSON-parsed, never executed.
import { readFile } from 'node:fs/promises';
import type { Ruleset, StatID, TrainerInfo, TrainerMon } from '../../../src/rulesets/types';

const FILE = 'Documentation/Unbound/source/calc/unbound.js';

interface CalcSet {
  level: number;
  ability?: string;
  item?: string;
  nature?: string;
  evs?: Record<string, number>;
  ivs?: Record<string, number>;
  moves?: string[];
}

/** formatted_sets[difficulty][species]["Lvl N Trainer Name"] = set */
type CalcSets = Record<string, Record<string, Record<string, CalcSet>>>;

const DIFFICULTIES: Record<string, string> = { insane: 'Insane', expert: 'Expert', difficult: 'Difficult' };
const STAT_KEYS: Record<string, StatID> = { hp: 'hp', at: 'atk', df: 'def', sa: 'spa', sd: 'spd', sp: 'spe' };
const SPECIES_FIXES: Record<string, string> = { 'Aegislash-Both': 'Aegislash' };
/** Typos and old names in the calc data */
const MOVE_FIXES: Record<string, string> = { 'Heatt Wave': 'Heat Wave' };
const ITEM_FIXES: Record<string, string> = {
  Kangaskhite: 'Kangaskhanite', Houndoomite: 'Houndoominite', 'Weakmess Policy': 'Weakness Policy',
  'Flynium Z': 'Flyinium Z', 'Necrozium Z': 'Ultranecrozium Z',
};

/** Gyms in story order; each split runs up to that leader's ace, which stands in for the level cap */
const GYMS = ['Mirskle', 'Vega', 'Alice', 'Mel', 'Galavan', 'Big Mo', 'Tessy', 'Benjamin'];

export async function parseCalcTrainers(rs: Ruleset, warnings: string[]): Promise<TrainerInfo[]> {
  const src = await readFile(FILE, 'utf8');
  const sets: CalcSets = {};
  for (const [, difficulty, json] of src.matchAll(/^formatted_sets\["(\w+)"\]\s*=\s*(\{.*\})\s*;?\s*$/gm)) sets[difficulty] = JSON.parse(json);

  const trainers: TrainerInfo[] = [];
  for (const [difficulty, bySpecies] of Object.entries(sets)) {
    const label = DIFFICULTIES[difficulty] ?? difficulty;
    const teams = new Map<string, TrainerMon[]>();
    for (const [rawSpecies, byTrainer] of Object.entries(bySpecies)) {
      const sp = rs.getSpecies(SPECIES_FIXES[rawSpecies] ?? rawSpecies);
      for (const [key, set] of Object.entries(byTrainer)) {
        const trainer = key.replace(/^Lvl \d+ /, '').trim();
        if (!sp) {
          warnings.push(`${label} ${trainer}: unknown species "${rawSpecies}", skipped`);
          continue;
        }
        const team = teams.get(trainer) ?? [];
        team.push(toTrainerMon(rs, sp.name, set, `${label} ${trainer}`, warnings));
        teams.set(trainer, team);
      }
    }

    const splits = gymSplits(teams);
    for (const [raw, team] of teams) {
      const { name, notes } = splitName(raw);
      const top = Math.max(...team.map((m) => m.level));
      const split = splits.find((s) => top <= s.cap) ?? { name: 'Post-game', cap: undefined };
      trainers.push({
        id: trainers.length + 1,
        name,
        location: '',
        split: split.name,
        levelCap: split.cap,
        notes,
        boss: true,
        difficulty: label,
        team: team.sort((a, b) => a.level - b.level),
      });
    }
  }
  return trainers;
}

function toTrainerMon(rs: Ruleset, species: string, s: CalcSet, where: string, warnings: string[]): TrainerMon {
  const evs = Object.fromEntries(
    Object.entries(s.evs ?? {})
      .filter(([k, v]) => STAT_KEYS[k] && v > 0)
      .map(([k, v]) => [STAT_KEYS[k], v]),
  );
  const ivs = Object.values(s.ivs ?? {});
  const moves = (s.moves ?? []).map((m) => MOVE_FIXES[m] ?? m);
  const item = s.item && (ITEM_FIXES[s.item] ?? s.item);
  for (const m of moves) if (!rs.getMove(m)) warnings.push(`${where}: ${species} has unknown move "${m}"`);
  if (item && !rs.getItem(item)) warnings.push(`${where}: ${species} has unknown item "${item}"`);
  if (s.ability && !rs.getAbility(s.ability)) warnings.push(`${where}: ${species} has unknown ability "${s.ability}"`);
  return {
    species,
    level: s.level,
    item: item || undefined,
    ability: s.ability || undefined,
    nature: s.nature || undefined,
    // the calc stores one IV per stat; trainers use the same value for all of them
    ivs: ivs.length ? Math.min(...ivs) : 31,
    evs: Object.keys(evs).length ? evs : undefined,
    moves,
  };
}

/** "Rival 3 |Player Chose Gible|" → name "Rival 3", note "If you chose Gible"; "Shadow Admin Marlon1" → "Shadow Admin Marlon 1" */
function splitName(raw: string) {
  const notes = [...raw.matchAll(/\|([^|]+)\|/g)].map(([, n]) => n.trim().replace(/^Player Chose/i, 'If you chose'));
  const name = raw
    .replace(/\|[^|]+\|/g, '')
    .replace(/([a-z])(\d)$/, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim();
  return { name, notes };
}

/** Each gym's split ends at its leader's highest level; the Elite Four and Champion close the main story */
function gymSplits(teams: Map<string, TrainerMon[]>) {
  const ace = (trainer: string) => {
    const team = teams.get(trainer);
    return team && Math.max(...team.map((m) => m.level));
  };
  const splits: { name: string; cap: number }[] = [];
  GYMS.forEach((gym, i) => {
    const cap = ace(`Leader ${gym}`);
    if (cap) splits.push({ name: `Gym ${i + 1}: ${gym}`, cap });
  });
  const champion = ace('Champion Jax');
  if (champion) splits.push({ name: 'Elite Four & Champion', cap: champion });
  return splits;
}
