// A simulation worker: runs batch battles and advisor playouts off the main thread (see pool.ts)
import { advise, batchSeed, runBattle, type AdviseOptions } from './analysis';
import { BattleSession, type Action, type BattleSetup, type Decision, type SideID } from './engine';
import type { AiKind } from './ai/players';

export type WorkerRequest =
  | { type: 'batch'; id: number; setup: BattleSetup; ai: [AiKind, AiKind]; indices: number[] }
  | { type: 'advise'; id: number; setup: BattleSetup; decisions: Decision[]; side: SideID; options: AdviseOptions & { only: Action[] } };

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const msg = e.data;
  try {
    if (msg.type === 'batch') {
      for (const index of msg.indices) {
        const record = runBattle({ ...msg.setup, seed: batchSeed(msg.setup.seed, index) }, msg.ai);
        self.postMessage({ type: 'battle', id: msg.id, index, record });
      }
      self.postMessage({ type: 'done', id: msg.id });
    } else {
      const session = BattleSession.replay(msg.setup, msg.decisions);
      self.postMessage({ type: 'advice', id: msg.id, advice: advise(session, msg.side, msg.options) });
    }
  } catch (err) {
    self.postMessage({ type: 'error', id: msg.id, error: String(err) });
  }
};
