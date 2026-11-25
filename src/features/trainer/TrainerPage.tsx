import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Sprite } from '../../components/Sprite';
import { TypeBadge } from '../../components/TypeBadge';
import { card, input } from '../../components/ui';
import { formatsFor } from '../../data/formats';
import { availableKinds, buildPool, buildQuestion, GENERATORS, keysByKind, type Question, type QuizContext } from '../../lib/quiz';
import { loadFormat } from '../../lib/smogon';
import { dueCount, pickNext } from '../../lib/srs';
import { usePromise } from '../../lib/usePromise';
import type { Ruleset } from '../../rulesets/types';
import { useRuleset } from '../../state/ruleset';
import { progressFor, useQuizStore } from '../../state/quiz';

const button =
  'rounded border border-slate-300 px-3 py-1 text-sm font-medium hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800';

export function TrainerPage() {
  const rs = useRuleset();
  const [params, setParams] = useSearchParams();
  const formats = formatsFor(rs.id);
  const format = formats.find((f) => f.id === params.get('format')) ?? formats[0];
  const meta = usePromise(() => (format ? loadFormat(format.id) : Promise.resolve(undefined)), [format?.id]);

  const ctx = useMemo<QuizContext | undefined>(
    () => (meta.loading ? undefined : { rs, meta: meta.data, pool: buildPool(rs, meta.data), formatName: format && `${rs.name} ${format.name}` }),
    [rs, meta.loading, meta.data, format],
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="mr-2 text-2xl font-bold">Matchup Trainer</h1>
        {formats.length > 1 && (
          <label className="flex items-center gap-1.5 text-sm">
            <span className="text-slate-500">Meta from</span>
            <select value={format?.id} onChange={(e) => setParams({ format: e.target.value })} className={input}>
              {formats.map((f) => (
                <option key={f.id} value={f.id}>
                  {rs.name} {f.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {ctx ? <Quiz key={`${rs.id}-${format?.id}`} ctx={ctx} /> : <p className="text-slate-500">Loading…</p>}
    </div>
  );
}

function Quiz({ ctx }: { ctx: QuizContext }) {
  const { rs } = ctx;
  const byRuleset = useQuizStore((s) => s.byRuleset);
  const { grade, toggleKind, reset } = useQuizStore();
  const progress = progressFor(byRuleset, rs.id);

  const kinds = useMemo(() => availableKinds(ctx), [ctx]);
  const enabled = kinds.filter((k) => !progress.disabled.includes(k));
  const enabledKey = enabled.join(',');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const topics = useMemo(() => keysByKind(ctx, enabled), [ctx, enabledKey]);
  const pool = useMemo(() => topics.flat(), [topics]);
  const poolSet = useMemo(() => new Set(pool), [pool]);

  const [question, setQuestion] = useState<Question>();
  const [picked, setPicked] = useState<string>();
  const [confirmReset, setConfirmReset] = useState(false);

  const next = useCallback(
    (avoid?: string) => {
      const cards = progressFor(useQuizStore.getState().byRuleset, rs.id).cards;
      // a key can fail to build (data changed since it was seen); try a few before giving up
      for (let tries = 0; tries < 10; tries++) {
        const key = pickNext(cards, topics, Date.now(), Math.random, avoid);
        const q = key && buildQuestion(ctx, key);
        if (q) {
          setQuestion(q);
          setPicked(undefined);
          return;
        }
        avoid = key;
      }
      setQuestion(undefined);
    },
    [ctx, topics, rs.id],
  );

  useEffect(() => next(), [next]);

  const answer = useCallback(
    (choice: string) => {
      if (!question || picked) return;
      setPicked(choice);
      grade(rs.id, question.key, choice === question.answer);
    },
    [question, picked, grade, rs.id],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      const n = Number(e.key);
      if (question && !picked && n >= 1 && n <= question.choices.length) answer(question.choices[n - 1]);
      else if (picked && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        next(question?.key);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [question, picked, answer, next]);

  const accuracy = progress.answered ? Math.round((progress.correct / progress.answered) * 100) : 0;
  const seen = Object.keys(progress.cards).filter((k) => poolSet.has(k)).length;
  const due = dueCount(progress.cards, poolSet, Date.now());

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_16rem]">
      <div className="space-y-3">
        {question ? (
          <QuestionCard rs={rs} q={question} picked={picked} onAnswer={answer} />
        ) : (
          <p className={`${card} p-6 text-slate-500`}>No questions for the selected topics. Turn some on at the right.</p>
        )}
        {picked && question && (
          <div
            className={`${card} border-l-4 p-4 ${picked === question.answer ? 'border-l-green-500' : 'border-l-red-500'}`}
          >
            <p className="font-semibold">{picked === question.answer ? 'Correct!' : `Not quite. The answer is ${question.answer}.`}</p>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{question.explanation}</p>
            {question.related && <RelatedSpecies rs={rs} {...question.related} />}
            <button className={`${button} mt-3`} onClick={() => next(question.key)} autoFocus>
              Next question <span className="text-xs text-slate-400">(Enter)</span>
            </button>
          </div>
        )}
      </div>

      <aside className="space-y-4">
        <section className={`${card} grid grid-cols-2 gap-3 p-4 text-center`}>
          {[
            ['Streak', progress.streak, `best ${progress.best}`],
            ['Accuracy', progress.answered ? `${accuracy}%` : '—', `${progress.answered} answered`],
            ['Due now', due, 'reviews'],
            ['Learned', seen, `of ${pool.length}`],
          ].map(([label, value, sub]) => (
            <div key={label as string}>
              <div className="text-xs uppercase text-slate-500">{label}</div>
              <div className="text-2xl font-bold tabular-nums">{value}</div>
              <div className="text-xs text-slate-400">{sub}</div>
            </div>
          ))}
        </section>

        <section className={`${card} p-4`}>
          <h2 className="mb-2 text-sm font-semibold">Topics</h2>
          <div className="space-y-1 text-sm">
            {kinds.map((k) => (
              <label key={k} className="flex items-center gap-2">
                <input type="checkbox" checked={!progress.disabled.includes(k)} onChange={() => toggleKind(rs.id, k)} />
                {GENERATORS[k].label}
              </label>
            ))}
          </div>
          <p className="mt-3 text-xs text-slate-500">
            Misses come back in a minute; right answers return after 10 minutes, then a day, then further apart. Progress is saved per ruleset.
          </p>
        </section>

        <section className="text-sm">
          {confirmReset ? (
            <div className="flex flex-wrap items-center gap-2">
              <span>Reset {rs.name} progress?</span>
              <button
                className={`${button} border-red-400 text-red-700 dark:text-red-400`}
                onClick={() => {
                  reset(rs.id);
                  setConfirmReset(false);
                  next();
                }}
              >
                Reset
              </button>
              <button className={button} onClick={() => setConfirmReset(false)}>
                Cancel
              </button>
            </div>
          ) : (
            <button className="text-slate-500 hover:underline" onClick={() => setConfirmReset(true)}>
              Reset progress
            </button>
          )}
        </section>
      </aside>
    </div>
  );
}

function RelatedSpecies({ rs, label, species }: { rs: Ruleset; label: string; species: string[] }) {
  return (
    <div className="mt-3">
      <h3 className="mb-1.5 text-xs font-semibold uppercase text-slate-500">
        {label} ({species.length})
      </h3>
      <div className="flex max-h-64 flex-wrap gap-1.5 overflow-y-auto">
        {species.map((name) => {
          const sp = rs.getSpecies(name);
          return (
            <Link
              key={name}
              to={`/dex/pokemon/${sp?.id ?? name}`}
              className="flex items-center gap-1 rounded border border-slate-200 py-0.5 pl-0.5 pr-2 text-xs hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
            >
              <Sprite id={sp?.spriteId ?? ''} name={name} size={24} />
              {name}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function QuestionCard({ rs, q, picked, onAnswer }: { rs: Ruleset; q: Question; picked?: string; onAnswer: (c: string) => void }) {
  const sp = q.species ? rs.getSpecies(q.species) : undefined;
  return (
    <section className={`${card} p-5`}>
      <div className="mb-1 text-xs font-semibold uppercase text-slate-400">{GENERATORS[q.kind].label}</div>
      <div className="flex items-center gap-4">
        {sp && <Sprite id={sp.spriteId} name={sp.name} size={72} />}
        <div>
          <h2 className="text-xl font-semibold">{q.prompt}</h2>
          {q.kind === 'effectiveness' && q.types && (
            <div className="mt-2 flex items-center gap-2">
              <TypeBadge type={q.types[0]} />
              <span className="text-slate-400">→</span>
              {q.types.slice(1).map((t) => (
                <TypeBadge key={t} type={t} />
              ))}
            </div>
          )}
        </div>
      </div>

      <div className={`mt-4 grid gap-2 ${q.choiceKind === 'text' ? '' : 'sm:grid-cols-2'}`}>
        {q.choices.map((c, i) => {
          const state = !picked ? 'idle' : c === q.answer ? 'right' : c === picked ? 'wrong' : 'other';
          const style = {
            idle: 'border-slate-300 hover:border-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800',
            right: 'border-green-500 bg-green-50 dark:bg-green-950/50',
            wrong: 'border-red-500 bg-red-50 dark:bg-red-950/50',
            other: 'border-slate-200 opacity-60 dark:border-slate-800',
          }[state];
          return (
            <button
              key={c}
              onClick={() => onAnswer(c)}
              disabled={!!picked}
              className={`flex items-center gap-3 rounded-lg border-2 px-3 py-2 text-left ${style}`}
            >
              <span className="w-4 text-xs text-slate-400">{i + 1}</span>
              <Choice rs={rs} kind={q.choiceKind} value={c} />
            </button>
          );
        })}
      </div>
    </section>
  );
}

function Choice({ rs, kind, value }: { rs: Ruleset; kind: Question['choiceKind']; value: string }) {
  switch (kind) {
    case 'type':
      return <TypeBadge type={value} />;
    case 'typing':
      return (
        <span className="flex gap-1">
          {value.split('/').map((t) => (
            <TypeBadge key={t} type={t} />
          ))}
        </span>
      );
    case 'multiplier':
      return <span className="text-lg font-bold tabular-nums">{value}</span>;
    case 'species': {
      const sp = rs.getSpecies(value);
      return (
        <span className="flex items-center gap-2">
          <Sprite id={sp?.spriteId ?? ''} name={value} size={36} />
          <span className="font-medium">{value}</span>
        </span>
      );
    }
    default:
      return <span className="text-sm">{value}</span>;
  }
}
