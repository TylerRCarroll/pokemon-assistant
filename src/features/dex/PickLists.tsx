import { useMemo, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Sprite } from '../../components/Sprite';
import { card } from '../../components/ui';
import { pct } from '../../lib/format';
import type { PickStat } from '../../lib/pickRates';
import { matches } from '../../lib/search';
import { STAT_LABELS } from '../../lib/team';
import type { Ruleset, StatID } from '../../rulesets/types';
import { SortHeader } from './SortHeader';
import { useSort } from './useSort';

interface Row {
  key: string;
  name: string;
  to?: string;
  detail: ReactNode;
  /** Extra text the search box matches, e.g. descriptions so "speed" finds Choice Scarf */
  searchText?: string;
}

type Col = 'name' | 'rate';

/** Sortable name / pick rate / top users / detail table shared by items, abilities, and natures */
function PickTable({
  rs,
  rows,
  query,
  picks,
  detailLabel,
}: {
  rs: Ruleset;
  rows: Row[];
  query: string;
  /** Pick rates for this category, when the ruleset has a usage source */
  picks?: Map<string, PickStat>;
  detailLabel: string;
}) {
  const [sort, onSort] = useSort<Col>('rate', ['rate'], true);
  const sorted = useMemo(() => {
    const q = query.toLowerCase();
    const rate = (r: Row) => picks?.get(r.key)?.rate ?? -1;
    return rows
      .filter((r) => !query || matches(r.name, query) || r.searchText?.toLowerCase().includes(q))
      .sort((a, b) => {
        const cmp = sort.key === 'rate' ? rate(a) - rate(b) : a.name.localeCompare(b.name);
        return (sort.desc ? -cmp : cmp) || a.name.localeCompare(b.name);
      });
  }, [rows, query, picks, sort]);

  return (
    <div className={`${card} overflow-x-auto`}>
      <table className="w-full text-sm">
        <thead className="border-b border-slate-200 text-left text-xs uppercase text-slate-500 dark:border-slate-800">
          <tr>
            <SortHeader label="Name" col="name" sort={sort} onSort={onSort} />
            {picks && <SortHeader label="Pick rate" col="rate" sort={sort} onSort={onSort} className="text-right" />}
            {picks && <th className="px-2 py-1.5 font-semibold">Top users</th>}
            <th className="px-2 py-1.5 font-semibold">{detailLabel}</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => {
            const pick = picks?.get(r.key);
            return (
              <tr key={r.key} className="border-b border-slate-100 last:border-0 hover:bg-slate-50 dark:border-slate-800/60 dark:hover:bg-slate-800/40">
                <td className="whitespace-nowrap px-2 py-1.5 font-medium">
                  {r.to ? (
                    <Link to={r.to} className="hover:underline">
                      {r.name}
                    </Link>
                  ) : (
                    r.name
                  )}
                </td>
                {picks && <td className="px-2 text-right tabular-nums">{pick ? (pick.rate < 0.001 ? '<0.1%' : pct(pick.rate)) :<span className="text-slate-400">—</span>}</td>}
                {picks && (
                  <td className="px-2">
                    <div className="flex">
                      {pick?.users.map(([species, share]) => {
                        const sp = rs.getSpecies(species);
                        return (
                          <Link key={species} to={`/planner/${sp?.id ?? species}`} title={`${species}: ${pct(share)} of its sets`}>
                            <Sprite id={sp?.spriteId ?? ''} name={species} size={28} />
                          </Link>
                        );
                      })}
                    </div>
                  </td>
                )}
                <td className="px-2 py-1.5 text-xs text-slate-600 dark:text-slate-400">{r.detail}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {!sorted.length && <p className="p-6 text-center text-slate-500">Nothing matches.</p>}
    </div>
  );
}

const STAT_NAMES: Record<StatID, string> = { hp: 'HP', atk: 'Attack', def: 'Defense', spa: 'Sp. Atk spa', spd: 'Sp. Def spd', spe: 'Speed' };

interface ListProps {
  rs: Ruleset;
  query: string;
  picks?: Map<string, PickStat>;
}

export function AbilityList({ rs, query, picks }: ListProps) {
  const rows = useMemo(
    () =>
      rs.abilities().map((a): Row => ({ key: a.id, name: a.name, to: `/dex/abilities/${a.id}`, detail: a.shortDesc || '—', searchText: a.shortDesc })),
    [rs],
  );
  return <PickTable rs={rs} rows={rows} query={query} picks={picks} detailLabel="Effect" />;
}

export function ItemList({ rs, query, picks }: ListProps) {
  const rows = useMemo(
    () => rs.items().map((i): Row => ({ key: i.id, name: i.name, detail: i.shortDesc || '—', searchText: i.shortDesc })),
    [rs],
  );
  return <PickTable rs={rs} rows={rows} query={query} picks={picks} detailLabel="Effect" />;
}

export function NatureList({ rs, query, picks }: ListProps) {
  const rows = useMemo(
    () =>
      rs.natures().map((n): Row => {
        const neutral = !n.plus || !n.minus || n.plus === n.minus;
        return {
          key: n.name,
          name: n.name,
          detail: neutral ? (
            'Neutral'
          ) : (
            <span className="font-medium">
              <span className="text-green-700 dark:text-green-400">+{STAT_LABELS[n.plus!]}</span>{' '}
              <span className="text-red-700 dark:text-red-400">−{STAT_LABELS[n.minus!]}</span>
            </span>
          ),
          // "speed" or "spe" finds the Speed natures
          searchText: neutral ? 'neutral' : `${STAT_NAMES[n.plus!]} ${STAT_NAMES[n.minus!]}`,
        };
      }),
    [rs],
  );
  return <PickTable rs={rs} rows={rows} query={query} picks={picks} detailLabel="Stats" />;
}
