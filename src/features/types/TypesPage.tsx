import { useMemo, useState } from 'react';
import { TypeBadge, typeColor } from '../../components/TypeBadge';
import { bucketProfile, defensiveProfile, typeMatrix } from '../../lib/typechart';
import { useRuleset } from '../../state/ruleset';

const CELL: Record<number, { label: string; cls: string }> = {
  0: { label: '0', cls: 'bg-slate-800 text-white' },
  0.5: { label: '½', cls: 'bg-red-200 text-red-900 dark:bg-red-900/60 dark:text-red-100' },
  2: { label: '2', cls: 'bg-green-300 text-green-950 dark:bg-green-700 dark:text-white' },
};

const BUCKETS = [
  ['quad', '4× weak'],
  ['weak', '2× weak'],
  ['resist', '½ resists'],
  ['quarter', '¼ resists'],
  ['immune', 'Immune'],
] as const;

export function TypesPage() {
  const rs = useRuleset();
  const matrix = useMemo(() => typeMatrix(rs), [rs]);
  const [picked, setPicked] = useState<string[]>(['Ground', 'Flying']);
  const valid = picked.filter((t) => rs.types.includes(t));
  const buckets = valid.length ? bucketProfile(defensiveProfile(rs, valid)) : undefined;

  const toggle = (t: string) =>
    setPicked((p) => (p.includes(t) ? p.filter((x) => x !== t) : [...p, t].slice(-2)));

  return (
    <div className="space-y-8">
      <section>
        <h1 className="mb-1 text-2xl font-bold">Type matchups</h1>
        <p className="mb-4 text-sm text-slate-500">
          {rs.name} · {rs.types.length} types. Pick one or two types to see what hits them.
        </p>
        <div className="mb-4 flex flex-wrap gap-1.5">
          {rs.types.map((t) => (
            <button
              key={t}
              onClick={() => toggle(t)}
              className={`rounded transition ${valid.includes(t) ? 'ring-2 ring-slate-900 ring-offset-2 dark:ring-white dark:ring-offset-slate-950' : 'opacity-60 hover:opacity-100'}`}
            >
              <TypeBadge type={t} />
            </button>
          ))}
        </div>
        {buckets && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {BUCKETS.map(([key, label]) => (
              <div key={key} className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
                <div className="mb-2 text-xs font-semibold uppercase text-slate-500">{label}</div>
                <div className="flex flex-wrap gap-1">
                  {buckets[key].length ? buckets[key].map((t) => <TypeBadge key={t} type={t} />) : <span className="text-sm text-slate-400">None</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-lg font-semibold">Full chart</h2>
        <p className="mb-3 text-xs text-slate-500">Rows attack, columns defend.</p>
        <div className="overflow-x-auto">
          <table className="border-collapse text-xs">
            <thead>
              <tr>
                <th className="p-1 text-right text-slate-400">ATK ↓ DEF →</th>
                {rs.types.map((d) => (
                  <th key={d} className="p-0.5">
                    <div className="w-8 rounded py-0.5 text-[10px] font-bold uppercase text-white" style={{ backgroundColor: typeColor(d) }}>
                      {d.slice(0, 3)}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rs.types.map((a) => (
                <tr key={a}>
                  <th className="p-0.5 text-right">
                    <TypeBadge type={a} />
                  </th>
                  {rs.types.map((d) => {
                    const c = CELL[matrix[a][d]];
                    return (
                      <td key={d} className={`h-7 w-8 border border-slate-100 text-center font-semibold dark:border-slate-800 ${c?.cls ?? ''}`}>
                        {c?.label ?? ''}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
