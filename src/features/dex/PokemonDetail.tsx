import { Fragment } from 'react';
import { Link, useParams } from 'react-router-dom';
import { MatchupBuckets } from '../../components/MatchupBuckets';
import { Sprite } from '../../components/Sprite';
import { StatBars } from '../../components/StatBars';
import { TypeBadge } from '../../components/TypeBadge';
import { card, link } from '../../components/ui';
import { evolutionTree, type EvoNode } from '../../lib/evolution';
import { groupLearnset } from '../../lib/learnsets';
import { usePromise } from '../../lib/usePromise';
import type { Ruleset } from '../../rulesets/types';
import { useRuleset } from '../../state/ruleset';
import { MoveTable } from './MoveTable';

export function PokemonDetail() {
  const { id = '' } = useParams();
  const rs = useRuleset();
  const sp = rs.getSpecies(id);
  const learnset = usePromise(() => rs.learnset(id), [rs, id]);

  if (!sp) return <NotInRuleset what="That Pokémon" rs={rs} />;
  const tree = evolutionTree(rs, sp.name);

  return (
    <div className="space-y-6">
      <BackToDex />
      <header className="flex flex-wrap items-center gap-4">
        <Sprite id={sp.spriteId} name={sp.name} size={96} />
        <div>
          <div className="text-sm text-slate-500">#{sp.num}{sp.tier && rs.kind === 'official' ? ` · ${sp.tier}` : ''}</div>
          <h1 className="text-3xl font-bold">{sp.name}</h1>
          <div className="mt-1 flex gap-1">
            {sp.types.map((t) => (
              <TypeBadge key={t} type={t} />
            ))}
          </div>
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className={`${card} p-4`}>
          <h2 className="mb-2 font-semibold">Base stats</h2>
          <StatBars stats={sp.baseStats} />
        </section>
        <section className={`${card} p-4`}>
          <h2 className="mb-2 font-semibold">Abilities</h2>
          <ul className="space-y-2">
            {sp.abilities.map((name) => {
              const a = rs.getAbility(name);
              return (
                <li key={name}>
                  <Link to={`/dex/abilities/${a?.id ?? name}`} className={link}>
                    {name}
                  </Link>
                  <p className="text-sm text-slate-600 dark:text-slate-400">{a?.shortDesc}</p>
                </li>
              );
            })}
          </ul>
        </section>
      </div>

      <section>
        <h2 className="mb-2 font-semibold">Defensive matchups</h2>
        <MatchupBuckets rs={rs} types={sp.types} compact />
      </section>

      {tree && (tree.children.length > 0 || sp.prevo) && (
        <section className={`${card} p-4`}>
          <h2 className="mb-3 font-semibold">Evolution</h2>
          <EvoTree node={tree} current={sp.id} />
        </section>
      )}

      <section className={`${card} p-4`}>
        <h2 className="mb-2 font-semibold">Learnset · {rs.name}</h2>
        {learnset.loading ? (
          <p className="text-sm text-slate-500">Loading moves…</p>
        ) : !learnset.data?.length ? (
          <p className="text-sm text-slate-500">No learnset data for this Pokémon in {rs.name}.</p>
        ) : (
          <LearnsetSections rs={rs} grouped={groupLearnset(learnset.data)} />
        )}
      </section>
    </div>
  );
}

function LearnsetSections({ rs, grouped }: { rs: Ruleset; grouped: ReturnType<typeof groupLearnset> }) {
  const tmNumber = (move: string) => rs.tms?.find((t) => t.move === move)?.num;
  const prevoNote = (viaPrevo?: boolean) => (viaPrevo ? 'via pre-evolution' : undefined);
  const sections = [
    {
      title: 'Level up',
      labelHeader: 'Lv',
      rows: grouped.level.map((l) => ({ move: l.move, label: l.level <= 1 ? 'Start' : String(l.level), note: prevoNote(l.viaPrevo) })),
    },
    {
      title: 'TM / TR',
      labelHeader: rs.tms ? 'TM' : undefined,
      rows: grouped.tm
        .map((e) => ({ move: e.move, n: tmNumber(e.move), note: prevoNote(e.viaPrevo) }))
        .sort((a, b) => (a.n ?? 999) - (b.n ?? 999))
        .map(({ move, n, note }) => ({ move, note, label: n ? String(n).padStart(2, '0') : '—' })),
    },
    { title: 'Move tutor', rows: grouped.tutor.map((e) => ({ move: e.move, note: prevoNote(e.viaPrevo) })) },
    { title: 'Egg moves', rows: grouped.egg.map((e) => ({ move: e.move, note: prevoNote(e.viaPrevo) })) },
    { title: 'Event', rows: grouped.event.map((e) => ({ move: e.move })) },
  ].filter((s) => s.rows.length);

  return (
    <div className="space-y-5">
      {rs.tms && (
        <p className="text-xs text-slate-500">
          TM numbers and locations come from the {rs.name} docs; which Pokémon can use each TM still follows Gen {rs.gen} data.
        </p>
      )}
      {sections.map((s) => (
        <div key={s.title}>
          <h3 className="mb-1 text-sm font-semibold text-slate-600 dark:text-slate-300">
            {s.title} <span className="font-normal text-slate-400">({s.rows.length})</span>
          </h3>
          <div className="overflow-x-auto">
            <MoveTable rs={rs} rows={s.rows} labelHeader={s.labelHeader} />
          </div>
        </div>
      ))}
    </div>
  );
}

function EvoTree({ node, current }: { node: EvoNode; current: string }) {
  const s = node.species;
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Link
        to={`/dex/pokemon/${s.id}`}
        className={`flex flex-col items-center rounded-lg px-2 py-1 ${s.id === current ? 'bg-slate-100 ring-1 ring-slate-300 dark:bg-slate-800 dark:ring-slate-600' : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'}`}
      >
        <Sprite id={s.spriteId} name={s.name} size={56} />
        <span className="text-sm font-medium">{s.name}</span>
      </Link>
      {node.children.length > 0 && (
        <div className="flex flex-col gap-2">
          {node.children.map((child) => (
            <Fragment key={child.species.id}>
              <div className="flex items-center gap-3">
                <div className="w-32 text-center text-xs text-slate-500">
                  <div className="text-lg leading-none">→</div>
                  {child.species.evoMethod}
                </div>
                <EvoTree node={child} current={current} />
              </div>
            </Fragment>
          ))}
        </div>
      )}
    </div>
  );
}

export function BackToDex() {
  return (
    <Link to="/dex" className="text-sm text-slate-500 hover:underline">
      ← Dex
    </Link>
  );
}

export function NotInRuleset({ what, rs }: { what: string; rs: Ruleset }) {
  return (
    <div className="space-y-3">
      <BackToDex />
      <p className={`${card} p-6 text-slate-600 dark:text-slate-400`}>
        {what} isn't in {rs.name}. Switch the ruleset in the header, or pick something else from the Dex.
      </p>
    </div>
  );
}
