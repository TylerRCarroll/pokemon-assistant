import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { card, input, link } from '../../components/ui';
import { bagItem, bagItemsFor, type BagItemId } from '../../battle/bag';
import { describeAction, BattleSession, newSeed, type Action, type Bag, type BattleSetup } from '../../battle/engine';
import { aiDecision, player, type AiKind } from '../../battle/ai/players';
import { hit } from '../../battle/ai/view';
import { battleText } from '../../battle/log';
import { revealed } from '../../battle/reveal';
import { gamesFor } from '../../data/games';
import type { TeamSet } from '../../lib/team';
import { groupBySplit, setFromTrainerMon, trainerDetails, trainerName } from '../../lib/trainers';
import { usePromise } from '../../lib/usePromise';
import { usePlaythrough } from '../../state/playthrough';
import { useRuleset } from '../../state/ruleset';
import { useTeamsStore } from '../../state/teams';
import { BattleView } from './BattleView';

const button =
  'rounded border border-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700 dark:hover:bg-slate-800';
const primary = 'rounded bg-blue-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-40';

type Mode = 'play' | 'watch';
const AI_LABEL: Record<Exclude<AiKind, 'random'>, string> = { ingame: 'In-game', smart: 'Smart' };

interface Config {
  setup: BattleSetup;
  mode: Mode;
  /** AI for the opponent, and for you in Watch mode */
  ai: [Exclude<AiKind, 'random'>, Exclude<AiKind, 'random'>];
  hidden: boolean;
}

export function BattlePage() {
  const [config, setConfig] = useState<Config>();
  return config ? <Battle key={JSON.stringify(config.setup.seed)} config={config} onExit={() => setConfig(undefined)} /> : <Setup onStart={setConfig} />;
}

// ---------------------------------------------------------------------------------------------
// Setup

function BagEditor({ gen, bag, onChange }: { gen: number; bag: Bag; onChange: (b: Bag) => void }) {
  const total = Object.values(bag).reduce((a, n) => a + (n ?? 0), 0);
  return (
    <details className="text-sm">
      <summary className="cursor-pointer text-slate-600 dark:text-slate-400">Bag ({total ? `${total} item${total > 1 ? 's' : ''}` : 'empty'})</summary>
      <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
        {bagItemsFor(gen).map((item) => (
          <label key={item.id} className="flex items-center justify-between gap-2" title={item.shortDesc(gen)}>
            <span>{item.name}</span>
            <input
              type="number"
              min={0}
              max={99}
              value={bag[item.id] ?? 0}
              onChange={(e) => onChange({ ...bag, [item.id]: Math.max(0, Number(e.target.value) || 0) })}
              className={`${input} w-16 py-0.5`}
            />
          </label>
        ))}
      </div>
    </details>
  );
}

function Setup({ onStart }: { onStart: (c: Config) => void }) {
  const rs = useRuleset();
  const [params] = useSearchParams();
  const prefs = usePlaythrough(rs);
  const game = gamesFor(rs.id).find((g) => g.id === prefs?.game);
  const playing = prefs?.mode === 'playthrough';

  const allTeams = useTeamsStore((s) => s.teams);
  const activeId = useTeamsStore((s) => s.activeByRuleset[rs.id]);
  const teams = useMemo(() => allTeams.filter((t) => t.rulesetId === rs.id && t.slots.some(Boolean)), [allTeams, rs.id]);
  const trainers = usePromise(() => (rs.loadTrainers ? rs.loadTrainers() : Promise.resolve(undefined)), [rs]);
  const bosses = useMemo(
    () => groupBySplit((trainers.data ?? []).filter((t) => t.boss && (!t.games || !game || t.games.includes(game.id)))),
    [trainers.data, game],
  );

  const [mine, setMine] = useState(() => (teams.some((t) => t.id === activeId) ? activeId : teams[0]?.id) ?? '');
  const [opponent, setOpponent] = useState(() => (params.get('trainer') ? `trainer:${params.get('trainer')}` : ''));
  const [mode, setMode] = useState<Mode>('play');
  const [ai, setAi] = useState<Config['ai']>(['smart', 'ingame']);
  const [hidden, setHidden] = useState(false);
  const [atCap, setAtCap] = useState(true);
  const [bags, setBags] = useState<[Bag, Bag]>([{}, {}]);

  // default opponent: the first boss, or another team
  const opponentId = opponent || (bosses[0] ? `trainer:${bosses[0].trainers[0].id}` : teams.find((t) => t.id !== mine) ? `team:${teams.find((t) => t.id !== mine)!.id}` : '');
  const trainer = opponentId.startsWith('trainer:') ? trainers.data?.find((t) => String(t.id) === opponentId.slice(8)) : undefined;
  const opponentTeam: TeamSet[] = trainer
    ? trainer.team.map((m) => setFromTrainerMon(rs, m))
    : ((teams.find((t) => `team:${t.id}` === opponentId)?.slots.filter(Boolean) ?? []) as TeamSet[]);
  const myTeamRaw = (teams.find((t) => t.id === mine)?.slots.filter(Boolean) ?? []) as TeamSet[];
  const cap = trainer?.levelCap;
  const myTeam = cap && atCap ? myTeamRaw.map((s) => ({ ...s, level: cap })) : myTeamRaw;
  // Showdown won't battle with a moveless Pokémon, and neither can you
  const moveless = [...myTeam, ...opponentTeam].filter((m) => !m.moves.some(Boolean)).map((m) => m.species);
  const ready = myTeam.length > 0 && opponentTeam.length > 0 && !moveless.length;

  if (!teams.length) {
    return (
      <p className={`${card} p-6 text-slate-500`}>
        Build a {rs.name} team in the{' '}
        <Link to="/team" className={link}>
          Team Builder
        </Link>{' '}
        first; battles start from your teams.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-baseline gap-2">
        <h1 className="mr-2 text-2xl font-bold">Battle</h1>
        <span className="text-sm text-slate-500">Showdown's battle engine with in-game rules: every move, ability, item, and status, plus the bag.</span>
      </div>
      <div className={`${card} grid gap-4 p-4 md:grid-cols-2`}>
        <div className="space-y-2">
          <h2 className="font-semibold">You</h2>
          <select value={mine} onChange={(e) => setMine(e.target.value)} className={`${input} w-full`}>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.slots.filter(Boolean).length})
              </option>
            ))}
          </select>
          {cap && (
            <label className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" checked={atCap} onChange={(e) => setAtCap(e.target.checked)} />
              At the level cap (Lv {cap})
            </label>
          )}
          <BagEditor gen={rs.gen} bag={bags[0]} onChange={(b) => setBags([b, bags[1]])} />
        </div>
        <div className="space-y-2">
          <h2 className="font-semibold">Opponent</h2>
          <select value={opponentId} onChange={(e) => setOpponent(e.target.value)} className={`${input} w-full`}>
            {bosses.map((g) => (
              <optgroup key={g.split} label={`${g.split}${g.levelCap ? ` (cap ${g.levelCap})` : ''}`}>
                {g.trainers.map((t, i) => (
                  <option key={`${t.id}-${i}`} value={`trainer:${t.id}`}>
                    {[trainerName(t), trainerDetails(t)].filter(Boolean).join(' · ')}
                  </option>
                ))}
              </optgroup>
            ))}
            {teams.length > 1 && (
              <optgroup label="Your teams">
                {teams.map((t) => (
                  <option key={t.id} value={`team:${t.id}`}>
                    {t.name}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
          <div className="text-xs text-slate-500">{opponentTeam.map((s) => `${s.species} Lv ${s.level}`).join(', ')}</div>
          <BagEditor gen={rs.gen} bag={bags[1]} onChange={(b) => setBags([bags[0], b])} />
        </div>
      </div>

      <div className={`${card} flex flex-wrap items-center gap-4 p-4 text-sm`}>
        <div className="flex rounded border border-slate-300 p-0.5 dark:border-slate-700">
          {(['play', 'watch'] as const).map((m) => (
            <button key={m} onClick={() => setMode(m)} className={`rounded px-3 py-1 font-medium ${mode === m ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900' : ''}`}>
              {m === 'play' ? 'Play' : 'Watch AI vs AI'}
            </button>
          ))}
        </div>
        {mode === 'watch' && (
          <label className="flex items-center gap-1.5">
            Your side
            <select value={ai[0]} onChange={(e) => setAi([e.target.value as Config['ai'][0], ai[1]])} className={input}>
              {Object.entries(AI_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="flex items-center gap-1.5">
          Opponent AI
          <select value={ai[1]} onChange={(e) => setAi([ai[0], e.target.value as Config['ai'][1]])} className={input}>
            {Object.entries(AI_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1.5" title="Show only what the game shows: species, HP bar, status, and moves, items, and abilities once revealed">
          <input type="checkbox" checked={hidden} onChange={(e) => setHidden(e.target.checked)} />
          Hide the opponent's details
        </label>
        <span className="text-xs text-slate-500">
          In-game plays like the real trainer, mostly going for its strongest hit; Smart weighs damage, speed, switches, and healing a turn ahead.
        </span>
        <button
          className={`${primary} ml-auto`}
          disabled={!ready}
          onClick={() =>
            onStart({
              mode,
              ai,
              hidden,
              setup: {
                rulesetId: rs.id,
                game: game?.id,
                seed: newSeed(),
                sides: [
                  { name: 'You', team: myTeam, bag: bags[0] },
                  { name: trainer ? trainerName(trainer) : (teams.find((t) => `team:${t.id}` === opponentId)?.name ?? 'Opponent'), team: opponentTeam, bag: bags[1] },
                ],
              },
            })
          }
        >
          Start battle
        </button>
      </div>
      {moveless.length > 0 && (
        <p className="text-sm text-amber-700 dark:text-amber-400">
          {moveless.join(', ')} {moveless.length > 1 ? 'have' : 'has'} no moves yet; give {moveless.length > 1 ? 'them' : 'it'} at least one on the{' '}
          <Link to="/team" className={link}>
            Team page
          </Link>{' '}
          to battle.
        </p>
      )}
      {playing && !trainers.data?.length && <p className="text-sm text-slate-500">{rs.name} has no boss teams; pick one of your teams to fight.</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// The battle

function Battle({ config, onExit }: { config: Config; onExit: () => void }) {
  const sessionRef = useRef<BattleSession>(BattleSession.start(config.setup));
  const [, setVersion] = useState(0);
  const [hidden, setHidden] = useState(config.hidden);
  const [error, setError] = useState<string>();
  const [auto, setAuto] = useState(config.mode === 'watch');
  const session = sessionRef.current;
  const refresh = () => setVersion((v) => v + 1);

  const players = useMemo(
    () => ({ p1: config.mode === 'watch' ? player(config.ai[0]) : undefined, p2: player(config.ai[1]) }),
    [config.mode, config.ai],
  );

  const submit = (mine?: Action) => {
    try {
      const decision = { ...aiDecision(session, players), ...(mine ? { p1: mine } : {}) };
      session.submit(decision);
      setError(undefined);
    } catch (e) {
      setError(String(e));
    }
    refresh();
  };

  const pending = session.pending();
  const youChoose = config.mode === 'play' && pending.includes('p1');
  // the AI's turn alone (a forced switch after you KO it), or Watch mode: no input needed
  const aiOnly = !session.ended && pending.length > 0 && !youChoose;
  useEffect(() => {
    if (!aiOnly || (config.mode === 'watch' && !auto)) return;
    const t = setTimeout(() => submit(), config.mode === 'watch' ? 700 : 300);
    return () => clearTimeout(t);
  });

  // back to your previous choice: rebuild the battle from the decisions before it
  const rewindTo = () => {
    const ds = session.decisions;
    for (let i = ds.length - 1; i >= 0; i--) {
      if (ds[i].p1) {
        sessionRef.current = BattleSession.replay(session.setup, ds, i);
        setError(undefined);
        refresh();
        return;
      }
    }
  };

  const log = session.log();
  const text = battleText(log);
  const reveal = hidden ? revealed(log, 'p2') : undefined;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-2 text-2xl font-bold">Battle</h1>
        <span className="text-sm text-slate-500">
          Turn {session.turn} · seed {session.setup.seed.join('-')}
        </span>
        <label className="ml-auto flex items-center gap-1.5 text-sm">
          <input type="checkbox" checked={hidden} onChange={(e) => setHidden(e.target.checked)} />
          Hide opponent
        </label>
        <button className={button} onClick={rewindTo} disabled={!session.decisions.some((d) => d.p1)}>
          ⟲ Rewind
        </button>
        <button className={button} onClick={onExit}>
          New battle
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <div className="space-y-3">
          <BattleView session={session} hidden={hidden} reveal={reveal} />
          {session.ended ? (
            <div className={`${card} p-4 text-center font-semibold`}>
              {session.winner === 'p1' ? 'You won!' : session.winner === 'p2' ? `${session.side('p2').name} won.` : 'A draw.'}
            </div>
          ) : youChoose ? (
            <Controls session={session} hidden={hidden} onAction={submit} />
          ) : config.mode === 'watch' ? (
            <div className="flex gap-2">
              <button className={button} onClick={() => setAuto(!auto)}>
                {auto ? '❚❚ Pause' : '▶ Play'}
              </button>
              <button className={button} onClick={() => submit()} disabled={auto}>
                Next
              </button>
            </div>
          ) : (
            <p className="text-sm text-slate-500">{session.side('p2').name} is choosing…</p>
          )}
          {error && <p className="text-sm text-red-700 dark:text-red-400">{error}</p>}
        </div>
        <BattleLog turns={text} />
      </div>
    </div>
  );
}

function BattleLog({ turns }: { turns: string[][] }) {
  const end = useRef<HTMLDivElement>(null);
  // braces: newer browsers return a promise from scrollIntoView, which React would take for a cleanup
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'nearest' });
  }, [turns.length]);
  return (
    <div className={`${card} max-h-[32rem] overflow-y-auto p-3 text-sm`}>
      {turns.map((lines, i) =>
        lines.length ? (
          <div key={i} className="mb-2">
            {i > 0 && <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Turn {i}</div>}
            {lines.map((l, j) => (
              <div key={j} className={/^\(/.test(l) ? 'text-xs text-slate-500' : ''}>
                {l}
              </div>
            ))}
          </div>
        ) : null,
      )}
      <div ref={end} />
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Your choices

type Tab = 'fight' | 'pokemon' | 'bag';

function Controls({ session, hidden, onAction }: { session: BattleSession; hidden: boolean; onAction: (a: Action) => void }) {
  const legal = session.legal('p1');
  const forced = legal.every((a) => a.kind === 'switch');
  const [tab, setTab] = useState<Tab>(forced ? 'pokemon' : 'fight');
  const [gimmickChecked, setGimmick] = useState(false);
  const [bagPick, setBagPick] = useState<BagItemId>();
  const me = session.active('p1');
  const them = session.active('p2');
  const party = session.side('p1').pokemon;
  const gimmicks = legal.filter((a): a is Extract<Action, { kind: 'move' }> => a.kind === 'move' && !!a.gimmick);
  // once Tera (or Mega, ...) is spent, the box no longer applies
  const gimmick = gimmickChecked && gimmicks.length > 0;
  const gimmickName = { mega: 'Mega Evolve', ultra: 'Ultra Burst', zmove: 'Z-Move', dynamax: 'Dynamax', terastallize: 'Terastallize' }[gimmicks[0]?.gimmick ?? 'mega'];
  const tabs: Tab[] = forced ? ['pokemon'] : ['fight', 'pokemon', ...(legal.some((a) => a.kind === 'bag') ? (['bag'] as Tab[]) : [])];
  const current = tabs.includes(tab) ? tab : tabs[0];

  return (
    <div className={`${card} space-y-3 p-3`}>
      <div className="flex items-center gap-1">
        {tabs.map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`rounded px-3 py-1 text-sm font-medium ${current === t ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900' : 'hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
            {t === 'fight' ? 'Fight' : t === 'pokemon' ? (forced ? 'Choose a Pokémon' : 'Pokémon') : 'Bag'}
          </button>
        ))}
        {!forced && (
          <button className="ml-auto text-sm text-red-700 hover:underline dark:text-red-400" onClick={() => onAction({ kind: 'forfeit' })}>
            Forfeit
          </button>
        )}
      </div>

      {current === 'fight' && me && (
        <div className="space-y-2">
          {gimmicks.length > 0 && (
            <label className="flex items-center gap-1.5 text-sm font-medium">
              <input type="checkbox" checked={gimmickChecked} onChange={(e) => setGimmick(e.target.checked)} />
              {gimmickName}
            </label>
          )}
          <div className="grid gap-2 sm:grid-cols-2">
            {me.moveSlots.map((slot, i) => {
              const action = legal.find((a) => a.kind === 'move' && a.move === i + 1 && (gimmick ? !!a.gimmick : !a.gimmick));
              const move = session.battle.dex.moves.get(slot.id);
              const h = !hidden && them && move.category !== 'Status' ? hit(session, 'p1', me, them, slot.move, gimmick && gimmicks[0]?.gimmick === 'terastallize') : undefined;
              return (
                <button key={slot.id} disabled={!action} onClick={() => action && onAction(action)} className={`${button} text-left`}>
                  <div className="flex justify-between gap-2">
                    <span>{slot.move}</span>
                    <span className="tabular-nums text-slate-500">
                      {slot.pp}/{slot.maxpp}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500">
                    {move.type} · {move.category}
                    {move.basePower ? ` · ${move.basePower}` : ''}
                    {h && ` · ${Math.round(Math.min(h.min, 1) * 100)}–${Math.round(Math.min(h.max, 1) * 100)}% of its HP`}
                  </div>
                </button>
              );
            })}
          </div>
          {/* struggle, when every move is out of PP */}
          {!me.moveSlots.some((_, i) => legal.some((a) => a.kind === 'move' && a.move === i + 1)) && legal.some((a) => a.kind === 'move') && (
            <button className={button} onClick={() => onAction(legal.find((a) => a.kind === 'move')!)}>
              Struggle
            </button>
          )}
        </div>
      )}

      {current === 'pokemon' && (
        <div className="grid gap-2 sm:grid-cols-2">
          {party.map((p, i) => {
            const action = legal.find((a) => a.kind === 'switch' && a.to === i);
            return (
              <button key={i} disabled={!action} onClick={() => action && onAction(action)} className={`${button} text-left`}>
                <div className="flex justify-between">
                  <span>{p.name}</span>
                  <span className="tabular-nums text-slate-500">{p.fainted ? 'Fainted' : `${p.hp}/${p.maxhp}`}</span>
                </div>
                <div className="text-xs text-slate-500">{p.isActive ? 'In battle' : p.status ? p.status.toUpperCase() : `Lv ${p.level}`}</div>
              </button>
            );
          })}
        </div>
      )}

      {current === 'bag' && (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {[...new Set(legal.flatMap((a) => (a.kind === 'bag' ? [a.use.item] : [])))].map((id) => (
              <button key={id} onClick={() => setBagPick(id)} className={`${button} ${bagPick === id ? 'border-blue-500' : ''}`} title={bagItem(id).shortDesc(session.battle.gen)}>
                {bagItem(id).name} ×{session.bags[0][id]}
              </button>
            ))}
          </div>
          {bagPick && (
            <div className="flex flex-wrap gap-1.5">
              {legal
                .filter((a): a is Extract<Action, { kind: 'bag' }> => a.kind === 'bag' && a.use.item === bagPick)
                .map((a) => (
                  <button key={`${a.use.target}-${a.use.move ?? ''}`} className={button} onClick={() => onAction(a)}>
                    {describeAction(session, 'p1', a).replace(`${bagItem(bagPick).name} on `, '')}
                    {a.use.move !== undefined && ` (${party[a.use.target].moveSlots[a.use.move].move})`}
                  </button>
                ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

