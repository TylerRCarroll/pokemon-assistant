import { useState } from 'react';
import { Sprite } from '../../components/Sprite';
import { counterFixes, type CounterFix, type FixKind } from '../../lib/counters';
import type { TeamSet } from '../../lib/team';
import type { LearnsetEntry, Ruleset, SpeciesInfo } from '../../rulesets/types';

const KIND_LABEL: Record<FixKind, string> = { level: 'Level up', evolve: 'Evolve', move: 'New move', item: 'Item', catch: 'New Pokémon' };

/** Learnsets for every species the advisor might change or bring in */
async function loadLearnsets(rs: Ruleset, team: TeamSet[], pool: SpeciesInfo[]) {
  const names = new Set<string>(pool.map((s) => s.name));
  for (const s of team) {
    names.add(s.species);
    for (const e of rs.getSpecies(s.species)?.evos ?? []) names.add(e);
  }
  const out = new Map<string, LearnsetEntry[]>();
  await Promise.all([...names].map(async (n) => out.set(n, await rs.learnset(n))));
  return out;
}

/** "How do I beat it?" for one boss Pokémon: single changes to the team, each damage-calced */
export function CounterPanel({
  rs,
  threat,
  threatTera,
  team,
  cap,
  trainer,
  pool,
  onOpen,
}: {
  rs: Ruleset;
  threat: TeamSet;
  threatTera?: boolean;
  /** The team at its real levels */
  team: TeamSet[];
  cap: number;
  trainer: string;
  /** Pokémon obtainable by this fight; undefined when the game's availability isn't known */
  pool?: SpeciesInfo[];
  onOpen: (member: TeamSet, threat: TeamSet, threatTera?: boolean) => void;
}) {
  const [state, setState] = useState<'idle' | 'working' | CounterFix[]>('idle');

  const run = async () => {
    setState('working');
    const learnsets = await loadLearnsets(rs, team, pool ?? []);
    // let "Working…" paint before the calc-heavy part (a second or so on a handheld)
    await new Promise((r) => setTimeout(r, 20));
    setState(counterFixes({ rs, threat, threatTera, team, cap, learnsets, pool, trainer }));
  };

  if (state === 'idle' || state === 'working') {
    return (
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
        <button
          onClick={run}
          disabled={state === 'working'}
          className="rounded bg-slate-900 px-3 py-1 font-medium text-white hover:bg-slate-700 disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-300"
        >
          {state === 'working' ? 'Working…' : `How do I beat ${threat.species}?`}
        </button>
        <span className="text-slate-500">
          Tries levels (up to {cap}), evolutions, moves, held items{pool ? ', and Pokémon you can get by now' : ''}, one change at a time.
        </span>
      </div>
    );
  }

  const works = state.filter((f) => f.checks);
  const closer = state.filter((f) => !f.checks);
  return (
    <div className="mt-3 space-y-3 text-xs">
      <div className="flex items-center gap-2">
        <h4 className="text-sm font-semibold">How to beat {threat.species}</h4>
        <button onClick={run} className="text-slate-500 hover:underline">
          Recheck
        </button>
      </div>
      {!state.length && <p className="text-slate-500">Nothing single-step gets close. It may need two changes at once, or someone the game hasn't offered yet.</p>}
      {works.length > 0 && <FixList title="Works" fixes={works} rs={rs} onOpen={(m) => onOpen(m, threat, threatTera)} />}
      {closer.length > 0 && <FixList title={works.length ? 'Gets closer' : 'Nothing checks it alone; these get closest'} fixes={closer} rs={rs} onOpen={(m) => onOpen(m, threat, threatTera)} />}
      <p className="text-slate-500">
        TMs and items can't be timed from the game data: check each "if you have it" against where you are. Levels and level-up moves stay within the cap.
      </p>
    </div>
  );
}

function FixList({ title, fixes, rs, onOpen }: { title: string; fixes: CounterFix[]; rs: Ruleset; onOpen: (m: TeamSet) => void }) {
  return (
    <div>
      <div className="mb-1 font-semibold uppercase text-slate-500">{title}</div>
      <ul className="grid gap-2 lg:grid-cols-2">
        {fixes.map((f, i) => (
          <li key={i} className="flex items-start gap-2 rounded border border-slate-200 bg-white p-2 dark:border-slate-700 dark:bg-slate-900">
            <span title={f.set.species} className="shrink-0">
              <Sprite id={rs.getSpecies(f.set.species)?.spriteId ?? ''} name={f.set.species} size={32} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2">
                <span className="font-medium">{f.title}</span>
                <span className="rounded bg-slate-100 px-1.5 text-[10px] uppercase text-slate-600 dark:bg-slate-800 dark:text-slate-400">{KIND_LABEL[f.kind]}</span>
              </div>
              <div className="text-slate-500">{f.how.join(' · ')}</div>
              <div className={f.checks ? 'text-green-700 dark:text-green-400' : 'text-slate-600 dark:text-slate-300'}>{f.result}</div>
            </div>
            <button
              onClick={() => onOpen(f.set)}
              className="shrink-0 rounded border border-slate-300 px-2 py-0.5 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
            >
              Calc
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
