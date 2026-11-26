import type { LearnsetEntry, MoveInfo, Ruleset, SpeciesInfo, TypeName } from '../rulesets/types';
import { defensiveCoverage, IMMUNITY_ABILITIES, memberTakes, teamWarnings, type Member, type TeamIssue } from './coverage';
import { statTotal } from './format';
import { findUsage, setFromUsage } from './smogon';
import type { FormatData } from './smogonTypes';
import { newSet, type TeamSet } from './team';

// ---------------------------------------------------------------------------------------------
// Tips: how to fix one warning without changing the roster

export interface MoveTip {
  member: Member;
  move: MoveInfo;
  /** The coverage-gap types this move hits super-effectively */
  hits: TypeName[];
}

export interface Tip {
  text?: string;
  moves?: MoveTip[];
}

/** Moves that look strong on paper but cost a turn or more, so they're bad coverage advice */
const AWKWARD = new Set(['focuspunch', 'outrage', 'thrash', 'petaldance', 'ragingfury', 'futuresight', 'doomdesire', 'belch', 'lastresort', 'dreameater', 'synchronoise', 'steelbeam', 'mindblown', 'explosion', 'selfdestruct', 'mistyexplosion']);

/** Damaging moves a member can learn but isn't running, best first: power × STAB × matching attack stat × accuracy² */
function learnableAttacks(rs: Ruleset, m: Member, learnset: LearnsetEntry[]) {
  const known = new Set(m.set.moves.map((n) => rs.getMove(n)?.id));
  const physical = m.species.baseStats.atk >= m.species.baseStats.spa;
  return learnset
    .map((e) => rs.getMove(e.move))
    .filter(
      (mv): mv is MoveInfo =>
        !!mv &&
        mv.category !== 'Status' &&
        mv.basePower > 1 &&
        !known.has(mv.id) &&
        !AWKWARD.has(mv.id) &&
        !mv.flags?.charge &&
        !mv.flags?.recharge,
    )
    .map((move) => {
      const stab = m.species.types.includes(move.type) ? 1.5 : 1;
      const statFit = (move.category === 'Physical') === physical ? 1 : 0.7;
      const accuracy = move.accuracy === true ? 1 : (move.accuracy / 100) ** 2;
      return { move, value: Math.min(move.basePower, 120) * stab * statFit * accuracy };
    })
    .sort((a, b) => b.value - a.value);
}

/** "A, B and C" (or "A, B or C") */
const listOf = (xs: string[], word = 'and') => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} ${word} ${xs[xs.length - 1]}`);

export function tipFor(
  rs: Ruleset,
  issue: TeamIssue,
  members: Member[],
  learnsetOf: (m: Member) => LearnsetEntry[] | undefined,
): Tip {
  switch (issue.kind) {
    case 'stackedWeakness': {
      const resisters = rs.types.filter((t) => rs.effectiveness(issue.type, [t]) < 1);
      const abilities = rs.gen >= 3 ? Object.keys(IMMUNITY_ABILITIES).filter((a) => IMMUNITY_ABILITIES[a] === issue.type && rs.getAbility(a)) : [];
      return {
        text:
          `Add a ${listOf(resisters, 'or')}-type Pokémon to take ${issue.type} hits` +
          (abilities.length ? `, or one with ${listOf(abilities, 'or')}` : '') +
          ', or replace one of the weak members (see the suggested swaps).',
      };
    }
    case 'coverageGap': {
      // greedy cover: repeatedly take the learnable move that hits the most remaining gaps (strength breaks ties)
      const options = members.flatMap((m) => {
        const learnset = learnsetOf(m);
        return learnset ? learnableAttacks(rs, m, learnset).slice(0, 40).map((o) => ({ member: m, ...o })) : [];
      });
      let remaining = [...issue.types];
      const moves: MoveTip[] = [];
      while (remaining.length && moves.length < 3) {
        let best: { tip: MoveTip; score: number } | undefined;
        for (const o of options) {
          const hits = remaining.filter((t) => rs.effectiveness(o.move.type, [t]) > 1);
          const score = hits.length * 1000 + o.value;
          if (hits.length && (!best || score > best.score)) best = { tip: { member: o.member, move: o.move, hits }, score };
        }
        if (!best) break;
        moves.push(best.tip);
        remaining = remaining.filter((t) => !best.tip.hits.includes(t));
      }
      return moves.length
        ? { moves, text: remaining.length ? `Still uncovered after these: ${listOf(remaining)}.` : undefined }
        : { text: 'Nobody on the team learns a move for this; a swap below can add the coverage.' };
    }
    case 'noAttacks': {
      const learnset = learnsetOf(issue.member);
      const best = learnset && learnableAttacks(rs, issue.member, learnset)[0];
      return best
        ? { moves: [{ member: issue.member, move: best.move, hits: [] }] }
        : { text: `Give ${issue.member.species.name} at least one attacking move so it isn't Taunt bait.` };
    }
    case 'duplicateItem':
      return { text: `Give one of them a different item. Leftovers, Heavy-Duty Boots, or a Choice item are the usual alternatives.` };
  }
}

// ---------------------------------------------------------------------------------------------
// Swaps: which member to replace, and with whom

export interface Swap {
  /** The member to replace */
  out: Member;
  /** Why that member is the one to go */
  outReasons: string[];
  incoming: SpeciesInfo;
  set: TeamSet;
  /** What the swap fixes, in plain language */
  fixes: string[];
  score: number;
}

/** Types a member threatens: its damaging moves, or its own types (likely STAB) when it has no moves picked yet */
function attackTypes(rs: Ruleset, m: Member): TypeName[] {
  if (!m.set.moves.length) return m.species.types;
  return [
    ...new Set(
      m.set.moves.flatMap((n) => {
        const mv = rs.getMove(n);
        return mv && mv.category !== 'Status' && mv.basePower > 0 ? [mv.type] : [];
      }),
    ),
  ];
}

/** Lower is better: stacked weaknesses, unresisted types, and types nothing hits super-effectively */
function makePenalty(rs: Ruleset) {
  const takes = new Map<string, number>();
  const hits = new Map<string, number>();
  const take = (m: Member, t: TypeName) => {
    const key = `${t}|${m.species.types.join('/')}|${m.set.ability ?? ''}`;
    let v = takes.get(key);
    if (v === undefined) takes.set(key, (v = memberTakes(rs, m, t)));
    return v;
  };
  const hit = (atk: TypeName, def: TypeName) => {
    const key = `${atk}|${def}`;
    let v = hits.get(key);
    if (v === undefined) hits.set(key, (v = rs.effectiveness(atk, [def])));
    return v;
  };
  return (team: Member[], attacks: TypeName[][]) => {
    let p = 0;
    for (const t of rs.types) {
      let weak = 0;
      let resist = 0;
      for (const m of team) {
        const x = take(m, t);
        if (x > 1) weak++;
        else if (x < 1) resist++;
      }
      p += Math.max(0, weak - resist) * 2 + (weak >= 3 ? 2 : 0) + (weak >= 2 && resist === 0 ? 1.5 : 0);
      if (!attacks.some((types) => types.some((a) => hit(a, t) > 1))) p += 1;
    }
    return p;
  };
}

/** Candidates: the format's most-used Pokémon when there's usage data, otherwise fully evolved non-legendaries */
function candidatePool(rs: Ruleset, members: Member[], meta?: FormatData): { species: SpeciesInfo; set: TeamSet }[] {
  const onTeam = new Set(members.map((m) => m.species.name.split('-')[0]));
  const ok = (s: SpeciesInfo) => !s.battleOnly && !onTeam.has(s.name.split('-')[0]);
  if (meta) {
    const top = Object.entries(meta.pokemon)
      .slice(0, 100)
      .flatMap(([name, u]) => {
        const s = rs.getSpecies(name);
        return s && ok(s) ? [{ species: s, set: setFromUsage(rs, s.name, u) }] : [];
      });
    if (top.length >= 20) return top;
  }
  return rs
    .species()
    .filter((s) => !s.evos?.length && !s.legendary && ok(s) && statTotal(s.baseStats) >= 420)
    .map((s) => ({ species: s, set: newSet(rs, s.name) }));
}

/** A rough 0-ish-centred strength score: base stat total, plus usage when the format has stats */
function quality(m: { species: SpeciesInfo }, meta?: FormatData) {
  const bst = (statTotal(m.species.baseStats) - 480) / 60;
  const usage = meta ? (findUsage(meta, m.species.name)?.usage ?? 0) * 8 : 0;
  return bst + usage;
}

export function suggestSwaps(rs: Ruleset, members: Member[], meta?: FormatData, limit = 3): Swap[] {
  if (members.length < 2) return [];
  const penalty = makePenalty(rs);
  const attacks = members.map((m) => attackTypes(rs, m));
  const before = penalty(members, attacks);
  const qualities = members.map((m) => quality(m, meta));

  const best = new Map<string, { i: number; species: SpeciesInfo; set: TeamSet; score: number }>();
  for (const c of candidatePool(rs, members, meta)) {
    const incoming: Member = { species: c.species, set: c.set };
    const incomingAttacks = attackTypes(rs, incoming);
    const q = quality(incoming, meta);
    members.forEach((_, i) => {
      const team = members.map((m, j) => (j === i ? incoming : m));
      const gain = before - penalty(team, attacks.map((a, j) => (j === i ? incomingAttacks : a)));
      if (gain < 1) return;
      const score = gain + 0.6 * (q - qualities[i]);
      const prev = best.get(c.species.id);
      if (!prev || score > prev.score) best.set(c.species.id, { i, species: c.species, set: c.set, score });
    });
  }

  // keep the list varied: at most two suggestions replacing the same member
  const picked: Swap[] = [];
  const perMember = new Map<number, number>();
  for (const b of [...best.values()].sort((x, y) => y.score - x.score)) {
    if ((perMember.get(b.i) ?? 0) >= 2) continue;
    perMember.set(b.i, (perMember.get(b.i) ?? 0) + 1);
    const incoming: Member = { species: b.species, set: b.set };
    picked.push({
      out: members[b.i],
      outReasons: outReasons(rs, members, b.i, qualities, meta),
      incoming: b.species,
      set: b.set,
      fixes: describeFixes(rs, members, members.map((m, j) => (j === b.i ? incoming : m))),
      score: b.score,
    });
    if (picked.length >= limit) break;
  }
  return picked;
}

function outReasons(rs: Ruleset, members: Member[], i: number, qualities: number[], meta?: FormatData): string[] {
  const m = members[i];
  const reasons: string[] = [];
  const stacked = teamWarnings(rs, members).flatMap((w) =>
    w.issue.kind === 'stackedWeakness' && w.issue.weak.includes(m) ? [w.issue.type] : [],
  );
  if (stacked.length) reasons.push(`adds to the ${listOf(stacked)} weakness${stacked.length > 1 ? 'es' : ''}`);
  if (qualities[i] === Math.min(...qualities)) {
    reasons.push(meta ? 'the least proven on the team (lowest stats and usage)' : `the lowest base stats on the team (BST ${statTotal(m.species.baseStats)})`);
  }
  if (m.set.moves.length && !m.set.moves.some((n) => (rs.getMove(n)?.basePower ?? 0) > 0)) reasons.push('has no damaging moves');
  return reasons;
}

/** Before/after differences worth saying out loud */
function describeFixes(rs: Ruleset, before: Member[], after: Member[]): string[] {
  const fixes: string[] = [];
  const rowsBefore = defensiveCoverage(rs, before);
  const rowsAfter = defensiveCoverage(rs, after);
  rowsBefore.forEach((b, k) => {
    const a = rowsAfter[k];
    const wasBad = b.weak.length >= 2 && b.weak.length > b.resist.length;
    if (wasBad && a.weak.length - a.resist.length < b.weak.length - b.resist.length) {
      fixes.push(`${b.type}: ${b.weak.length} weak / ${b.resist.length} resist → ${a.weak.length} / ${a.resist.length}`);
    }
  });
  const gaps = (team: Member[]) => {
    const attacks = team.map((m) => attackTypes(rs, m));
    return rs.types.filter((t) => !attacks.some((types) => types.some((x) => rs.effectiveness(x, [t]) > 1)));
  };
  const covered = gaps(before).filter((t) => !gaps(after).includes(t));
  if (covered.length) fixes.push(`now hits ${listOf(covered)} super-effectively`);
  const newProblems = rowsAfter.filter((a, k) => a.weak.length >= 3 && rowsBefore[k].weak.length < 3).map((a) => a.type);
  // the biggest defensive improvements first, capped so the card stays readable
  const shown = fixes.slice(0, 4);
  if (newProblems.length) shown.push(`but stacks a ${listOf(newProblems)} weakness`);
  return shown;
}
