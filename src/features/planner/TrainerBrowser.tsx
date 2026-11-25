import { Fragment, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Sprite } from '../../components/Sprite';
import { ItemName, MoveName } from '../../components/Tooltip';
import { card, input, link } from '../../components/ui';
import { matches } from '../../lib/search';
import { groupBySplit, trainerName } from '../../lib/trainers';
import type { Ruleset, TrainerInfo } from '../../rulesets/types';

/** Romhack trainer battles by split, for rulesets that have trainer data instead of usage stats */
export function TrainerBrowser({ rs, trainers }: { rs: Ruleset; trainers: TrainerInfo[] }) {
  const [bossesOnly, setBossesOnly] = useState(true);
  const [query, setQuery] = useState('');
  const groups = useMemo(
    () =>
      groupBySplit(
        trainers.filter(
          (t) =>
            (!bossesOnly || t.boss) &&
            (!query || matches(t.name, query) || matches(t.location, query) || t.team.some((m) => matches(m.species, query))),
        ),
      ),
    [trainers, bossesOnly, query],
  );

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600 dark:text-slate-400">
        {rs.name} has no Smogon usage stats, so this shows the game's own trainer teams from the hack's documentation. Check any of them against your
        team in <Link to="/calc?tab=threats" className={link}>Threats</Link>.
      </p>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Trainer, place, or Pokémon…" className={`${input} w-64`} />
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={bossesOnly} onChange={(e) => setBossesOnly(e.target.checked)} />
          Bosses only (gym leaders, rivals, Galactic, Elite Four, Champion)
        </label>
      </div>

      {groups.map((g) => (
        <section key={g.split} className="space-y-2">
          <h2 className="text-lg font-semibold">
            {g.split}
            {g.levelCap && <span className="ml-2 text-sm font-normal text-slate-500">level cap {g.levelCap}</span>}
          </h2>
          <div className="grid gap-3 lg:grid-cols-2">
            {g.trainers.map((t) => (
              <TrainerCard key={`${t.id}-${t.name}-${t.location}`} rs={rs} trainer={t} />
            ))}
          </div>
        </section>
      ))}
      {!groups.length && <p className={`${card} p-6 text-slate-500`}>No trainers match.</p>}
    </div>
  );
}

function TrainerCard({ rs, trainer: t }: { rs: Ruleset; trainer: TrainerInfo }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`${card} p-3`}>
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="font-semibold">{trainerName(t)}</div>
          <div className="text-xs text-slate-500">
            {t.location}
            {t.notes.length > 0 && ` · ${t.notes.join(' · ')}`}
          </div>
        </div>
        <Link
          to={`/calc?tab=threats&trainer=${t.id}`}
          className="rounded border border-slate-300 px-2 py-0.5 text-xs font-medium hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
        >
          Check vs my team
        </Link>
      </div>
      <button onClick={() => setOpen(!open)} className="mt-2 flex flex-wrap gap-1 text-left" title={open ? 'Hide sets' : 'Show sets'}>
        {t.team.map((m, i) => {
          const sp = rs.getSpecies(m.species);
          return (
            <span key={i} className="flex flex-col items-center text-[10px] text-slate-500">
              <Sprite id={sp?.spriteId ?? ''} name={m.species} size={40} />
              Lv{m.level}
            </span>
          );
        })}
      </button>
      {open && (
        <ul className="mt-2 space-y-1.5 text-xs">
          {t.team.map((m, i) => (
            <li key={i}>
              <span className="font-semibold">
                {m.species} Lv{m.level}
              </span>
              {m.item && (
                <>
                  {' @ '}
                  <ItemName rs={rs} name={m.item} />
                </>
              )}{' '}
              · {m.ability} · {m.nature} · {m.ivs} IVs
              <div className="text-slate-500">
                {m.moves.map((mv, j) => (
                  <Fragment key={j}>
                    {j > 0 && ' / '}
                    <MoveName rs={rs} name={mv} />
                  </Fragment>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
