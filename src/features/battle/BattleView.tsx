import type { Pokemon } from '@pkmn/sim';
import { Sprite } from '../../components/Sprite';
import { TypeBadge } from '../../components/TypeBadge';
import { card } from '../../components/ui';
import type { BattleSession, SideID } from '../../battle/engine';
import type { Revealed } from '../../battle/reveal';

const STATUS: Record<string, [string, string]> = {
  brn: ['BRN', 'bg-orange-500'],
  par: ['PAR', 'bg-yellow-500'],
  psn: ['PSN', 'bg-purple-500'],
  tox: ['TOX', 'bg-purple-700'],
  slp: ['SLP', 'bg-slate-500'],
  frz: ['FRZ', 'bg-cyan-500'],
};

const BOOST_LABEL: Record<string, string> = { atk: 'Atk', def: 'Def', spa: 'SpA', spd: 'SpD', spe: 'Spe', accuracy: 'Acc', evasion: 'Eva' };

// volatiles worth showing; the rest are bookkeeping
const VOLATILES: Record<string, string> = {
  confusion: 'Confused',
  substitute: 'Substitute',
  leechseed: 'Leech Seed',
  taunt: 'Taunt',
  encore: 'Encore',
  torment: 'Torment',
  disable: 'Disable',
  focusenergy: 'Focus Energy',
  ppdirehit: 'Dire Hit',
  attract: 'Infatuated',
  curse: 'Cursed',
  perishsong: 'Perish Song',
  yawn: 'Drowsy',
  partiallytrapped: 'Trapped',
  dynamax: 'Dynamaxed',
  choicelock: 'Choice-locked',
  flashfire: 'Flash Fire',
  aquaring: 'Aqua Ring',
  ingrain: 'Ingrain',
  magnetrise: 'Magnet Rise',
  stockpile: 'Stockpile',
  charge: 'Charged',
};

function hpColor(pct: number) {
  return pct > 50 ? 'bg-green-500' : pct > 20 ? 'bg-yellow-500' : 'bg-red-500';
}

export function HpBar({ mon, exact }: { mon: Pokemon; exact: boolean }) {
  const pct = mon.fainted ? 0 : Math.max(1, Math.round((mon.hp / mon.maxhp) * 100));
  return (
    <div>
      <div className="h-2.5 w-full overflow-hidden rounded bg-slate-200 dark:bg-slate-700">
        <div className={`h-full ${hpColor(pct)} transition-all`} style={{ width: `${mon.fainted ? 0 : (mon.hp / mon.maxhp) * 100}%` }} />
      </div>
      <div className="mt-0.5 text-right text-xs tabular-nums text-slate-500">{mon.fainted ? 'Fainted' : exact ? `${mon.hp}/${mon.maxhp}` : `${pct}%`}</div>
    </div>
  );
}

function ActiveCard({ session, side, hidden, reveal }: { session: BattleSession; side: SideID; hidden: boolean; reveal?: Revealed }) {
  const mon = session.active(side);
  const s = session.side(side);
  if (!mon) return <div className={`${card} p-3 text-sm text-slate-500`}>{s.name}: no Pokémon in battle</div>;
  const sp = session.rs.getSpecies(mon.species.name);
  const types = mon.terastallized ? [mon.terastallized] : mon.getTypes();
  const boosts = Object.entries(mon.boosts).filter(([, n]) => n);
  const vols = Object.keys(mon.volatiles).flatMap((v) => (VOLATILES[v] ? [VOLATILES[v]] : []));
  const dex = session.battle.dex;
  const item = hidden ? reveal?.item : mon.item ? dex.items.get(mon.item).name : undefined;
  const ability = hidden ? reveal?.ability : dex.abilities.get(mon.ability).name;
  const moves = hidden ? [...(reveal?.moves ?? [])] : mon.moveSlots.map((m) => `${m.move} ${m.pp}/${m.maxpp}`);
  return (
    <div className={`${card} flex gap-3 p-3`}>
      <Sprite id={sp?.spriteId ?? mon.species.id} name={mon.species.name} size={64} />
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-semibold">{mon.name}</span>
          <span className="text-xs text-slate-500">Lv {mon.level}</span>
          {types.map((t) => (
            <TypeBadge key={t} type={t} short />
          ))}
          {mon.terastallized && <span className="text-xs font-medium text-sky-600 dark:text-sky-400">Tera</span>}
          {mon.status && STATUS[mon.status] && <span className={`rounded px-1 text-xs font-bold text-white ${STATUS[mon.status][1]}`}>{STATUS[mon.status][0]}</span>}
        </div>
        <HpBar mon={mon} exact={!hidden} />
        <div className="flex flex-wrap gap-x-2 text-xs text-slate-600 dark:text-slate-400">
          {ability && <span>{ability}</span>}
          {item && <span>@ {item}</span>}
          {boosts.map(([stat, n]) => (
            <span key={stat} className={n > 0 ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}>
              {n > 0 ? '+' : ''}
              {n} {BOOST_LABEL[stat]}
            </span>
          ))}
          {vols.map((v) => (
            <span key={v} className="text-amber-700 dark:text-amber-400">
              {v}
            </span>
          ))}
        </div>
        {moves.length > 0 && <div className="text-xs text-slate-500">{moves.join(' · ')}</div>}
      </div>
    </div>
  );
}

/** The side's party as a strip: tap targets for nothing, just who's left */
function Party({ session, side, hidden }: { session: BattleSession; side: SideID; hidden: boolean }) {
  const s = session.side(side);
  if (hidden) {
    // the games show only how many are left
    return (
      <div className="flex gap-1" title={`${s.pokemonLeft} left`}>
        {s.pokemon.map((p, i) => (
          <span key={i} className={`inline-block h-3 w-3 rounded-full border ${p.fainted ? 'border-slate-400 bg-slate-300 dark:bg-slate-700' : 'border-red-600 bg-red-500'}`} />
        ))}
      </div>
    );
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {s.pokemon.map((p, i) => (
        <span
          key={i}
          className={`flex items-center gap-1 rounded border px-1 text-xs ${p.isActive ? 'border-blue-400' : 'border-slate-200 dark:border-slate-700'} ${p.fainted ? 'opacity-40' : ''}`}
          title={`${p.name}: ${p.hp}/${p.maxhp}${p.status ? ` (${p.status})` : ''}`}
        >
          <Sprite id={session.rs.getSpecies(p.species.name)?.spriteId ?? p.species.id} name={p.name} size={24} />
          <span className="tabular-nums">{p.fainted ? 'fnt' : `${Math.round((p.hp / p.maxhp) * 100)}%`}</span>
          {p.status && <span className="font-bold">{STATUS[p.status]?.[0]}</span>}
        </span>
      ))}
    </div>
  );
}

const CONDITION_NAMES: Record<string, string> = {
  reflect: 'Reflect',
  lightscreen: 'Light Screen',
  auroraveil: 'Aurora Veil',
  stealthrock: 'Stealth Rock',
  spikes: 'Spikes',
  toxicspikes: 'Toxic Spikes',
  stickyweb: 'Sticky Web',
  tailwind: 'Tailwind',
  safeguard: 'Safeguard',
  mist: 'Mist',
};

function Field({ session }: { session: BattleSession }) {
  const f = session.battle.field;
  const dex = session.battle.dex;
  const bits = [
    f.weather && dex.conditions.get(f.weather).name,
    f.terrain && dex.conditions.get(f.terrain).name,
    ...Object.keys(f.pseudoWeather).map((p) => dex.conditions.get(p).name),
  ].filter(Boolean);
  const sides = (['p1', 'p2'] as const).map((id) => {
    const conds = session.side(id).sideConditions;
    return Object.entries(conds).map(([k, v]) => `${CONDITION_NAMES[k] ?? dex.conditions.get(k).name}${(v as { layers?: number }).layers ? ` ×${(v as { layers?: number }).layers}` : ''}`);
  });
  if (!bits.length && !sides[0].length && !sides[1].length) return null;
  return (
    <div className="flex flex-wrap gap-x-4 text-xs text-slate-600 dark:text-slate-400">
      {bits.length > 0 && <span>Field: {bits.join(', ')}</span>}
      {sides[1].length > 0 && <span>{session.side('p2').name}: {sides[1].join(', ')}</span>}
      {sides[0].length > 0 && <span>{session.side('p1').name}: {sides[0].join(', ')}</span>}
    </div>
  );
}

/** Both sides of a battle: the opponent above, you below */
export function BattleView({ session, hidden, reveal }: { session: BattleSession; hidden: boolean; reveal?: Map<string, Revealed> }) {
  const foe = session.active('p2');
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">{session.side('p2').name}</span>
        <Party session={session} side="p2" hidden={hidden} />
      </div>
      <ActiveCard session={session} side="p2" hidden={hidden} reveal={foe ? reveal?.get(foe.name) : undefined} />
      <Field session={session} />
      <ActiveCard session={session} side="p1" hidden={false} />
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">{session.side('p1').name}</span>
        <Party session={session} side="p1" hidden={false} />
      </div>
    </div>
  );
}
