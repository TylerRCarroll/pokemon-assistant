import { describe, expect, it } from 'vitest';
import { isDark, readTheme, THEME_KEY } from './theme';

const store = (v: string | null) => ({ getItem: (k: string) => (k === THEME_KEY ? v : null) });

describe('theme', () => {
  it('reads a saved choice and falls back to system', () => {
    expect(readTheme(store('dark'))).toBe('dark');
    expect(readTheme(store('light'))).toBe('light');
    expect(readTheme(store(null))).toBe('system');
    expect(readTheme(store('purple'))).toBe('system');
    expect(readTheme({ getItem: () => { throw new Error('blocked'); } })).toBe('system');
  });

  it('only follows the system on "system"', () => {
    expect(isDark('system', true)).toBe(true);
    expect(isDark('system', false)).toBe(false);
    expect(isDark('light', true)).toBe(false);
    expect(isDark('dark', false)).toBe(true);
  });

  it('stays out of backups and sync, which take every pokeplanner: key', () => {
    expect(THEME_KEY.startsWith('pokeplanner:')).toBe(false);
  });
});
