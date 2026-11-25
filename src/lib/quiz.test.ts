import { describe, expect, it } from 'vitest';
import { getRuleset } from '../rulesets/registry';
import { allKeys, availableKinds, buildPool, buildQuestion, type QuizContext } from './quiz';
import { loadFormat } from './smogon';
import { pickNext, schedule } from './srs';

/** Deterministic RNG so failures reproduce */
function seeded(seed: number) {
  return () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
}

async function context(rulesetId: string, formatId?: string): Promise<QuizContext> {
  const rs = getRuleset(rulesetId);
  const meta = formatId ? await loadFormat(formatId) : undefined;
  return { rs, meta, pool: buildPool(rs, meta), formatName: formatId };
}

describe('quiz questions', () => {
  for (const [rulesetId, formatId] of [['gen9', 'gen9ou'], ['gen1', 'gen1ou'], ['renegade-platinum'], ['unbound']] as const) {
    it(`builds valid questions of every kind for ${rulesetId}`, async () => {
      const ctx = await context(rulesetId, formatId);
      const rng = seeded(42);
      for (const kind of availableKinds(ctx)) {
        const keys = allKeys(ctx, [kind]);
        expect(keys.length, kind).toBeGreaterThan(0);
        for (const key of keys.filter((_, i) => i % Math.ceil(keys.length / 25) === 0)) {
          const q = buildQuestion(ctx, key, rng);
          expect(q, key).toBeDefined();
          expect(q!.choices, key).toContain(q!.answer);
          expect(new Set(q!.choices).size, key).toBe(q!.choices.length);
          expect(q!.choices.length, key).toBeGreaterThanOrEqual(3);
        }
      }
    });
  }

  it('only offers kinds that make sense for the ruleset', async () => {
    expect(availableKinds(await context('gen1'))).not.toContain('ability');
    expect(availableKinds(await context('gen9'))).not.toContain('counter');
    expect(availableKinds(await context('gen9', 'gen9ou'))).toContain('counter');
    expect(availableKinds(await context('renegade-platinum'))).toContain('hackChange');
    expect(availableKinds(await context('gen9'))).not.toContain('hackChange');
    expect(availableKinds(await context('gen1', 'gen1ou'))).not.toContain('counter');
    expect(availableKinds(await context('unbound'))).toContain('hackChange');
  });

  it('gets type matchups right, including the Gen 1 Ghost bug', async () => {
    const q9 = buildQuestion(await context('gen9'), 'eff|Fire|Grass/Steel')!;
    expect(q9.answer).toBe('4×');
    expect(q9.choices).toEqual(['0×', '¼×', '½×', '1×', '2×', '4×']);
    expect(buildQuestion(await context('gen1'), 'eff|Ghost|Psychic')!.answer).toBe('0×');
  });

  it('asks about romhack stat changes', async () => {
    const q = buildQuestion(await context('unbound'), 'hstat|venusaur', seeded(1))!;
    expect(q.prompt).toMatch(/Unbound, what's Venusaur's base/);
    expect(q.choices).toContain(q.answer);
    expect(q.explanation).toMatch(/was \d+/);
  });

  it('asks about romhack retypes', async () => {
    const q = buildQuestion(await context('renegade-platinum'), 'htype|charizard', seeded(1))!;
    expect(q.answer).toBe('Fire/Dragon');
    expect(q.explanation).toMatch(/was Fire\/Flying/);
  });
});

describe('spaced repetition', () => {
  const now = 1_000_000;

  it('spaces correct answers out and resets on a miss', () => {
    const a = schedule(undefined, true, now);
    expect(a.due - now).toBe(10 * 60_000);
    const b = schedule(a, true, now);
    expect(b.due - now).toBe(24 * 3600_000);
    const c = schedule(b, true, now);
    expect(c.interval).toBeGreaterThan(b.interval * 2);
    const miss = schedule(c, false, now);
    expect(miss.reps).toBe(0);
    expect(miss.lapses).toBe(1);
    expect(miss.due - now).toBe(60_000);
    expect(miss.ease).toBeLessThan(c.ease);
  });

  it('serves due cards first, then new ones', () => {
    const cards = { a: schedule(undefined, true, now - 3600_000), b: schedule(undefined, true, now) };
    expect(pickNext(cards, [['a', 'b', 'c']], now)).toBe('a'); // overdue
    expect(pickNext({ b: cards.b }, [['b', 'c']], now)).toBe('c'); // nothing due → unseen
    expect(pickNext({ b: cards.b }, [['b']], now)).toBe('b'); // everything seen → soonest
  });

  it('picks new cards evenly across topics, not keys', () => {
    const big = Array.from({ length: 1000 }, (_, i) => `big${i}`);
    let small = 0;
    for (let i = 0; i < 400; i++) if (pickNext({}, [big, ['s1', 's2']], now)!.startsWith('s')) small++;
    expect(small).toBeGreaterThan(120); // ~50%, not ~0.2%
  });
});
