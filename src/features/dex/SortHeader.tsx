import type { SortState } from './useSort';

export function SortHeader<K extends string>({
  label,
  col,
  sort,
  onSort,
  className = '',
}: {
  label: string;
  col: K;
  sort: SortState<K>;
  onSort: (k: K) => void;
  className?: string;
}) {
  const active = sort.key === col;
  return (
    <th className={`px-2 py-1.5 font-semibold ${className}`}>
      <button onClick={() => onSort(col)} className={`hover:underline ${active ? 'text-slate-900 dark:text-white' : ''}`}>
        {label}
        {active && (sort.desc ? ' ↓' : ' ↑')}
      </button>
    </th>
  );
}
