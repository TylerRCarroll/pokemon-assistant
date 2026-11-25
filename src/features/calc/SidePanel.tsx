import { useMemo } from 'react';
import { SearchSelect } from '../../components/SearchSelect';
import { card, input } from '../../components/ui';
import { BOOST_STATS, effectiveSpeed, type CalcSide } from '../../lib/calc';
import { setFromUsage } from '../../lib/smogon';
import type { FormatData } from '../../lib/smogonTypes';
import { genFeatures, STAT_LABELS, type TeamSet } from '../../lib/team';
import { usePromise } from '../../lib/usePromise';
import type { Ruleset } from '../../rulesets/types';
import { SetEditor } from '../team/SetEditor';

const STATUS = [
  ['', 'Healthy'],
  ['brn', 'Burned'],
  ['par', 'Paralyzed'],
  ['psn', 'Poisoned'],
  ['tox', 'Badly poisoned'],
  ['slp', 'Asleep'],
  ['frz', 'Frozen'],
] as const;
const BOOSTS = [6, 5, 4, 3, 2, 1, 0, -1, -2, -3, -4, -5, -6];
const small = 'mb-0.5 block text-xs font-semibold uppercase text-slate-500';

export function SidePanel({
  rs,
  title,
  side,
  onChange,
  teamSets,
  meta,
}: {
  rs: Ruleset;
  title: string;
  side?: CalcSide;
  onChange: (side: CalcSide | undefined) => void;
  teamSets: TeamSet[];
  meta?: FormatData;
}) {
  const f = genFeatures(rs);
  const learnset = usePromise(() => (side ? rs.learnset(side.set.species) : Promise.resolve(undefined)), [rs, side?.set.species]);
  const metaOptions = useMemo(
    () =>
      Object.keys(meta?.pokemon ?? {})
        .map((name) => rs.getSpecies(name))
        .filter((s) => !!s)
        .map((s) => ({ value: s.name, label: s.name })),
    [meta, rs],
  );
  const update = (patch: Partial<CalcSide>) => side && onChange({ ...side, ...patch });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <h2 className="mr-auto text-lg font-semibold">{title}</h2>
        {teamSets.length > 0 && (
          <label>
            <span className={small}>From your team</span>
            <select
              value=""
              onChange={(e) => {
                const s = teamSets[Number(e.target.value)];
                if (s) onChange({ set: s });
              }}
              className={input}
            >
              <option value="">Pick…</option>
              {teamSets.map((s, i) => (
                <option key={i} value={i}>
                  {s.species}
                </option>
              ))}
            </select>
          </label>
        )}
        {meta && (
          <div className="w-52">
            <span className={small}>Meta set (most common)</span>
            <SearchSelect
              value=""
              options={metaOptions}
              placeholder="Search threats…"
              onChange={(name) => {
                const u = name && meta.pokemon[name];
                if (u) onChange({ set: setFromUsage(rs, name, u) });
              }}
            />
          </div>
        )}
      </div>

      <SetEditor
        key={side?.set.species ?? 'empty'}
        rs={rs}
        set={side?.set ?? null}
        learnset={learnset.loading ? undefined : learnset.data}
        issues={[]}
        onChange={(set) => onChange({ ...side, set })}
        narrow
      />

      {side && (
        <div className={`${card} flex flex-wrap items-end gap-4 p-3`}>
          <div>
            <span className={small}>Boosts</span>
            <div className="flex gap-1">
              {BOOST_STATS.map((s) => (
                <label key={s} className="flex flex-col items-center text-xs text-slate-500">
                  {STAT_LABELS[s]}
                  <select
                    value={side.boosts?.[s] ?? 0}
                    onChange={(e) => update({ boosts: { ...side.boosts, [s]: Number(e.target.value) } })}
                    className={`${input} w-14 px-1`}
                  >
                    {BOOSTS.map((b) => (
                      <option key={b} value={b}>
                        {b > 0 ? `+${b}` : b}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          </div>
          <label>
            <span className={small}>Status</span>
            <select value={side.status ?? ''} onChange={(e) => update({ status: e.target.value as CalcSide['status'] })} className={input}>
              {STATUS.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <div className="flex flex-col gap-1 text-sm">
            {f.tera && (
              <label className="flex items-center gap-1.5">
                <input type="checkbox" checked={!!side.tera} onChange={(e) => update({ tera: e.target.checked })} />
                Terastallized ({side.set.teraType})
              </label>
            )}
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={!!side.reflect} onChange={(e) => update({ reflect: e.target.checked })} />
              Reflect
            </label>
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={!!side.lightScreen} onChange={(e) => update({ lightScreen: e.target.checked })} />
              Light Screen
            </label>
          </div>
          <div className="ml-auto text-right">
            <span className={small}>Speed</span>
            <span className="text-lg font-semibold tabular-nums">{effectiveSpeed(rs, side)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
