import { statTotal } from '../lib/format';
import type { StatsTable } from '../rulesets/types';

const LABELS: [keyof StatsTable, string][] = [
  ['hp', 'HP'],
  ['atk', 'Atk'],
  ['def', 'Def'],
  ['spa', 'SpA'],
  ['spd', 'SpD'],
  ['spe', 'Spe'],
];

// hue runs red (low) → green (high); 180+ is pinned to the top colour
const barColor = (v: number) => `hsl(${Math.min(v, 180) * 0.75} 70% 45%)`;

export function StatBars({ stats, compare }: { stats: StatsTable; compare?: StatsTable }) {
  return (
    <table className="w-full text-sm">
      <tbody>
        {LABELS.map(([key, label]) => {
          const delta = compare ? stats[key] - compare[key] : 0;
          return (
            <tr key={key}>
              <th className="w-12 py-0.5 pr-2 text-left font-medium text-slate-500">{label}</th>
              <td className="w-10 pr-2 text-right font-semibold tabular-nums">{stats[key]}</td>
              <td className="py-0.5">
                <div className="h-2.5 rounded bg-slate-100 dark:bg-slate-800">
                  <div
                    className="h-full rounded"
                    style={{ width: `${Math.min(stats[key] / 255, 1) * 100}%`, backgroundColor: barColor(stats[key]) }}
                  />
                </div>
              </td>
              {compare && (
                <td className={`w-12 pl-2 text-right text-xs tabular-nums ${delta > 0 ? 'text-green-600' : delta < 0 ? 'text-red-600' : 'text-slate-400'}`}>
                  {delta > 0 ? `+${delta}` : delta || '—'}
                </td>
              )}
            </tr>
          );
        })}
        <tr>
          <th className="pt-1 pr-2 text-left font-medium text-slate-500">Total</th>
          <td className="pt-1 pr-2 text-right font-bold tabular-nums">{statTotal(stats)}</td>
          <td />
          {compare && (
            <td className="pt-1 pl-2 text-right text-xs tabular-nums text-slate-500">
              {statTotal(stats) - statTotal(compare) || '—'}
            </td>
          )}
        </tr>
      </tbody>
    </table>
  );
}
