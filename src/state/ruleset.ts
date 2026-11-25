import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DEFAULT_RULESET, getRuleset } from '../rulesets/registry';

interface RulesetState {
  rulesetId: string;
  setRuleset: (id: string) => void;
}

export const useRulesetStore = create<RulesetState>()(
  persist(
    (set) => ({
      rulesetId: DEFAULT_RULESET,
      setRuleset: (rulesetId) => set({ rulesetId }),
    }),
    { name: 'pokeplanner:ruleset' },
  ),
);

/** The active ruleset; every feature should read game data through this */
export function useRuleset() {
  return getRuleset(useRulesetStore((s) => s.rulesetId));
}
