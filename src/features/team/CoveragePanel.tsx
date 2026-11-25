import { Sprite } from '../../components/Sprite';
import { TypeBadge } from '../../components/TypeBadge';
import { card } from '../../components/ui';
import { defensiveCoverage, offensiveCoverage, teamWarnings, type Member } from '../../lib/coverage';
import type { Ruleset } from '../../rulesets/types';

function Minis({ members }: { members: Member[] }) {
  return (
    <span className="flex flex-wrap gap-0.5">
      {members.map((m, i) => (
        <span key={`${m.species.id}-${i}`} title={m.species.name}>
          <Sprite id={m.species.spriteId} name={m.species.name} size={24} />
        </span>
      ))}
    </span>
  );
}

export function CoveragePanel({ rs, members }: { rs: Ruleset; members: Member[] }) {
  if (!members.length) return null;
  const warnings = teamWarnings(rs, members);
  const defense = defensiveCoverage(rs, members);
  const offense = offensiveCoverage(rs, members);

  return (
    <div className="space-y-4">
      <section className={`${card} p-4`}>
        <h2 className="mb-2 font-semibold">Warnings</h2>
        {warnings.length ? (
          <ul className="space-y-1 text-sm">
            {warnings.map((w) => (
              <li key={w.message} className="flex gap-2">
                <span className={w.severity === 'high' ? 'text-red-600' : 'text-amber-600'}>{w.severity === 'high' ? '●' : '○'}</span>
                {w.message}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-500">No glaring holes. Nice.</p>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className={`${card} overflow-x-auto p-4`}>
          <h2 className="mb-1 font-semibold">Defensive coverage</h2>
          <p className="mb-2 text-xs text-slate-500">Who takes extra damage from each type, and who walls it. Counts immunity abilities like Levitate.</p>
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="py-1 font-semibold">Attack</th>
                <th className="py-1 font-semibold">Weak</th>
                <th className="py-1 font-semibold">Resists / immune</th>
              </tr>
            </thead>
            <tbody>
              {defense.map((row) => {
                const danger = row.weak.length >= 3 || (row.weak.length >= 2 && !row.resist.length);
                return (
                  <tr key={row.type} className={`border-t border-slate-100 dark:border-slate-800/60 ${danger ? 'bg-red-50 dark:bg-red-950/30' : ''}`}>
                    <td className="py-1 pr-2">
                      <TypeBadge type={row.type} />
                    </td>
                    <td className="py-1 pr-2">
                      <Minis members={row.weak} />
                    </td>
                    <td className="py-1">
                      <Minis members={row.resist} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>

        <section className={`${card} p-4`}>
          <h2 className="mb-1 font-semibold">Offensive coverage</h2>
          <p className="mb-3 text-xs text-slate-500">Best multiplier your damaging moves get against each type.</p>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            {offense.map((row) => (
              <div
                key={row.type}
                className={`flex items-center justify-between rounded px-2 py-1 text-sm ${
                  row.best > 1
                    ? 'bg-green-50 dark:bg-green-950/40'
                    : row.best < 1
                      ? 'bg-red-50 dark:bg-red-950/40'
                      : 'bg-slate-50 dark:bg-slate-800/50'
                }`}
                title={row.hitters.map((m) => m.species.name).join(', ') || 'No super-effective hits'}
              >
                <TypeBadge type={row.type} short />
                <span className="font-semibold tabular-nums">{row.best ? `${row.best}×` : '0×'}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
