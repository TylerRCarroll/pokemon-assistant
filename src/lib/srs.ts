/** Spaced repetition, a light SM-2: misses come back in a minute, hits space out to days and weeks */

export interface Card {
  /** Interval multiplier; drops on misses, never below 1.3 */
  ease: number;
  /** Current gap in ms */
  interval: number;
  /** Timestamp when the card is next due */
  due: number;
  /** Correct answers in a row */
  reps: number;
  lapses: number;
}

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
/** Learning steps before a card graduates to day-based intervals */
const STEPS = [10 * MINUTE, DAY];

export function schedule(card: Card | undefined, correct: boolean, now: number): Card {
  const c = card ?? { ease: 2.5, interval: 0, due: now, reps: 0, lapses: 0 };
  if (!correct) {
    return { ease: Math.max(1.3, c.ease - 0.2), interval: MINUTE, due: now + MINUTE, reps: 0, lapses: c.lapses + (card ? 1 : 0) };
  }
  const reps = c.reps + 1;
  const interval = reps <= STEPS.length ? STEPS[reps - 1] : Math.round(c.interval * c.ease);
  return { ease: Math.min(3, c.ease + 0.05), interval, due: now + interval, reps, lapses: c.lapses };
}

/**
 * Next card key: the most overdue card first; otherwise an unseen key from a random
 * topic (topics are picked evenly, so a big topic doesn't crowd out small ones);
 * otherwise the soonest-due seen card, so a session never runs dry.
 */
export function pickNext(
  cards: Record<string, Card>,
  topics: string[][],
  now: number,
  rng: () => number = Math.random,
  avoid?: string,
): string | undefined {
  const pool = topics.flat();
  const inPool = new Set(pool);
  const seen = Object.entries(cards).filter(([k]) => inPool.has(k) && k !== avoid);
  const due = seen.filter(([, c]) => c.due <= now).sort((a, b) => a[1].due - b[1].due);
  if (due.length) return due[0][0];
  const fresh = topics.map((t) => t.filter((k) => !cards[k] && k !== avoid)).filter((t) => t.length);
  if (fresh.length) {
    const topic = fresh[Math.floor(rng() * fresh.length)];
    return topic[Math.floor(rng() * topic.length)];
  }
  return seen.sort((a, b) => a[1].due - b[1].due)[0]?.[0] ?? pool[0];
}

export const dueCount = (cards: Record<string, Card>, pool: Set<string>, now: number) =>
  Object.entries(cards).filter(([k, c]) => pool.has(k) && c.due <= now).length;
