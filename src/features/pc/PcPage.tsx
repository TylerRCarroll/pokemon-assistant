import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { SearchSelect, type Option } from '../../components/SearchSelect';
import { TypeBadge } from '../../components/TypeBadge';
import { card, input } from '../../components/ui';
import { gamesFor } from '../../data/games';
import { buildAvailability, loadAvailability } from '../../lib/availability';
import { checkSet } from '../../lib/legality';
import { matches } from '../../lib/search';
import { newSet } from '../../lib/team';
import { usePromise } from '../../lib/usePromise';
import { useBox, useBoxStore, type StoredMon } from '../../state/box';
import { usePlaythrough } from '../../state/playthrough';
import { useRuleset } from '../../state/ruleset';
import { useTeamsStore } from '../../state/teams';
import { PlaythroughBar } from '../team/PlaythroughBar';
import { SetEditor } from '../team/SetEditor';
import { SlotCard } from '../team/SlotCard';

const button =
  'rounded border border-slate-300 px-3 py-1 text-sm font-medium hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-800';

/** The playthrough's PC: every mon you've raised, on a team or not, editable any time */
export function PcPage() {
  const rs = useRuleset();
  const prefs = usePlaythrough(rs);
  const game = gamesFor(rs.id).find((g) => g.id === prefs?.game);
  const availabilityFile = usePromise(() => (game ? loadAvailability(game) : Promise.resolve(undefined)), [game?.id]);
  const checkpoints = useMemo(
    () => (game && availabilityFile.data ? buildAvailability(rs, game, availabilityFile.data).checkpoints : undefined),
    [rs, game, availabilityFile.data],
  );
  const checkpoint = Math.min(prefs?.checkpoint ?? 0, (checkpoints?.length ?? 1) - 1);
  const cap = checkpoints?.[checkpoint]?.levelCap;

  const playing = prefs?.mode === 'playthrough' && game;
  const mons = useBox(rs.id, playing ? game.id : undefined);
  const { createMon, updateMon, releaseMon } = useBoxStore();
  const allTeams = useTeamsStore((s) => s.teams);
  const teams = useMemo(() => allTeams.filter((t) => t.rulesetId === rs.id), [allTeams, rs.id]);
  const { setSlot, createTeam } = useTeamsStore();

  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string>();
  const selected = mons.find((m) => m.id === selectedId);

  const teamsOf = (mon: StoredMon) => teams.filter((t) => t.slots.some((s) => s?.monId === mon.id));
  const shown = mons.filter((m) => !query.trim() || matches([m.set.species, m.set.item ?? '', m.set.ability ?? '', ...m.set.moves].join(' '), query));

  const speciesOptions = useMemo<Option[]>(
    () => rs.species().map((s) => ({ value: s.name, label: s.name, extra: s.types.map((t) => <TypeBadge key={t} type={t} short />) })),
    [rs],
  );
  const catchNew = (species: string) => {
    if (!playing || !species) return;
    setSelectedId(createMon(rs.id, game.id, { ...newSet(rs, species), level: cap ?? 100 }));
  };

  if (!prefs || !game) {
    return <p className={`${card} p-6 text-slate-500`}>The PC is for playthroughs, and {rs.name} has no game data to play through.</p>;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-baseline gap-2">
        <h1 className="mr-2 text-2xl font-bold">PC</h1>
        <span className="text-sm text-slate-500">Every mon you've raised, with its full set. Swap them on and off teams without retyping anything.</span>
      </div>
      <PlaythroughBar rs={rs} prefs={{ ...prefs, checkpoint }} checkpoints={checkpoints} />

      {!playing ? (
        <p className={`${card} p-6 text-slate-500`}>The PC belongs to playthroughs. Switch to Playthrough above to see {game.name}'s PC.</p>
      ) : (
        <>
          <div className={`${card} flex flex-wrap items-center gap-3 p-3`}>
            <div className="w-64">
              <SearchSelect value="" options={speciesOptions} onChange={catchNew} placeholder={`New mon${cap ? ` (Lv ${cap})` : ''}…`} />
            </div>
            {mons.length > 0 && (
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter by name, move, item…" className={`${input} w-56`} />
            )}
            <span className="text-xs text-slate-500">
              {mons.length} in {game.name}'s PC. Team members join automatically when you open the{' '}
              <Link to="/team" className="text-blue-700 hover:underline dark:text-blue-400">
                Team
              </Link>{' '}
              page.
            </span>
          </div>

          {mons.length === 0 ? (
            <p className={`${card} p-6 text-center text-slate-500`}>The PC is empty. Add a mon above, or open the Team page in playthrough mode to bring your team in.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
              {shown.map((m) => {
                const on = teamsOf(m);
                return (
                  <SlotCard
                    key={m.id}
                    rs={rs}
                    set={m.set}
                    selected={m.id === selectedId}
                    issueCount={0}
                    note={on.length ? `On ${on.map((t) => t.name).join(', ')}` : undefined}
                    onSelect={() => setSelectedId(m.id === selectedId ? undefined : m.id)}
                  />
                );
              })}
            </div>
          )}

          {selected && (
            <SelectedMon
              key={selected.id}
              mon={selected}
              teams={teams}
              onTeams={teamsOf(selected).map((t) => t.id)}
              onChange={(set) => updateMon(selected.id, set)}
              onCatch={catchNew}
              onAdd={(teamId) => {
                if (teamId === 'new') {
                  createTeam(rs.id, undefined, [selected.set]);
                  return;
                }
                const t = teams.find((x) => x.id === teamId);
                const free = t?.slots.findIndex((s) => !s) ?? -1;
                if (t && free >= 0) setSlot(t.id, free, selected.set);
              }}
              onRelease={() => {
                releaseMon(selected.id);
                setSelectedId(undefined);
              }}
            />
          )}
        </>
      )}
    </div>
  );
}

function SelectedMon({
  mon,
  teams,
  onTeams,
  onChange,
  onCatch,
  onAdd,
  onRelease,
}: {
  mon: StoredMon;
  teams: ReturnType<typeof useTeamsStore.getState>['teams'];
  /** Ids of the teams it's already on */
  onTeams: string[];
  onChange: (set: StoredMon['set']) => void;
  onCatch: (species: string) => void;
  onAdd: (teamId: string) => void;
  onRelease: () => void;
}) {
  const rs = useRuleset();
  const learnset = usePromise(() => rs.learnset(mon.set.species), [rs, mon.set.species]);
  const issues = checkSet(rs, mon.set, learnset.data);
  const addable = teams.filter((t) => !onTeams.includes(t.id));
  const [target, setTarget] = useState(addable[0]?.id ?? 'new');
  const [confirming, setConfirming] = useState(false);
  const targetTeam = teams.find((t) => t.id === target);
  const full = !!targetTeam && targetTeam.slots.every(Boolean);
  const pickTarget = addable.some((t) => t.id === target) || target === 'new' ? target : (addable[0]?.id ?? 'new');

  return (
    <div className="space-y-3">
      <SetEditor
        rs={rs}
        set={mon.set}
        learnset={learnset.loading ? undefined : learnset.data}
        issues={issues}
        onChange={onChange}
        pc={{ mons: [], onPick: () => {}, onNew: onCatch, hint: 'Picking another Pokémon adds it as a new mon; this one stays as it is.' }}
      />
      <div className={`${card} flex flex-wrap items-center gap-3 p-3 text-sm`}>
        <select value={pickTarget} onChange={(e) => setTarget(e.target.value)} className={input}>
          {addable.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} ({t.slots.filter(Boolean).length}/6)
            </option>
          ))}
          <option value="new">A new team</option>
        </select>
        <button className={button} disabled={full && pickTarget === target} onClick={() => onAdd(pickTarget)}>
          Add to team
        </button>
        {full && pickTarget === target && <span className="text-xs text-amber-700 dark:text-amber-400">That team is full; swap someone out on the Team page.</span>}
        <span className="ml-auto">
          {confirming ? (
            <span className="flex flex-wrap items-center gap-2">
              Release {mon.set.species}{onTeams.length ? ' and take it off its teams' : ''}? This can't be undone.
              <button className={`${button} border-red-400 text-red-700 dark:text-red-400`} onClick={onRelease}>
                Release
              </button>
              <button className={button} onClick={() => setConfirming(false)}>
                Cancel
              </button>
            </span>
          ) : (
            <button className="text-red-700 hover:underline dark:text-red-400" onClick={() => setConfirming(true)}>
              Release
            </button>
          )}
        </span>
      </div>
    </div>
  );
}
