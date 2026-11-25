import { useSearchParams } from 'react-router-dom';
import { input } from '../../components/ui';
import { useRuleset } from '../../state/ruleset';
import { AbilityList, ItemList } from './DescriptionLists';
import { MoveList } from './MoveList';
import { PokemonList } from './PokemonList';

const TABS = [
  { id: 'pokemon', label: 'Pokémon' },
  { id: 'moves', label: 'Moves' },
  { id: 'abilities', label: 'Abilities' },
  { id: 'items', label: 'Items' },
] as const;
type Tab = (typeof TABS)[number]['id'];

export function DexPage() {
  const rs = useRuleset();
  const [params, setParams] = useSearchParams();
  const tab = (TABS.find((t) => t.id === params.get('tab'))?.id ?? 'pokemon') as Tab;
  const query = params.get('q') ?? '';
  const type = params.get('type') ?? '';

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
          {TABS.map((t) => (
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
      </div>

      {tab === 'pokemon' && <PokemonList rs={rs} query={query} type={type} />}
      {tab === 'moves' && <MoveList rs={rs} query={query} type={type} />}
      {tab === 'abilities' && <AbilityList rs={rs} query={query} />}
      {tab === 'items' && <ItemList rs={rs} query={query} />}
    </div>
  );
}

