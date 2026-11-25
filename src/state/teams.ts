import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { TeamSet } from '../lib/team';

export interface Team {
  id: string;
  name: string;
  /** Teams belong to one ruleset; the team page shows the current ruleset's teams */
  rulesetId: string;
  slots: (TeamSet | null)[];
  updatedAt: number;
}

interface TeamsState {
  teams: Team[];
  /** Last-opened team per ruleset */
  activeByRuleset: Record<string, string>;
  createTeam: (rulesetId: string, name?: string, slots?: (TeamSet | null)[]) => string;
  renameTeam: (id: string, name: string) => void;
  deleteTeam: (id: string) => void;
  setActive: (rulesetId: string, id: string) => void;
  setSlot: (id: string, index: number, set: TeamSet | null) => void;
  setSlots: (id: string, slots: (TeamSet | null)[]) => void;
}

const emptySlots = (): (TeamSet | null)[] => Array(6).fill(null);
const padSlots = (slots: (TeamSet | null)[]) => [...slots, ...emptySlots()].slice(0, 6);

export const useTeamsStore = create<TeamsState>()(
  persist(
    (set, get) => {
      const patch = (id: string, fn: (t: Team) => Partial<Team>) =>
        set((s) => ({ teams: s.teams.map((t) => (t.id === id ? { ...t, ...fn(t), updatedAt: Date.now() } : t)) }));

      return {
        teams: [],
        activeByRuleset: {},
        createTeam(rulesetId, name, slots) {
          const id = crypto.randomUUID();
          const count = get().teams.filter((t) => t.rulesetId === rulesetId).length;
          const team: Team = {
            id,
            name: name || `Team ${count + 1}`,
            rulesetId,
            slots: padSlots(slots ?? []),
            updatedAt: Date.now(),
          };
          set((s) => ({ teams: [...s.teams, team], activeByRuleset: { ...s.activeByRuleset, [rulesetId]: id } }));
          return id;
        },
        renameTeam: (id, name) => patch(id, () => ({ name })),
        deleteTeam: (id) => set((s) => ({ teams: s.teams.filter((t) => t.id !== id) })),
        setActive: (rulesetId, id) => set((s) => ({ activeByRuleset: { ...s.activeByRuleset, [rulesetId]: id } })),
        setSlot: (id, index, slot) => patch(id, (t) => ({ slots: t.slots.map((s, i) => (i === index ? slot : s)) })),
        setSlots: (id, slots) => patch(id, () => ({ slots: padSlots(slots) })),
      };
    },
    { name: 'pokeplanner:teams' },
  ),
);
