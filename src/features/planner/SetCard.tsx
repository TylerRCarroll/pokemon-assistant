import { Fragment, type ReactNode } from 'react';
import { ItemName, MoveName } from '../../components/Tooltip';
import { card } from '../../components/ui';
import { optionLabel } from '../../lib/smogon';
import type { SmogonSet } from '../../lib/smogonTypes';
import { formatEvs } from '../../lib/format';
import type { TeamSet } from '../../lib/team';
import type { Ruleset } from '../../rulesets/types';

const button =
  'rounded border border-slate-300 px-3 py-1 text-sm font-medium hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800';

/** Slash options ("Leftovers / Heavy-Duty Boots") with each option rendered on its own */
function options(v: string | string[] | undefined, render: (name: string) => ReactNode) {
  const list = Array.isArray(v) ? v : v ? [v] : [];
  if (!list.length) return undefined;
  return list.map((o, i) => (
    <Fragment key={o}>
      {i > 0 && ' / '}
      {render(o)}
    </Fragment>
  ));
}

function Line({ label, value }: { label: string; value?: ReactNode }) {
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
  rs,
  title,
  subtitle,
  smogon,
  set,
  onAdd,
}: {
  rs: Ruleset;
  title: string;
  subtitle?: string;
  smogon?: SmogonSet;
  set: TeamSet;
  onAdd: () => void;
}) {
  const moves = smogon ? smogon.moves : set.moves;
  const move = (m: string) => <MoveName rs={rs} name={m} />;
  return (
    <section className={`${card} flex flex-col gap-2 p-4`}>
      <div>
        <h3 className="font-semibold">{title}</h3>
        {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
      </div>
      <ul className="list-inside list-disc text-sm">
        {moves.map((m, i) => (
          <li key={i}>{options(m, move)}</li>
        ))}
      </ul>
      <div className="space-y-0.5">
        <Line label="Item" value={options(smogon ? smogon.item : set.item, (i) => <ItemName rs={rs} name={i} />)} />
        <Line label="Ability" value={smogon ? optionLabel(smogon.ability) : set.ability} />
        <Line label="Nature" value={smogon ? optionLabel(smogon.nature) : set.nature} />
        <Line label="EVs" value={formatEvs(smogon ? (Array.isArray(smogon.evs) ? smogon.evs[0] : smogon.evs) : set.evs)} />
        <Line label="Tera" value={smogon ? optionLabel(smogon.teratypes) : set.teraType} />
      </div>
      <div className="mt-auto pt-1">
        <button className={button} onClick={onAdd}>
          Add to team
        </button>
        {smogon && moves.some(Array.isArray) && (
          <span className="ml-2 text-xs text-slate-500">uses the first option of each slash</span>
        )}
      </div>
    </section>
  );
}
