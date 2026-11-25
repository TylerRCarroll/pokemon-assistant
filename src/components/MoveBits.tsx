import type { MoveInfo } from '../rulesets/types';

const CATEGORY_STYLE: Record<MoveInfo['category'], string> = {
  Physical: 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300',
  Special: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300',
  Status: 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
};

export function CategoryBadge({ category }: { category: MoveInfo['category'] }) {
  return <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${CATEGORY_STYLE[category]}`}>{category}</span>;
}

