import { useMemo } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { difficultiesOf } from '../lib/trainers';
import type { TrainerInfo } from '../rulesets/types';

interface TrainerPrefs {
  /** Chosen game difficulty per ruleset, for hacks with per-difficulty trainer teams */
  difficulty: Record<string, string>;
  setDifficulty: (rulesetId: string, difficulty: string) => void;
}

export const useTrainerPrefs = create<TrainerPrefs>()(
  persist(
    (set) => ({
      difficulty: {},
      setDifficulty: (rulesetId, difficulty) => set((s) => ({ difficulty: { ...s.difficulty, [rulesetId]: difficulty } })),
    }),
    { name: 'pokeplanner:trainers' },
  ),
);

/** The trainers for the chosen difficulty; hacks with a single set of teams pass through unchanged */
export function useDifficulty(rulesetId: string, trainers: TrainerInfo[] | undefined) {
  const stored = useTrainerPrefs((s) => s.difficulty[rulesetId]);
  const setStored = useTrainerPrefs((s) => s.setDifficulty);
  const difficulties = useMemo(() => difficultiesOf(trainers ?? []), [trainers]);
  const difficulty = stored && difficulties.includes(stored) ? stored : difficulties[0];
  const filtered = useMemo(
    () => (difficulty ? trainers?.filter((t) => t.difficulty === difficulty) : trainers),
    [trainers, difficulty],
  );
  return {
    difficulties,
    difficulty,
    setDifficulty: (d: string) => setStored(rulesetId, d),
    trainers: filtered,
  };
}
