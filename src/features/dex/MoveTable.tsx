import { Link } from 'react-router-dom';
import { CategoryBadge } from '../../components/MoveBits';
import { formatAccuracy, formatPower } from '../../lib/format';
import { TypeBadge } from '../../components/TypeBadge';
import type { Ruleset } from '../../rulesets/types';

export interface MoveRow {
  move: string; // id
  label?: string; // e.g. "Lv 32", "TM49"
  note?: string;
}

/** Compact move table used by learnset sections */
export function MoveTable({ rs, rows, labelHeader }: { rs: Ruleset; rows: MoveRow[]; labelHeader?: string }) {
  return (
    <table className="w-full text-sm">
      <thead className="text-left text-xs uppercase text-slate-500">
        <tr>
          {labelHeader && <th className="w-16 px-2 py-1 font-semibold">{labelHeader}</th>}
          <th className="px-2 py-1 font-semibold">Move</th>
          <th className="px-2 py-1 font-semibold">Type</th>
          <th className="px-2 py-1 font-semibold">Cat.</th>
          <th className="px-2 py-1 text-right font-semibold">Pow</th>
          <th className="px-2 py-1 text-right font-semibold">Acc</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => {
          const m = rs.getMove(r.move);
          if (!m) return null;
          return (
            <tr key={`${r.move}-${i}`} className="border-t border-slate-100 dark:border-slate-800/60">
              {labelHeader && <td className="px-2 py-1 text-xs text-slate-500 tabular-nums">{r.label}</td>}
              <td className="px-2 py-1">
                <Link to={`/dex/moves/${m.id}`} className="font-medium hover:underline">
                  {m.name}
                </Link>
                {r.note && <span className="ml-2 text-xs text-slate-400">{r.note}</span>}
              </td>
              <td className="px-2">
                <TypeBadge type={m.type} short />
              </td>
              <td className="px-2">
                <CategoryBadge category={m.category} />
              </td>
              <td className="px-2 text-right tabular-nums">{formatPower(m)}</td>
              <td className="px-2 text-right tabular-nums">{formatAccuracy(m)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
