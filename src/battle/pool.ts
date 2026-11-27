// A few simulation workers, sharing out batch battles and advisor options between them
import { mergeAdvice, type Advice, type AdviseOptions, type BattleRecord, type GauntletRun, type GauntletSetup } from './analysis';
import type { BattleSession, SideID } from './engine';
import type { AiKind } from './ai/players';
import type { WorkerRequest } from './worker';

type Reply =
  | { type: 'battle'; id: number; index: number; record: BattleRecord }
  | { type: 'run'; id: number; index: number; run: GauntletRun }
  | { type: 'done'; id: number }
  | { type: 'advice'; id: number; advice: Advice[] }
  | { type: 'error'; id: number; error: string };

let nextId = 1;

export class SimPool {
  private workers: Worker[] = [];
  readonly size: number;

  constructor(size = Math.max(1, Math.min(8, (navigator.hardwareConcurrency || 4) - 1))) {
    this.size = size;
  }

  private ensure() {
    while (this.workers.length < this.size) this.workers.push(new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' }));
    return this.workers;
  }

  /** Stop everything in flight (the workers are rebuilt on the next request) */
  cancel() {
    for (const w of this.workers) w.terminate();
    this.workers = [];
  }

  /** `count` AI-vs-AI battles; `onRecord` hears about each as it finishes */
  batch(setup: BattleSession['setup'], count: number, ai: [AiKind, AiKind], onRecord: (r: BattleRecord, index: number) => void): Promise<BattleRecord[]> {
    const workers = this.ensure();
    const id = nextId++;
    const records: BattleRecord[] = new Array(count);
    return new Promise((resolve, reject) => {
      let open = 0;
      workers.forEach((w, wi) => {
        const indices = Array.from({ length: count }, (_, i) => i).filter((i) => i % workers.length === wi);
        if (!indices.length) return;
        open++;
        const onMessage = (e: MessageEvent<Reply>) => {
          const r = e.data;
          if (r.id !== id) return;
          if (r.type === 'battle') {
            records[r.index] = r.record;
            onRecord(r.record, r.index);
          } else if (r.type === 'done') {
            w.removeEventListener('message', onMessage);
            if (--open === 0) resolve(records.filter(Boolean));
          } else if (r.type === 'error') {
            w.removeEventListener('message', onMessage);
            reject(new Error(r.error));
          }
        };
        w.addEventListener('message', onMessage);
        w.postMessage({ type: 'batch', id, setup, ai, indices } satisfies WorkerRequest);
      });
      if (!open) resolve([]);
    });
  }

  /** `count` runs of a gauntlet; `onRun` hears about each as it finishes */
  gauntlet(gauntlet: GauntletSetup, count: number, ai: [AiKind, AiKind], onRun: (r: GauntletRun, index: number) => void): Promise<void> {
    const workers = this.ensure();
    const id = nextId++;
    return new Promise((resolve, reject) => {
      let open = 0;
      workers.forEach((w, wi) => {
        const indices = Array.from({ length: count }, (_, i) => i).filter((i) => i % workers.length === wi);
        if (!indices.length) return;
        open++;
        const onMessage = (e: MessageEvent<Reply>) => {
          const r = e.data;
          if (r.id !== id) return;
          if (r.type === 'run') onRun(r.run, r.index);
          else if (r.type === 'done' || r.type === 'error') {
            w.removeEventListener('message', onMessage);
            if (r.type === 'error') reject(new Error(r.error));
            else if (--open === 0) resolve();
          }
        };
        w.addEventListener('message', onMessage);
        w.postMessage({ type: 'gauntlet', id, gauntlet, ai, indices } satisfies WorkerRequest);
      });
      if (!open) resolve();
    });
  }

  /** The advisor's ranking of the side's options now, with the options shared out between workers */
  advise(session: BattleSession, side: SideID, options: AdviseOptions = {}): Promise<Advice[]> {
    const workers = this.ensure();
    const id = nextId++;
    const legal = session.legal(side).filter((a) => a.kind !== 'forfeit');
    const shares = workers.map((_, wi) => legal.filter((__, i) => i % workers.length === wi)).filter((s) => s.length);
    return Promise.all(
      shares.map(
        (only, wi) =>
          new Promise<Advice[]>((resolve, reject) => {
            const w = workers[wi];
            const onMessage = (e: MessageEvent<Reply>) => {
              const r = e.data;
              if (r.id !== id) return;
              w.removeEventListener('message', onMessage);
              if (r.type === 'advice') resolve(r.advice);
              else if (r.type === 'error') reject(new Error(r.error));
            };
            w.addEventListener('message', onMessage);
            w.postMessage({ type: 'advise', id, setup: session.setup, decisions: session.decisions, side, options: { ...options, only } } satisfies WorkerRequest);
          }),
      ),
    ).then(mergeAdvice);
  }
}
