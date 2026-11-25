import { useEffect, useMemo, useState } from 'react';
import { card } from '../../components/ui';
import { resolveMembers } from '../../lib/coverage';
import { checkSet } from '../../lib/legality';
import { usePromise } from '../../lib/usePromise';
import type { LearnsetEntry } from '../../rulesets/types';
import { useRuleset } from '../../state/ruleset';
import { useTeamsStore } from '../../state/teams';
import { CoveragePanel } from './CoveragePanel';
import { SetEditor } from './SetEditor';
import { SlotCard } from './SlotCard';
import { TeamBar } from './TeamBar';

export function TeamPage() {
  const rs = useRuleset();
  const allTeams = useTeamsStore((s) => s.teams);
  const activeId = useTeamsStore((s) => s.activeByRuleset[rs.id]);
  const setSlot = useTeamsStore((s) => s.setSlot);
  const teams = useMemo(() => allTeams.filter((t) => t.rulesetId === rs.id), [allTeams, rs.id]);
  const team = teams.find((t) => t.id === activeId) ?? teams[0];
  const [selected, setSelected] = useState(0);

  useEffect(() => setSelected(0), [team?.id]);

  // Learnsets for every member, so each card can show legality problems
  const speciesKey = team?.slots.map((s) => s?.species ?? '').join('|') ?? '';
  const learnsets = usePromise(
    () =>
      Promise.all(team?.slots.map((s) => (s ? rs.learnset(s.species) : Promise.resolve(undefined))) ?? []),
    [rs, speciesKey],
  );
  const issuesFor = (i: number) => {
    const set = team?.slots[i];
    const ls: LearnsetEntry[] | undefined = learnsets.data?.[i];
    return set ? checkSet(rs, set, ls) : [];
  };

  const members = useMemo(() => resolveMembers(rs, team?.slots ?? []), [rs, team?.slots]);

  return (
    <div className="space-y-5">
      <TeamBar rs={rs} teams={teams} active={team} />

      {!team ? (
        <div className={`${card} p-8 text-center text-slate-500`}>
          No {rs.name} teams yet. Start a new team or import one from Showdown.
          <p className="mt-1 text-xs">Teams are kept per ruleset; switch rulesets in the header to see those teams.</p>
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            {team.slots.map((set, i) => (
              <SlotCard key={i} rs={rs} set={set} selected={i === selected} issueCount={issuesFor(i).length} onSelect={() => setSelected(i)} />
            ))}
          </div>

          <SetEditor
            key={`${team.id}-${selected}`}
            rs={rs}
            set={team.slots[selected]}
            learnset={learnsets.loading ? undefined : learnsets.data?.[selected]}
            issues={issuesFor(selected)}
            onChange={(set) => setSlot(team.id, selected, set)}
            onRemove={() => setSlot(team.id, selected, null)}
          />

          <CoveragePanel rs={rs} members={members} />
        </>
      )}
    </div>
  );
}
