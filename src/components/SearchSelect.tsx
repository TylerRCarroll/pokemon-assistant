import { useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { matches } from '../lib/search';
import { input } from './ui';

export interface Option {
  value: string;
  label: string;
  /** Optional extra content shown to the right of the label */
  extra?: ReactNode;
}

/**
 * Type-to-filter combobox. Shows the current value; typing filters options;
 * arrow keys + Enter pick, Escape cancels.
 */
export function SearchSelect({
  value,
  options,
  onChange,
  placeholder,
  invalid = false,
  maxResults = 60,
  clearable = false,
  onEnter,
  inputRef: externalRef,
}: {
  value: string;
  options: Option[];
  onChange: (value: string) => void;
  placeholder?: string;
  invalid?: boolean;
  maxResults?: number;
  clearable?: boolean;
  /** Called after a pick made with Enter (not the mouse), e.g. to move focus to the next field */
  onEnter?: (value: string) => void;
  inputRef?: (el: HTMLInputElement | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(
    () => (query ? options.filter((o) => matches(o.label, query)) : options).slice(0, maxResults),
    [options, query, maxResults],
  );
  const current = options.find((o) => o.value === value)?.label ?? value;

  const pick = (v: string) => {
    onChange(v);
    setOpen(false);
    setQuery('');
    inputRef.current?.blur();
  };

  return (
    <div className="relative">
      <input
        ref={(el) => {
          inputRef.current = el;
          externalRef?.(el);
        }}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        value={open ? query : current}
        placeholder={open ? current || placeholder : placeholder}
        onFocus={() => {
          setOpen(true);
          setQuery('');
          setCursor(0);
        }}
        onBlur={() => setOpen(false)}
        onChange={(e) => {
          setQuery(e.target.value);
          setCursor(0);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') setCursor((c) => Math.min(c + 1, filtered.length - 1));
          else if (e.key === 'ArrowUp') setCursor((c) => Math.max(c - 1, 0));
          else if (e.key === 'Enter' && filtered[cursor]) {
            const v = filtered[cursor].value;
            pick(v);
            onEnter?.(v);
          }
          else if (e.key === 'Escape') inputRef.current?.blur();
          else return;
          e.preventDefault();
        }}
        className={`${input} w-full ${invalid ? 'border-red-500 text-red-700 dark:border-red-500 dark:text-red-400' : ''}`}
      />
      {clearable && value && !open && (
        <button
          type="button"
          onClick={() => onChange('')}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 px-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
          aria-label="Clear"
        >
          ×
        </button>
      )}
      {open && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-20 mt-1 max-h-72 w-full min-w-64 overflow-y-auto rounded border border-slate-200 bg-white py-1 text-sm shadow-lg dark:border-slate-700 dark:bg-slate-900"
        >
          {filtered.map((o, i) => (
            <li
              key={o.value}
              role="option"
              aria-selected={i === cursor}
              // mousedown so the pick lands before the input's blur closes the list
              onMouseDown={(e) => {
                e.preventDefault();
                pick(o.value);
              }}
              onMouseEnter={() => setCursor(i)}
              className={`flex cursor-pointer items-center gap-2 px-2 py-1 ${i === cursor ? 'bg-slate-100 dark:bg-slate-800' : ''}`}
            >
              <span className="truncate">{o.label}</span>
              {o.extra && <span className="ml-auto flex shrink-0 items-center gap-1.5 text-xs text-slate-500">{o.extra}</span>}
            </li>
          ))}
          {!filtered.length && <li className="px-2 py-1 text-slate-500">No matches</li>}
        </ul>
      )}
    </div>
  );
}
