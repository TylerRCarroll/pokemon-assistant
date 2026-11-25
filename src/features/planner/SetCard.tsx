import { card } from '../../components/ui';
import { optionLabel } from '../../lib/smogon';
import type { SmogonSet } from '../../lib/smogonTypes';
import { formatEvs } from '../../lib/format';
import type { TeamSet } from '../../lib/team';

const button =
  'rounded border border-slate-300 px-3 py-1 text-sm font-medium hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800';

function Line({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div className="text-sm">
      <span className="text-slate-500">{label}: </span>
      {value}
    </div>
  );
}

/** A set to show and send to the builder: either a Smogon analysis set (with slash options) or a built TeamSet */
export function SetCard({
  title,
  subtitle,
  smogon,
  set,
  onAdd,
}: {
  title: string;
  subtitle?: string;
  smogon?: SmogonSet;
  set: TeamSet;
  onAdd: () => void;
}) {
  const moves = smogon ? smogon.moves.map(optionLabel) : set.moves;
  return (
    <section className={`${card} flex flex-col gap-2 p-4`}>
      <div>
        <h3 className="font-semibold">{title}</h3>
        {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
      </div>
      <ul className="list-inside list-disc text-sm">
        {moves.map((m, i) => (
          <li key={i}>{m}</li>
        ))}
      </ul>
      <div className="space-y-0.5">
        <Line label="Item" value={smogon ? optionLabel(smogon.item) : set.item} />
        <Line label="Ability" value={smogon ? optionLabel(smogon.ability) : set.ability} />
        <Line label="Nature" value={smogon ? optionLabel(smogon.nature) : set.nature} />
        <Line label="EVs" value={formatEvs(smogon ? (Array.isArray(smogon.evs) ? smogon.evs[0] : smogon.evs) : set.evs)} />
        <Line label="Tera" value={smogon ? optionLabel(smogon.teratypes) : set.teraType} />
      </div>
      <div className="mt-auto pt-1">
        <button className={button} onClick={onAdd}>
          Add to team
        </button>
        {smogon && moves.some((m) => m.includes(' / ')) && (
          <span className="ml-2 text-xs text-slate-500">uses the first option of each slash</span>
        )}
      </div>
    </section>
  );
}
