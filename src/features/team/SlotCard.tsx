import { Sprite } from '../../components/Sprite';
import { TypeBadge } from '../../components/TypeBadge';
import { card } from '../../components/ui';
import { ROLE_LABELS, type Role } from '../../lib/roles';
import type { TeamSet } from '../../lib/team';
import type { Ruleset } from '../../rulesets/types';

export function SlotCard({
  rs,
  set,
  selected,
  issueCount,
  roles = [],
  onSelect,
}: {
  rs: Ruleset;
  set: TeamSet | null;
  selected: boolean;
  issueCount: number;
  roles?: Role[];
  onSelect: () => void;
}) {
  const ring = selected ? 'ring-2 ring-blue-500' : 'hover:border-slate-400 dark:hover:border-slate-600';
  if (!set) {
    return (
      <button onClick={onSelect} className={`${card} ${ring} flex min-h-40 items-center justify-center border-dashed text-slate-400`}>
        + Add Pokémon
      </button>
    );
  }
  const sp = rs.getSpecies(set.species);
  return (
    <button onClick={onSelect} className={`${card} ${ring} flex min-h-40 flex-col gap-1 p-3 text-left`}>
      <div className="flex items-center gap-2">
        <Sprite id={sp?.spriteId ?? ''} name={set.species} size={48} />
        <div className="min-w-0">
          <div className="truncate font-semibold">{set.species}</div>
          <div className="flex gap-1">
            {sp?.types.map((t) => (
              <TypeBadge key={t} type={t} short />
            ))}
          </div>
        </div>
        {issueCount > 0 && (
          <span className="ml-auto rounded-full bg-red-100 px-2 text-xs font-semibold text-red-700 dark:bg-red-950 dark:text-red-300" title="Set has problems">
            {issueCount}
          </span>
        )}
      </div>
      <div className="truncate text-xs text-slate-500">
        {[set.item, set.ability].filter(Boolean).join(' · ') || '—'}
      </div>
      <ul className="grid grid-cols-2 gap-x-2 text-xs">
        {[0, 1, 2, 3].map((i) => (
          <li key={i} className={`truncate ${set.moves[i] ? '' : 'text-slate-400'}`}>
            {set.moves[i] ?? '—'}
          </li>
        ))}
      </ul>
      {roles.length > 0 && (
        <div className="mt-auto flex flex-wrap gap-1 pt-1">
          {roles.map((r) => (
            <span key={r} className="rounded bg-slate-100 px-1.5 text-[10px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              {ROLE_LABELS[r]}
            </span>
          ))}
        </div>
      )}
    </button>
  );
}
