// What one side has shown the other so far, read from the battle log: the moves it has used, and an
// ability or item once something announces it ("[from] ability: Intimidate", "[from] item: Leftovers").
// Hidden-info mode shows only this much of the opponent, as the games do.
import type { SideID } from './engine';

export interface Revealed {
  moves: Set<string>;
  ability?: string;
  item?: string;
}

const ident = (side: SideID) => new RegExp(`\\|${side}[a-z]?: ([^|]+)`);

export function revealed(log: string[], side: SideID): Map<string, Revealed> {
  const out = new Map<string, Revealed>();
  const of = (name: string) => {
    let r = out.get(name);
    if (!r) out.set(name, (r = { moves: new Set() }));
    return r;
  };
  const own = ident(side);
  for (const line of log) {
    const parts = line.split('|');
    const holder = /\[of\] (p[12])[a-z]?: ([^|]+)/.exec(line);
    // whose effect it is: the [of] Pokémon when named, else the line's first Pokémon
    const subject = holder ? (holder[1] === side ? holder[2] : undefined) : own.exec(line)?.[1];
    switch (parts[1]) {
      case 'move': {
        const user = new RegExp(`^${side}[a-z]?: (.+)$`).exec(parts[2] ?? '');
        if (user) of(user[1]).moves.add(parts[3]);
        break;
      }
      case '-ability':
        if (new RegExp(`^${side}[a-z]?: `).test(parts[2] ?? '')) of(parts[2].replace(/^p\d[a-z]?: /, '')).ability = parts[3];
        break;
      case '-item':
      case '-enditem':
        if (new RegExp(`^${side}[a-z]?: `).test(parts[2] ?? '')) of(parts[2].replace(/^p\d[a-z]?: /, '')).item = parts[3];
        break;
    }
    if (!subject) continue;
    const ability = /\[from\] ability: ([^|]+)/.exec(line);
    if (ability) of(subject).ability = ability[1];
    const item = /\[from\] item: ([^|]+)/.exec(line);
    if (item) of(subject).item = item[1];
  }
  return out;
}
