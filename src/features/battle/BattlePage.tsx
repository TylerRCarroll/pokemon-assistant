import { useEffect, useMemo, useRef, useState } from 'react';
import type { Pokemon } from '@pkmn/sim';
import { Link, useSearchParams } from 'react-router-dom';
import { card, input, link } from '../../components/ui';
import { tooClose, type Advice, type GauntletSetup } from '../../battle/analysis';
import { bagItem, bagItemsFor, type BagItemId } from '../../battle/bag';
import { BattleSession, newSeed, type Action, type Bag, type BattleSetup } from '../../battle/engine';
import { aiDecision, player, type AiKind } from '../../battle/ai/players';
import { hit } from '../../battle/ai/view';
import { battleText } from '../../battle/log';
import { gameTypesFor, type GameType } from '../../battle/mods';
import { SimPool } from '../../battle/pool';
import { revealed } from '../../battle/reveal';
import { gamesFor } from '../../data/games';
import type { TeamSet } from '../../lib/team';
import { groupBySplit, setFromTrainerMon, trainerDetails, trainerName } from '../../lib/trainers';
import { usePromise } from '../../lib/usePromise';
import type { TrainerInfo } from '../../rulesets/types';
import { usePlaythrough } from '../../state/playthrough';
import { useRuleset } from '../../state/ruleset';
import { useTeamsStore } from '../../state/teams';
import { BattleLog, BattleView } from './BattleView';
import { GauntletResults } from './Gauntlet';
import { Simulation } from './Simulation';

const button =
  'rounded border border-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700 dark:hover:bg-slate-800';
const primary = 'rounded bg-blue-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-40';

type Mode = 'play' | 'watch' | 'simulate' | 'gauntlet';
type Ai = Exclude<AiKind, 'random'>;
const AI_LABEL: Record<Ai, string> = { ingame: 'In-game', smart: 'Smart' };
const MODE_LABEL: Record<Mode, string> = { play: 'Play', watch: 'Watch AI vs AI', simulate: 'Simulate', gauntlet: 'Gauntlet' };
const TYPE_LABEL: Record<GameType, string> = { singles: 'Singles', doubles: 'Doubles', triples: 'Triples' };

type Config =
  | {
      mode: 'play' | 'watch' | 'simulate';
      setup: BattleSetup;
      /** AI for the opponent, and for you in Watch and Simulate */
      ai: [Ai, Ai];
      hidden: boolean;
      /** Simulate: how many battles */
      count?: number;
    }
  | { mode: 'gauntlet'; gauntlet: GauntletSetup; ai: [Ai, Ai]; count: number };

export function BattlePage() {
  const [config, setConfig] = useState<Config>();
  if (!config) return <Setup onStart={setConfig} />;
  const exit = () => setConfig(undefined);
  if (config.mode === 'gauntlet') return <GauntletResults key={config.gauntlet.seed.join()} gauntlet={config.gauntlet} ai={config.ai} count={config.count} onExit={exit} />;
  if (config.mode === 'simulate') return <Simulation key={config.setup.seed.join()} setup={config.setup} ai={config.ai} count={config.count ?? 100} onExit={exit} />;
  return <Battle key={config.setup.seed.join()} config={config} onExit={exit} />;
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

function AiSelect({ label, value, onChange }: { label: string; value: Ai; onChange: (a: Ai) => void }) {
  return (
    <label className="flex items-center gap-1.5">
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value as Ai)} className={input}>
        {Object.entries(AI_LABEL).map(([k, v]) => (
          <option key={k} value={k}>
            {v}
          </option>
        ))}
      </select>
    </label>
  );
}

/** The fights of a gauntlet: bosses in story order, ticked */
function FightPicker({ bosses, picked, onChange }: { bosses: ReturnType<typeof groupBySplit>; picked: number[]; onChange: (ids: number[]) => void }) {
  const all = bosses.flatMap((g) => g.trainers);
  // the Elite Four and Champion: the checkpoint named for them, or the last one with bosses before the post-game
  const leagueSplit = bosses.find((g) => /elite four|champion|league/i.test(g.split))?.split;
  const league = all.filter((t) => t.split === leagueSplit);
  const toggle = (id: number) => onChange(picked.includes(id) ? picked.filter((x) => x !== id) : all.filter((t) => picked.includes(t.id) || t.id === id).map((t) => t.id));
  return (
    <div className="space-y-2 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        {league.length > 0 && (
          <button className={button} onClick={() => onChange(league.map((t) => t.id))}>
            Elite Four run ({league.length})
          </button>
        )}
        <button className={button} onClick={() => onChange([])} disabled={!picked.length}>
          Clear
        </button>
        <span className="text-xs text-slate-500">{picked.length} fight{picked.length === 1 ? '' : 's'}, fought in story order</span>
      </div>
      <div className="max-h-64 space-y-2 overflow-y-auto rounded border border-slate-200 p-2 dark:border-slate-800">
        {bosses.map((g) => (
          <div key={g.split}>
            <div className="text-xs font-semibold text-slate-500">
              {g.split}
              {g.levelCap ? ` (cap ${g.levelCap})` : ''}
            </div>
            {g.trainers.map((t, i) => (
              <label key={`${t.id}-${i}`} className="flex items-center gap-1.5">
                <input type="checkbox" checked={picked.includes(t.id)} onChange={() => toggle(t.id)} />
                {[trainerName(t), trainerDetails(t)].filter(Boolean).join(' · ')}
              </label>
            ))}
          </div>
        ))}
      </div>
    </div>
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
  const [gameType, setGameType] = useState<GameType>('singles');
  const [count, setCount] = useState(100);
  const [ai, setAi] = useState<[Ai, Ai]>(['smart', 'ingame']);
  const [hidden, setHidden] = useState(false);
  const [atCap, setAtCap] = useState(true);
  const [bags, setBags] = useState<[Bag, Bag]>([{}, {}]);
  // in a battle you play, a full bag by default; simulations count, so the AI can't heal forever
  const [anyItem, setAnyItem] = useState(true);
  const [fights, setFights] = useState<number[]>([]);
  const [healBetween, setHealBetween] = useState(false);

  // picks belong to a ruleset: switching rulesets here starts them over
  const [pickedFor, setPickedFor] = useState(rs.id);
  if (pickedFor !== rs.id) {
    setPickedFor(rs.id);
    setOpponent('');
    setFights([]);
  }
  const myId = teams.some((t) => t.id === mine) ? mine : ((teams.some((t) => t.id === activeId) ? activeId : teams[0]?.id) ?? '');
  const types = gameTypesFor(rs.gen);
  const type = types.includes(gameType) ? gameType : 'singles';
  // default opponent: the first boss, or another team
  const opponentId = opponent || (bosses[0] ? `trainer:${bosses[0].trainers[0].id}` : teams.find((t) => t.id !== myId) ? `team:${teams.find((t) => t.id !== myId)!.id}` : '');
  const trainer = opponentId.startsWith('trainer:') ? trainers.data?.find((t) => String(t.id) === opponentId.slice(8)) : undefined;
  const teamOf = (t: TrainerInfo) => t.team.map((m) => setFromTrainerMon(rs, m));
  const opponentTeam: TeamSet[] = trainer ? teamOf(trainer) : ((teams.find((t) => `team:${t.id}` === opponentId)?.slots.filter(Boolean) ?? []) as TeamSet[]);
  const gauntletTrainers = bosses.flatMap((g) => g.trainers).filter((t) => fights.includes(t.id));
  const myTeamRaw = (teams.find((t) => t.id === myId)?.slots.filter(Boolean) ?? []) as TeamSet[];
  // a gauntlet plays at its toughest fight's cap
  const cap = mode === 'gauntlet' ? Math.max(0, ...gauntletTrainers.map((t) => t.levelCap ?? 0)) || undefined : trainer?.levelCap;
  const myTeam = cap && atCap ? myTeamRaw.map((s) => ({ ...s, level: cap })) : myTeamRaw;
  const theirs = mode === 'gauntlet' ? gauntletTrainers.flatMap(teamOf) : opponentTeam;
  // Showdown won't battle with a moveless Pokémon, and neither can you
  const moveless = [...new Set([...myTeam, ...theirs].filter((m) => !m.moves.some(Boolean)).map((m) => m.species))];
  const ready = myTeam.length > 0 && theirs.length > 0 && !moveless.length;

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

  const start = () => {
    const unlimited = anyItem && (mode === 'play' || mode === 'watch');
    const you = { name: 'You', team: myTeam, bag: bags[0], ...(unlimited ? { unlimitedBag: true } : {}) };
    if (mode === 'gauntlet') {
      onStart({
        mode,
        ai,
        count,
        gauntlet: {
          rulesetId: rs.id,
          game: game?.id,
          gameType: type,
          seed: newSeed(),
          you,
          healBetween,
          fights: gauntletTrainers.map((t) => ({ name: trainerName(t), team: teamOf(t) })),
        },
      });
      return;
    }
    onStart({
      mode,
      ai,
      hidden,
      count,
      setup: {
        rulesetId: rs.id,
        game: game?.id,
        gameType: type,
        seed: newSeed(),
        sides: [you, { name: trainer ? trainerName(trainer) : (teams.find((t) => `team:${t.id}` === opponentId)?.name ?? 'Opponent'), team: opponentTeam, bag: bags[1] }],
      },
    });
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-baseline gap-2">
        <h1 className="mr-2 text-2xl font-bold">Battle</h1>
        <span className="text-sm text-slate-500">Showdown's battle engine with in-game rules: every move, ability, item, and status, plus the bag.</span>
      </div>

      <div className={`${card} flex flex-wrap items-center gap-3 p-3 text-sm`}>
        <div className="flex flex-wrap rounded border border-slate-300 p-0.5 dark:border-slate-700">
          {(['play', 'watch', 'simulate', 'gauntlet'] as const).map((m) => (
            <button key={m} onClick={() => setMode(m)} className={`rounded px-3 py-1 font-medium ${mode === m ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900' : ''}`}>
              {MODE_LABEL[m]}
            </button>
          ))}
        </div>
        {types.length > 1 && (
          <select value={type} onChange={(e) => setGameType(e.target.value as GameType)} className={input} title="Singles, or a double (or triple) battle">
            {types.map((t) => (
              <option key={t} value={t}>
                {TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        )}
        <span className="text-xs text-slate-500">
          {mode === 'gauntlet'
            ? 'Fights back to back: HP, PP, status, faints, and your bag carry from one to the next.'
            : mode === 'simulate'
              ? 'Many AI-vs-AI battles, for a win rate and who does the work.'
              : mode === 'watch'
                ? 'Two AIs play it out.'
                : 'You play your team against the AI.'}
        </span>
      </div>

      <div className={`${card} grid gap-4 p-4 md:grid-cols-2`}>
        <div className="space-y-2">
          <h2 className="font-semibold">You</h2>
          <select value={myId} onChange={(e) => setMine(e.target.value)} className={`${input} w-full`}>
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
          {(mode === 'play' || mode === 'watch') && (
            <label className="flex items-center gap-1.5 text-sm" title="Every item the games have in this generation, as many times as you like">
              <input type="checkbox" checked={anyItem} onChange={(e) => setAnyItem(e.target.checked)} />
              Use any item (a full bag)
            </label>
          )}
          {!(anyItem && (mode === 'play' || mode === 'watch')) && <BagEditor gen={rs.gen} bag={bags[0]} onChange={(b) => setBags([b, bags[1]])} />}
        </div>
        <div className="space-y-2">
          <h2 className="font-semibold">{mode === 'gauntlet' ? 'Fights' : 'Opponent'}</h2>
          {mode === 'gauntlet' ? (
            bosses.length ? (
              <FightPicker bosses={bosses} picked={fights} onChange={setFights} />
            ) : (
              <p className="text-sm text-slate-500">{rs.name} has no boss teams to make a gauntlet from.</p>
            )
          ) : (
            <>
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
            </>
          )}
        </div>
      </div>

      <div className={`${card} flex flex-wrap items-center gap-4 p-4 text-sm`}>
        {(mode === 'simulate' || mode === 'gauntlet') && (
          <label className="flex items-center gap-1.5">
            {mode === 'gauntlet' ? 'Runs' : 'Battles'}
            <select value={count} onChange={(e) => setCount(Number(e.target.value))} className={input}>
              {[25, 50, 100, 200, 500].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        )}
        {mode !== 'play' && <AiSelect label="Your side" value={ai[0]} onChange={(a) => setAi([a, ai[1]])} />}
        <AiSelect label="Opponent AI" value={ai[1]} onChange={(a) => setAi([ai[0], a])} />
        {mode === 'gauntlet' && (
          <label className="flex items-center gap-1.5" title="On for gyms with a Pokémon Center between them; off for the Elite Four, where only your bag heals">
            <input type="checkbox" checked={healBetween} onChange={(e) => setHealBetween(e.target.checked)} />
            Heal between fights
          </label>
        )}
        {(mode === 'play' || mode === 'watch') && (
          <label className="flex items-center gap-1.5" title="Show only what the game shows: species, HP bar, status, and moves, items, and abilities once revealed">
            <input type="checkbox" checked={hidden} onChange={(e) => setHidden(e.target.checked)} />
            Hide the opponent's details
          </label>
        )}
        <span className="text-xs text-slate-500">In-game plays like the real trainer, mostly going for its strongest hit; Smart weighs damage, speed, switches, and healing a turn ahead.</span>
        <button className={`${primary} ml-auto`} disabled={!ready} onClick={start}>
          {mode === 'simulate' ? `Run ${count} battles` : mode === 'gauntlet' ? `Run the gauntlet ${count} times` : 'Start battle'}
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
      {mode === 'gauntlet' && !fights.length && bosses.length > 0 && <p className="text-sm text-slate-500">Tick the fights to run, or start from the Elite Four.</p>}
      {playing && !trainers.data?.length && <p className="text-sm text-slate-500">{rs.name} has no boss teams; pick one of your teams to fight.</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// The battle

function Battle({ config, onExit }: { config: Extract<Config, { setup: BattleSetup }>; onExit: () => void }) {
  const sessionRef = useRef<BattleSession>(BattleSession.start(config.setup));
  const [, setVersion] = useState(0);
  const [hidden, setHidden] = useState(config.hidden);
  const [error, setError] = useState<string>();
  const [auto, setAuto] = useState(config.mode === 'watch');
  // doubles and triples: your choices so far this turn, one per slot
  const [picks, setPicks] = useState<Action[]>([]);
  const session = sessionRef.current;
  const refresh = () => setVersion((v) => v + 1);

  // the advisor plays each option out many times in workers; its answer is for this decision only
  const pool = useRef<SimPool>(undefined);
  useEffect(() => () => pool.current?.cancel(), []);
  const [advice, setAdvice] = useState<{ at: number; list?: Advice[]; error?: string }>();
  const at = session.decisions.length;
  const ask = () => {
    pool.current ??= new SimPool();
    setAdvice({ at });
    pool.current
      .advise(session, 'p1', { rollouts: 24, depth: 16 })
      .then((list) => setAdvice((a) => (a?.at === at ? { at, list } : a)))
      .catch((e) => setAdvice((a) => (a?.at === at ? { at, error: String(e) } : a)));
  };

  const players = useMemo(() => ({ p1: config.mode === 'watch' ? player(config.ai[0]) : undefined, p2: player(config.ai[1]) }), [config.mode, config.ai]);

  const submit = (mine?: Action | Action[]) => {
    try {
      const decision = { ...aiDecision(session, players), ...(mine ? { p1: mine } : {}) };
      session.submit(decision);
      setError(undefined);
    } catch (e) {
      setError(String(e));
    }
    setPicks([]);
    refresh();
  };

  const pending = session.pending();
  const youChoose = config.mode === 'play' && pending.includes('p1');
  // the slots that need a choice from you now (a forced switch may need only one)
  const yourSlots = youChoose ? Array.from({ length: session.slots }, (_, i) => i).filter((i) => !session.legalSlot('p1', i).every((a) => a.kind === 'pass')) : [];
  const slot = yourSlots[picks.length];
  const pick = (a: Action) => {
    if (a.kind === 'forfeit' || session.slots === 1) return submit(a);
    const next = [...picks, a];
    if (next.length < yourSlots.length) return setPicks(next);
    // slots with nothing to do pass
    const all = Array.from({ length: session.slots }, (_, i) => (yourSlots.includes(i) ? next[yourSlots.indexOf(i)] : ({ kind: 'pass' } as Action)));
    submit(all);
  };

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
        setPicks([]);
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
          {TYPE_LABEL[config.setup.gameType ?? 'singles']} · turn {session.turn} · seed {session.setup.seed.join('-')}
        </span>
        <label className="ml-auto flex items-center gap-1.5 text-sm">
          <input type="checkbox" checked={hidden} onChange={(e) => setHidden(e.target.checked)} />
          Hide opponent
        </label>
        <button className={button} onClick={rewindTo} disabled={!session.decisions.some((d) => d.p1)}>
          ⟲ Rewind
        </button>
        <CopyBattle session={session} advice={advice?.at === at ? advice.list : undefined} />
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
          ) : youChoose && slot !== undefined ? (
            <>
              <Controls key={`${at}-${slot}`} session={session} slot={slot} picked={picks} hidden={hidden} onAction={pick} onBack={picks.length ? () => setPicks(picks.slice(0, -1)) : undefined} />
              {session.slots === 1 && <AdvicePanel advice={advice?.at === at ? advice : undefined} onAsk={ask} onPick={submit} />}
            </>
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

/**
 * The battle as text to paste into a bug report: teams, seed, and every choice (enough to rebuild it
 * exactly), the advisor's last ranking, and the log as you read it
 */
function CopyBattle({ session, advice }: { session: BattleSession; advice?: Advice[] }) {
  const [copied, setCopied] = useState<'yes' | 'failed'>();
  const copy = async () => {
    const report = {
      kind: 'pokeplanner-battle',
      copiedAt: new Date().toISOString(),
      turn: session.turn,
      setup: session.setup,
      decisions: session.decisions,
      advice: advice?.map((a) => ({ option: a.label, winChance: Math.round(a.winChance * 1000) / 1000, hpLeft: Math.round(a.margin * 1000) / 1000, samples: a.samples, action: a.action })),
      log: battleText(session.log()).map((lines, turn) => ({ turn, lines })),
    };
    const text = JSON.stringify(report, null, 1);
    try {
      await navigator.clipboard.writeText(text);
      setCopied('yes');
    } catch {
      // no clipboard (some Android webviews): save it as a file instead
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
      a.download = `battle-turn-${session.turn}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
      setCopied('failed');
    }
    setTimeout(() => setCopied(undefined), 2500);
  };
  return (
    <button className={button} onClick={copy} title="Copies the teams, seed, every choice, the advisor's ranking, and the log, so the battle can be rebuilt exactly">
      {copied === 'yes' ? 'Copied ✓' : copied === 'failed' ? 'Saved as a file' : 'Copy battle'}
    </button>
  );
}

function AdvicePanel({ advice, onAsk, onPick }: { advice?: { list?: Advice[]; error?: string }; onAsk: () => void; onPick: (a: Action) => void }) {
  if (!advice) {
    return (
      <button className={button} onClick={onAsk} title="Plays each option out a couple of dozen times with the smart AI on both sides and ranks them by how often you win">
        What should I do?
      </button>
    );
  }
  if (advice.error) return <p className="text-sm text-red-700 dark:text-red-400">{advice.error}</p>;
  if (!advice.list) return <p className="text-sm text-slate-500">Playing each option out…</p>;
  const [first, second] = advice.list;
  const close = first && second && tooClose(first, second);
  return (
    <div className={`${card} space-y-1.5 p-3 text-sm`}>
      <div className="font-medium">
        Best options <span className="font-normal text-slate-500">(estimated win chance after {first?.samples ?? 0} playouts each, smart AI on both sides; HP is your team's left at the end)</span>
      </div>
      {close && (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          The top options are too close to call: the playouts can't tell them apart, so pick on what you know of the fight.
        </p>
      )}
      {advice.list.slice(0, 6).map((a, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className="h-2 w-24 shrink-0 overflow-hidden rounded bg-slate-200 dark:bg-slate-700">
            <div className="h-full bg-blue-500" style={{ width: `${Math.round(a.winChance * 100)}%` }} />
          </div>
          <span className="w-10 text-right tabular-nums">{Math.round(a.winChance * 100)}%</span>
          <span className="w-16 text-right text-xs tabular-nums text-slate-500" title="Your team's HP left at the end of the playouts, on average">
            {Math.round(a.margin * 100)}% HP
          </span>
          <span className="flex-1">{a.label}</span>
          <button className="text-blue-700 hover:underline dark:text-blue-400" onClick={() => onPick(a.action)}>
            Do it
          </button>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Your choices, one active slot at a time

/** "2×", "½×", "0×" for a move's type against a Pokémon's current types (Tera included); abilities aside */
function typeMultiplier(session: BattleSession, moveType: string, target: Pokemon): string {
  const types = target.getTypes();
  if (!session.battle.dex.getImmunity(moveType, types)) return '0×';
  const n = 2 ** session.battle.dex.getEffectiveness(moveType, types);
  return n === 0.5 ? '½×' : n === 0.25 ? '¼×' : `${n}×`;
}

type Tab = 'fight' | 'pokemon' | 'bag';

function Controls({
  session,
  slot,
  picked,
  hidden,
  onAction,
  onBack,
}: {
  session: BattleSession;
  slot: number;
  /** Earlier slots' choices this turn: no switching in the same Pokémon twice, one gimmick per side */
  picked: Action[];
  hidden: boolean;
  onAction: (a: Action) => void;
  onBack?: () => void;
}) {
  const legal = session.legalSlot('p1', slot).filter((a) => {
    if (a.kind === 'switch') return !picked.some((p) => p.kind === 'switch' && p.to === a.to);
    if (a.kind === 'move' && a.gimmick) return !picked.some((p) => p.kind === 'move' && p.gimmick === a.gimmick);
    return true;
  });
  const forced = legal.every((a) => a.kind === 'switch' || a.kind === 'pass');
  const [tab, setTab] = useState<Tab>(forced ? 'pokemon' : 'fight');
  const [gimmickChecked, setGimmick] = useState(false);
  // a single-target move picked in doubles: now choose where it goes
  const [aiming, setAiming] = useState<number>();
  const me = session.active('p1', slot);
  const them = session.active('p2');
  const foes = session.side('p2').active.filter((p): p is Pokemon => !!p && !p.fainted);
  const party = session.side('p1').pokemon;
  const gimmicks = legal.filter((a): a is Extract<Action, { kind: 'move' }> => a.kind === 'move' && !!a.gimmick);
  // once Tera (or Mega, ...) is spent, the box no longer applies
  const gimmick = gimmickChecked && gimmicks.length > 0;
  const gimmickName = { mega: 'Mega Evolve', ultra: 'Ultra Burst', zmove: 'Z-Move', dynamax: 'Dynamax', terastallize: 'Terastallize' }[gimmicks[0]?.gimmick ?? 'mega'];
  const tabs: Tab[] = forced ? ['pokemon'] : ['fight', 'pokemon', 'bag'];
  const current = tabs.includes(tab) ? tab : tabs[0];
  const movesFor = (i: number) => legal.filter((a): a is Extract<Action, { kind: 'move' }> => a.kind === 'move' && a.move === i + 1 && (gimmick ? !!a.gimmick : !a.gimmick));

  return (
    <div className={`${card} space-y-3 p-3`}>
      <div className="flex flex-wrap items-center gap-1">
        {session.slots > 1 && <span className="mr-2 text-sm font-semibold">{me?.name ?? `Slot ${slot + 1}`}:</span>}
        {tabs.map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`rounded px-3 py-1 text-sm font-medium ${current === t ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900' : 'hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
            {t === 'fight' ? 'Fight' : t === 'pokemon' ? (forced ? 'Choose a Pokémon' : 'Pokémon') : 'Bag'}
          </button>
        ))}
        {legal.some((a) => a.kind === 'shift') && (
          <button className={button} onClick={() => onAction({ kind: 'shift' })}>
            Shift
          </button>
        )}
        {onBack && (
          <button className="ml-2 text-sm text-slate-600 hover:underline dark:text-slate-400" onClick={onBack}>
            ← Back
          </button>
        )}
        {!forced && (
          <button className="ml-auto text-sm text-red-700 hover:underline dark:text-red-400" onClick={() => onAction({ kind: 'forfeit' })}>
            Forfeit
          </button>
        )}
      </div>

      {current === 'fight' && me && aiming !== undefined && (
        <div className="space-y-2">
          <div className="text-sm">
            {me.moveSlots[aiming].move} at:{' '}
            <button className="text-slate-600 hover:underline dark:text-slate-400" onClick={() => setAiming(undefined)}>
              (back)
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {movesFor(aiming).map((a) => {
              const target = a.target !== undefined ? me.getAtLoc(a.target) : undefined;
              return (
                <button key={a.target} className={button} onClick={() => onAction(a)}>
                  {a.target! < 0 ? 'Your ' : ''}
                  {target?.name ?? `slot ${Math.abs(a.target!)}`}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {current === 'fight' && me && aiming === undefined && (
        <div className="space-y-2">
          {gimmicks.length > 0 && (
            <label className="flex items-center gap-1.5 text-sm font-medium">
              <input type="checkbox" checked={gimmickChecked} onChange={(e) => setGimmick(e.target.checked)} />
              {gimmickName}
            </label>
          )}
          <div className="grid gap-2 sm:grid-cols-2">
            {me.moveSlots.map((ms, i) => {
              const options = movesFor(i);
              const move = session.battle.dex.moves.get(ms.id);
              const h = !hidden && them && move.category !== 'Status' && session.slots === 1 ? hit(session, 'p1', me, them, ms.move, gimmick && gimmicks[0]?.gimmick === 'terastallize') : undefined;
              const choose = () => (options.length > 1 ? setAiming(i) : options[0] && onAction(options[0]));
              return (
                <button key={ms.id} disabled={!options.length} onClick={choose} className={`${button} text-left`}>
                  <div className="flex justify-between gap-2">
                    <span>{ms.move}</span>
                    <span className="tabular-nums text-slate-500">
                      {ms.pp}/{ms.maxpp}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500">
                    {move.type} · {move.category}
                    {move.basePower ? ` · ${move.basePower}` : ''}
                    {h && ` · ${Math.round(Math.min(h.min, 1) * 100)}–${Math.round(Math.min(h.max, 1) * 100)}% of its HP`}
                  </div>
                  {move.category !== 'Status' && foes.length > 0 && (
                    <div className="text-xs">
                      {foes.map((f, j) => {
                        const x = typeMultiplier(session, move.type, f);
                        const tone = x === '0×' ? 'text-slate-400' : /^[248]/.test(x) && x !== '1×' ? 'font-semibold text-green-700 dark:text-green-400' : x === '1×' ? 'text-slate-500' : 'text-red-700 dark:text-red-400';
                        return (
                          <span key={j} className={`${tone} ${j ? 'ml-2' : ''}`}>
                            {foes.length > 1 ? `${f.name} ` : ''}
                            {x}
                          </span>
                        );
                      })}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
          {/* struggle, when every move is out of PP */}
          {!me.moveSlots.some((_, i) => movesFor(i).length) && legal.some((a) => a.kind === 'move') && (
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
          {legal.some((a) => a.kind === 'pass') && (
            <button className={button} onClick={() => onAction({ kind: 'pass' })}>
              Leave the slot empty
            </button>
          )}
        </div>
      )}

      {current === 'bag' && <BagTab session={session} legal={legal} picked={picked} onAction={onAction} />}
    </div>
  );
}

const BAG_GROUPS: [string, BagItemId[]][] = [
  ['HP', ['potion', 'superpotion', 'hyperpotion', 'maxpotion', 'fullrestore']],
  ['Status', ['antidote', 'burnheal', 'iceheal', 'awakening', 'paralyzeheal', 'fullheal']],
  ['Revive', ['revive', 'maxrevive']],
  ['PP', ['ether', 'maxether', 'elixir', 'maxelixir']],
  ['Battle items', ['xattack', 'xdefense', 'xspatk', 'xspdef', 'xspeed', 'xaccuracy', 'direhit', 'guardspec']],
];

/** Every item the gen has, by kind; the ones that wouldn't do anything right now are greyed out with why */
function BagTab({ session, legal, picked, onAction }: { session: BattleSession; legal: Action[]; picked: Action[]; onAction: (a: Action) => void }) {
  const [pick, setPick] = useState<BagItemId>();
  const gen = session.battle.gen;
  const party = session.side('p1').pokemon;
  const available = new Set(bagItemsFor(gen).map((i) => i.id));
  // what's left, counting the items earlier slots already picked this turn
  const left = (id: BagItemId) => session.bagLeft('p1', id) - picked.filter((p) => p.kind === 'bag' && p.use.item === id).length;
  const uses = (id: BagItemId) => (left(id) > 0 ? legal.filter((a): a is Extract<Action, { kind: 'bag' }> => a.kind === 'bag' && a.use.item === id) : []);
  // locked into a move, or the like: the game offers no bag this turn
  const none = !legal.some((a) => a.kind === 'bag') && !legal.some((a) => a.kind === 'move' || a.kind === 'switch');
  return (
    <div className="space-y-3">
      {none && <p className="text-sm text-slate-500">No items this turn.</p>}
      {BAG_GROUPS.map(([group, ids]) => {
        const items = ids.filter((id) => available.has(id));
        if (!items.length) return null;
        return (
          <div key={group}>
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{group}</div>
            <div className="flex flex-wrap gap-1.5">
              {items.map((id) => {
                const item = bagItem(id);
                const n = left(id);
                const can = uses(id).length > 0;
                const why = n <= 0 ? 'None left' : item.target === 'fainted' ? 'No Pokémon has fainted' : item.target === 'active' ? 'Nothing it would raise' : 'Nothing it would help right now';
                return (
                  <button
                    key={id}
                    disabled={!can}
                    onClick={() => setPick(pick === id ? undefined : id)}
                    className={`${button} ${pick === id ? 'border-blue-500' : ''}`}
                    title={`${item.shortDesc(gen)}${can ? '' : ` (${why})`}`}
                  >
                    {item.name}
                    <span className="ml-1 text-xs text-slate-500">{n === Infinity ? '' : `×${Math.max(0, n)}`}</span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
      {pick && (
        <div className="space-y-1 rounded border border-blue-300 p-2 dark:border-blue-800">
          <div className="text-sm">
            {bagItem(pick).name}: <span className="text-slate-500">{bagItem(pick).shortDesc(gen)}. Use it on:</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {uses(pick).map((a) => {
              const mon = party[a.use.target];
              return (
                <button key={`${a.use.target}-${a.use.move ?? ''}`} className={button} onClick={() => onAction(a)}>
                  {mon.name}
                  <span className="ml-1 text-xs text-slate-500">
                    {a.use.move !== undefined ? mon.moveSlots[a.use.move].move : mon.fainted ? 'fainted' : `${mon.hp}/${mon.maxhp}${mon.status ? ` ${mon.status.toUpperCase()}` : ''}`}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
