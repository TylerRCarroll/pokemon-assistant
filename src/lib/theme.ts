import { useEffect, useState } from 'react';

/**
 * Light/dark theme, chosen per device. The key deliberately sits outside the `pokeplanner:` prefix so
 * backups and gist sync leave it alone (the handheld can be dark while the PC follows its system).
 * index.html applies the same rule before first paint, so keep the two in step.
 */
export type ThemePref = 'system' | 'light' | 'dark';
export const THEME_KEY = 'pokeplanner-theme';
export const THEME_ORDER: ThemePref[] = ['system', 'light', 'dark'];

export function readTheme(storage: Pick<Storage, 'getItem'> | undefined = globalThis.localStorage): ThemePref {
  try {
    const v = storage?.getItem(THEME_KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

const media = () => globalThis.matchMedia?.('(prefers-color-scheme: dark)');

export const isDark = (pref: ThemePref, systemDark = media()?.matches ?? false) => pref === 'dark' || (pref === 'system' && systemDark);

export function applyTheme(pref: ThemePref) {
  const dark = isDark(pref);
  document.documentElement.classList.toggle('dark', dark);
  // native controls (selects, scrollbars, checkboxes) follow this
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
}

/** The stored preference and a setter; re-applies when the system theme flips while on "system" */
export function useTheme() {
  const [pref, setPref] = useState<ThemePref>(() => readTheme());
  useEffect(() => {
    applyTheme(pref);
    try {
      if (pref === 'system') localStorage.removeItem(THEME_KEY);
      else localStorage.setItem(THEME_KEY, pref);
    } catch {
      // storage blocked: the choice just lasts for this visit
    }
    if (pref !== 'system') return;
    const mq = media();
    const onChange = () => applyTheme('system');
    mq?.addEventListener('change', onChange);
    return () => mq?.removeEventListener('change', onChange);
  }, [pref]);
  return [pref, setPref] as const;
}
