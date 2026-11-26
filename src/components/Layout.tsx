import { Link, NavLink, Outlet } from 'react-router-dom';
import { THEME_ORDER, useTheme, type ThemePref } from '../lib/theme';
import { RULESETS } from '../rulesets/registry';
import { useRuleset, useRulesetStore } from '../state/ruleset';
import { useAutoSync, useSyncStore } from '../state/sync';

const NAV = [
  { to: '/types', label: 'Types' },
  { to: '/dex', label: 'Dex' },
  { to: '/team', label: 'Team' },
  { to: '/planner', label: 'Planner' },
  { to: '/calc', label: 'Calc' },
  { to: '/trainer', label: 'Trainer' },
  { to: '/backup', label: 'Backup' },
];

const THEME_LABEL: Record<ThemePref, { icon: string; name: string }> = {
  system: { icon: '◐', name: 'System' },
  light: { icon: '☀', name: 'Light' },
  dark: { icon: '☾', name: 'Dark' },
};

/** Cycles System → Light → Dark */
function ThemeButton({ value, onChange }: { value: ThemePref; onChange: (t: ThemePref) => void }) {
  const next = THEME_ORDER[(THEME_ORDER.indexOf(value) + 1) % THEME_ORDER.length];
  const { icon, name } = THEME_LABEL[value];
  return (
    <button
      onClick={() => onChange(next)}
      title={`Theme: ${name} (click for ${THEME_LABEL[next].name})`}
      aria-label={`Theme: ${name}. Switch to ${THEME_LABEL[next].name}`}
      className="flex items-center gap-1 rounded border border-slate-300 px-2 py-1 text-sm hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
    >
      <span aria-hidden>{icon}</span>
      <span className="text-xs text-slate-500">{name}</span>
    </button>
  );
}

export function Layout() {
  const rulesetId = useRulesetStore((s) => s.rulesetId);
  const setRuleset = useRulesetStore((s) => s.setRuleset);
  const ruleset = useRuleset();
  useAutoSync();
  const sync = useSyncStore((s) => s.status);
  const [theme, setTheme] = useTheme();

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-slate-900/90">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <span className="text-lg font-bold">PokéPlanner</span>
          <nav className="flex flex-wrap gap-1">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                className={({ isActive }) =>
                  `rounded px-3 py-1 text-sm font-medium ${
                    isActive
                      ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                      : 'hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`
                }
              >
                {n.label}
              </NavLink>
            ))}
          </nav>
          {sync !== 'off' && (
            <Link
              to="/backup"
              title="Sync status"
              className={`ml-auto rounded px-2 py-0.5 text-xs ${sync === 'error' ? 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
            >
              {sync === 'syncing' ? 'Syncing…' : sync === 'error' ? 'Sync error' : 'Synced ✓'}
            </Link>
          )}
          <label className={`${sync === 'off' ? 'ml-auto ' : ''}flex items-center gap-2 text-sm`}>
            <span className="text-slate-500">Ruleset</span>
            <select
              value={rulesetId}
              onChange={(e) => setRuleset(e.target.value)}
              className="rounded border border-slate-300 bg-white px-2 py-1 dark:border-slate-700 dark:bg-slate-800"
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
          <ThemeButton value={theme} onChange={setTheme} />
        </div>
        {!ruleset.verified && (
          <div className="border-t border-amber-200 bg-amber-50 px-4 py-1.5 text-center text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
            {ruleset.notes ?? 'This ruleset uses draft data.'}
          </div>
        )}
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
