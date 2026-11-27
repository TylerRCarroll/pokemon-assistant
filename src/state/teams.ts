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
  /** When each deleted team was deleted, so syncing and merging don't bring it back */
  deleted: Record<string, number>;
  createTeam: (rulesetId: string, name?: string, slots?: (TeamSet | null)[]) => string;
  renameTeam: (id: string, name: string) => void;
  deleteTeam: (id: string) => void;
  setActive: (rulesetId: string, id: string) => void;
  setSlot: (id: string, index: number, set: TeamSet | null) => void;
  setSlots: (id: string, slots: (TeamSet | null)[]) => void;
  /** Put a set in the ruleset's active team's first free slot, or start a new team when it's full */
  addSet: (rulesetId: string, set: TeamSet) => { teamName: string; created: boolean };
  /** A PC mon changed: rewrite every slot holding it (see state/box.ts) */
  updateLinked: (monId: string, set: TeamSet) => void;
  /** A PC mon was released: empty every slot holding it */
  unlinkMon: (monId: string) => void;
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
        deleted: {},
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
        deleteTeam: (id) => set((s) => ({ teams: s.teams.filter((t) => t.id !== id), deleted: { ...s.deleted, [id]: Date.now() } })),
        setActive: (rulesetId, id) => set((s) => ({ activeByRuleset: { ...s.activeByRuleset, [rulesetId]: id } })),
        setSlot: (id, index, slot) => patch(id, (t) => ({ slots: t.slots.map((s, i) => (i === index ? slot : s)) })),
        setSlots: (id, slots) => patch(id, () => ({ slots: padSlots(slots) })),
        addSet(rulesetId, newSet) {
          const { teams, activeByRuleset } = get();
          const mine = teams.filter((t) => t.rulesetId === rulesetId);
          const team = mine.find((t) => t.id === activeByRuleset[rulesetId]) ?? mine[0];
          const free = team?.slots.findIndex((s) => !s) ?? -1;
          if (team && free >= 0) {
            get().setSlot(team.id, free, newSet);
            return { teamName: team.name, created: false };
          }
          const id = get().createTeam(rulesetId, undefined, [newSet]);
          return { teamName: get().teams.find((t) => t.id === id)!.name, created: true };
        },
        updateLinked(monId, linked) {
          const holds = (t: Team) => t.slots.some((s) => s?.monId === monId);
          set((s) => ({
            teams: s.teams.map((t) =>
              holds(t) ? { ...t, slots: t.slots.map((x) => (x?.monId === monId ? linked : x)), updatedAt: Date.now() } : t,
            ),
          }));
        },
        unlinkMon(monId) {
          const holds = (t: Team) => t.slots.some((s) => s?.monId === monId);
          set((s) => ({
            teams: s.teams.map((t) => (holds(t) ? { ...t, slots: t.slots.map((x) => (x?.monId === monId ? null : x)), updatedAt: Date.now() } : t)),
          }));
        },
      };
    },
    { name: 'pokeplanner:teams' },
  ),
);
