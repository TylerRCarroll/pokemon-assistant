import { input } from './ui';

/** Game difficulty picker for hacks with per-difficulty trainer teams; renders nothing otherwise */
export function DifficultySelect({
  difficulties,
  value,
  onChange,
}: {
  difficulties: string[];
  value?: string;
  onChange: (difficulty: string) => void;
}) {
  if (difficulties.length < 2) return null;
  return (
    <label className="flex items-center gap-1.5 text-sm">
      <span className="text-slate-500">Difficulty</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className={input}>
        {difficulties.map((d) => (
          <option key={d}>{d}</option>
        ))}
      </select>
    </label>
  );
}
