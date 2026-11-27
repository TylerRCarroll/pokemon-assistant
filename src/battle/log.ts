// The sim's protocol log → the lines a player reads ("Garchomp used Earthquake!"), via @pkmn/view.
// The formatter alone can't say how much a hit did ("was hurt!"), so we track each Pokémon's HP
// through the log and put the amounts in: what a hit took, and what drain, Leech Seed, Leftovers,
// or a potion gave back.
import { Protocol } from '@pkmn/protocol';
import { LogFormatter } from '@pkmn/view';

const key = (ident: string) => ident.replace(/^(p\d)[a-z]?: /, '$1: ');
const nameOf = (ident: string) => ident.replace(/^p\d[a-z]?: /, '');

function parseHp(s: string): [number, number] | undefined {
  if (/^0( fnt)?$/.test(s.trim())) return [0, 0];
  const m = /^(\d+)\/(\d+)/.exec(s);
  return m ? [Number(m[1]), Number(m[2])] : undefined;
}

/** "…by Leech Seed!" → "…by Leech Seed (−13 HP, 12%)!": the amount goes before the sentence's own ending */
function withAmount(line: string, amount: string): string {
  const m = /^(.*?)([.!)]*)$/.exec(line)!;
  return `${m[1]} (${amount})${m[2] || '.'}`;
}

/** Readable battle text, one entry per turn (index 0 is everything before turn 1) */
export function battleText(protocol: string[], perspective: 'p1' | 'p2' = 'p1'): string[][] {
  const formatter = new LogFormatter(perspective);
  const turns: string[][] = [[]];
  // HP as [now, max] per Pokémon, as the log has told us
  const hp = new Map<string, [number, number]>();
  const who = (ident: string) => `${ident.startsWith(perspective) ? '' : 'The opposing '}${nameOf(ident)}`;

  for (const line of protocol) {
    for (const { args, kwArgs } of Protocol.parse(line)) {
      const out = turns[turns.length - 1];
      if (args[0] === 'turn') turns.push([]);
      // our bag messages, and the like
      if (args[0] === 'message') {
        out.push(String(args[1]));
        continue;
      }
      const text = formatter.formatText(args, kwArgs).replace(/\*\*/g, '').trim();
      // turns are already split out, so Showdown's "== Turn 3 ==" headers go
      const lines = text.split('\n').map((t) => t.trim()).filter((t) => t && !/^== Turn \d+ ==$/.test(t));

      const [cmd, ident, status] = args as unknown as [string, string, string];
      if (cmd === 'switch' || cmd === 'drag' || cmd === 'replace') {
        const h = parseHp(String((args as unknown as string[])[3] ?? ''));
        if (h) hp.set(key(ident), h);
      } else if ((cmd === '-damage' || cmd === '-heal' || cmd === '-sethp') && ident) {
        const before = hp.get(key(ident));
        const now = parseHp(String(status ?? ''));
        if (before && now) {
          const max = now[1] || before[1];
          const change = now[0] - before[0];
          hp.set(key(ident), [now[0], max]);
          const pct = Math.round((Math.abs(change) / max) * 100);
          if (change < 0 && !lines.length) lines.push(`(${who(ident)} was hurt!)`);
          if (change < 0) {
            // a plain hit reads "(X was hurt!)": say by how much instead
            const last = lines.length - 1;
            lines[last] = /was hurt!\)$/.test(lines[last]) ? `(${who(ident)} lost ${pct}% of its HP: ${-change} HP)` : withAmount(lines[last], `−${-change} HP, ${pct}%`);
          } else if (change > 0) {
            if (!lines.length) lines.push(`${who(ident)} had its HP restored.`);
            lines[lines.length - 1] = withAmount(lines[lines.length - 1], `+${change} HP, ${pct}%`);
          }
        }
      }
      out.push(...lines);
    }
  }
  return turns;
}
