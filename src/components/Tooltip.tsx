import { useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { formatAccuracy, formatPower } from '../lib/format';
import type { Ruleset } from '../rulesets/types';
import { CategoryBadge } from './MoveBits';
import { TypeBadge } from './TypeBadge';

const WIDTH = 288;
const GAP = 6;

/**
 * Hover/focus popup rendered into <body>, so it isn't clipped by overflow-hidden
 * parents (the usage-share bars, say). Opens below the trigger, or above near the bottom of the screen.
 */
export function Tooltip({ content, children }: { content: ReactNode; children: ReactNode }) {
  const [rect, setRect] = useState<DOMRect>();
  const open = (e: { currentTarget: HTMLElement }) => setRect(e.currentTarget.getBoundingClientRect());
  const close = () => setRect(undefined);
  const below = rect && rect.bottom + 180 < window.innerHeight;
  return (
    <span onMouseEnter={open} onMouseLeave={close} onFocus={open} onBlur={close} className="cursor-help">
      {children}
      {rect &&
        createPortal(
          <div
            role="tooltip"
            style={{
              position: 'fixed',
              width: WIDTH,
              left: Math.max(8, Math.min(rect.left, window.innerWidth - WIDTH - 8)),
              ...(below ? { top: rect.bottom + GAP } : { bottom: window.innerHeight - rect.top + GAP }),
            }}
            className="pointer-events-none z-50 rounded-lg border border-slate-200 bg-white p-3 text-left text-xs font-normal text-slate-700 shadow-lg dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          >
            {content}
          </div>,
          document.body,
        )}
    </span>
  );
}

/** An item name that shows the item's effect on hover */
export function ItemName({ rs, name }: { rs: Ruleset; name: string }) {
  const item = rs.getItem(name);
  const text = item?.shortDesc || item?.desc;
  if (!item || !text) return <>{name}</>;
  return (
    <Tooltip
      content={
        <>
          <div className="mb-1 text-sm font-semibold">{item.name}</div>
          <p>{text}</p>
        </>
      }
    >
      {item.name}
    </Tooltip>
  );
}

/** A move name (or custom children, e.g. a dex link) that shows type, stats, and effect on hover */
export function MoveName({ rs, name, children }: { rs: Ruleset; name: string; children?: ReactNode }) {
  const move = rs.getMove(name);
  if (!move) return <>{children ?? name}</>;
  return (
    <Tooltip
      content={
        <>
          <div className="mb-1.5 flex items-center gap-1.5">
            <span className="mr-auto text-sm font-semibold">{move.name}</span>
            <TypeBadge type={move.type} />
            <CategoryBadge category={move.category} />
          </div>
          <div className="mb-1.5 flex gap-3 tabular-nums text-slate-500 dark:text-slate-400">
            <span>Power {formatPower(move)}</span>
            <span>Acc {formatAccuracy(move)}</span>
            <span>PP {move.pp}</span>
            {move.priority !== 0 && <span>Priority {move.priority > 0 ? `+${move.priority}` : move.priority}</span>}
          </div>
          <p>{move.shortDesc || move.desc}</p>
        </>
      }
    >
      {children ?? move.name}
    </Tooltip>
  );
}
