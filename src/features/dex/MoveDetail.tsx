import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CategoryBadge } from '../../components/MoveBits';
import { formatAccuracy, formatPower } from '../../lib/format';
import { Sprite } from '../../components/Sprite';
import { TypeBadge } from '../../components/TypeBadge';
import { card } from '../../components/ui';
import { findLearners, methodLabel } from '../../lib/learnsets';
import { usePromise } from '../../lib/usePromise';
import { useRuleset } from '../../state/ruleset';
import { BackToDex, NotInRuleset } from './PokemonDetail';

export function MoveDetail() {
  const { id = '' } = useParams();
  const rs = useRuleset();
  const move = rs.getMove(id);
  const learners = usePromise(() => (move ? findLearners(rs, move.id) : Promise.resolve([])), [rs, move?.id]);
  const sorted = useMemo(
    () => [...(learners.data ?? [])].sort((a, b) => a.species.num - b.species.num || a.species.name.localeCompare(b.species.name)),
    [learners.data],
  );

  if (!move) return <NotInRuleset what="That move" rs={rs} />;
  const tm = rs.tms?.find((t) => t.move === move.id);
  const assumed = (move as { assumed?: string[] }).assumed;

  const facts = [
    ['Power', formatPower(move)],
    ['Accuracy', formatAccuracy(move)],
    ['PP', String(move.pp)],
    ['Priority', move.priority > 0 ? `+${move.priority}` : String(move.priority)],
    ...(move.flags?.contact ? [['Contact', 'Yes']] : []),
  ];

  return (
    <div className="space-y-6">
      <BackToDex />
      <header>
        <h1 className="text-3xl font-bold">{move.name}</h1>
        <div className="mt-1 flex items-center gap-2">
          <TypeBadge type={move.type} />
          <CategoryBadge category={move.category} />
        </div>
      </header>

      <section className={`${card} p-4`}>
        <dl className="mb-3 flex flex-wrap gap-x-8 gap-y-2">
          {facts.map(([k, v]) => (
            <div key={k}>
              <dt className="text-xs uppercase text-slate-500">{k}</dt>
              <dd className="text-lg font-semibold tabular-nums">{v}</dd>
            </div>
          ))}
        </dl>
        <p className="text-sm">{move.desc || move.shortDesc}</p>
        {tm && (
          <p className="mt-3 text-sm">
            <span className="font-semibold">TM{String(tm.num).padStart(2, '0')}</span> in {rs.name}: {tm.location}
          </p>
        )}
        {assumed?.length ? (
          <p className="mt-3 text-xs text-amber-700 dark:text-amber-400">
            {rs.name}-only move. Assumed, not confirmed from the docs: {assumed.join(', ')}.
          </p>
        ) : null}
      </section>

      <section className={`${card} p-4`}>
        <h2 className="mb-2 font-semibold">
          Learned by {!learners.loading && <span className="font-normal text-slate-400">({sorted.length})</span>}
        </h2>
        {learners.loading ? (
          <p className="text-sm text-slate-500">Scanning every learnset in {rs.name}…</p>
        ) : !sorted.length ? (
          <p className="text-sm text-slate-500">
            {assumed ? `No learnset data for ${rs.name}-only moves yet.` : `Nothing learns this move in ${rs.name}.`}
          </p>
        ) : (
          <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
            {sorted.map(({ species: s, methods, viaPrevo }) => (
              <Link
                key={s.id}
                to={`/dex/pokemon/${s.id}`}
                className="flex items-center gap-2 rounded px-1 py-0.5 hover:bg-slate-50 dark:hover:bg-slate-800/50"
              >
                <Sprite id={s.spriteId} name={s.name} size={32} />
                <span className="text-sm font-medium">{s.name}</span>
                <span className="ml-auto text-xs text-slate-500">
                  {methods.map(methodLabel).join(', ')}
                  {viaPrevo && ' (prevo)'}
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
