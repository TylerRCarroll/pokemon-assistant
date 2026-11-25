import { Fragment, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Sprite } from '../../components/Sprite';
import { card, input, link } from '../../components/ui';
import type { FormatInfo } from '../../data/formats';
import { pct } from '../../lib/format';
import { setFromUsage } from '../../lib/smogon';
import type { FormatData } from '../../lib/smogonTypes';
import type { TeamSet } from '../../lib/team';
import { analyzeThreats, type Matchup, type ThreatReport } from '../../lib/threats';
import { groupBySplit, setFromTrainerMon, trainerName } from '../../lib/trainers';
import type { Ruleset, TrainerInfo } from '../../rulesets/types';

const DANGER_STYLE = {
  high: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
  medium: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  low: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
};

function MiniSprite({ rs, species }: { rs: Ruleset; species: string }) {
  const sp = rs.getSpecies(species);
  return (
    <span title={species}>
      <Sprite id={sp?.spriteId ?? ''} name={species} size={28} />
    </span>
  );
}

const dmgClass = (p = 0) => (p >= 100 ? 'text-red-600 font-semibold' : p >= 50 ? 'text-amber-600' : 'text-slate-600 dark:text-slate-300');

export function ThreatsView({
  rs,
  team,
  formats,
  format,
  onFormat,
  data,
  trainers,
  trainerId,
  onTrainer,
  onOpen,
}: {
  rs: Ruleset;
  team: TeamSet[];
  formats: FormatInfo[];
  format?: FormatInfo;
  onFormat: (id: string) => void;
  data?: FormatData;
  /** Romhack trainer teams; used instead of usage stats when the ruleset has none */
  trainers?: TrainerInfo[];
  trainerId?: number;
  onTrainer: (id: number) => void;
  onOpen: (member: TeamSet, threat: TeamSet) => void;
}) {
  const [count, setCount] = useState(30);
  const [expanded, setExpanded] = useState<string>();
  const [allTrainers, setAllTrainers] = useState(false);
  const [atCap, setAtCap] = useState(true);
  const trainerMode = !formats.length && !!trainers?.length;
  const bosses = useMemo(() => groupBySplit((trainers ?? []).filter((t) => allTrainers || t.boss)), [trainers, allTrainers]);
  const trainer = trainers?.find((t) => t.id === trainerId) ?? bosses[0]?.trainers[0];
  const cap = trainer && (trainer.levelCap ?? Math.max(...trainer.team.map((m) => m.level)));

  // in a romhack, compare at the split's level cap rather than whatever level the builder set
  const myTeam = useMemo(
    () => (trainerMode && atCap && cap ? team.map((s) => ({ ...s, level: cap })) : team),
    [team, trainerMode, atCap, cap],
  );

  const reports = useMemo<ThreatReport[]>(() => {
    if (!myTeam.length) return [];
    if (trainerMode) {
      if (!trainer) return [];
      return analyzeThreats(rs, trainer.team.map((m) => ({ set: setFromTrainerMon(rs, m), usage: 0 })), myTeam);
    }
    if (!data) return [];
    const threats = Object.entries(data.pokemon)
      .filter(([name]) => rs.getSpecies(name))
      .slice(0, count)
      .map(([name, u]) => ({ set: setFromUsage(rs, name, u), usage: u.usage }));
    return analyzeThreats(rs, threats, myTeam);
  }, [rs, data, myTeam, count, trainerMode, trainer]);

  if (!formats.length && !trainerMode) {
    return <p className={`${card} p-6 text-slate-500`}>Threat checks need usage stats, and Smogon has none for {rs.name}. The calculator tab still works.</p>;
  }
  if (!team.length) {
    return (
      <p className={`${card} p-6 text-slate-500`}>
        Build or import a {rs.name} team in the <Link to="/team" className={link}>Team Builder</Link> first; threats are checked against your active team.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {trainerMode ? (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <select value={trainer?.id ?? ''} onChange={(e) => onTrainer(Number(e.target.value))} className={`${input} max-w-md`}>
            {bosses.map((g) => (
              <optgroup key={g.split} label={`${g.split}${g.levelCap ? ` (cap ${g.levelCap})` : ''}`}>
                {g.trainers.map((t) => (
                  <option key={`${t.id}-${t.location}`} value={t.id}>
                    {trainerName(t)} · {t.location}
                    {t.notes.length ? ` · ${t.notes[0]}` : ''}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={allTrainers} onChange={(e) => setAllTrainers(e.target.checked)} />
            All trainers
          </label>
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={atCap} onChange={(e) => setAtCap(e.target.checked)} />
            Set my team to level {cap}
          </label>
          <span className="text-xs text-slate-500">A check either walls it (takes under 50%, hits back for 50%+) or outspeeds and OHKOs it.</span>
        </div>
      ) : (
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <select value={format?.id} onChange={(e) => onFormat(e.target.value)} className={input}>
          {formats.map((f) => (
            <option key={f.id} value={f.id}>
              {rs.name} {f.name}
            </option>
          ))}
        </select>
        <select value={count} onChange={(e) => setCount(Number(e.target.value))} className={input}>
          {[20, 30, 50].map((n) => (
            <option key={n} value={n}>
              Top {n} by usage
            </option>
          ))}
        </select>
        <span className="text-xs text-slate-500">
          Each threat uses its most common set. A check either walls it (takes under 50%, hits back for 50%+) or outspeeds and OHKOs it.
        </span>
      </div>
      )}

      <div className={`${card} overflow-x-auto`}>
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 text-left text-xs uppercase text-slate-500 dark:border-slate-800">
            <tr>
              <th className="px-3 py-2 font-semibold">Threat</th>
              <th className="px-2 py-2 font-semibold">{trainerMode ? 'Level' : 'Usage'}</th>
              <th className="px-2 py-2 font-semibold">OHKOs</th>
              <th className="px-2 py-2 font-semibold">2HKOs</th>
              <th className="px-2 py-2 font-semibold">Your checks</th>
              <th className="px-2 py-2 font-semibold">Outspeeds</th>
            </tr>
          </thead>
          <tbody>
            {reports.map((r, i) => {
              const key = `${r.threat.species}-${i}`;
              const isOpen = expanded === key;
              return (
                <Fragment key={key}>
                  <tr
                    onClick={() => setExpanded(isOpen ? undefined : key)}
                    className="cursor-pointer border-b border-slate-100 hover:bg-slate-50 dark:border-slate-800/60 dark:hover:bg-slate-800/40"
                  >
                    <td className="px-3 py-1.5">
                      <div className="flex items-center gap-2">
                        <span className={`w-16 rounded px-1.5 py-0.5 text-center text-xs font-semibold capitalize ${DANGER_STYLE[r.danger]}`}>{r.danger}</span>
                        <MiniSprite rs={rs} species={r.threat.species} />
                        <span className="font-medium">{r.threat.species}</span>
                      </div>
                    </td>
                    <td className="px-2 tabular-nums text-slate-500">{trainerMode ? `Lv${r.threat.level}` : pct(r.usage)}</td>
                    <td className="px-2 tabular-nums">{r.ohkos}</td>
                    <td className="px-2 tabular-nums">{r.twoHkos}</td>
                    <td className="px-2">
                      <span className="flex">
                        {r.matchups.filter((m) => m.checks).map((m, i) => (
                          <MiniSprite key={i} rs={rs} species={m.member.species} />
                        ))}
                        {!r.checks && <span className="text-red-600">none</span>}
                      </span>
                    </td>
                    <td className="px-2 tabular-nums">
                      {r.matchups.filter((m) => m.threatFaster).length}/{r.matchups.length}
                    </td>
                  </tr>
                  {isOpen && (
                    <tr className="border-b border-slate-100 bg-slate-50/60 dark:border-slate-800/60 dark:bg-slate-900/60">
                      <td colSpan={6} className="px-3 py-2">
                        <MatchupGrid rs={rs} report={r} onOpen={onOpen} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MatchupGrid({ rs, report, onOpen }: { rs: Ruleset; report: ThreatReport; onOpen: (member: TeamSet, threat: TeamSet) => void }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {report.matchups.map((m: Matchup, i) => (
        <div key={i} className="flex items-center gap-2 rounded border border-slate-200 bg-white p-2 dark:border-slate-700 dark:bg-slate-900">
          <MiniSprite rs={rs} species={m.member.species} />
          <div className="min-w-0 flex-1 text-xs">
            <div className="font-medium">
              {m.member.species} {m.walls && <span className="text-green-600">✓ walls it</span>}
              {m.revengeKills && <span className="text-green-600">✓ outspeeds &amp; OHKOs</span>}
            </div>
            <div>
              Takes <span className={dmgClass(m.theirBest?.maxPct)}>{m.theirBest ? `${m.theirBest.minPct}–${m.theirBest.maxPct}%` : '—'}</span>
              {m.theirBest && ` (${m.theirBest.move})`}
            </div>
            <div>
              Deals <span className={dmgClass(m.yourBest?.maxPct)}>{m.yourBest ? `${m.yourBest.minPct}–${m.yourBest.maxPct}%` : '—'}</span>
              {m.yourBest && ` (${m.yourBest.move})`}
            </div>
            <div className="text-slate-500">{m.speedTie ? 'Speed tie' : m.threatFaster ? 'Threat is faster' : 'You are faster'}</div>
          </div>
          <button
            onClick={() => onOpen(m.member, report.threat)}
            className="shrink-0 rounded border border-slate-300 px-2 py-0.5 text-xs hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
          >
            Calc
          </button>
        </div>
      ))}
    </div>
  );
}
