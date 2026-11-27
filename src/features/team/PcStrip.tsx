import { Link } from 'react-router-dom';
import { Sprite } from '../../components/Sprite';
import { card } from '../../components/ui';
import type { Ruleset } from '../../rulesets/types';
import type { StoredMon } from '../../state/box';

/** The playthrough's PC, minus whoever is on the team: tap one to put it in the selected slot */
export function PcStrip({ rs, mons, gameName, slotLabel, onPlace }: { rs: Ruleset; mons: StoredMon[]; gameName: string; slotLabel: string; onPlace: (mon: StoredMon) => void }) {
  return (
    <section className={`${card} p-3`}>
      <div className="mb-2 flex flex-wrap items-baseline gap-x-2">
        <h2 className="font-semibold">PC</h2>
        <span className="text-xs text-slate-500">
          {gameName} · {mons.length} not on this team.{' '}
          {mons.length ? `Tap one to put it in ${slotLabel}; whoever was there goes back to the PC.` : 'Mons you swap out land here, sets intact.'}
        </span>
        <Link to="/pc" className="ml-auto text-xs font-medium text-blue-700 hover:underline dark:text-blue-400">
          Open PC
        </Link>
      </div>
      {mons.length > 0 && (
        <ul className="flex gap-2 overflow-x-auto pb-1">
          {mons.map((m) => (
            <li key={m.id} className="shrink-0">
              <button
                onClick={() => onPlace(m)}
                title={[m.set.item, m.set.ability, ...m.set.moves].filter(Boolean).join(' · ')}
                className="flex w-20 flex-col items-center rounded border border-slate-200 p-1 text-center text-xs hover:border-blue-400 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
              >
                <Sprite id={rs.getSpecies(m.set.species)?.spriteId ?? ''} name={m.set.species} size={40} />
                <span className="w-full truncate font-medium">{m.set.species}</span>
                <span className="text-slate-500">Lv {m.set.level}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
