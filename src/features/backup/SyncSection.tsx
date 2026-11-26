import { useState } from 'react';
import { card, input, link } from '../../components/ui';
import { connect, saveConfig } from '../../lib/sync';
import { useSyncStore } from '../../state/sync';

const button =
  'rounded border border-slate-300 px-3 py-1 text-sm font-medium hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-800';

const TOKEN_URL = 'https://github.com/settings/personal-access-tokens/new';

function ago(ms: number) {
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(ms).toLocaleDateString();
}

/** Turn GitHub Gist sync on or off for this device */
export function SyncSection() {
  const { status, config, error, lastChanges, setConfig, sync } = useSyncStore();
  const [token, setToken] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string>();
  const [confirmOff, setConfirmOff] = useState(false);

  const turnOn = async () => {
    setConnecting(true);
    setConnectError(undefined);
    try {
      const cfg = await connect(token.trim());
      saveConfig(cfg);
      setConfig(cfg);
      setToken('');
      await useSyncStore.getState().sync();
    } catch (e) {
      setConnectError(e instanceof Error ? e.message : String(e));
    } finally {
      setConnecting(false);
    }
  };

  return (
    <section className={`${card} space-y-3 p-4`}>
      <h2 className="font-semibold">Sync between devices</h2>
      {config ? (
        <>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            On. Teams, quiz progress, and settings sync through a private gist on your GitHub account: a few seconds after each change,
            and whenever the app comes back on screen. Deleted teams stay deleted everywhere.
          </p>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <button className={button} onClick={sync} disabled={status === 'syncing'}>
              {status === 'syncing' ? 'Syncing…' : 'Sync now'}
            </button>
            <span className="text-slate-500">
              {status === 'error' ? <span className="text-red-600">{error}</span> : config.lastSync ? `Last synced ${ago(config.lastSync)}` : 'Not synced yet'}
            </span>
          </div>
          {lastChanges.length > 0 && <p className="text-xs text-slate-500">From your other devices: {lastChanges.join('; ')}.</p>}
          <div className="text-sm">
            {confirmOff ? (
              <span className="flex flex-wrap items-center gap-2">
                Stop syncing on this device? Your data here and in the gist stays.
                <button
                  className={button}
                  onClick={() => {
                    saveConfig(undefined);
                    setConfig(undefined);
                    setConfirmOff(false);
                  }}
                >
                  Turn off
                </button>
                <button className={button} onClick={() => setConfirmOff(false)}>
                  Cancel
                </button>
              </span>
            ) : (
              <button className="text-slate-500 hover:underline" onClick={() => setConfirmOff(true)}>
                Turn off sync on this device
              </button>
            )}
          </div>
        </>
      ) : (
        <>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Keep teams in step between this device and others (PC, phone, handheld) through a private gist on your GitHub account. No server
            involved; the token stays in this browser.
          </p>
          <ol className="list-inside list-decimal space-y-1 text-sm text-slate-600 dark:text-slate-400">
            <li>
              Create a token at{' '}
              <a href={TOKEN_URL} target="_blank" rel="noreferrer" className={link}>
                github.com/settings/personal-access-tokens/new
              </a>
              : any name, the expiry you like, and under <strong>Account permissions</strong> set <strong>Gists</strong> to{' '}
              <strong>Read and write</strong>. Nothing else.
            </li>
            <li>Paste it below on each device. The first one creates the gist; the others find it.</li>
          </ol>
          <div className="flex flex-wrap gap-2">
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="github_pat_…"
              autoComplete="off"
              className={`${input} w-80 max-w-full font-mono`}
            />
            <button className={button} onClick={turnOn} disabled={!token.trim() || connecting}>
              {connecting ? 'Connecting…' : 'Turn on sync'}
            </button>
          </div>
          {connectError && <p className="text-sm text-red-600">{connectError}</p>}
        </>
      )}
    </section>
  );
}
