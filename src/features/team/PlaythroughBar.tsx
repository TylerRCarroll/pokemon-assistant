import { card, input } from '../../components/ui';
import { gamesFor, type Checkpoint } from '../../data/games';
import type { Ruleset } from '../../rulesets/types';
import { usePlaythroughStore, type PlaythroughPrefs } from '../../state/playthrough';

/** Competitive vs playthrough advice, and how far into the game you are */
export function PlaythroughBar({ rs, prefs, checkpoints }: { rs: Ruleset; prefs: PlaythroughPrefs; checkpoints?: Checkpoint[] }) {
  const set = usePlaythroughStore((s) => s.set);
  const games = gamesFor(rs.id);
  const game = games.find((g) => g.id === prefs.game);
  const tab = (mode: PlaythroughPrefs['mode'], label: string) => (
    <button
      onClick={() => set(rs, { mode })}
      className={`rounded px-3 py-1 text-sm font-medium ${prefs.mode === mode ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900' : 'hover:bg-slate-100 dark:hover:bg-slate-800'}`}
    >
      {label}
    </button>
  );
  return (
    <section className={`${card} flex flex-wrap items-center gap-3 p-3 text-sm`}>
      <div className="flex rounded border border-slate-300 p-0.5 dark:border-slate-700">
        {rs.kind === 'official' && tab('competitive', 'Competitive')}
        {tab('playthrough', 'Playthrough')}
      </div>
      {prefs.mode === 'playthrough' ? (
        <>
          {games.length > 1 && (
            <select value={prefs.game} onChange={(e) => set(rs, { game: e.target.value, checkpoint: 0 })} className={input}>
              {games.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          )}
          <label className="flex items-center gap-1.5">
            <span className="text-slate-500">Next up</span>
            <select value={prefs.checkpoint} onChange={(e) => set(rs, { checkpoint: Number(e.target.value) })} className={input} disabled={!checkpoints}>
              {checkpoints?.map((c, i) => (
                <option key={c.label} value={i}>
                  {c.label} (Lv {c.levelCap})
                </option>
              ))}
            </select>
          </label>
          <span className="text-xs text-slate-500">
            Advice only uses Pokémon you can have by then, evolved as far as that level allows. Data: {game?.source}.
          </span>
        </>
      ) : (
        <span className="text-xs text-slate-500">Advice draws on Smogon usage, assuming every Pokémon is available.</span>
      )}
    </section>
  );
}
