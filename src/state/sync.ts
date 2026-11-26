import { useEffect } from 'react';
import { create } from 'zustand';
import { loadConfig, syncNow, type SyncConfig } from '../lib/sync';
import { usePlaythroughStore } from './playthrough';
import { useQuizStore } from './quiz';
import { useRulesetStore } from './ruleset';
import { useTeamsStore } from './teams';
import { useTrainerPrefs } from './trainerPrefs';

/** Every persisted store, so synced data can be reloaded into the running app */
const STORES = [useTeamsStore, useQuizStore, usePlaythroughStore, useTrainerPrefs, useRulesetStore];

type Status = 'off' | 'idle' | 'syncing' | 'error';

interface SyncState {
  status: Status;
  config?: SyncConfig;
  error?: string;
  /** Last pull's changes from other devices, shown briefly */
  lastChanges: string[];
  setConfig: (config?: SyncConfig) => void;
  sync: () => Promise<void>;
}

let applying = false;

export const useSyncStore = create<SyncState>()((set, get) => ({
  status: loadConfig() ? 'idle' : 'off',
  config: loadConfig(),
  lastChanges: [],
  setConfig: (config) => set({ config, status: config ? 'idle' : 'off', error: undefined }),
  async sync() {
    const { config, status } = get();
    if (!config || status === 'syncing') return;
    set({ status: 'syncing' });
    try {
      const result = await syncNow(config);
      if (result.changedKeys.length) {
        // reload the stores from storage without their change events triggering another sync
        applying = true;
        await Promise.all(STORES.map((s) => s.persist.rehydrate()));
        applying = false;
      }
      set({ status: 'idle', error: undefined, config: loadConfig(), lastChanges: result.changes });
    } catch (e) {
      applying = false;
      set({ status: 'error', error: e instanceof Error ? e.message : String(e) });
    }
  },
}));

const DEBOUNCE_MS = 4000;

/**
 * Keeps devices in step while sync is on: syncs on start, a few seconds after any change, and whenever
 * the app comes back into view (switching from the PC to the handheld pulls the latest).
 */
export function useAutoSync() {
  const enabled = useSyncStore((s) => !!s.config);
  useEffect(() => {
    if (!enabled) return;
    const { sync } = useSyncStore.getState();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const later = () => {
      if (applying) return;
      clearTimeout(timer);
      timer = setTimeout(sync, DEBOUNCE_MS);
    };
    const unsubscribe = STORES.map((s) => (s as { subscribe: (fn: () => void) => () => void }).subscribe(later));
    const onVisible = () => document.visibilityState === 'visible' && sync();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', sync);
    sync();
    return () => {
      clearTimeout(timer);
      unsubscribe.forEach((u) => u());
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', sync);
    };
  }, [enabled]);
}
