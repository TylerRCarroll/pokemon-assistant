import { typeColor } from '../lib/format';

export function TypeBadge({ type, short = false }: { type: string; short?: boolean }) {
  return (
    <span
      className="inline-block rounded px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-white"
      style={{ backgroundColor: typeColor(type), textShadow: '0 1px 1px rgb(0 0 0 / 0.4)' }}
    >
      {short ? type.slice(0, 3) : type}
    </span>
  );
}
