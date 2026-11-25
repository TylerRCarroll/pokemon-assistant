import { useSearchParams } from 'react-router-dom';
import { input } from '../../components/ui';
import { formatsFor } from '../../data/formats';
import { pickRatesFromTrainers, pickRatesFromUsage, type PickCategory } from '../../lib/pickRates';
import { loadFormat } from '../../lib/smogon';
import { genFeatures } from '../../lib/team';
import { usePromise } from '../../lib/usePromise';
import type { Ruleset } from '../../rulesets/types';
import { useRuleset } from '../../state/ruleset';
import { AbilityList, ItemList, NatureList } from './PickLists';
import { MoveList } from './MoveList';
import { PokemonList } from './PokemonList';

const TABS = [
  { id: 'pokemon', label: 'Pokémon' },
  { id: 'moves', label: 'Moves' },
  { id: 'abilities', label: 'Abilities' },
  { id: 'items', label: 'Items' },
  { id: 'natures', label: 'Natures' },
] as const;
type Tab = (typeof TABS)[number]['id'];

const PICK_TABS: readonly string[] = ['abilities', 'items', 'natures'] satisfies PickCategory[];

/** Where pick rates come from: Smogon formats for official gens, the game's trainers for romhacks that have them */
function pickSources(rs: Ruleset) {
  return [
    ...formatsFor(rs.id).map((f) => ({ id: f.id, label: `${rs.name} ${f.name}` })),
    ...(rs.loadTrainers ? [{ id: 'trainers', label: `${rs.name} trainers` }] : []),
  ];
}

function tabAvailable(rs: Ruleset, tab: Tab) {
  const f = genFeatures(rs);
  return tab === 'items' ? f.items : tab === 'abilities' || tab === 'natures' ? f.abilities : true;
}

export function DexPage() {
  const rs = useRuleset();
  const [params, setParams] = useSearchParams();
  const tabs = TABS.filter((t) => tabAvailable(rs, t.id));
  const tab = (tabs.find((t) => t.id === params.get('tab'))?.id ?? 'pokemon') as Tab;
  const query = params.get('q') ?? '';
  const type = params.get('type') ?? '';

  const sources = pickSources(rs);
  const source = sources.find((s) => s.id === params.get('meta')) ?? sources[0];
  const showPicks = PICK_TABS.includes(tab) && !!source;
  const picks = usePromise(async () => {
    if (!showPicks) return undefined;
    if (source.id === 'trainers') return pickRatesFromTrainers(rs, await rs.loadTrainers!());
    const data = await loadFormat(source.id);
    return data && pickRatesFromUsage(rs, data);
  }, [rs, source?.id, showPicks]);

  const update = (changes: Record<string, string>) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(changes)) {
          if (v) next.set(k, v);
          else next.delete(k);
        }
        return next;
      },
      { replace: true },
    );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">Dex</h1>
        <div className="flex rounded border border-slate-300 p-0.5 dark:border-slate-700">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => update({ tab: t.id === 'pokemon' ? '' : t.id, type: '' })}
              className={`rounded px-3 py-1 text-sm font-medium ${tab === t.id ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900' : 'hover:bg-slate-100 dark:hover:bg-slate-800'}`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <input
          type="search"
          value={query}
          onChange={(e) => update({ q: e.target.value })}
          placeholder="Search…"
          className={`${input} w-56`}
          autoFocus
        />
        {(tab === 'pokemon' || tab === 'moves') && (
          <select value={type} onChange={(e) => update({ type: e.target.value })} className={input}>
            <option value="">All types</option>
            {rs.types.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        )}
        {showPicks && sources.length > 1 && (
          <label className="flex items-center gap-1.5 text-sm">
            <span className="text-slate-500">Pick rates from</span>
            <select value={source.id} onChange={(e) => update({ meta: e.target.value })} className={input}>
              {sources.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        )}
        {showPicks && sources.length === 1 && <span className="text-sm text-slate-500">Pick rates from {source.label}</span>}
        {showPicks && picks.loading && <span className="text-sm text-slate-400">Loading…</span>}
      </div>

      {tab === 'pokemon' && <PokemonList rs={rs} query={query} type={type} />}
      {tab === 'moves' && <MoveList rs={rs} query={query} type={type} />}
      {tab === 'abilities' && <AbilityList rs={rs} query={query} picks={picks.data?.abilities} />}
      {tab === 'items' && <ItemList rs={rs} query={query} picks={picks.data?.items} />}
      {tab === 'natures' && <NatureList rs={rs} query={query} picks={picks.data?.natures} />}
    </div>
  );
}

