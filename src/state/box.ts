import { useMemo } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { TeamSet } from '../lib/team';
import { useTeamsStore } from './teams';

/** A Pokémon in a playthrough's PC: kept with its full set whether or not it's on a team */
export interface StoredMon {
  id: string;
  rulesetId: string;
  /** The playthrough (game id from data/games.ts) it was caught in; each game has its own PC */
  game: string;
  /** Always carries `monId: id`, so a copy put in a team slot stays linked */
  set: TeamSet;
  createdAt: number;
  updatedAt: number;
}

interface BoxState {
  mons: StoredMon[];
  /** When each released mon was released, so syncing and merging don't bring it back */
  deleted: Record<string, number>;
  createMon: (rulesetId: string, game: string, set: TeamSet) => string;
  /** Save a mon's new set, here and in every team slot holding it */
  updateMon: (id: string, set: TeamSet) => void;
  /** Delete a mon for good, taking it off any team it's on */
  releaseMon: (id: string) => void;
  /**
   * Bring a team's unlinked members (from before the PC, or pasted in) into this game's PC, and empty slots
   * whose mon was released elsewhere. Reads the live stores, so running it twice never makes duplicates.
   */
  adoptTeam: (teamId: string, rulesetId: string, game: string) => void;
}

export const useBoxStore = create<BoxState>()(
  persist(
    (set) => ({
      mons: [],
      deleted: {},
      createMon(rulesetId, game, monSet) {
        const id = crypto.randomUUID();
        const now = Date.now();
        set((s) => ({ mons: [...s.mons, { id, rulesetId, game, set: { ...monSet, monId: id }, createdAt: now, updatedAt: now }] }));
        return id;
      },
      updateMon(id, monSet) {
        const linked = { ...monSet, monId: id };
        set((s) => ({ mons: s.mons.map((m) => (m.id === id ? { ...m, set: linked, updatedAt: Date.now() } : m)) }));
        useTeamsStore.getState().updateLinked(id, linked);
      },
      adoptTeam(teamId, rulesetId, game) {
        const team = useTeamsStore.getState().teams.find((t) => t.id === teamId);
        if (!team) return;
        const { mons, deleted, createMon } = useBoxStore.getState();
        const ids = new Set(mons.map((m) => m.id));
        const linked = (s: TeamSet) => !!s.monId && ids.has(s.monId);
        if (team.slots.every((s) => !s || linked(s))) return;
        const slots = team.slots.map((s) => {
          if (!s || linked(s)) return s;
          if (s.monId && deleted[s.monId]) return null;
          return { ...s, monId: createMon(rulesetId, game, s) };
        });
        useTeamsStore.getState().setSlots(teamId, slots);
      },
      releaseMon(id) {
        set((s) => ({ mons: s.mons.filter((m) => m.id !== id), deleted: { ...s.deleted, [id]: Date.now() } }));
        useTeamsStore.getState().unlinkMon(id);
      },
    }),
    { name: 'pokeplanner:box' },
  ),
);

/** One playthrough's PC, oldest catch first */
export function useBox(rulesetId: string, game: string | undefined): StoredMon[] {
  const mons = useBoxStore((s) => s.mons);
  return useMemo(() => mons.filter((m) => m.rulesetId === rulesetId && m.game === game), [mons, rulesetId, game]);
}
