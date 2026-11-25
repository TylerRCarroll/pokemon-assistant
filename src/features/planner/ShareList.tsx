import type { ReactNode } from 'react';
import { card } from '../../components/ui';
import { pct } from '../../lib/format';
import type { Share } from '../../lib/smogonTypes';

/** A titled list of name + share bars, e.g. "Moves: Earthquake 94%" */
export function ShareList({
  title,
  shares,
  render,
  note,
}: {
  title: string;
  shares: Share[];
  render?: (name: string) => ReactNode;
  note?: string;
}) {
  if (!shares.length) return null;
  return (
    <section className={`${card} p-4`}>
      <h2 className="mb-2 font-semibold">{title}</h2>
      {note && <p className="-mt-1 mb-2 text-xs text-slate-500">{note}</p>}
      <ul className="space-y-1">
        {shares.map(([name, share]) => (
          <li key={name} className="relative overflow-hidden rounded px-2 py-0.5 text-sm">
            <div className="absolute inset-y-0 left-0 bg-blue-100 dark:bg-blue-950/60" style={{ width: `${Math.min(share, 1) * 100}%` }} />
            <div className="relative flex items-center justify-between gap-2">
              <span className="truncate">{render ? render(name) : name}</span>
              <span className="shrink-0 tabular-nums text-slate-600 dark:text-slate-300">{pct(share)}</span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
