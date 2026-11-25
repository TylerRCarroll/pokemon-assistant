import { bucketProfile, defensiveProfile } from '../lib/typechart';
import type { Ruleset, TypeName } from '../rulesets/types';
import { TypeBadge } from './TypeBadge';
import { card } from './ui';

const BUCKETS = [
  ['quad', '4× weak'],
  ['weak', '2× weak'],
  ['resist', '½ resists'],
  ['quarter', '¼ resists'],
  ['immune', 'Immune'],
] as const;

/** What hits a typing hard, what it shrugs off. Empty buckets are hidden when `compact`. */
export function MatchupBuckets({ rs, types, compact = false }: { rs: Ruleset; types: TypeName[]; compact?: boolean }) {
  const buckets = bucketProfile(defensiveProfile(rs, types));
  const shown = compact ? BUCKETS.filter(([key]) => buckets[key].length) : BUCKETS;
  return (
    <div className={`grid gap-3 ${compact ? 'sm:grid-cols-2' : 'sm:grid-cols-2 lg:grid-cols-5'}`}>
      {shown.map(([key, label]) => (
        <div key={key} className={`${card} p-3`}>
          <div className="mb-2 text-xs font-semibold uppercase text-slate-500">{label}</div>
          <div className="flex flex-wrap gap-1">
            {buckets[key].length ? (
              buckets[key].map((t) => <TypeBadge key={t} type={t} />)
            ) : (
              <span className="text-sm text-slate-400">None</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
