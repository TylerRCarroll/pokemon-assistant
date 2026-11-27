// The sim's protocol log → the lines a player reads ("Garchomp used Earthquake!"), via @pkmn/view
import { Protocol } from '@pkmn/protocol';
import { LogFormatter } from '@pkmn/view';

/** Readable battle text, one entry per turn (index 0 is everything before turn 1) */
export function battleText(protocol: string[], perspective: 'p1' | 'p2' = 'p1'): string[][] {
  const formatter = new LogFormatter(perspective);
  const turns: string[][] = [[]];
  for (const line of protocol) {
    for (const { args, kwArgs } of Protocol.parse(line)) {
      if (args[0] === 'turn') turns.push([]);
      // our bag messages, and the like
      if (args[0] === 'message') {
        turns[turns.length - 1].push(String(args[1]));
        continue;
      }
      const text = formatter.formatText(args, kwArgs).replace(/\*\*/g, '').trim();
      // turns are already split out, so Showdown's "== Turn 3 ==" headers go
      const lines = text.split('\n').map((t) => t.trim()).filter((t) => t && !/^== Turn \d+ ==$/.test(t));
      turns[turns.length - 1].push(...lines);
    }
  }
  return turns;
}
