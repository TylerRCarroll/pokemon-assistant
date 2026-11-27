import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { THEME_ORDER, useTheme, type ThemePref } from '../lib/theme';
import { RULESETS } from '../rulesets/registry';
import { useRuleset, useRulesetStore } from '../state/ruleset';
import { useAutoSync, useSyncStore } from '../state/sync';

const NAV = [
  { to: '/types', label: 'Types' },
  { to: '/dex', label: 'Dex' },
  { to: '/team', label: 'Team' },
  { to: '/pc', label: 'PC' },
  { to: '/planner', label: 'Planner' },
  { to: '/calc', label: 'Calc' },
  { to: '/battle', label: 'Battle' },
  { to: '/trainer', label: 'Trainer' },
  { to: '/backup', label: 'Backup' },
];

const THEME_LABEL: Record<ThemePref, { icon: string; name: string }> = {
  system: { icon: '◐', name: 'System' },
  light: { icon: '☀', name: 'Light' },
  dark: { icon: '☾', name: 'Dark' },
};

/** Cycles System → Light → Dark */
function ThemeButton({ value, onChange, wide }: { value: ThemePref; onChange: (t: ThemePref) => void; wide?: boolean }) {
  const next = THEME_ORDER[(THEME_ORDER.indexOf(value) + 1) % THEME_ORDER.length];
  const { icon, name } = THEME_LABEL[value];
  return (
    <button
      onClick={() => onChange(next)}
      title={`Theme: ${name} (click for ${THEME_LABEL[next].name})`}
      aria-label={`Theme: ${name}. Switch to ${THEME_LABEL[next].name}`}
      className={`flex items-center gap-1 rounded border border-slate-300 px-2 py-1 text-sm hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800 ${wide ? 'justify-center py-2' : ''}`}
    >
      <span aria-hidden>{icon}</span>
      <span className="text-xs text-slate-500">{wide ? `Theme: ${name}` : name}</span>
    </button>
  );
}

function RulesetSelect({ compact }: { compact?: boolean }) {
  const rulesetId = useRulesetStore((s) => s.rulesetId);
  const setRuleset = useRulesetStore((s) => s.setRuleset);
  return (
    <label className="flex min-w-0 items-center gap-2 text-sm">
      <span className={compact ? 'sr-only' : 'text-slate-500'}>Ruleset</span>
      <select
        value={rulesetId}
        onChange={(e) => setRuleset(e.target.value)}
        className={`rounded border border-slate-300 bg-white px-2 py-1 dark:border-slate-700 dark:bg-slate-800 ${compact ? 'max-w-[9.5rem] truncate' : ''}`}
      >
        {(['Official', 'Romhacks'] as const).map((group) => (
          <optgroup key={group} label={group}>
            {RULESETS.filter((r) => r.group === group).map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </label>
  );
}

/** A small chip for a ruleset whose data is a draft; the full note opens on tap instead of taking a band of the screen */
function DraftNotice() {
  const ruleset = useRuleset();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  // a new ruleset starts closed
  useEffect(() => setOpen(false), [ruleset.id]);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  if (ruleset.verified) return null;
  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        title="About this ruleset's data"
        className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-900 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200"
      >
        Draft data ⓘ
      </button>
      {open && (
        // phones: across the screen under the header; wider: a dropdown under the chip
        <div className="fixed inset-x-3 top-14 z-30 rounded-lg border md:absolute md:inset-x-auto md:right-0 md:top-full md:mt-2 md:w-80 border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 shadow-lg dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          <div className="mb-1 font-semibold">{ruleset.name}</div>
          {ruleset.notes ?? 'This ruleset uses draft data.'}
        </div>
      )}
    </div>
  );
}

function SyncStatus({ dot }: { dot?: boolean }) {
  const sync = useSyncStore((s) => s.status);
  if (sync === 'off') return null;
  const label = sync === 'syncing' ? 'Syncing…' : sync === 'error' ? 'Sync error' : 'Synced ✓';
  if (dot) {
    return (
      <Link to="/backup" title={label} aria-label={label} className="flex h-6 w-6 items-center justify-center">
        <span className={`h-2.5 w-2.5 rounded-full ${sync === 'error' ? 'bg-red-500' : sync === 'syncing' ? 'animate-pulse bg-amber-400' : 'bg-green-500'}`} />
      </Link>
    );
  }
  return (
    <Link
      to="/backup"
      title="Sync status"
      className={`rounded px-2 py-0.5 text-xs ${sync === 'error' ? 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
    >
      {label}
    </Link>
  );
}

const navClass = (big: boolean) => ({ isActive }: { isActive: boolean }) =>
  `rounded font-medium ${big ? 'px-3 py-3 text-base' : 'px-3 py-1 text-sm'} ${
    isActive ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900' : 'hover:bg-slate-100 dark:hover:bg-slate-800'
  }`;

export function Layout() {
  useAutoSync();
  const [theme, setTheme] = useTheme();
  const location = useLocation();
  const [menu, setMenu] = useState(false);
  const page = NAV.find((n) => location.pathname.startsWith(n.to))?.label;

  // the menu closes when you go somewhere, or press Escape
  useEffect(() => setMenu(false), [location.pathname]);
  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenu(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [menu]);

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-slate-900/90">
        {/* phones and the handheld: one compact row, everything else behind the menu */}
        <div className="flex items-center gap-2 px-3 py-2 md:hidden">
          <button
            onClick={() => setMenu(!menu)}
            aria-label={menu ? 'Close the menu' : 'Open the menu'}
            aria-expanded={menu}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded border border-slate-300 text-lg dark:border-slate-700"
          >
            {menu ? '✕' : '☰'}
          </button>
          <div className="min-w-0 flex-1 truncate">
            <span className="font-bold">PokéPlanner</span>
            {page && <span className="text-slate-500"> · {page}</span>}
          </div>
          <DraftNotice />
          <SyncStatus dot />
          <RulesetSelect compact />
        </div>

        {/* wider screens: the full bar */}
        <div className="mx-auto hidden max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 md:flex">
          <span className="text-lg font-bold">PokéPlanner</span>
          <nav className="flex flex-wrap gap-1">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} className={navClass(false)}>
                {n.label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <SyncStatus />
            <DraftNotice />
            <RulesetSelect />
            <ThemeButton value={theme} onChange={setTheme} />
          </div>
        </div>

        {menu && (
          <nav className="border-t border-slate-200 px-3 pb-3 pt-2 md:hidden dark:border-slate-800">
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
              {NAV.map((n) => (
                <NavLink key={n.to} to={n.to} className={navClass(true)}>
                  {n.label}
                </NavLink>
              ))}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-1.5">
              <ThemeButton value={theme} onChange={setTheme} wide />
              <div className="flex items-center justify-center">
                <SyncStatus />
              </div>
            </div>
          </nav>
        )}
      </header>
      {/* tapping outside the open menu closes it */}
      {menu && <div className="fixed inset-0 z-10 bg-black/20 md:hidden" onClick={() => setMenu(false)} aria-hidden />}
      <main className="mx-auto max-w-6xl px-3 py-4 md:px-4 md:py-6">
        <Outlet />
      </main>
    </div>
  );
}
