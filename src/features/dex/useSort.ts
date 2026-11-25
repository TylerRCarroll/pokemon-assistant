import { useState } from 'react';

export type SortState<K extends string> = { key: K; desc: boolean };

/** Column sort state: clicking the active column flips direction; numeric columns start descending */
export function useSort<K extends string>(initial: K, numeric: readonly K[], initialDesc = false) {
  const [sort, setSort] = useState<SortState<K>>({ key: initial, desc: initialDesc });
  const toggle = (key: K) =>
    setSort((s) => (s.key === key ? { key, desc: !s.desc } : { key, desc: numeric.includes(key) }));
  return [sort, toggle] as const;
}
