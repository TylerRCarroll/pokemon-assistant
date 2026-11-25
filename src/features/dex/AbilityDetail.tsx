import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Sprite } from '../../components/Sprite';
import { TypeBadge } from '../../components/TypeBadge';
import { card } from '../../components/ui';
import { useRuleset } from '../../state/ruleset';
import { BackToDex, NotInRuleset } from './PokemonDetail';

export function AbilityDetail() {
  const { id = '' } = useParams();
  const rs = useRuleset();
  const ability = rs.getAbility(id);
  const holders = useMemo(
    () => (ability ? rs.species().filter((s) => s.abilities.includes(ability.name)) : []),
    [rs, ability],
  );

  if (!ability) return <NotInRuleset what="That ability" rs={rs} />;

  return (
    <div className="space-y-6">
      <BackToDex />
      <header>
        <h1 className="text-3xl font-bold">{ability.name}</h1>
      </header>
      <section className={`${card} p-4`}>
        <p className="text-sm">{ability.desc || ability.shortDesc}</p>
      </section>
      <section className={`${card} p-4`}>
        <h2 className="mb-2 font-semibold">
          Pokémon with {ability.name} <span className="font-normal text-slate-400">({holders.length})</span>
        </h2>
        <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
          {holders.map((s) => (
            <Link
              key={s.id}
              to={`/dex/pokemon/${s.id}`}
              className="flex items-center gap-2 rounded px-1 py-0.5 hover:bg-slate-50 dark:hover:bg-slate-800/50"
            >
              <Sprite id={s.spriteId} name={s.name} size={32} />
              <span className="text-sm font-medium">{s.name}</span>
              <span className="ml-auto flex gap-1">
                {s.types.map((t) => (
                  <TypeBadge key={t} type={t} short />
                ))}
              </span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
