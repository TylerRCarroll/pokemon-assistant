import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { CategoryBadge } from '../../components/MoveBits';
import { formatAccuracy, formatPower } from '../../lib/format';
import { TypeBadge } from '../../components/TypeBadge';
import { card } from '../../components/ui';
import type { MoveInfo, Ruleset } from '../../rulesets/types';
import { matches } from '../../lib/search';
import { SortHeader } from './SortHeader';
import { useSort } from './useSort';

type Col = 'name' | 'type' | 'category' | 'basePower' | 'accuracy' | 'pp';
const NUMERIC: Col[] = ['basePower', 'accuracy', 'pp'];

const value = (m: MoveInfo, col: Col): number | string =>
  col === 'accuracy' ? (m.accuracy === true ? 101 : m.accuracy) : m[col];

export function MoveList({ rs, query, type }: { rs: Ruleset; query: string; type: string }) {
  const [sort, onSort] = useSort<Col>('name', NUMERIC);

  const rows = useMemo(() => {
    const filtered = rs.moves().filter((m) => (!query || matches(m.name, query)) && (!type || m.type === type));
    return filtered.sort((a, b) => {
      const va = value(a, sort.key), vb = value(b, sort.key);
      const cmp = typeof va === 'number' ? va - (vb as number) : va.localeCompare(vb as string);
      return (sort.desc ? -cmp : cmp) || a.name.localeCompare(b.name);
    });
  }, [rs, query, type, sort]);

  return (
    <div className={`${card} overflow-x-auto`}>
      <table className="w-full text-sm">
        <thead className="border-b border-slate-200 text-left text-xs uppercase text-slate-500 dark:border-slate-800">
          <tr>
            <SortHeader label="Move" col="name" sort={sort} onSort={onSort} />
            <SortHeader label="Type" col="type" sort={sort} onSort={onSort} />
            <SortHeader label="Cat." col="category" sort={sort} onSort={onSort} />
            <SortHeader label="Pow" col="basePower" sort={sort} onSort={onSort} className="text-right" />
            <SortHeader label="Acc" col="accuracy" sort={sort} onSort={onSort} className="text-right" />
            <SortHeader label="PP" col="pp" sort={sort} onSort={onSort} className="text-right" />
            <th className="px-2 py-1.5 font-semibold">Effect</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((m) => (
            <tr key={m.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50 dark:border-slate-800/60 dark:hover:bg-slate-800/40">
              <td className="whitespace-nowrap px-2 py-1.5">
                <Link to={`/dex/moves/${m.id}`} className="font-medium hover:underline">
                  {m.name}
                </Link>
              </td>
              <td className="px-2">
                <TypeBadge type={m.type} short />
              </td>
              <td className="px-2">
                <CategoryBadge category={m.category} />
              </td>
              <td className="px-2 text-right tabular-nums">{formatPower(m)}</td>
              <td className="px-2 text-right tabular-nums">{formatAccuracy(m)}</td>
              <td className="px-2 text-right tabular-nums">{m.pp}</td>
              <td className="px-2 text-xs text-slate-600 dark:text-slate-400">{m.shortDesc}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && <p className="p-6 text-center text-slate-500">No moves match.</p>}
    </div>
  );
}
