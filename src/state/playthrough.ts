import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { gamesFor } from '../data/games';
import type { Ruleset } from '../rulesets/types';

export type PlayMode = 'competitive' | 'playthrough';

export interface PlaythroughPrefs {
  mode: PlayMode;
  game: string;
  checkpoint: number;
}

interface PlaythroughState {
  /** Per ruleset: Smogon-style advice, or advice limited to what a playthrough has reached */
  byRuleset: Record<string, PlaythroughPrefs>;
  set: (rulesetId: string, patch: Partial<PlaythroughPrefs>) => void;
}

/** Romhacks default to playthrough mode; official gens to competitive (Smogon) */
export function defaultPrefs(rs: Ruleset): PlaythroughPrefs | undefined {
  const games = gamesFor(rs.id);
  if (!games.length) return undefined;
  return { mode: rs.kind === 'romhack' ? 'playthrough' : 'competitive', game: games[0].id, checkpoint: 0 };
}

export const usePlaythroughStore = create<PlaythroughState>()(
  persist(
    (set) => ({
      byRuleset: {},
      set: (rulesetId, patch) =>
        set((s) => ({
          byRuleset: { ...s.byRuleset, [rulesetId]: { ...(s.byRuleset[rulesetId] ?? { mode: 'competitive', game: '', checkpoint: 0 }), ...patch } },
        })),
    }),
    { name: 'pokeplanner:playthrough' },
  ),
);

export function usePlaythrough(rs: Ruleset): PlaythroughPrefs | undefined {
  const stored = usePlaythroughStore((s) => s.byRuleset[rs.id]);
  const fallback = defaultPrefs(rs);
  if (!fallback) return undefined;
  const game = gamesFor(rs.id).some((g) => g.id === stored?.game) ? stored!.game : fallback.game;
  return { ...fallback, ...stored, game };
}
