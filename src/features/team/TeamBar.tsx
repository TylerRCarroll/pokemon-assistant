import { useState } from 'react';
import { card, input } from '../../components/ui';
import { exportPaste, importPaste } from '../../lib/teamio';
import type { Ruleset } from '../../rulesets/types';
import { useTeamsStore, type Team } from '../../state/teams';

const button =
  'rounded border border-slate-300 px-3 py-1 text-sm font-medium hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800';

type Panel = 'none' | 'import' | 'export' | 'rename' | 'delete';

export function TeamBar({ rs, teams, active }: { rs: Ruleset; teams: Team[]; active?: Team }) {
  const { createTeam, renameTeam, deleteTeam, setActive, setSlots } = useTeamsStore();
  const [panel, setPanel] = useState<Panel>('none');
  const [text, setText] = useState('');
  const [importInto, setImportInto] = useState<'new' | 'current'>('new');
  const [warnings, setWarnings] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);

  const open = (p: Panel) => {
    setPanel(panel === p ? 'none' : p);
    setWarnings([]);
    setCopied(false);
    if (p === 'rename') setText(active?.name ?? '');
    else if (p === 'export') setText(active ? exportPaste(active.slots) : '');
    else setText('');
  };

  const doImport = () => {
    const { sets, warnings } = importPaste(rs, text);
    setWarnings(warnings);
    if (!sets.length) return;
    if (importInto === 'current' && active) setSlots(active.id, sets);
    else createTeam(rs.id, undefined, sets);
    if (!warnings.length) setPanel('none');
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-2 text-2xl font-bold">Team Builder</h1>
        {teams.length > 0 && (
          <select value={active?.id ?? ''} onChange={(e) => setActive(rs.id, e.target.value)} className={input}>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        )}
        <button className={button} onClick={() => createTeam(rs.id)}>
          New team
        </button>
        <button className={button} onClick={() => open('import')}>
          Import
        </button>
        {active && (
          <>
            <button className={button} onClick={() => open('export')}>
              Export
            </button>
            <button className={button} onClick={() => open('rename')}>
              Rename
            </button>
            <button className={`${button} text-red-700 dark:text-red-400`} onClick={() => open('delete')}>
              Delete
            </button>
          </>
        )}
      </div>

      {panel === 'import' && (
        <div className={`${card} space-y-2 p-3`}>
          <p className="text-sm text-slate-600 dark:text-slate-400">Paste a Showdown team or single set (pokepast.es text works too).</p>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={10} className={`${input} w-full font-mono text-xs`} autoFocus />
          <div className="flex flex-wrap items-center gap-3">
            {active && (
              <select value={importInto} onChange={(e) => setImportInto(e.target.value as 'new' | 'current')} className={input}>
                <option value="new">As a new team</option>
                <option value="current">Replace "{active.name}"</option>
              </select>
            )}
            <button className={button} onClick={doImport} disabled={!text.trim()}>
              Import
            </button>
          </div>
          {warnings.length > 0 && (
            <ul className="list-inside list-disc text-sm text-amber-700 dark:text-amber-400">
              {warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {panel === 'export' && active && (
        <div className={`${card} space-y-2 p-3`}>
          <textarea value={text} readOnly rows={10} className={`${input} w-full font-mono text-xs`} onFocus={(e) => e.target.select()} />
          <button
            className={button}
            onClick={() => navigator.clipboard.writeText(text).then(() => setCopied(true))}
            disabled={!text}
          >
            {copied ? 'Copied' : 'Copy to clipboard'}
          </button>
        </div>
      )}

      {panel === 'rename' && active && (
        <form
          className={`${card} flex items-center gap-2 p-3`}
          onSubmit={(e) => {
            e.preventDefault();
            if (text.trim()) renameTeam(active.id, text.trim());
            setPanel('none');
          }}
        >
          <input value={text} onChange={(e) => setText(e.target.value)} className={`${input} w-64`} autoFocus />
          <button className={button} type="submit">
            Save
          </button>
        </form>
      )}

      {panel === 'delete' && active && (
        <div className={`${card} flex flex-wrap items-center gap-3 p-3 text-sm`}>
          <span>
            Delete <strong>{active.name}</strong>? This can't be undone.
          </span>
          <button
            className={`${button} border-red-400 text-red-700 dark:text-red-400`}
            onClick={() => {
              deleteTeam(active.id);
              setPanel('none');
            }}
          >
            Delete team
          </button>
          <button className={button} onClick={() => setPanel('none')}>
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
