import { getRuleset } from '../rulesets/registry';
import type { Ruleset, SpeciesInfo, StatID, TypeName } from '../rulesets/types';
import type { FormatData } from './smogonTypes';
import { genFeatures, STAT_IDS, STAT_LABELS } from './team';

/** How choices render: type badges, multipliers, species sprites, or plain text */
export type ChoiceKind = 'type' | 'typing' | 'multiplier' | 'species' | 'text';

export interface Question {
  key: string;
  kind: QuizKind;
  prompt: string;
  /** Visuals for the prompt */
  species?: string;
  types?: TypeName[];
  choiceKind: ChoiceKind;
  choices: string[];
  answer: string;
  explanation: string;
}

export interface QuizContext {
  rs: Ruleset;
  /** Species questions draw from here (meta-relevant when usage stats exist) */
  pool: SpeciesInfo[];
  meta?: FormatData;
  formatName?: string;
}

export type QuizKind = 'effectiveness' | 'weakness' | 'ability' | 'abilityEffect' | 'moveType' | 'counter' | 'hackChange';

type Rng = () => number;

interface Generator {
  label: string;
  available: (ctx: QuizContext) => boolean;
  keys: (ctx: QuizContext) => string[];
  build: (ctx: QuizContext, key: string, rng: Rng) => Question | undefined;
}

const shuffle = <T,>(xs: T[], rng: Rng) => {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
const sample = <T,>(xs: T[], n: number, rng: Rng) => shuffle(xs, rng).slice(0, n);
const unique = <T,>(xs: T[]) => [...new Set(xs)];

const MULT_LABEL: Record<number, string> = { 0: '0×', 0.25: '¼×', 0.5: '½×', 1: '1×', 2: '2×', 4: '4×' };
const mult = (n: number) => MULT_LABEL[n] ?? `${n}×`;
/** Ascending; object key order would put the integers first */
const MULT_ORDER = ['0×', '¼×', '½×', '1×', '2×', '4×'];

/** Multiple choice: the answer plus up to `n - 1` distractors, shuffled */
const choicesWith = (answer: string, distractors: string[], n: number, rng: Rng) =>
  shuffle([answer, ...sample(unique(distractors.filter((d) => d !== answer)), n - 1, rng)], rng);

/** The official ruleset a romhack is built on, to spot what the hack changed */
const baseRuleset = (rs: Ruleset) => getRuleset(rs.natDex ? `gen${rs.gen}natdex` : `gen${rs.gen}`);

export const GENERATORS: Record<QuizKind, Generator> = {
  effectiveness: {
    label: 'Type matchups',
    available: () => true,
    keys: ({ rs, pool }) => {
      // real typings only, so questions look like actual battles
      const typings = unique(pool.map((s) => s.types.join('/')));
      return rs.types.flatMap((atk) => typings.map((t) => `eff|${atk}|${t}`));
    },
    build: ({ rs }, key) => {
      const [, atk, typing] = key.split('|');
      const defs = typing.split('/');
      if (!rs.types.includes(atk) || defs.some((d) => !rs.types.includes(d))) return undefined;
      const total = rs.effectiveness(atk, defs);
      const parts = defs.map((d) => `${d} ${mult(rs.effectiveness(atk, [d]))}`).join(', ');
      return {
        key,
        kind: 'effectiveness',
        prompt: `How effective is a ${atk}-type attack against a ${typing} Pokémon?`,
        types: [atk, ...defs],
        choiceKind: 'multiplier',
        choices: MULT_ORDER.filter((l) => defs.length > 1 || (l !== '¼×' && l !== '4×')),
        answer: mult(total),
        explanation: defs.length > 1 ? `${atk} vs ${parts} → ${mult(total)}` : `${atk} vs ${typing} is ${mult(total)}`,
      };
    },
  },

  weakness: {
    label: 'Weaknesses',
    available: () => true,
    keys: ({ rs, pool }) => pool.filter((s) => rs.types.some((t) => rs.effectiveness(t, s.types) > 1)).map((s) => `weak|${s.id}`),
    build: ({ rs }, key, rng) => {
      const sp = rs.getSpecies(key.split('|')[1]);
      if (!sp) return undefined;
      const byType = rs.types.map((t) => [t, rs.effectiveness(t, sp.types)] as const);
      const weak = byType.filter(([, m]) => m > 1);
      if (!weak.length) return undefined;
      const answer = weak[Math.floor(rng() * weak.length)][0];
      return {
        key,
        kind: 'weakness',
        prompt: `Which type hits ${sp.name} super-effectively?`,
        species: sp.name,
        types: sp.types,
        choiceKind: 'type',
        choices: choicesWith(answer, byType.filter(([, m]) => m <= 1).map(([t]) => t), 4, rng),
        answer,
        explanation: `${sp.name} (${sp.types.join('/')}) is weak to ${weak.map(([t, m]) => `${t} ${mult(m)}`).join(', ')}.`,
      };
    },
  },

  ability: {
    label: 'Abilities',
    available: ({ rs }) => genFeatures(rs).abilities,
    keys: ({ pool }) => pool.filter((s) => s.abilities.length).map((s) => `abil|${s.id}`),
    build: ({ rs, pool }, key, rng) => {
      const sp = rs.getSpecies(key.split('|')[1]);
      if (!sp?.abilities.length) return undefined;
      const answer = sp.abilities[Math.floor(rng() * sp.abilities.length)];
      const others = pool.flatMap((s) => s.abilities).filter((a) => !sp.abilities.includes(a));
      return {
        key,
        kind: 'ability',
        prompt: `Which of these abilities can ${sp.name} have?`,
        species: sp.name,
        choiceKind: 'text',
        choices: choicesWith(answer, others, 4, rng),
        answer,
        explanation: `${sp.name}'s abilities: ${sp.abilities.join(', ')}.`,
      };
    },
  },

  abilityEffect: {
    label: 'Ability effects',
    available: ({ rs }) => genFeatures(rs).abilities,
    keys: ({ rs, pool }) =>
      unique(pool.flatMap((s) => s.abilities))
        .map((a) => rs.getAbility(a))
        .filter((a) => a?.shortDesc)
        .map((a) => `abdesc|${a!.id}`),
    build: ({ rs, pool }, key, rng) => {
      const ability = rs.getAbility(key.split('|')[1]);
      if (!ability?.shortDesc) return undefined;
      const others = unique(pool.flatMap((s) => s.abilities))
        .map((a) => rs.getAbility(a)?.shortDesc)
        .filter((d): d is string => !!d && d !== ability.shortDesc);
      return {
        key,
        kind: 'abilityEffect',
        prompt: `What does ${ability.name} do?`,
        choiceKind: 'text',
        choices: choicesWith(ability.shortDesc, others, 4, rng),
        answer: ability.shortDesc,
        explanation: ability.desc || ability.shortDesc,
      };
    },
  },

  moveType: {
    label: 'Move types',
    available: () => true,
    keys: ({ rs, meta }) => {
      // with usage stats, ask about moves the meta actually uses; otherwise any attacking move
      const used = meta && new Set(Object.values(meta.pokemon).flatMap((u) => u.moves.map(([m]) => rs.getMove(m)?.id)));
      return rs
        .moves()
        .filter((m) => (used ? used.has(m.id) : m.basePower > 0))
        .map((m) => `mtype|${m.id}`);
    },
    build: ({ rs }, key, rng) => {
      const move = rs.getMove(key.split('|')[1]);
      if (!move || !rs.types.includes(move.type)) return undefined;
      const changed = rs.kind === 'romhack' && baseRuleset(rs).getMove(move.id)?.type;
      return {
        key,
        kind: 'moveType',
        prompt: `What type is ${move.name}?`,
        choiceKind: 'type',
        choices: choicesWith(move.type, rs.types, 4, rng),
        answer: move.type,
        explanation:
          `${move.name}: ${move.type}, ${move.category}${move.basePower ? `, ${move.basePower} power` : ''}.` +
          (changed && changed !== move.type ? ` (${changed} in the original game.)` : ''),
      };
    },
  },

  counter: {
    label: 'Checks & counters',
    available: ({ meta }) => !!meta,
    keys: ({ rs, meta }) =>
      Object.entries(meta?.pokemon ?? {})
        .slice(0, 80)
        .filter(([name, u]) => rs.getSpecies(name) && u.counters.some(([c]) => rs.getSpecies(c)))
        .map(([name]) => `ctr|${rs.getSpecies(name)!.id}`),
    build: ({ rs, meta, formatName }, key, rng) => {
      const sp = rs.getSpecies(key.split('|')[1]);
      const u = sp && meta?.pokemon[sp.name];
      if (!sp || !u) return undefined;
      const counters = u.counters.filter(([c]) => rs.getSpecies(c));
      if (!counters.length) return undefined;
      const [answer, rate] = counters[Math.floor(rng() * Math.min(counters.length, 5))];
      const notCounters = Object.keys(meta.pokemon)
        .slice(0, 60)
        .filter((n) => n !== sp.name && !u.counters.some(([c]) => c === n) && rs.getSpecies(n));
      return {
        key,
        kind: 'counter',
        prompt: `In ${formatName ?? meta.format}, which of these reliably checks ${sp.name}?`,
        species: sp.name,
        choiceKind: 'species',
        choices: choicesWith(answer, notCounters, 4, rng),
        answer,
        explanation: `${answer} KOs or forces out ${sp.name} ${Math.round(rate * 100)}% of the time they meet. Others: ${counters
          .slice(0, 5)
          .map(([c]) => c)
          .filter((c) => c !== answer)
          .join(', ')}.`,
      };
    },
  },

  hackChange: {
    label: 'Romhack changes',
    available: ({ rs }) => rs.kind === 'romhack',
    keys: ({ rs }) => {
      // retyped species (Renegade Platinum) and re-statted species (Unbound's rebalance)
      const base = baseRuleset(rs);
      return rs.species().flatMap((s) => {
        const b = base.getSpecies(s.id);
        if (!b) return [];
        const keys: string[] = [];
        if (b.types.join('/') !== s.types.join('/')) keys.push(`htype|${s.id}`);
        if (STAT_IDS.some((k) => b.baseStats[k] !== s.baseStats[k])) keys.push(`hstat|${s.id}`);
        return keys;
      });
    },
    build: ({ rs }, key, rng) => {
      if (key.startsWith('hstat|')) return buildStatChange(rs, key, rng);
      const sp = rs.getSpecies(key.split('|')[1]);
      const before = sp && baseRuleset(rs).getSpecies(sp.id);
      if (!sp || !before) return undefined;
      const answer = sp.types.join('/');
      const old = before.types.join('/');
      const decoys = [old, ...rs.types.filter((t) => !sp.types.includes(t)).map((t) => `${sp.types[0]}/${t}`), ...rs.types.map((t) => `${t}/${sp.types.at(-1)}`)];
      return {
        key,
        kind: 'hackChange',
        prompt: `In ${rs.name}, what's ${sp.name}'s typing?`,
        species: sp.name,
        choiceKind: 'typing',
        choices: choicesWith(answer, decoys.filter((d) => d.split('/')[0] !== d.split('/')[1]), 4, rng),
        answer,
        explanation: `${sp.name} is ${answer} in ${rs.name} (it was ${old}).`,
      };
    },
  },
};

/** "In Unbound, what's Venusaur's base Sp. Atk?" for the stat the hack changed most */
function buildStatChange(rs: Ruleset, key: string, rng: Rng): Question | undefined {
  const sp = rs.getSpecies(key.split('|')[1]);
  const before = sp && baseRuleset(rs).getSpecies(sp.id);
  if (!sp || !before) return undefined;
  const stat: StatID = [...STAT_IDS].sort(
    (a, b) => Math.abs(sp.baseStats[b] - before.baseStats[b]) - Math.abs(sp.baseStats[a] - before.baseStats[a]),
  )[0];
  const now = sp.baseStats[stat];
  const was = before.baseStats[stat];
  if (now === was) return undefined;
  const near = [-20, -15, -10, 10, 15, 20].map((d) => now + d).filter((v) => v > 0 && v !== was);
  const total = (x: SpeciesInfo) => STAT_IDS.reduce((sum, k) => sum + x.baseStats[k], 0);
  return {
    key,
    kind: 'hackChange',
    prompt: `In ${rs.name}, what's ${sp.name}'s base ${STAT_LABELS[stat]}?`,
    species: sp.name,
    choiceKind: 'text',
    choices: choicesWith(String(now), [String(was), ...sample(near, 2, rng).map(String)], 4, rng),
    answer: String(now),
    explanation: `${sp.name}'s base ${STAT_LABELS[stat]} is ${now} in ${rs.name} (was ${was}). Total ${total(sp)}, was ${total(before)}.`,
  };
}

/** Species to quiz on: the format's top usage when stats exist, otherwise fully evolved Pokémon */
export function buildPool(rs: Ruleset, meta?: FormatData): SpeciesInfo[] {
  if (meta) {
    const top = Object.keys(meta.pokemon)
      .slice(0, 150)
      .map((n) => rs.getSpecies(n))
      .filter((s): s is SpeciesInfo => !!s);
    if (top.length >= 20) return top;
  }
  return rs.species().filter((s) => !s.evos?.length);
}

/** Kinds that apply to this ruleset and actually have questions (Gen 1 OU has no counter data, say) */
export function availableKinds(ctx: QuizContext): QuizKind[] {
  return (Object.keys(GENERATORS) as QuizKind[]).filter((k) => GENERATORS[k].available(ctx) && GENERATORS[k].keys(ctx).length > 0);
}

/** Question keys grouped by topic, for even topic picking */
export function keysByKind(ctx: QuizContext, kinds: QuizKind[]): string[][] {
  return kinds.map((k) => (GENERATORS[k].available(ctx) ? GENERATORS[k].keys(ctx) : []));
}

export function allKeys(ctx: QuizContext, kinds: QuizKind[]): string[] {
  return keysByKind(ctx, kinds).flat();
}

const KIND_BY_PREFIX: Record<string, QuizKind> = {
  eff: 'effectiveness',
  weak: 'weakness',
  abil: 'ability',
  abdesc: 'abilityEffect',
  mtype: 'moveType',
  ctr: 'counter',
  htype: 'hackChange',
  hstat: 'hackChange',
};

export function buildQuestion(ctx: QuizContext, key: string, rng: Rng = Math.random): Question | undefined {
  const kind = KIND_BY_PREFIX[key.split('|')[0]];
  return kind ? GENERATORS[kind].build(ctx, key, rng) : undefined;
}
