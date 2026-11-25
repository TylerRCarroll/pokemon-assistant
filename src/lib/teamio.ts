import { Sets, Teams } from '@pkmn/sets';
import type { Ruleset } from '../rulesets/types';
import { newSet, type TeamSet } from './team';

export interface ImportResult {
  sets: TeamSet[];
  warnings: string[];
}

/** Parse a Showdown paste (one set or a whole team) into sets for this ruleset */
export function importPaste(rs: Ruleset, text: string): ImportResult {
  const warnings: string[] = [];
  const parsed = Teams.importTeam(text)?.team ?? [];
  const sets: TeamSet[] = [];

  for (const p of parsed) {
    if (!p.species) continue;
    const sp = rs.getSpecies(p.species);
    if (!sp) {
      warnings.push(`${p.species} isn't in ${rs.name}, skipped`);
      continue;
    }
    const base = newSet(rs, sp.name);
    const moves: string[] = [];
    for (const m of p.moves ?? []) {
      const move = rs.getMove(m);
      if (move) moves.push(move.name);
      else warnings.push(`${sp.name}: unknown move "${m}" dropped`);
    }
    const item = p.item ? rs.getItem(p.item)?.name : undefined;
    if (p.item && !item) warnings.push(`${sp.name}: unknown item "${p.item}" dropped`);

    sets.push({
      ...base,
      item,
      ability: p.ability || base.ability,
      moves: moves.slice(0, 4),
      nature: p.nature || base.nature,
      evs: { ...base.evs, ...p.evs },
      ivs: { ...base.ivs, ...p.ivs },
      level: p.level || base.level,
      teraType: p.teraType || base.teraType,
      gender: p.gender || undefined,
      shiny: p.shiny || undefined,
    });
  }
  if (sets.length > 6) warnings.push(`Paste had ${sets.length} Pokémon; kept the first 6`);
  if (!parsed.length && text.trim()) warnings.push("Couldn't read that as a Showdown paste");
  return { sets: sets.slice(0, 6), warnings };
}

/** Showdown paste text for a team (empty slots skipped) */
export function exportPaste(sets: (TeamSet | null)[]): string {
  return sets
    .filter((s): s is TeamSet => !!s)
    .map((s) => Sets.exportSet({ name: '', gender: '', ...s, item: s.item ?? '', ability: s.ability ?? '', nature: s.nature ?? '' }).trim())
    .join('\n\n');
}
