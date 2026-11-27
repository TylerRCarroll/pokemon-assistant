import { useEffect, useMemo, useRef, useState } from 'react';
import { card } from '../../components/ui';
import { summarize, type BattleRecord } from '../../battle/analysis';
import { BattleSession, type BattleSetup, type SideID } from '../../battle/engine';
import type { AiKind } from '../../battle/ai/players';
import { battleText } from '../../battle/log';
import { SimPool } from '../../battle/pool';
import { BattleLog, BattleView } from './BattleView';

const button =
  'rounded border border-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700 dark:hover:bg-slate-800';

const pct = (n: number) => `${Math.round(n * 100)}%`;

/** Many AI-vs-AI battles between the two teams, run in workers, with results as they come in */
export function Simulation({ setup, ai, count, onExit }: { setup: BattleSetup; ai: [AiKind, AiKind]; count: number; onExit: () => void }) {
  const [records, setRecords] = useState<(BattleRecord & { index: number })[]>([]);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string>();
  const [replay, setReplay] = useState<number>();
  const pool = useRef<SimPool>(undefined);

  useEffect(() => {
    const p = (pool.current = new SimPool());
    let live = true;
    const started = performance.now();
    p.batch(setup, count, ai, (r, index) => live && setRecords((rs) => [...rs, { ...r, index }]))
      .then(() => live && (setDone(true), console.info(`[sim] ${count} battles in ${Math.round(performance.now() - started)}ms on ${p.size} workers`)))
      .catch((e) => live && setError(String(e)));
    return () => {
      live = false;
      p.cancel();
    };
  }, [setup, ai, count]);

  const summary = useMemo(() => summarize(records), [records]);
  const shown = replay !== undefined ? records.find((r) => r.index === replay) : undefined;
  if (shown) return <Replay setup={{ ...setup, seed: shown.seed }} record={shown} onBack={() => setReplay(undefined)} />;

  const [you, them] = [setup.sides[0].name, setup.sides[1].name];
  const side = (id: SideID) => summary.mons.filter((m) => m.side === id);
  const mvp = [...side('p1')].sort((a, b) => b.kos - a.kos || b.damage - a.damage)[0];
  const threat = [...side('p2')].sort((a, b) => b.kos - a.kos || b.damage - a.damage)[0];
  // losses first, closest ones on top: those are the battles to learn from
  const listed = [...records].sort((a, b) => (a.winner === 'p2' ? 0 : 1) - (b.winner === 'p2' ? 0 : 1) || Math.abs(a.hpLeft[0] - a.hpLeft[1]) - Math.abs(b.hpLeft[0] - b.hpLeft[1]));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-2 text-2xl font-bold">Simulation</h1>
        <span className="text-sm text-slate-500">
          {you} vs {them}, {ai[0] === 'smart' ? 'Smart' : 'In-game'} AI against {ai[1] === 'smart' ? 'Smart' : 'In-game'}
        </span>
        <button className={`${button} ml-auto`} onClick={onExit}>
          New battle
        </button>
      </div>

      <div className={`${card} space-y-2 p-4`}>
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
          <span className="text-3xl font-bold tabular-nums">{records.length ? pct(summary.wins / records.length) : '…'}</span>
          <span className="text-sm text-slate-500">
            win rate over {records.length} of {count} battles{done ? '' : ' (running)'} · {summary.avgTurns} turns on average
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded bg-slate-200 dark:bg-slate-700">
          <div className="h-full bg-blue-500 transition-all" style={{ width: `${(records.length / count) * 100}%` }} />
        </div>
        {records.length > 0 && (
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {mvp && mvp.kos > 0 && (
              <>
                Your best performer: <b>{mvp.name}</b> ({mvp.kos} KOs a battle).{' '}
              </>
            )}
            {threat && threat.kos > 0 && (
              <>
                Their biggest threat: <b>{threat.name}</b> ({threat.kos} KOs a battle, {threat.damage}% damage dealt).
              </>
            )}
          </p>
        )}
        {error && <p className="text-sm text-red-700 dark:text-red-400">{error}</p>}
      </div>

      {records.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2">
          {(['p1', 'p2'] as const).map((id) => (
            <div key={id} className={`${card} overflow-x-auto p-3`}>
              <h2 className="mb-2 font-semibold">{id === 'p1' ? you : them}</h2>
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-slate-500">
                  <tr>
                    <th className="font-medium">Pokémon</th>
                    <th className="text-right font-medium" title="Foes knocked out, per battle">
                      KOs
                    </th>
                    <th className="text-right font-medium" title="Damage dealt to foes per battle, in % of their max HP">
                      Damage
                    </th>
                    <th className="text-right font-medium" title="Share of battles it fainted in">
                      Fainted
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {side(id).map((m) => (
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
          ))}
        </div>
      )}

      {records.length > 0 && (
        <div className={`${card} p-3`}>
          <h2 className="mb-2 font-semibold">Battles</h2>
          <div className="max-h-80 space-y-1 overflow-y-auto text-sm">
            {listed.map((r) => (
              <div key={r.index} className="flex items-center gap-2">
                <span className={`w-12 font-medium ${r.winner === 'p1' ? 'text-green-700 dark:text-green-400' : r.winner === 'p2' ? 'text-red-700 dark:text-red-400' : ''}`}>
                  {r.winner === 'p1' ? 'Won' : r.winner === 'p2' ? 'Lost' : 'Draw'}
                </span>
                <span className="flex-1 text-slate-600 dark:text-slate-400">
                  #{r.index + 1} · {r.turns} turns · {r.winner === 'p1' ? `${r.hpLeft[0] || '<1'}% of your HP left` : `their ${r.hpLeft[1] || '<1'}% HP left`}
                </span>
                <button className="text-blue-700 hover:underline dark:text-blue-400" onClick={() => setReplay(r.index)}>
                  Replay
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** One simulated battle, a decision at a time */
function Replay({ setup, record, onBack }: { setup: BattleSetup; record: BattleRecord; onBack: () => void }) {
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const total = record.decisions.length;
  const session = useMemo(() => BattleSession.replay(setup, record.decisions, step), [setup, record, step]);
  useEffect(() => {
    if (!playing) return;
    if (step >= total) {
      setPlaying(false);
      return;
    }
    const t = setTimeout(() => setStep((s) => s + 1), 600);
    return () => clearTimeout(t);
  }, [playing, step, total]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-2 text-2xl font-bold">Replay</h1>
        <span className="text-sm text-slate-500">
          {record.winner === 'p1' ? 'A win' : record.winner === 'p2' ? 'A loss' : 'A draw'} in {record.turns} turns · turn {session.turn}
        </span>
        <button className={`${button} ml-auto`} onClick={onBack}>
          Back to results
        </button>
      </div>
      <div className={`${card} flex flex-wrap items-center gap-2 p-3`}>
        <button className={button} onClick={() => setStep(0)} disabled={!step}>
          ⏮
        </button>
        <button className={button} onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={!step}>
          ◀
        </button>
        <button className={button} onClick={() => setPlaying(!playing)} disabled={step >= total}>
          {playing ? '❚❚' : '▶'}
        </button>
        <button className={button} onClick={() => setStep((s) => Math.min(total, s + 1))} disabled={step >= total}>
          ▶▶
        </button>
        <input type="range" min={0} max={total} value={step} onChange={(e) => setStep(Number(e.target.value))} className="min-w-40 flex-1" />
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <BattleView session={session} hidden={false} />
        <BattleLog turns={battleText(session.log())} />
      </div>
    </div>
  );
}
