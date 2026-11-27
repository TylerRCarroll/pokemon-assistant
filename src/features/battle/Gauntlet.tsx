import { useEffect, useMemo, useState } from 'react';
import { card } from '../../components/ui';
import { summarizeGauntlet, type GauntletRun, type GauntletSetup } from '../../battle/analysis';
import type { AiKind } from '../../battle/ai/players';
import { SimPool } from '../../battle/pool';
import { Replay } from './Simulation';

const button =
  'rounded border border-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700 dark:hover:bg-slate-800';
const pct = (n: number) => `${Math.round(n * 100)}%`;

/** A gauntlet run many times: how often you clear it, where runs end, and who carries the team */
export function GauntletResults({ gauntlet, ai, count, onExit }: { gauntlet: GauntletSetup; ai: [AiKind, AiKind]; count: number; onExit: () => void }) {
  const [runs, setRuns] = useState<(GauntletRun & { index: number })[]>([]);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string>();
  const [replay, setReplay] = useState<{ run: number; fight: number }>();

  useEffect(() => {
    const pool = new SimPool();
    let live = true;
    pool
      .gauntlet(gauntlet, count, ai, (r, index) => live && setRuns((rs) => [...rs, { ...r, index }]))
      .then(() => live && setDone(true))
      .catch((e) => live && setError(String(e)));
    return () => {
      live = false;
      pool.cancel();
    };
  }, [gauntlet, ai, count]);

  const summary = useMemo(() => summarizeGauntlet(gauntlet, runs), [gauntlet, runs]);
  const shown = replay && runs.find((r) => r.index === replay.run)?.fights[replay.fight];
  if (replay && shown) {
    return <Replay title={`Replay: ${gauntlet.fights[replay.fight].name}`} setup={shown.setup} record={shown.record} onBack={() => setReplay(undefined)} />;
  }

  const n = runs.length || 1;
  // where runs end most often
  const wall = [...summary.fights].map((f, i) => ({ ...f, i })).sort((a, b) => b.lost - a.lost)[0];
  const carry = [...summary.mons].sort((a, b) => b.kos - a.kos)[0];
  const listed = [...runs].sort((a, b) => (a.lostAt ?? Infinity) - (b.lostAt ?? Infinity) || a.index - b.index);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-2 text-2xl font-bold">Gauntlet</h1>
        <span className="text-sm text-slate-500">
          {gauntlet.fights.length} fights {gauntlet.healBetween ? 'with healing between them' : 'back to back, no healing but your bag'}
        </span>
        <button className={`${button} ml-auto`} onClick={onExit}>
          New battle
        </button>
      </div>

      <div className={`${card} space-y-2 p-4`}>
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
          <span className="text-3xl font-bold tabular-nums">{runs.length ? pct(summary.cleared / n) : '…'}</span>
          <span className="text-sm text-slate-500">
            of {runs.length} of {count} runs cleared every fight{done ? '' : ' (running)'}
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded bg-slate-200 dark:bg-slate-700">
          <div className="h-full bg-blue-500 transition-all" style={{ width: `${(runs.length / count) * 100}%` }} />
        </div>
        {runs.length > 0 && (
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {wall && wall.lost > 0 && (
              <>
                Runs end most at <b>{wall.name}</b> ({pct(wall.lost / n)} of runs)
                {wall.topThreat ? (
                  <>
                    , where <b>{wall.topThreat.name}</b> does the most damage ({wall.topThreat.kos} KOs a fight)
                  </>
                ) : null}
                .{' '}
              </>
            )}
            {carry && carry.kos > 0 && (
              <>
                Carrying the team: <b>{carry.name}</b> ({carry.kos} KOs a run).
              </>
            )}
          </p>
        )}
        {error && <p className="text-sm text-red-700 dark:text-red-400">{error}</p>}
      </div>

      {runs.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2">
          <div className={`${card} p-3`}>
            <h2 className="mb-2 font-semibold">Fight by fight</h2>
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-slate-500">
                <tr>
                  <th className="font-medium">Fight</th>
                  <th className="text-right font-medium" title="Share of runs that got this far">
                    Reached
                  </th>
                  <th className="text-right font-medium" title="Share of the runs that got here that ended here">
                    Lost here
                  </th>
                  <th className="pl-2 font-medium">Their best</th>
                </tr>
              </thead>
              <tbody>
                {summary.fights.map((f, i) => (
                  <tr key={i} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="py-1">{f.name}</td>
                    <td className="text-right tabular-nums">{pct(f.reached / n)}</td>
                    <td className={`text-right tabular-nums ${f.reached && f.lost / f.reached > 0.25 ? 'font-semibold text-red-700 dark:text-red-400' : ''}`}>{f.reached ? pct(f.lost / f.reached) : '–'}</td>
                    <td className="pl-2 text-slate-600 dark:text-slate-400">{f.topThreat ? `${f.topThreat.name} (${f.topThreat.kos})` : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className={`${card} p-3`}>
            <h2 className="mb-2 font-semibold">Your team over a run</h2>
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-slate-500">
                <tr>
                  <th className="font-medium">Pokémon</th>
                  <th className="text-right font-medium" title="Foes knocked out per run">
                    KOs
                  </th>
                  <th className="text-right font-medium" title="Damage dealt per run, in % of the foes' max HP">
                    Damage
                  </th>
                  <th className="text-right font-medium" title="Share of runs it had fainted by the end">
                    Fainted
                  </th>
                </tr>
              </thead>
              <tbody>
                {summary.mons.map((m) => (
                  <tr key={m.name} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="py-1">{m.name}</td>
                    <td className="text-right tabular-nums">{m.kos.toFixed(2)}</td>
                    <td className="text-right tabular-nums">{m.damage}%</td>
                    <td className="text-right tabular-nums">{pct(m.faintRate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {runs.length > 0 && (
        <div className={`${card} p-3`}>
          <h2 className="mb-2 font-semibold">Runs</h2>
          <div className="max-h-80 space-y-1 overflow-y-auto text-sm">
            {listed.map((r) => (
              <div key={r.index} className="flex flex-wrap items-center gap-x-2">
                <span className={`w-16 font-medium ${r.lostAt === undefined ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}`}>{r.lostAt === undefined ? 'Cleared' : 'Lost'}</span>
                <span className="text-slate-600 dark:text-slate-400">#{r.index + 1}</span>
                {r.fights.map((f, i) => (
                  <button
                    key={i}
                    className={`rounded px-1.5 text-xs hover:underline ${f.record.winner === 'p1' ? 'bg-green-100 dark:bg-green-900/40' : 'bg-red-100 dark:bg-red-900/40'}`}
                    onClick={() => setReplay({ run: r.index, fight: i })}
                    title={`Replay ${gauntlet.fights[i].name}: ${f.record.turns} turns`}
                  >
                    {gauntlet.fights[i].name}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
