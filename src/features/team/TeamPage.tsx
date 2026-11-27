import { useEffect, useMemo, useState } from 'react';
import { card } from '../../components/ui';
import { formatsFor } from '../../data/formats';
import { gamesFor } from '../../data/games';
import { availablePool, buildAvailability, loadAvailability } from '../../lib/availability';
import { resolveMembers, type Member } from '../../lib/coverage';
import { memberRoles } from '../../lib/roles';
import { loadFormat } from '../../lib/smogon';
import { newSet, type TeamSet } from '../../lib/team';
import type { SwapOwned } from '../../lib/teamAdvice';
import { checkSet } from '../../lib/legality';
import { usePromise } from '../../lib/usePromise';
import type { LearnsetEntry } from '../../rulesets/types';
import { useBoxStore, type StoredMon } from '../../state/box';
import { usePlaythrough } from '../../state/playthrough';
import { useRuleset } from '../../state/ruleset';
import { useTeamsStore } from '../../state/teams';
import { CoveragePanel } from './CoveragePanel';
import { PcStrip } from './PcStrip';
import { PlaythroughBar } from './PlaythroughBar';
import { SetEditor } from './SetEditor';
import { SlotCard } from './SlotCard';
import { TeamBar } from './TeamBar';

interface LastSwap {
  index: number;
  prev: TeamSet | null;
  label: string;
  /** A PC mon the swap evolved, as it was before */
  monBefore?: { id: string; set: TeamSet };
  /** A PC mon the swap created (a new catch), released again on undo */
  created?: string;
}

export function TeamPage() {
  const rs = useRuleset();
  const allTeams = useTeamsStore((s) => s.teams);
  const activeId = useTeamsStore((s) => s.activeByRuleset[rs.id]);
  const setSlot = useTeamsStore((s) => s.setSlot);
  const teams = useMemo(() => allTeams.filter((t) => t.rulesetId === rs.id), [allTeams, rs.id]);
  const team = teams.find((t) => t.id === activeId) ?? teams[0];
  const [selected, setSelected] = useState(0);

  useEffect(() => setSelected(0), [team?.id]);

  // the PC: a linked slot shows the PC's copy, so the two can't drift apart (a sync can land one store first)
  const allMons = useBoxStore((s) => s.mons);
  const createMon = useBoxStore((s) => s.createMon);
  const updateMon = useBoxStore((s) => s.updateMon);
  const releaseMon = useBoxStore((s) => s.releaseMon);
  const adoptTeam = useBoxStore((s) => s.adoptTeam);
  const monById = useMemo(() => new Map(allMons.map((m) => [m.id, m])), [allMons]);
  const slots = useMemo(
    () => team?.slots.map((s) => (s?.monId ? (monById.get(s.monId)?.set ?? s) : s)) ?? [],
    [team?.slots, monById],
  );

  // Learnsets for every member, so each card can show legality problems
  const speciesKey = slots.map((s) => s?.species ?? '').join('|');
  const learnsets = usePromise(
    () => Promise.all(slots.map((s) => (s ? rs.learnset(s.species) : Promise.resolve(undefined)))),
    [rs, speciesKey],
  );
  const issuesFor = (i: number) => {
    const set = slots[i];
    const ls: LearnsetEntry[] | undefined = learnsets.data?.[i];
    return set ? checkSet(rs, set, ls) : [];
  };

  const members = useMemo(() => resolveMembers(rs, slots), [rs, slots]);
  const learnsetOf = (m: Member) => learnsets.data?.[slots.indexOf(m.set)];
  // the ruleset's main format (OU, usually) steers swap suggestions toward meta-relevant picks
  const mainFormat = formatsFor(rs.id)[0]?.id;
  const metaData = usePromise(() => (mainFormat ? loadFormat(mainFormat) : Promise.resolve(undefined)), [mainFormat]);

  // playthrough mode: advice limited to what the game has offered by the chosen checkpoint
  const prefs = usePlaythrough(rs);
  const game = gamesFor(rs.id).find((g) => g.id === prefs?.game);
  const availabilityFile = usePromise(() => (game ? loadAvailability(game) : Promise.resolve(undefined)), [game?.id]);
  const availability = useMemo(
    () => (game && availabilityFile.data ? buildAvailability(rs, game, availabilityFile.data) : undefined),
    [rs, game, availabilityFile.data],
  );
  const playing = prefs?.mode === 'playthrough' && availability;
  const checkpoint = Math.min(prefs?.checkpoint ?? 0, (availability?.checkpoints.length ?? 1) - 1);
  const play = useMemo(() => {
    if (!playing) return undefined;
    const cap = availability.checkpoints[checkpoint]?.levelCap ?? 100;
    return { availability, checkpoint, pool: availablePool(rs, availability, checkpoint), level: cap };
  }, [playing, availability, checkpoint, rs]);
  // Smogon usage only steers competitive advice
  const meta = { data: play ? undefined : metaData.data };
  const [lastSwap, setLastSwap] = useState<LastSwap>();
  useEffect(() => setLastSwap(undefined), [team?.id, rs.id]);

  // playthrough mode keeps every team member in the game's PC, so swapping one out never loses its set
  const pcGame = prefs?.mode === 'playthrough' ? game : undefined;
  const pcMons = useMemo(
    () => (pcGame ? allMons.filter((m) => m.rulesetId === rs.id && m.game === pcGame.id) : []),
    [allMons, rs.id, pcGame],
  );
  const benched = useMemo(() => {
    const onTeam = new Set(slots.flatMap((s) => (s?.monId ? [s.monId] : [])));
    return pcMons.filter((m) => !onTeam.has(m.id));
  }, [pcMons, slots]);

  // members from before the PC existed (or pasted in) join this game's PC; a slot whose mon was released elsewhere empties
  useEffect(() => {
    if (pcGame && team) adoptTeam(team.id, rs.id, pcGame.id);
  }, [pcGame, team, monById, rs.id, adoptTeam]);

  const rolesFor = (set: TeamSet | null) => {
    const sp = set && rs.getSpecies(set.species);
    return set && sp ? memberRoles(rs, set, sp, meta.data) : [];
  };

  /** Save an edit: a PC mon is saved in the PC (which updates every team holding it), anything else in the slot */
  const saveSlot = (index: number, set: TeamSet) => {
    if (!team) return;
    if (set.monId && monById.has(set.monId)) updateMon(set.monId, set);
    else setSlot(team.id, index, set);
  };

  /** Put a set in a slot (whoever was there stays in the PC), remembering how to undo it */
  const place = (index: number, set: TeamSet | null, label: string, extra: Partial<LastSwap> = {}) => {
    if (!team) return;
    setSlot(team.id, index, set);
    setLastSwap({ index, prev: slots[index], label, ...extra });
  };
  const placeMon = (index: number, mon: StoredMon) => {
    const out = slots[index];
    place(index, mon.set, out ? `Swapped ${out.species} for ${mon.set.species} from the PC.` : `Added ${mon.set.species} from the PC.`);
  };
  /** A species not in the PC yet: a new catch, at the level cap when there is one */
  const catchNew = (index: number, species: string) => {
    if (!pcGame) return;
    const set = { ...newSet(rs, species), level: play?.level ?? 100 };
    const id = createMon(rs.id, pcGame.id, set);
    const out = slots[index];
    place(index, { ...set, monId: id }, out ? `Swapped ${out.species} for a new ${species}.` : `Added a new ${species}.`, { created: id });
  };

  const swap = (out: Member, set: TeamSet, owned?: SwapOwned) => {
    const index = slots.indexOf(out.set);
    if (index < 0) return;
    const mon = owned && monById.get(owned.monId);
    if (mon) {
      // a PC mon the suggestion evolved: evolve it for real (undo puts it back)
      if (owned.evolvesFrom) updateMon(mon.id, set);
      const label = owned.evolvesFrom
        ? `Evolved your ${owned.evolvesFrom} into ${set.species} and swapped it in for ${out.species.name}.`
        : `Swapped ${out.species.name} for ${set.species} from the PC.`;
      place(index, { ...set, monId: mon.id }, label, owned.evolvesFrom ? { monBefore: { id: mon.id, set: mon.set } } : {});
    } else if (pcGame) {
      const id = createMon(rs.id, pcGame.id, set);
      place(index, { ...set, monId: id }, `Swapped ${out.species.name} for ${set.species}.`, { created: id });
    } else place(index, set, `Swapped ${out.species.name} for ${set.species}.`);
  };

  const undo = () => {
    if (!team || !lastSwap) return;
    setSlot(team.id, lastSwap.index, lastSwap.prev);
    if (lastSwap.monBefore) updateMon(lastSwap.monBefore.id, lastSwap.monBefore.set);
    if (lastSwap.created) releaseMon(lastSwap.created);
    setLastSwap(undefined);
  };

  return (
    <div className="space-y-5">
      <TeamBar rs={rs} teams={teams} active={team} />
      {prefs && <PlaythroughBar rs={rs} prefs={{ ...prefs, checkpoint }} checkpoints={availability?.checkpoints} />}

      {!team ? (
        <div className={`${card} p-8 text-center text-slate-500`}>
          No {rs.name} teams yet. Start a new team or import one from Showdown.
          <p className="mt-1 text-xs">Teams are kept per ruleset; switch rulesets in the header to see those teams.</p>
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            {slots.map((set, i) => (
              <SlotCard
                key={i}
                rs={rs}
                set={set}
                selected={i === selected}
                issueCount={issuesFor(i).length}
                roles={rolesFor(set)}
                onSelect={() => setSelected(i)}
              />
            ))}
          </div>

          {pcGame && (
            <PcStrip rs={rs} mons={benched} gameName={pcGame.name} slotLabel={`slot ${selected + 1}`} onPlace={(mon) => placeMon(selected, mon)} />
          )}

          <SetEditor
            key={`${team.id}-${selected}`}
            rs={rs}
            set={slots[selected]}
            learnset={learnsets.loading ? undefined : learnsets.data?.[selected]}
            issues={issuesFor(selected)}
            onChange={(set) => saveSlot(selected, set)}
            onRemove={() => place(selected, null, `${pcGame ? 'Sent' : 'Removed'} ${slots[selected]?.species}${pcGame ? ' to the PC' : ''}.`)}
            removeLabel={pcGame ? 'Send to PC' : undefined}
            pc={pcGame && { mons: benched, onPick: (mon) => placeMon(selected, mon), onNew: (name) => catchNew(selected, name) }}
          />

          <CoveragePanel
            rs={rs}
            members={members}
            learnsetOf={learnsetOf}
            meta={meta.data}
            play={play}
            owned={pcGame ? benched : undefined}
            onSwap={swap}
            undo={lastSwap && { label: lastSwap.label, run: undo }}
          />
        </>
      )}
    </div>
  );
}
