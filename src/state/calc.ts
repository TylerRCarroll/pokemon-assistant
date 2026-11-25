import { create } from 'zustand';
import type { CalcSide, FieldOptions } from '../lib/calc';

/** Calculator state for the session; the threat view writes here to open a matchup in the calc */
interface CalcState {
  rulesetId?: string;
  left?: CalcSide;
  right?: CalcSide;
  field: FieldOptions;
  setSide: (which: 'left' | 'right', side: CalcSide | undefined) => void;
  setField: (field: FieldOptions) => void;
  load: (rulesetId: string, left: CalcSide, right: CalcSide) => void;
  /** Clear both sides if they belong to another ruleset */
  ensureRuleset: (rulesetId: string) => void;
}

export const useCalcStore = create<CalcState>()((set, get) => ({
  field: {},
  setSide: (which, side) => set({ [which]: side }),
  setField: (field) => set({ field }),
  load: (rulesetId, left, right) => set({ rulesetId, left, right }),
  ensureRuleset: (rulesetId) => {
    if (get().rulesetId !== rulesetId) set({ rulesetId, left: undefined, right: undefined, field: {} });
  },
}));
