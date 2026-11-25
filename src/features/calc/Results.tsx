import { useState } from 'react';
import { CategoryBadge } from '../../components/MoveBits';
import { TypeBadge } from '../../components/TypeBadge';
import { card } from '../../components/ui';
import type { MoveResult } from '../../lib/calc';

const barColor = (pct: number) => (pct >= 100 ? 'bg-red-500' : pct >= 50 ? 'bg-amber-500' : 'bg-green-500');

/** One attack direction: each damaging move with its % range and KO odds */
export function Results({ title, results }: { title: string; results: MoveResult[] }) {
  const [open, setOpen] = useState<string>();
  return (
    <section className={`${card} p-4`}>
      <h3 className="mb-2 font-semibold">{title}</h3>
      {!results.length ? (
        <p className="text-sm text-slate-500">No damaging moves.</p>
      ) : (
        <ul className="space-y-2">
          {results.map((r) => (
            <li key={r.move}>
              <button className="w-full text-left" onClick={() => setOpen(open === r.move ? undefined : r.move)}>
                <div className="flex items-center gap-2 text-sm">
                  <span className="w-36 truncate font-medium">{r.move}</span>
                  <TypeBadge type={r.type} short />
                  <CategoryBadge category={r.category} />
                  <span className="ml-auto tabular-nums">
                    {r.minPct}–{r.maxPct}%
                  </span>
                </div>
                <div className="relative mt-1 h-2 rounded bg-slate-100 dark:bg-slate-800">
                  <div className={`absolute inset-y-0 left-0 rounded opacity-40 ${barColor(r.maxPct)}`} style={{ width: `${Math.min(r.maxPct, 100)}%` }} />
                  <div className={`absolute inset-y-0 left-0 rounded ${barColor(r.minPct)}`} style={{ width: `${Math.min(r.minPct, 100)}%` }} />
                </div>
                <div className="mt-0.5 text-xs text-slate-500">{r.koText}</div>
              </button>
              {open === r.move && <p className="mt-1 rounded bg-slate-50 p-2 text-xs dark:bg-slate-800/60">{r.desc}</p>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
