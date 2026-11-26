import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Sprite } from '../../components/Sprite';
import { MoveName } from '../../components/Tooltip';
import { TypeBadge } from '../../components/TypeBadge';
import { card } from '../../components/ui';
import { defensiveCoverage, offensiveCoverage, teamWarnings, type Member } from '../../lib/coverage';
import type { FormatData } from '../../lib/smogonTypes';
import { suggestSwaps, tipFor, type Swap, type Tip } from '../../lib/teamAdvice';
import type { TeamSet } from '../../lib/team';
import type { LearnsetEntry, Ruleset } from '../../rulesets/types';

const button =
  'rounded border border-slate-300 px-2 py-0.5 text-xs font-medium hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800';

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

function TipLine({ rs, tip }: { rs: Ruleset; tip: Tip }) {
  return (
    <div className="ml-5 mt-0.5 text-xs text-slate-600 dark:text-slate-400">
      {tip.moves?.map((t) => (
        <div key={`${t.member.species.id}-${t.move.id}`} className="flex flex-wrap items-center gap-1">
          <span className="text-slate-400">Fix:</span> teach {t.member.species.name}
          <MoveName rs={rs} name={t.move.name}>
            <span className="font-medium text-slate-800 underline decoration-dotted dark:text-slate-200">{t.move.name}</span>
          </MoveName>
          <TypeBadge type={t.move.type} short />
          {t.hits.length > 0 && <span>to hit {t.hits.join(', ')}</span>}
        </div>
      ))}
      {tip.text}
    </div>
  );
}

function SwapCard({ rs, swap, onSwap }: { rs: Ruleset; swap: Swap; onSwap: () => void }) {
  return (
    <li className="rounded border border-slate-200 p-2.5 dark:border-slate-800">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Sprite id={swap.out.species.spriteId} name={swap.out.species.name} size={32} />
        <span className="text-slate-500 line-through">{swap.out.species.name}</span>
        <span className="text-slate-400">→</span>
        <Sprite id={swap.incoming.spriteId} name={swap.incoming.name} size={32} />
        <Link to={`/dex/pokemon/${swap.incoming.id}`} className="font-semibold hover:underline">
          {swap.incoming.name}
        </Link>
        <span className="flex gap-1">
          {swap.incoming.types.map((t) => (
            <TypeBadge key={t} type={t} short />
          ))}
        </span>
        <span className="ml-auto flex gap-1.5">
          <Link to={`/planner/${swap.incoming.id}`} className={button}>
            Sets
          </Link>
          <button className={button} onClick={onSwap}>
            Swap in
          </button>
        </span>
      </div>
      <ul className="mt-1 list-inside list-disc text-xs text-slate-600 dark:text-slate-400">
        {swap.fixes.map((f) => (
          <li key={f}>{f}</li>
        ))}
        {swap.outReasons.length > 0 && (
          <li>
            Why {swap.out.species.name}: {swap.outReasons.join('; ')}
          </li>
        )}
        {rs.kind === 'romhack' && <li className="text-slate-400">Check it&apos;s obtainable at your point in the game.</li>}
      </ul>
    </li>
  );
}

export function CoveragePanel({
  rs,
  members,
  learnsetOf,
  meta,
  onSwap,
  undo,
}: {
  rs: Ruleset;
  members: Member[];
  learnsetOf: (m: Member) => LearnsetEntry[] | undefined;
  /** Usage stats for the ruleset's main format, to favour meta-relevant swaps */
  meta?: FormatData;
  onSwap: (out: Member, set: TeamSet) => void;
  /** Shown after a swap so it can be reverted */
  undo?: { label: string; run: () => void };
}) {
  const warnings = useMemo(() => teamWarnings(rs, members), [rs, members]);
  const swaps = useMemo(
    () => (warnings.some((w) => w.issue.kind !== 'duplicateItem') ? suggestSwaps(rs, members, meta) : []),
    [rs, members, meta, warnings],
  );
  if (!members.length) return null;
  const defense = defensiveCoverage(rs, members);
  const offense = offensiveCoverage(rs, members);

  return (
    <div className="space-y-4">
      <section className={`${card} p-4`}>
        <h2 className="mb-2 font-semibold">Warnings</h2>
        {warnings.length ? (
          <ul className="space-y-1 text-sm">
            {warnings.map((w) => (
              <li key={w.message}>
                <div className="flex gap-2">
                  <span className={w.severity === 'high' ? 'text-red-600' : 'text-amber-600'}>{w.severity === 'high' ? '●' : '○'}</span>
                  {w.message}
                </div>
                <TipLine rs={rs} tip={tipFor(rs, w.issue, members, learnsetOf)} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-500">No glaring holes. Nice.</p>
        )}
        {undo && (
          <p className="mt-2 text-xs text-slate-500">
            {undo.label}{' '}
            <button className={button} onClick={undo.run}>
              Undo
            </button>
          </p>
        )}
      </section>

      {swaps.length > 0 && (
        <section className={`${card} p-4`}>
          <h2 className="font-semibold">Suggested swaps</h2>
          <p className="mb-2 text-xs text-slate-500">
            Replacements that fix the most warnings, weighed against what you&apos;d lose.{' '}
            {meta ? 'Drawn from the most-used Pokémon in the format.' : 'Drawn from fully evolved, non-legendary Pokémon.'}
          </p>
          <ul className="space-y-2">
            {swaps.map((s) => (
              <SwapCard key={`${s.out.species.id}-${s.incoming.id}`} rs={rs} swap={s} onSwap={() => onSwap(s.out, s.set)} />
            ))}
          </ul>
        </section>
      )}

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
