import type { LearnsetEntry, MoveInfo, Ruleset, SpeciesInfo, TMInfo, TypeName } from '../rulesets/types';
import { calcMove, effectiveSpeed, toCalcMove, type Boosts, type CalcSide, type FieldOptions } from './calc';
import { statTotal } from './format';
import { ownedMatch, type OwnedMon } from './box';
import { familyOf } from './evolution';
import { newSet, type TeamSet } from './team';
import { AWKWARD } from './teamAdvice';
import { matchupOf, type Matchup } from './threats';

/**
 * The counter advisor: when nothing on the team checks a boss's Pokémon, what single change would?
 * Every idea is damage-calced against the real boss set, so the answers are the calc's, not guesses
 * from type charts. Ideas are kept within the level cap; ones whose timing we can't know (TMs without
 * a location, held items, stones) say so instead of being hidden.
 */

export type FixKind = 'level' | 'evolve' | 'move' | 'item' | 'catch';

export interface CounterFix {
  kind: FixKind;
  /** The team member being changed (undefined for a new catch) */
  member?: TeamSet;
  /** The member (or newcomer) after the change, for the calc */
  set: TeamSet;
  title: string;
  /** How to get it: "Learns at Lv 32", "TM34 · Route 210", "if you have one" */
  how: string[];
  /** What it achieves against the threat */
  result: string;
  after: Matchup;
  /** Turns it into a check (walls, outspeeds and OHKOs, or sets up / survives with Sash and OHKOs) */
  checks: boolean;
  /** 0..1, how near the matchup gets to a check */
  closeness: number;
  /** Rough effort, lower first */
  cost: number;
  /** A newcomer that's already in the PC (evolved from `evolvesFrom` first, when set) */
  owned?: { monId: string; evolvesFrom?: string };
}

export interface CounterInput {
  rs: Ruleset;
  threat: TeamSet;
  /** The threat Terastallizes into its Tera type */
  threatTera?: boolean;
  /** The team at its real levels (anything above the cap is treated as at the cap) */
  team: TeamSet[];
  cap: number;
  /** Learnsets by species name; species without one just get fewer ideas */
  learnsets: Map<string, LearnsetEntry[]>;
  /** Pokémon obtainable by this point of the game, already at their furthest reachable stage */
  pool?: SpeciesInfo[];
  field?: FieldOptions;
  /** The boss's name: TMs it hands out ("Gift from Fantina") are rewards for this fight, so never suggested */
  trainer?: string;
  /** Ideas per kind */
  perKind?: number;
  /** The playthrough's PC: newcomers already caught, judged by their real sets */
  owned?: OwnedMon[];
}

/** 0..1: how close a matchup is to walling (takes <50%, deals 50%+) or revenge killing (faster, OHKO) */
export function closeness(m: Matchup): number {
  if (m.checks) return 1;
  const dealt = m.yourBest?.minPct ?? 0;
  const taken = m.theirBest?.maxPct ?? 0;
  const wall = Math.min(1, 49.9 / Math.max(taken, 1)) * Math.min(1, dealt / 50);
  const revenge = (m.threatFaster || m.speedTie ? 0.6 : 1) * Math.min(1, dealt / 100);
  return Math.min(0.99, Math.max(wall, revenge));
}

/** "an Eviolite", "a Life Orb" */
const article = (word: string) => (/^[aeiou]/i.test(word) ? 'an' : 'a');

const range = (r?: { minPct: number; maxPct: number }) => (r ? `${r.minPct}–${r.maxPct}%` : '—');

function describe(m: Matchup, extra?: string): string {
  const verdict = extra ?? (m.revengeKills ? 'outspeeds and OHKOs' : m.walls ? 'walls it' : 'not a check yet');
  const knocked = m.losesItem ? ` (its Knock Off takes the ${m.losesItem}${m.revengeKills ? ', but you move first' : ' after one hit'})` : '';
  return `${verdict}: takes ${range(m.theirBest)}, deals ${range(m.yourBest)}${m.yourBest ? ` with ${m.yourBest.move}` : ''}${knocked}`;
}

// ---------------------------------------------------------------------------------------------
// Items

const TYPE_ITEM: Partial<Record<TypeName, string>> = {
  Normal: 'Silk Scarf', Fire: 'Charcoal', Water: 'Mystic Water', Electric: 'Magnet', Grass: 'Miracle Seed', Ice: 'Never-Melt Ice',
  Fighting: 'Black Belt', Poison: 'Poison Barb', Ground: 'Soft Sand', Flying: 'Sharp Beak', Psychic: 'Twisted Spoon', Bug: 'Silver Powder',
  Rock: 'Hard Stone', Ghost: 'Spell Tag', Dragon: 'Dragon Fang', Dark: 'Black Glasses', Steel: 'Metal Coat', Fairy: 'Fairy Feather',
};
const RESIST_BERRY: Partial<Record<TypeName, string>> = {
  Normal: 'Chilan Berry', Fire: 'Occa Berry', Water: 'Passho Berry', Electric: 'Wacan Berry', Grass: 'Rindo Berry', Ice: 'Yache Berry',
  Fighting: 'Chople Berry', Poison: 'Kebia Berry', Ground: 'Shuca Berry', Flying: 'Coba Berry', Psychic: 'Payapa Berry', Bug: 'Tanga Berry',
  Rock: 'Charti Berry', Ghost: 'Kasib Berry', Dragon: 'Haban Berry', Dark: 'Colbur Berry', Steel: 'Babiri Berry', Fairy: 'Roseli Berry',
};

function itemIdeas(rs: Ruleset, member: TeamSet, before: Matchup): string[] {
  const sp = rs.getSpecies(member.species);
  const names = new Set<string>();
  const attackTypes = member.moves.flatMap((n) => {
    const mv = rs.getMove(n);
    return mv && mv.category !== 'Status' && mv.basePower > 0 ? [mv] : [];
  });
  for (const mv of attackTypes) if (TYPE_ITEM[mv.type]) names.add(TYPE_ITEM[mv.type]!);
  const physical = attackTypes.some((m) => m.category === 'Physical');
  const special = attackTypes.some((m) => m.category === 'Special');
  if (physical) names.add('Choice Band').add('Muscle Band');
  if (special) names.add('Choice Specs').add('Wise Glasses');
  names.add('Life Orb').add('Expert Belt').add('Choice Scarf');
  if (sp?.evos?.length) names.add('Eviolite');
  if (before.theirBest?.category === 'Special') names.add('Assault Vest');
  const hitBy = before.theirBest?.type as TypeName | undefined;
  if (hitBy && RESIST_BERRY[hitBy]) names.add(RESIST_BERRY[hitBy]!);
  return [...names].filter((n) => rs.getItem(n) && n !== member.item);
}

// ---------------------------------------------------------------------------------------------
// Moves

/** Moves worth one setup turn, and the boosts they give */
const SETUP: Record<string, Boosts> = {
  swordsdance: { atk: 2 }, nastyplot: { spa: 2 }, calmmind: { spa: 1, spd: 1 }, dragondance: { atk: 1, spe: 1 },
  bulkup: { atk: 1, def: 1 }, quiverdance: { spa: 1, spd: 1, spe: 1 }, shellsmash: { atk: 2, spa: 2, spe: 2, def: -1, spd: -1 },
  coil: { atk: 1, def: 1 }, honeclaws: { atk: 1 }, workup: { atk: 1, spa: 1 }, growth: { atk: 1, spa: 1 }, agility: { spe: 2 },
  rockpolish: { spe: 2 }, tailglow: { spa: 3 }, geomancy: { spa: 2, spd: 2, spe: 2 }, victorydance: { atk: 1, def: 1, spe: 1 },
};

interface MoveSource {
  move: MoveInfo;
  /** Level needed to learn it by level-up (0 = no level needed) */
  level: number;
  how: string;
  cost: number;
}

/** How a member could get each move it doesn't know, within the cap; cheapest route per move */
function moveSources(rs: Ruleset, set: TeamSet, learnset: LearnsetEntry[], cap: number, reward?: RegExp): MoveSource[] {
  const known = new Set(set.moves.map((n) => rs.getMove(n)?.id));
  const tmFor = new Map<string, TMInfo>((rs.tms ?? []).flatMap((t) => (t.move ? [[t.move, t] as const] : [])));
  const out: MoveSource[] = [];
  for (const e of learnset) {
    const move = rs.getMove(e.move);
    if (!move || known.has(move.id) || AWKWARD.has(move.id)) continue;
    const damaging = move.category !== 'Status' && move.basePower > 1 && !move.flags?.charge && !move.flags?.recharge;
    if (!damaging && !SETUP[move.id]) continue;
    const options: MoveSource[] = [];
    for (const m of e.methods) {
      if (m.kind === 'level' && !e.viaPrevo) {
        if (m.level > cap) continue;
        options.push(
          m.level <= set.level
            ? { move, level: 0, how: `Move Reminder (learned at Lv ${m.level})`, cost: 1.5 }
            : { move, level: m.level, how: `Learns it at Lv ${m.level}`, cost: 1 + (m.level - set.level) * 0.15 },
        );
      } else if (m.kind === 'tm') {
        const tm = tmFor.get(move.id);
        if (tm && reward?.test(tm.location)) continue;
        options.push({ move, level: 0, how: tm ? `TM${String(tm.num).padStart(2, '0')}${tm.location ? ` · ${tm.location}` : ''}` : rs.gen <= 6 ? 'By TM or HM, if you have it' : 'By TM, if you have it', cost: tm ? 2 : 2.5 });
      } else if (m.kind === 'tutor') {
        options.push({ move, level: 0, how: 'Move Tutor', cost: 2.5 });
      } else if (m.kind === 'egg') {
        options.push({ move, level: 0, how: 'Egg move: needs breeding', cost: 4 });
      }
    }
    const best = options.sort((a, b) => a.cost - b.cost)[0];
    if (best) out.push(best);
  }
  return out;
}

/** The member's move doing the least against this threat (or an empty slot) */
function weakestSlot(rs: Ruleset, me: CalcSide, threat: CalcSide, field: FieldOptions): { index: number; name?: string } {
  if (me.set.moves.length < 4) return { index: me.set.moves.length };
  let index = 0;
  let worst = Infinity;
  me.set.moves.forEach((n, i) => {
    const r = calcMove(rs, me, threat, n, field);
    const v = r?.maxPct ?? (SETUP[rs.getMove(n)?.id ?? ''] ? 40 : 0);
    if (v < worst) [worst, index] = [v, i];
  });
  return { index, name: me.set.moves[index] };
}

const withMove = (set: TeamSet, index: number, move: string): TeamSet => {
  const moves = [...set.moves];
  moves[index] = move;
  return { ...set, moves };
};

// ---------------------------------------------------------------------------------------------

/** The evolution's level requirement from text like "Level 32" (undefined for other methods) */
export const evoLevel = (method?: string) => {
  const m = method && /^Level (\d+)/.exec(method);
  return m ? Number(m[1]) : undefined;
};

/**
 * Ways to beat `threat`, best first: every idea that makes a check, cheapest first, then (if
 * fewer than a few do) the ideas that get closest.
 */
export function counterFixes(input: CounterInput): CounterFix[] {
  const { rs, threat, cap, learnsets, field = {}, perKind = 3 } = input;
  // the boss's last name ("GYM LEADER FANTINA" gives Fantina), matched as a whole word against TM locations
  const bossName = input.trainer?.trim().split(/\s+/).pop();
  const reward = bossName && bossName.length > 2 ? new RegExp(`\\b${bossName.replace(/[^\w]/g, '')}\\b`, 'i') : undefined;
  const t: CalcSide = { set: threat, tera: input.threatTera };
  const threatSpeed = effectiveSpeed(rs, t);
  const team = input.team.map((s) => (s.level > cap ? { ...s, level: cap } : s));
  const match = (set: TeamSet, boosts?: Boosts) => matchupOf(rs, t, { set, boosts }, field, threatSpeed);
  const fixes: CounterFix[] = [];
  const add = (fix: Omit<CounterFix, 'checks' | 'closeness' | 'result'> & { result?: string; checks?: boolean }) => {
    const checks = fix.checks ?? fix.after.checks;
    fixes.push({ ...fix, checks, closeness: checks ? 1 : closeness(fix.after), result: fix.result ?? describe(fix.after) });
  };

  /** The lowest level in [from, cap] at which `make(level)` checks (matchups improve with level, so binary search) */
  const firstCheckingLevel = (from: number, make: (level: number) => TeamSet) => {
    if (!match(make(cap)).checks) return undefined;
    let lo = from;
    let hi = cap;
    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2);
      if (match(make(mid)).checks) hi = mid;
      else lo = mid + 1;
    }
    return lo;
  };

  for (const member of team) {
    const before = match(member);
    if (before.checks) continue;
    const base = closeness(before);
    const sp = rs.getSpecies(member.species);
    const atLevel = (set: TeamSet) => (level: number) => ({ ...set, level });

    // 1. More levels, up to the cap
    if (member.level < cap) {
      const lvl = firstCheckingLevel(member.level + 1, atLevel(member));
      const set = { ...member, level: lvl ?? cap };
      const after = match(set);
      if (lvl || closeness(after) > base + 0.1) {
        const n = set.level - member.level;
        add({ kind: 'level', member, set, title: `Level ${member.species} to ${set.level}`, how: [`${n} level${n > 1 ? 's' : ''}${set.level === cap ? ' (the cap)' : ''}`], after, cost: 0.5 + n * 0.15 });
      }
    }

    // 2. Evolve, if the cap (or an item) allows it
    for (const evoName of sp?.evos ?? []) {
      const evo = rs.getSpecies(evoName);
      if (!evo) continue;
      const need = evoLevel(evo.evoMethod);
      if (need && need > cap) continue;
      const abilityIndex = Math.max(0, sp!.abilities.indexOf(member.ability ?? ''));
      const evolved = { ...member, species: evo.name, ability: evo.abilities[abilityIndex] ?? evo.abilities[0], level: Math.max(member.level, need ?? 0) };
      const lvl = firstCheckingLevel(evolved.level, atLevel(evolved));
      const set = { ...evolved, level: lvl ?? evolved.level };
      const after = match(set);
      if (!lvl && closeness(after) <= base + 0.1) continue;
      add({
        kind: 'evolve',
        member,
        set,
        title: `Evolve ${member.species} into ${evo.name}`,
        how: [need ? `Evolves at Lv ${need}` : `${evo.evoMethod ?? 'Evolves'}, if you can`, ...(set.level > Math.max(member.level, need ?? 0) ? [`at Lv ${set.level}`] : [])],
        after,
        cost: need ? 1 + Math.max(0, set.level - member.level) * 0.15 : 2.5,
      });
    }

    // 3. A move it can learn by now (or by the cap)
    const learnset = learnsets.get(member.species);
    if (learnset) {
      const me: CalcSide = { set: member };
      const slot = weakestSlot(rs, me, t, field);
      const replaces = slot.name ? `replacing ${slot.name}` : 'in an empty slot';
      for (const src of moveSources(rs, member, learnset, cap, reward)) {
        const taught = withMove(member, slot.index, src.move.name);
        const boosts = SETUP[src.move.id];
        if (boosts) {
          // one setup turn: survive it, then OHKO (outspeeding, or surviving a second hit)
          const lvl = Math.max(member.level, src.level);
          const set = { ...taught, level: lvl };
          const hit = match(set).theirBest?.maxPct ?? 0;
          const boosted = match(set, boosts);
          const works = hit < 100 && (boosted.yourBest?.minPct ?? 0) >= 100 && (!boosted.threatFaster || (boosted.theirBest?.maxPct ?? 0) + hit < 100);
          if (!works) continue;
          add({
            kind: 'move', member, set, after: boosted, checks: true,
            title: `Teach ${member.species} ${src.move.name}`,
            how: [src.how, replaces],
            result: describe(boosted, `sets up once (takes up to ${hit}%), then OHKOs`),
            cost: src.cost + 0.5,
          });
          continue;
        }
        // damaging: skip anything weaker than what it already has
        const alone = calcMove(rs, { set: { ...taught, level: Math.max(member.level, src.level) } }, t, src.move.name, field);
        if (!alone || alone.minPct <= (before.yourBest?.minPct ?? 0)) continue;
        const from = Math.max(member.level, src.level);
        const lvl = firstCheckingLevel(from, atLevel(taught));
        const set = { ...taught, level: lvl ?? from };
        const after = match(set);
        if (!lvl && closeness(after) <= base + 0.1) continue;
        add({
          kind: 'move', member, set, after,
          title: `Teach ${member.species} ${src.move.name}`,
          how: [src.how, replaces, ...(lvl && lvl > from ? [`and reach Lv ${lvl}`] : [])],
          cost: src.cost + Math.max(0, set.level - from) * 0.15,
        });
      }
    }

    // 4. A held item
    for (const item of itemIdeas(rs, member, before)) {
      const held = { ...member, item };
      const lvl = firstCheckingLevel(member.level, atLevel(held));
      const set = { ...held, level: lvl ?? member.level };
      const after = match(set);
      const how = [`Hold ${item}, if you have one`, ...(member.item ? [`instead of ${member.item}`] : []), ...(lvl && lvl > member.level ? [`and reach Lv ${lvl}`] : [])];
      if (lvl || closeness(after) > base + 0.1) {
        add({ kind: 'item', member, set, after, title: `Give ${member.species} ${article(item)} ${item}`, how, cost: 2.5 + Math.max(0, set.level - member.level) * 0.15 });
      }
    }
    // Focus Sash: a slower member that OHKOs survives the threat's hit at 1 HP
    if (rs.gen >= 4 && rs.getItem('Focus Sash') && before.threatFaster && (before.yourBest?.minPct ?? 0) >= 100 && (before.theirBest?.maxPct ?? 0) >= 100 && (toCalcMove(rs, before.theirBest!.move)?.hits ?? 1) <= 1) {
      const set = { ...member, item: 'Focus Sash' };
      add({ kind: 'item', member, set, after: match(set), checks: true, title: `Give ${member.species} a Focus Sash`, how: ['Hold Focus Sash, if you have one', 'only from full HP'], result: describe(match(set), 'survives at 1 HP, then OHKOs'), cost: 2.5 });
    }
  }

  // 5. Someone new: from the PC first (already caught, real set), then from what's obtainable by now
  // one per evolution family: no Gabite suggested next to your Gible (forms count as the same family)
  const onTeam = new Set(team.map((s) => familyOf(rs, s.species)));
  const teamIds = new Set(team.flatMap((s) => (s.monId ? [s.monId] : [])));
  const owned = (input.owned ?? []).filter((m) => !teamIds.has(m.id) && !onTeam.has(familyOf(rs, m.set.species)));
  const catches: CounterFix[] = [];
  const usedMons = new Set<string>();
  const newcomers: { name: string; match?: ReturnType<typeof ownedMatch> }[] = (input.pool ?? []).map((sp) => {
    const match = ownedMatch(rs, owned, sp.name);
    if (match) usedMons.add(match.mon.id);
    return { name: sp.name, match };
  });
  for (const mon of owned) {
    if (usedMons.has(mon.id) || newcomers.some((n) => n.name === mon.set.species)) continue;
    newcomers.push({ name: mon.set.species, match: { mon, set: mon.set } });
  }
  const seen = new Set<string>();
  for (const { name, match: own } of newcomers) {
    const sp = rs.getSpecies(name);
    if (!sp) continue;
    const fam = familyOf(rs, sp.name);
    if (onTeam.has(fam) || (!own && seen.has(sp.name))) continue;
    seen.add(sp.name);
    const learnset = learnsets.get(sp.name);
    const ownedInfo = own && { monId: own.mon.id, evolvesFrom: own.evolvesFrom };
    const ownedHow = own
      ? [own.evolvesFrom ? `Your ${own.evolvesFrom} in the PC, evolved` : 'Already in your PC', `at Lv ${Math.min(own.set.level, cap)}`]
      : [`at Lv ${cap}`];
    const title = own ? (own.evolvesFrom ? `Evolve your ${own.evolvesFrom} into ${sp.name}` : `Use your ${sp.name} from the PC`) : `Get ${sp.name}`;
    // a caught mon costs less than one you'd still have to find; a stronger one first among equals,
    // one-off legendaries after the rest, and every TM or tutor its set needs is more legwork
    const baseCost = (own ? 3 : 5) - (statTotal(sp.baseStats) - 400) / 400 + (sp.legendary ? 0.6 : 0);

    // a PC mon as it already is
    if (own) {
      const real = { ...own.set, level: Math.min(own.set.level, cap) };
      const after = match(real);
      if (after.checks || !learnset) {
        const c = closeness(after);
        if (c >= 0.5) catches.push({ kind: 'catch', set: real, after, checks: after.checks, closeness: c, title, how: ownedHow, result: describe(after), cost: baseCost - 0.5, owned: ownedInfo });
        continue;
      }
    }
    if (!learnset) continue;
    const blank = own ? { ...own.set, level: Math.min(own.set.level, cap), moves: [] } : { ...newSet(rs, sp.name), level: cap };
    const reach = own ? blank.level : cap;
    // level-up (and relearner) moves first; TMs only when those can't do it
    const sources = moveSources(rs, blank, learnset, reach, reward);
    const easy = bestMovesAgainst(rs, blank, t, sources.filter((s) => s.cost <= 1.5), field);
    const easySet = { ...blank, moves: easy.map((p) => p.move.name) };
    const easyAfter = easy.length ? match(easySet) : undefined;
    const picked = easyAfter?.checks ? easy : bestMovesAgainst(rs, blank, t, sources, field);
    if (!picked.length) continue;
    const set = { ...blank, moves: picked.map((p) => p.move.name) };
    const after = picked === easy ? easyAfter! : match(set);
    const c = closeness(after);
    if (c < 0.5) continue;
    catches.push({
      kind: 'catch', set, after, checks: after.checks, closeness: c,
      title,
      how: [
        ...ownedHow,
        // where each move comes from, so a late TM doesn't hide behind a good-looking set
        ...picked.map((p) => `${p.move.name}: ${p.level || p.how.startsWith('Move Reminder') ? 'level-up' : p.how}`),
      ],
      result: describe(after),
      cost: baseCost + 0.3 * picked.filter((p) => p.cost > 1.5).length,
      owned: ownedInfo,
    });
  }
  fixes.push(...catches);

  // best per kind, checks first, then cheapest; near-misses only make the list when little works
  const order = (a: CounterFix, b: CounterFix) => Number(b.checks) - Number(a.checks) || (a.checks ? a.cost - b.cost : b.closeness - a.closeness);
  const out: CounterFix[] = [];
  for (const kind of ['level', 'evolve', 'move', 'item', 'catch'] as FixKind[]) {
    const ofKind = fixes.filter((f) => f.kind === kind).sort(order);
    const winners = ofKind.filter((f) => f.checks);
    out.push(...(winners.length ? winners : ofKind).slice(0, perKind));
  }
  return out.sort(order);
}

/** Up to four moves for a newcomer: the hardest hitters against the threat, one per type */
function bestMovesAgainst(rs: Ruleset, set: TeamSet, threat: CalcSide, sources: MoveSource[], field: FieldOptions): MoveSource[] {
  const sp = rs.getSpecies(set.species);
  const physical = (sp?.baseStats.atk ?? 0) >= (sp?.baseStats.spa ?? 0);
  // a cheap pre-rank so only a handful get the full calc
  const rough = sources
    .filter((s) => s.cost < 4 && s.move.category !== 'Status')
    .map((s) => {
      const eff = rs.effectiveness(s.move.type, rs.getSpecies(threat.set.species)?.types ?? []);
      const stab = sp?.types.includes(s.move.type) ? 1.5 : 1;
      const fit = (s.move.category === 'Physical') === physical ? 1 : 0.7;
      const acc = s.move.accuracy === true ? 1 : s.move.accuracy / 100;
      // level-up moves beat a TM of similar power: no hunting for the TM
      const ease = s.cost <= 1.5 ? 1 : s.cost <= 2 ? 0.9 : 0.8;
      return { s, v: Math.min(s.move.basePower, 120) * eff * stab * fit * acc * ease };
    })
    .sort((a, b) => b.v - a.v)
    .slice(0, 8);
  const scored = rough
    .map(({ s }) => ({ s, r: calcMove(rs, { set }, threat, s.move.name, field) }))
    .filter((x) => (x.r?.maxPct ?? 0) > 0)
    .sort((a, b) => b.r!.minPct - a.r!.minPct);
  const picked: MoveSource[] = [];
  const types = new Set<string>();
  for (const x of scored) {
    if (types.has(x.s.move.type)) continue;
    types.add(x.s.move.type);
    picked.push(x.s);
    if (picked.length === 4) break;
  }
  return picked;
}
