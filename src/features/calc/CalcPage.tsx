import { useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { input } from '../../components/ui';
import { formatsFor } from '../../data/formats';
import { calcAll, effectiveSpeed, type FieldOptions } from '../../lib/calc';
import { loadFormat } from '../../lib/smogon';
import type { TeamSet } from '../../lib/team';
import { usePromise } from '../../lib/usePromise';
import type { Ruleset } from '../../rulesets/types';
import { useCalcStore } from '../../state/calc';
import { useRuleset } from '../../state/ruleset';
import { useTeamsStore } from '../../state/teams';
import { Results } from './Results';
import { SidePanel } from './SidePanel';
import { ThreatsView } from './ThreatsView';

const tabClass = (active: boolean) =>
  `rounded px-3 py-1 text-sm font-medium ${active ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900' : 'hover:bg-slate-100 dark:hover:bg-slate-800'}`;

/** Weather and terrain that exist in this ruleset's gen */
function fieldOptions(rs: Ruleset) {
  const weather = rs.gen === 1 ? [] : ['Sun', 'Rain', 'Sand', rs.gen >= 9 ? 'Snow' : 'Hail'];
  const terrain = rs.gen >= 6 ? ['Electric', 'Grassy', 'Psychic', 'Misty'] : [];
  return { weather, terrain };
}

export function CalcPage() {
  const rs = useRuleset();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'threats' ? 'threats' : 'calc';
  const { left, right, field, setSide, setField, load, ensureRuleset } = useCalcStore();
  useEffect(() => ensureRuleset(rs.id), [rs.id, ensureRuleset]);

  const formats = formatsFor(rs.id);
  const format = formats.find((f) => f.id === params.get('format')) ?? formats[0];
  const meta = usePromise(() => (format ? loadFormat(format.id) : Promise.resolve(undefined)), [format?.id]);

  // the ruleset's active team (same rule the Team Builder uses)
  const teams = useTeamsStore((s) => s.teams);
  const activeId = useTeamsStore((s) => s.activeByRuleset[rs.id]);
  const team = useMemo(() => {
    const mine = teams.filter((t) => t.rulesetId === rs.id);
    const t = mine.find((x) => x.id === activeId) ?? mine[0];
    return (t?.slots.filter(Boolean) ?? []) as TeamSet[];
  }, [teams, activeId, rs.id]);

  const opts = fieldOptions(rs);
  const setParam = (k: string, v: string) =>
    setParams((p) => {
      const next = new URLSearchParams(p);
      next.set(k, v);
      return next;
    });

  const aToB = useMemo(() => (left && right ? calcAll(rs, left, right, field) : []), [rs, left, right, field]);
  const bToA = useMemo(() => (left && right ? calcAll(rs, right, left, field) : []), [rs, left, right, field]);
  const speeds = left && right ? [effectiveSpeed(rs, left), effectiveSpeed(rs, right)] : undefined;

  const openMatchup = (member: TeamSet, threat: TeamSet) => {
    load(rs.id, { set: member }, { set: threat });
    setParams((p) => {
      const next = new URLSearchParams(p);
      next.delete('tab');
      return next;
    });
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="mr-2 text-2xl font-bold">Damage Calc</h1>
        <div className="flex rounded border border-slate-300 p-0.5 dark:border-slate-700">
          <button className={tabClass(tab === 'calc')} onClick={() => setParam('tab', 'calc')}>
            Calculator
          </button>
          <button className={tabClass(tab === 'threats')} onClick={() => setParam('tab', 'threats')}>
            Threats to my team
          </button>
        </div>
      </div>

      {tab === 'threats' ? (
        <ThreatsView
          rs={rs}
          team={team}
          formats={formats}
          format={format}
          onFormat={(id) => setParam('format', id)}
          data={meta.data}
          onOpen={openMatchup}
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-4 text-sm">
            {opts.weather.length > 0 && (
              <label className="flex items-center gap-1.5">
                Weather
                <select value={field.weather ?? ''} onChange={(e) => setField({ ...field, weather: e.target.value as FieldOptions['weather'] })} className={input}>
                  <option value="">None</option>
                  {opts.weather.map((w) => (
                    <option key={w}>{w}</option>
                  ))}
                </select>
              </label>
            )}
            {opts.terrain.length > 0 && (
              <label className="flex items-center gap-1.5">
                Terrain
                <select value={field.terrain ?? ''} onChange={(e) => setField({ ...field, terrain: e.target.value as FieldOptions['terrain'] })} className={input}>
                  <option value="">None</option>
                  {opts.terrain.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </label>
            )}
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={!!field.crit} onChange={(e) => setField({ ...field, crit: e.target.checked })} />
              Critical hits
            </label>
            {rs.gen >= 3 && (
              <label className="flex items-center gap-1.5">
                <input type="checkbox" checked={!!field.doubles} onChange={(e) => setField({ ...field, doubles: e.target.checked })} />
                Doubles (spread moves deal less)
              </label>
            )}
          </div>

          <div className="grid gap-5 xl:grid-cols-2">
            <SidePanel rs={rs} title="Pokémon A" side={left} onChange={(s) => setSide('left', s)} teamSets={team} meta={meta.data} />
            <SidePanel rs={rs} title="Pokémon B" side={right} onChange={(s) => setSide('right', s)} teamSets={team} meta={meta.data} />
          </div>

          {left && right && (
            <>
              {speeds && (
                <p className="text-sm">
                  {speeds[0] === speeds[1]
                    ? `Speed tie at ${speeds[0]}.`
                    : `${speeds[0] > speeds[1] ? left.set.species : right.set.species} moves first (${Math.max(...speeds)} vs ${Math.min(...speeds)}), ignoring priority.`}
                </p>
              )}
              <div className="grid gap-5 lg:grid-cols-2">
                <Results title={`${left.set.species} → ${right.set.species}`} results={aToB} />
                <Results title={`${right.set.species} → ${left.set.species}`} results={bToA} />
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
