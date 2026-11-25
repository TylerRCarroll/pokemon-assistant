import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Sprite } from '../../components/Sprite';
import { statTotal } from '../../lib/format';
import { TypeBadge } from '../../components/TypeBadge';
import { card } from '../../components/ui';
import type { Ruleset, SpeciesInfo } from '../../rulesets/types';
import { matches } from '../../lib/search';
import { SortHeader } from './SortHeader';
import { useSort } from './useSort';

const STATS = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'] as const;
const STAT_LABEL = { hp: 'HP', atk: 'Atk', def: 'Def', spa: 'SpA', spd: 'SpD', spe: 'Spe' };
type Col = 'num' | 'name' | 'bst' | (typeof STATS)[number];
const NUMERIC: Col[] = ['bst', ...STATS];

const value = (s: SpeciesInfo, col: Col): number | string =>
  col === 'num' ? s.num : col === 'name' ? s.name : col === 'bst' ? statTotal(s.baseStats) : s.baseStats[col];

export function PokemonList({ rs, query, type }: { rs: Ruleset; query: string; type: string }) {
  const [sort, onSort] = useSort<Col>('num', NUMERIC);

  const rows = useMemo(() => {
    const filtered = rs
      .species()
      .filter((s) => (!query || matches(s.name, query)) && (!type || s.types.includes(type)));
    return filtered.sort((a, b) => {
      const va = value(a, sort.key), vb = value(b, sort.key);
      const cmp = typeof va === 'number' ? va - (vb as number) : va.localeCompare(vb as string);
      return (sort.desc ? -cmp : cmp) || a.num - b.num;
    });
  }, [rs, query, type, sort]);

  return (
    <div className={`${card} overflow-x-auto`}>
      <table className="w-full text-sm">
        <thead className="border-b border-slate-200 text-left text-xs uppercase text-slate-500 dark:border-slate-800">
          <tr>
            <SortHeader label="#" col="num" sort={sort} onSort={onSort} />
            <SortHeader label="Pokémon" col="name" sort={sort} onSort={onSort} />
            <th className="px-2 py-1.5 font-semibold">Types</th>
            <th className="px-2 py-1.5 font-semibold">Abilities</th>
            {STATS.map((k) => (
              <SortHeader key={k} label={STAT_LABEL[k]} col={k} sort={sort} onSort={onSort} className="text-right" />
            ))}
            <SortHeader label="BST" col="bst" sort={sort} onSort={onSort} className="text-right" />
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => (
            <tr key={s.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50 dark:border-slate-800/60 dark:hover:bg-slate-800/40">
              <td className="px-2 text-slate-400 tabular-nums">{s.num}</td>
              <td className="px-2 py-0.5">
                <Link to={`/dex/pokemon/${s.id}`} className="flex items-center gap-2 font-medium hover:underline">
                  <Sprite id={s.spriteId} name={s.name} size={36} />
                  {s.name}
                </Link>
              </td>
              <td className="px-2">
                <div className="flex gap-1">
                  {s.types.map((t) => (
                    <TypeBadge key={t} type={t} short />
                  ))}
                </div>
              </td>
              <td className="px-2 text-xs text-slate-600 dark:text-slate-400">{s.abilities.join(' / ')}</td>
              {STATS.map((k) => (
                <td key={k} className="px-2 text-right tabular-nums">
                  {s.baseStats[k]}
                </td>
              ))}
              <td className="px-2 text-right font-semibold tabular-nums">{statTotal(s.baseStats)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && <p className="p-6 text-center text-slate-500">No Pokémon match.</p>}
    </div>
  );
}
