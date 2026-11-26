import { useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { CategoryBadge } from '../../components/MoveBits';
import { SearchSelect, type Option } from '../../components/SearchSelect';
import { TypeBadge } from '../../components/TypeBadge';
import { card, input, link } from '../../components/ui';
import { formatPower } from '../../lib/format';
import type { SetIssue } from '../../lib/legality';
import { evTotal, finalStats, genFeatures, newSet, STAT_IDS, STAT_LABELS, type TeamSet } from '../../lib/team';
import type { LearnsetEntry, Ruleset, StatID } from '../../rulesets/types';

const label = 'mb-0.5 block text-xs font-semibold uppercase text-slate-500';

export function SetEditor({
  rs,
  set,
  learnset,
  issues,
  onChange,
  onRemove,
  narrow = false,
}: {
  rs: Ruleset;
  set: TeamSet | null;
  learnset?: LearnsetEntry[];
  issues: SetIssue[];
  onChange: (set: TeamSet) => void;
  /** Omit to hide the remove button (e.g. in the calculator) */
  onRemove?: () => void;
  /** Two-column layout for half-width panels */
  narrow?: boolean;
}) {
  const f = genFeatures(rs);

  const speciesOptions = useMemo<Option[]>(
    () =>
      rs.species().map((s) => ({
        value: s.name,
        label: s.name,
        extra: s.types.map((t) => <TypeBadge key={t} type={t} short />),
      })),
    [rs],
  );
  const itemOptions = useMemo<Option[]>(() => rs.items().map((i) => ({ value: i.name, label: i.name })), [rs]);
  const moveOptions = useMemo<Option[]>(
    () =>
      (learnset ?? [])
        .map((e) => rs.getMove(e.move))
        .filter((m) => !!m)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((m) => ({
          value: m.name,
          label: m.name,
          extra: (
            <>
              <TypeBadge type={m.type} short />
              <CategoryBadge category={m.category} />
              <span className="w-7 text-right tabular-nums">{formatPower(m)}</span>
            </>
          ),
        })),
    [rs, learnset],
  );
  const moveInputs = useRef<(HTMLInputElement | null)[]>([]);

  if (!set) {
    return (
      <div className={`${card} p-4`}>
        <span className={label}>Pick a Pokémon</span>
        <div className="max-w-sm">
          <SearchSelect value="" options={speciesOptions} onChange={(name) => name && onChange(newSet(rs, name))} placeholder="Search Pokémon…" />
        </div>
      </div>
    );
  }

  const sp = rs.getSpecies(set.species);
  const stats = finalStats(rs, set);
  const nature = rs.natures().find((n) => n.name === set.nature);
  const update = (patch: Partial<TeamSet>) => onChange({ ...set, ...patch });
  const setMove = (i: number, name: string) => {
    const moves = [...set.moves];
    moves[i] = name;
    update({ moves: moves.filter(Boolean) });
  };
  // Enter on a move jumps to the next empty slot so the moveset can be typed in one go
  const nextMove = (i: number, name: string) => {
    const moves = [...set.moves];
    moves[i] = name;
    const filled = moves.filter(Boolean).length;
    // moves are kept packed to the front, so the first empty box is at index `filled`; all four boxes are
    // always rendered, so focus can move right away and fast typists don't lose keystrokes
    if (filled < 4) moveInputs.current[filled]?.focus();
  };
  const setStat = (kind: 'evs' | 'ivs', stat: StatID, value: number) =>
    update({ [kind]: { ...set[kind], [stat]: Math.max(0, Math.min(kind === 'evs' ? 252 : 31, value || 0)) } });
  const badMoves = new Set(issues.filter((i) => i.field === 'moves').map((i) => i.message));
  const moveInvalid = (name: string) => [...badMoves].some((m) => m.includes(name));

  return (
    <div className={`${card} space-y-4 p-4`}>
      <div className={`grid gap-3 sm:grid-cols-2 ${narrow ? '' : 'lg:grid-cols-4'}`}>
        <div>
          <span className={label}>Pokémon</span>
          <SearchSelect
            value={set.species}
            options={speciesOptions}
            onChange={(name) => name && name !== set.species && onChange(newSet(rs, name))}
          />
          {sp && (
            <Link to={`/dex/pokemon/${sp.id}`} className={`${link} text-xs`}>
              Dex page
            </Link>
          )}
        </div>
        {f.items && (
          <div>
            <span className={label}>Item</span>
            <SearchSelect value={set.item ?? ''} options={itemOptions} onChange={(item) => update({ item: item || undefined })} placeholder="No item" clearable />
          </div>
        )}
        {f.abilities && (
          <div>
            <span className={label}>Ability</span>
            <select value={set.ability ?? ''} onChange={(e) => update({ ability: e.target.value })} className={`${input} w-full`}>
              {sp?.abilities.map((a) => (
                <option key={a}>{a}</option>
              ))}
              {set.ability && !sp?.abilities.includes(set.ability) && <option>{set.ability}</option>}
            </select>
          </div>
        )}
        <div className="flex gap-3">
          <div className="w-20">
            <span className={label}>Level</span>
            <input type="number" min={1} max={100} value={set.level} onChange={(e) => update({ level: Number(e.target.value) || 1 })} className={`${input} w-full`} />
          </div>
          {f.tera && (
            <div className="flex-1">
              <span className={label}>Tera</span>
              <select value={set.teraType ?? ''} onChange={(e) => update({ teraType: e.target.value })} className={`${input} w-full`}>
                {[...rs.types, 'Stellar'].map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      <div>
        <span className={label}>
          Moves {!learnset && <span className="font-normal normal-case">(loading learnset…)</span>}
        </span>
        <div className="grid gap-2 sm:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <SearchSelect
              key={i}
              value={set.moves[i] ?? ''}
              options={moveOptions}
              onChange={(name) => setMove(i, name)}
              onEnter={(name) => nextMove(i, name)}
              inputRef={(el) => {
                moveInputs.current[i] = el;
              }}
              placeholder={`Move ${i + 1}`}
              invalid={!!set.moves[i] && moveInvalid(set.moves[i])}
              clearable
            />
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-6">
        <table className="text-sm">
          <thead className="text-xs uppercase text-slate-500">
            <tr>
              <th className="pr-3 text-left font-semibold">Stat</th>
              <th className="pr-3 text-right font-semibold">Base</th>
              <th className="pr-3 font-semibold">EVs</th>
              <th className="pr-3 font-semibold">IVs</th>
              <th className="text-right font-semibold">Total</th>
            </tr>
          </thead>
          <tbody>
            {STAT_IDS.map((s) => (
              <tr key={s}>
                <td className="pr-3 font-medium">
                  {STAT_LABELS[s]}
                  {nature?.plus === s && nature.plus !== nature.minus && <span className="text-green-600"> +</span>}
                  {nature?.minus === s && nature.plus !== nature.minus && <span className="text-red-600"> −</span>}
                </td>
                <td className="pr-3 text-right tabular-nums text-slate-500">{sp?.baseStats[s]}</td>
                <td className="pr-3 py-0.5">
                  <input type="number" min={0} max={252} step={4} value={set.evs[s]} onChange={(e) => setStat('evs', s, Number(e.target.value))} className={`${input} w-16`} />
                </td>
                <td className="pr-3">
                  <input type="number" min={0} max={31} value={set.ivs[s]} onChange={(e) => setStat('ivs', s, Number(e.target.value))} className={`${input} w-14`} />
                </td>
                <td className="text-right font-semibold tabular-nums">{stats?.[s]}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="space-y-2 pb-1">
          {f.natures && (
            <div>
              <span className={label}>Nature</span>
              <select value={set.nature ?? ''} onChange={(e) => update({ nature: e.target.value })} className={input}>
                {rs.natures().map((n) => (
                  <option key={n.name} value={n.name}>
                    {n.name}
                    {n.plus && n.plus !== n.minus ? ` (+${STAT_LABELS[n.plus]} −${STAT_LABELS[n.minus!]})` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}
          {f.evTotalCap && (
            <p className={`text-xs ${evTotal(set.evs) > f.evTotalCap ? 'text-red-600' : 'text-slate-500'}`}>
              {f.evTotalCap - evTotal(set.evs)} EVs left
            </p>
          )}
        </div>
      </div>

      {issues.length > 0 && (
        <ul className="list-inside list-disc text-sm text-red-700 dark:text-red-400">
          {issues.map((i) => (
            <li key={i.message}>{i.message}</li>
          ))}
        </ul>
      )}

      {onRemove && (
        <button onClick={onRemove} className="text-sm text-red-700 hover:underline dark:text-red-400">
          Remove from team
        </button>
      )}
    </div>
  );
}
