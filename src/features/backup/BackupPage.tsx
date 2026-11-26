import { useMemo, useState } from 'react';
import { card, input } from '../../components/ui';
import { createBackup, parseBackup, planImport, PREFIX, type Backup, type ImportMode } from '../../lib/backup';

const button =
  'rounded border border-slate-300 px-3 py-1 text-sm font-medium hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-800';

/** Current pokeplanner stores in this browser, parsed */
function readCurrent() {
  const out: Record<string, { state: Record<string, unknown>; version?: number } | undefined> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key?.startsWith(PREFIX)) continue;
    try {
      out[key] = JSON.parse(localStorage.getItem(key)!);
    } catch {
      out[key] = undefined;
    }
  }
  return out;
}

const teamCount = (b: Backup) => ((b.data[`${PREFIX}teams`]?.state.teams as unknown[]) ?? []).length;

export function BackupPage() {
  const [copied, setCopied] = useState(false);
  const [text, setText] = useState('');
  const [mode, setMode] = useState<ImportMode>('merge');
  const [confirmReplace, setConfirmReplace] = useState(false);

  const local = useMemo(() => createBackup(localStorage), []);
  const exportText = useMemo(() => JSON.stringify(local, null, 1), [local]);
  const parsed = useMemo(() => (text.trim() ? parseBackup(text) : {}), [text]);
  const plan = useMemo(() => parsed.backup && planImport(readCurrent(), parsed.backup, mode), [parsed.backup, mode]);

  const download = () => {
    const blob = new Blob([exportText], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `pokeplanner-backup-${local.exportedAt.slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const copy = async () => {
    await navigator.clipboard.writeText(exportText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  const apply = () => {
    if (!plan) return;
    for (const [key, value] of Object.entries(plan.writes)) {
      if (value) localStorage.setItem(key, value);
      else localStorage.removeItem(key);
    }
    // the stores read localStorage once at startup, so reload to pick up the import
    location.reload();
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Backup &amp; restore</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Teams, quiz progress, and settings live in this browser only, so each site (localhost, GitHub Pages) and each browser has its own.
          Export here, then import on the other one.
        </p>
      </div>

      <section className={`${card} space-y-3 p-4`}>
        <h2 className="font-semibold">Export from this browser</h2>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          {teamCount(local)} team{teamCount(local) === 1 ? '' : 's'} and {Object.keys(local.data).length} saved store
          {Object.keys(local.data).length === 1 ? '' : 's'} at {location.host}.
        </p>
        <div className="flex flex-wrap gap-2">
          <button className={button} onClick={download}>
            Download backup file
          </button>
          <button className={button} onClick={copy}>
            {copied ? 'Copied!' : 'Copy to clipboard'}
          </button>
        </div>
      </section>

      <section className={`${card} space-y-3 p-4`}>
        <h2 className="font-semibold">Import into this browser</h2>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <label className={`${button} cursor-pointer`}>
            Choose backup file…
            <input
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (file) setText(await file.text());
                e.target.value = '';
              }}
            />
          </label>
          <span className="text-slate-500">or paste it below</span>
        </div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder='{"app": "pokeplanner", ...}'
          rows={5}
          className={`${input} w-full font-mono text-xs`}
        />
        {parsed.error && <p className="text-sm text-red-600">{parsed.error}</p>}
        {parsed.backup && plan && (
          <div className="space-y-3 text-sm">
            <p className="text-slate-600 dark:text-slate-400">
              Backup from {new Date(parsed.backup.exportedAt).toLocaleString()} with {teamCount(parsed.backup)} team
              {teamCount(parsed.backup) === 1 ? '' : 's'}.
            </p>
            <fieldset className="space-y-1">
              <label className="flex items-start gap-2">
                <input type="radio" checked={mode === 'merge'} onChange={() => setMode('merge')} className="mt-1" />
                <span>
                  <strong>Merge</strong> (recommended): keep what&apos;s here and add the backup&apos;s teams. Same team in both: the newer edit
                  wins. Quiz progress keeps whichever side has answered more.
                </span>
              </label>
              <label className="flex items-start gap-2">
                <input type="radio" checked={mode === 'replace'} onChange={() => setMode('replace')} className="mt-1" />
                <span>
                  <strong>Replace</strong>: make this browser match the backup exactly. Anything here that isn&apos;t in the backup is deleted.
                </span>
              </label>
            </fieldset>
            {plan.summary.length > 0 && (
              <ul className="list-inside list-disc text-slate-600 dark:text-slate-400">
                {plan.summary.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            )}
            {mode === 'replace' && confirmReplace ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-red-700 dark:text-red-400">Replace everything saved in this browser?</span>
                <button className={`${button} border-red-400 text-red-700 dark:text-red-400`} onClick={apply}>
                  Replace
                </button>
                <button className={button} onClick={() => setConfirmReplace(false)}>
                  Cancel
                </button>
              </div>
            ) : (
              <button className={button} onClick={() => (mode === 'replace' ? setConfirmReplace(true) : apply())}>
                Import
              </button>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
