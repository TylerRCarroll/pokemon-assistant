import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { card } from '../../components/ui';
import type { Ruleset } from '../../rulesets/types';
import { matches } from '../../lib/search';

interface Entry {
  id: string;
  name: string;
  shortDesc: string;
}

/** Name + description rows; also searches descriptions so "speed" finds Choice Scarf */
function DescriptionList({ entries, query, linkTo }: { entries: Entry[]; query: string; linkTo?: (id: string) => string }) {
  const rows = useMemo(
    () =>
      entries
        .filter((e) => !query || matches(e.name, query) || e.shortDesc.toLowerCase().includes(query.toLowerCase()))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [entries, query],
  );
  return (
    <div className={`${card} divide-y divide-slate-100 dark:divide-slate-800/60`}>
      {rows.map((e) => (
        <div key={e.id} className="flex flex-col gap-0.5 px-3 py-2 sm:flex-row sm:gap-4">
          <div className="w-48 shrink-0 font-medium">
            {linkTo ? (
              <Link to={linkTo(e.id)} className="hover:underline">
                {e.name}
              </Link>
            ) : (
              e.name
            )}
          </div>
          <div className="text-sm text-slate-600 dark:text-slate-400">{e.shortDesc || '—'}</div>
        </div>
      ))}
      {!rows.length && <p className="p-6 text-center text-slate-500">Nothing matches.</p>}
    </div>
  );
}

export function AbilityList({ rs, query }: { rs: Ruleset; query: string }) {
  const entries = useMemo(() => rs.abilities(), [rs]);
  return <DescriptionList entries={entries} query={query} linkTo={(id) => `/dex/abilities/${id}`} />;
}

export function ItemList({ rs, query }: { rs: Ruleset; query: string }) {
  const entries = useMemo(() => rs.items(), [rs]);
  return <DescriptionList entries={entries} query={query} />;
}
