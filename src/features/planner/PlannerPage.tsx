import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { SearchSelect } from '../../components/SearchSelect';
import { Sprite } from '../../components/Sprite';
import { TypeBadge } from '../../components/TypeBadge';
import { card, input, link } from '../../components/ui';
import { formatsFor } from '../../data/formats';
import { findSets, findUsage, loadFormat, parseSpread, setFromSmogon, setFromUsage, setsFromSample } from '../../lib/smogon';
import type { FormatData, Share } from '../../lib/smogonTypes';
import type { TeamSet } from '../../lib/team';
import { usePromise } from '../../lib/usePromise';
import type { Ruleset } from '../../rulesets/types';
import { useRuleset } from '../../state/ruleset';
import { useTeamsStore } from '../../state/teams';
import { formatEvs, pct } from '../../lib/format';
import { SetCard } from './SetCard';
import { ShareList } from './ShareList';

export function PlannerPage() {
  const rs = useRuleset();
  const { mon } = useParams();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const formats = formatsFor(rs.id);
  const format = formats.find((f) => f.id === params.get('format')) ?? formats[0];
  const data = usePromise(() => (format ? loadFormat(format.id) : Promise.resolve(undefined)), [format?.id]);
  const species = mon ? rs.getSpecies(mon) : undefined;

  const monOptions = useMemo(
    () =>
      Object.entries(data.data?.pokemon ?? {})
        .map(([name, u]) => ({ name, u, sp: rs.getSpecies(name) }))
        .filter((o) => o.sp)
        .map(({ u, sp }) => ({ value: sp!.id, label: sp!.name, extra: <span className="tabular-nums">{pct(u.usage)}</span> })),
    [data.data, rs],
  );

  const goTo = (id: string) => navigate(`/planner/${id}${format ? `?format=${format.id}` : ''}`);

  if (!formats.length) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Move Planner</h1>
        <p className={`${card} p-6 text-slate-600 dark:text-slate-400`}>
          Smogon doesn't publish usage stats for {rs.name}, so there's nothing to plan from yet.
          {rs.kind === 'romhack' && ' Curated sets and boss teams for romhacks are planned.'} The <Link to="/dex" className={link}>Dex</Link> and{' '}
          <Link to="/team" className={link}>Team Builder</Link> still work for this ruleset.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="mr-2 text-2xl font-bold">Move Planner</h1>
        <select value={format.id} onChange={(e) => setParams({ format: e.target.value })} className={input}>
          {formats.map((f) => (
            <option key={f.id} value={f.id}>
              {rs.name} {f.name}
            </option>
          ))}
        </select>
        <div className="w-64">
          <SearchSelect value={species?.id ?? ''} options={monOptions} onChange={(id) => id && goTo(id)} placeholder="Search Pokémon…" />
        </div>
        {data.data && (
          <span className="text-xs text-slate-500">
            {data.data.battles.toLocaleString()} battles · Smogon stats fetched {data.data.fetchedAt}
          </span>
        )}
      </div>

      {data.loading ? (
        <p className="text-slate-500">Loading {format.name} usage…</p>
      ) : !data.data ? (
        <p className={`${card} p-6 text-slate-500`}>No data for {format.id}. Run npm run fetch:smogon.</p>
      ) : mon ? (
        <MonPlan rs={rs} data={data.data} name={species?.name ?? mon} formatName={`${rs.name} ${format.name}`} onPick={goTo} />
      ) : (
        <TopUsage rs={rs} data={data.data} onPick={goTo} />
      )}
    </div>
  );
}

function TopUsage({ rs, data, onPick }: { rs: Ruleset; data: FormatData; onPick: (id: string) => void }) {
  const top = Object.entries(data.pokemon).slice(0, 60);
  return (
    <section className={`${card} p-4`}>
      <h2 className="mb-3 font-semibold">Most used</h2>
      <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-4">
        {top.map(([name, u]) => {
          const sp = rs.getSpecies(name);
          if (!sp) return null;
          return (
            <button key={name} onClick={() => onPick(sp.id)} className="flex items-center gap-2 rounded px-1 py-0.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50">
              <span className="w-6 text-right text-xs text-slate-400 tabular-nums">{u.rank}</span>
              <Sprite id={sp.spriteId} name={sp.name} size={32} />
              <span className="truncate text-sm font-medium">{sp.name}</span>
              <span className="ml-auto text-xs tabular-nums text-slate-500">{pct(u.usage)}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function MonPlan({
  rs,
  data,
  name,
  formatName,
  onPick,
}: {
  rs: Ruleset;
  data: FormatData;
  name: string;
  formatName: string;
  onPick: (id: string) => void;
}) {
  const addSet = useTeamsStore((s) => s.addSet);
  const createTeam = useTeamsStore((s) => s.createTeam);
  const [notice, setNotice] = useState<string>();
  const sp = rs.getSpecies(name);
  const usage = findUsage(data, name);
  const sets = findSets(data, name);
  const samples = data.teams.filter((t) => t.data.some((m) => rs.getSpecies(m.species)?.id === sp?.id));

  if (!sp) return <p className={`${card} p-6 text-slate-500`}>{name} isn't in {rs.name}.</p>;

  const add = (set: TeamSet) => {
    const { teamName, created } = addSet(rs.id, set);
    setNotice(created ? `Started ${teamName} with ${set.species}` : `Added ${set.species} to ${teamName}`);
  };

  const monLink = (n: string) => {
    const s = rs.getSpecies(n);
    return s ? (
      <button onClick={() => onPick(s.id)} className="flex items-center gap-1.5 hover:underline">
        <Sprite id={s.spriteId} name={s.name} size={24} />
        {s.name}
      </button>
    ) : (
      n
    );
  };
  const moveLink = (n: string) => {
    const m = rs.getMove(n);
    return m ? (
      <Link to={`/dex/moves/${m.id}`} className="hover:underline">
        {m.name}
      </Link>
    ) : (
      n
    );
  };
  const spreadShares: Share[] = (usage?.spreads ?? []).map(([s, v]) => {
    const p = parseSpread(s);
    return [p ? `${p.nature} · ${formatEvs(p.evs)}` : s, v];
  });

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center gap-4">
        <Sprite id={sp.spriteId} name={sp.name} size={80} />
        <div>
          <h2 className="text-3xl font-bold">{sp.name}</h2>
          <div className="mt-1 flex items-center gap-2">
            {sp.types.map((t) => (
              <TypeBadge key={t} type={t} />
            ))}
            {usage && (
              <span className="text-sm text-slate-500">
                #{usage.rank} in {formatName} · {pct(usage.usage)} of teams
              </span>
            )}
          </div>
          <Link to={`/dex/pokemon/${sp.id}`} className={`${link} text-xs`}>
            Dex page
          </Link>
        </div>
      </header>

      {notice && (
        <div className="flex items-center gap-3 rounded border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-900 dark:border-green-800 dark:bg-green-950 dark:text-green-200">
          {notice}.
          <Link to="/team" className="font-semibold underline">
            Open Team Builder
          </Link>
          <button onClick={() => setNotice(undefined)} className="ml-auto" aria-label="Dismiss">
            ×
          </button>
        </div>
      )}

      {!usage && (
        <p className={`${card} p-4 text-sm text-slate-500`}>
          {sp.name} is too rare in {formatName} for usage stats{Object.keys(sets).length ? ', but Smogon has sets for it below' : ''}.
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {usage && (
          <SetCard
            title="Most common choices"
            subtitle="Top moves, item, ability, and spread from usage stats"
            set={setFromUsage(rs, sp.name, usage)}
            onAdd={() => add(setFromUsage(rs, sp.name, usage))}
          />
        )}
        {Object.entries(sets).map(([setName, s]) => (
          <SetCard key={setName} title={setName} subtitle="Smogon analysis set" smogon={s} set={setFromSmogon(rs, sp.name, s)} onAdd={() => add(setFromSmogon(rs, sp.name, s))} />
        ))}
      </div>

      {usage && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <ShareList title="Moves" shares={usage.moves} render={moveLink} />
          <div className="space-y-4">
            <ShareList title="Items" shares={usage.items} />
            <ShareList title="Abilities" shares={usage.abilities} />
          </div>
          <div className="space-y-4">
            <ShareList title="Tera types" shares={usage.teraTypes} />
            <ShareList title="Spreads" shares={spreadShares} />
          </div>
          <ShareList title="Common teammates" shares={usage.teammates} render={monLink} />
          <ShareList
            title="Checks & counters"
            shares={usage.counters}
            render={monLink}
            note="How often each one KOs or forces it out when they meet"
          />
        </div>
      )}

      {samples.length > 0 && (
        <section className={`${card} p-4`}>
          <h2 className="mb-2 font-semibold">Sample teams with {sp.name}</h2>
          <ul className="divide-y divide-slate-100 dark:divide-slate-800/60">
            {samples.map((t) => (
              <li key={t.name} className="flex flex-wrap items-center gap-3 py-2">
                <div className="w-48">
                  <div className="text-sm font-medium">{t.name}</div>
                  {t.author && <div className="text-xs text-slate-500">by {t.author}</div>}
                </div>
                <div className="flex gap-1">
                  {t.data.map((m, i) => {
                    const s = rs.getSpecies(m.species);
                    return (
                      <span key={i} title={m.species}>
                        <Sprite id={s?.spriteId ?? ''} name={m.species} size={36} />
                      </span>
                    );
                  })}
                </div>
                <button
                  className="ml-auto rounded border border-slate-300 px-3 py-1 text-sm font-medium hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                  onClick={() => {
                    createTeam(rs.id, t.name, setsFromSample(rs, t));
                    setNotice(`Imported "${t.name}" as a new team`);
                  }}
                >
                  Import team
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
