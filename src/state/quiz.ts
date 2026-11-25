import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { QuizKind } from '../lib/quiz';
import { schedule, type Card } from '../lib/srs';

export interface QuizProgress {
  cards: Record<string, Card>;
  answered: number;
  correct: number;
  streak: number;
  best: number;
  /** Question kinds turned off; everything else is on */
  disabled: QuizKind[];
}

const empty = (): QuizProgress => ({ cards: {}, answered: 0, correct: 0, streak: 0, best: 0, disabled: [] });

interface QuizState {
  /** Progress is per ruleset, since answers differ between gens and hacks */
  byRuleset: Record<string, QuizProgress>;
  grade: (rulesetId: string, key: string, correct: boolean) => void;
  toggleKind: (rulesetId: string, kind: QuizKind) => void;
  reset: (rulesetId: string) => void;
}

export const useQuizStore = create<QuizState>()(
  persist(
    (set) => ({
      byRuleset: {},
      grade: (rulesetId, key, correct) =>
        set((s) => {
          const p = s.byRuleset[rulesetId] ?? empty();
          const streak = correct ? p.streak + 1 : 0;
          return {
            byRuleset: {
              ...s.byRuleset,
              [rulesetId]: {
                ...p,
                cards: { ...p.cards, [key]: schedule(p.cards[key], correct, Date.now()) },
                answered: p.answered + 1,
                correct: p.correct + (correct ? 1 : 0),
                streak,
                best: Math.max(p.best, streak),
              },
            },
          };
        }),
      toggleKind: (rulesetId, kind) =>
        set((s) => {
          const p = s.byRuleset[rulesetId] ?? empty();
          const disabled = p.disabled.includes(kind) ? p.disabled.filter((k) => k !== kind) : [...p.disabled, kind];
          return { byRuleset: { ...s.byRuleset, [rulesetId]: { ...p, disabled } } };
        }),
      reset: (rulesetId) => set((s) => ({ byRuleset: { ...s.byRuleset, [rulesetId]: empty() } })),
    }),
    { name: 'pokeplanner:quiz' },
  ),
);

export const progressFor = (byRuleset: Record<string, QuizProgress>, rulesetId: string) => byRuleset[rulesetId] ?? empty();
