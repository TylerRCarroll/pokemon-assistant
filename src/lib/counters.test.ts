import { beforeAll, describe, expect, it } from 'vitest';
import { GAMES } from '../data/games';
import { getRuleset } from '../rulesets/registry';
import type { LearnsetEntry, TrainerInfo } from '../rulesets/types';
import { availablePool, buildAvailability, loadAvailability } from './availability';
import { closeness, counterFixes, evoLevel, type CounterFix } from './counters';
import { newSet, type TeamSet } from './team';
import { matchupOf } from './threats';
import { setFromTrainerMon } from './trainers';

// A Renegade Platinum (Complete) team a few levels under Fantina's cap, with nothing that checks her ghosts
const rs = getRuleset('renegade-platinum');
const mk = (species: string, level: number, moves: string[]): TeamSet => ({ ...newSet(rs, species), level, moves });

let fantina: TrainerInfo;
let cap: number;
let team: TeamSet[];
const learnsets = new Map<string, LearnsetEntry[]>();
let pool: ReturnType<typeof availablePool>;
const cache = new Map<string, CounterFix[]>();
const fixesFor = (species: string): CounterFix[] => {
  const mon = fantina.team.find((m) => m.species === species)!;
  if (!cache.has(species)) cache.set(species, counterFixes({ rs, threat: setFromTrainerMon(rs, mon), team, cap, learnsets, pool, trainer: fantina.name }));
  return cache.get(species)!;
};

beforeAll(async () => {
  fantina = (await rs.loadTrainers!()).find((t) => t.boss && /fantina/i.test(t.name))!;
  cap = fantina.levelCap!;
  team = [
    mk('Monferno', cap - 3, ['Flame Wheel', 'Mach Punch', 'Fury Swipes', 'Taunt']),
    mk('Staravia', cap - 2, ['Wing Attack', 'Quick Attack', 'Double Team', 'Growl']),
    mk('Bibarel', cap - 4, ['Headbutt', 'Water Gun', 'Rollout', 'Defense Curl']),
    mk('Kirlia', cap - 2, ['Confusion', 'Magical Leaf', 'Double Team', 'Growl']),
  ];
  const game = GAMES.find((g) => g.id === 'renegade-platinum')!;
  const availability = buildAvailability(rs, game, (await loadAvailability(game))!);
  pool = availablePool(rs, availability, availability.checkpoints.findIndex((c) => c.levelCap >= cap));
  const species = new Set([...team.map((s) => s.species), ...pool.map((s) => s.name)]);
  await Promise.all([...species].map(async (s) => learnsets.set(s, await rs.learnset(s))));
  // the advice for all six is the slow part (seconds on a CI runner), so do it once here, not inside a test's 5s budget
  for (const m of fantina.team) fixesFor(m.species);
}, 60_000);

describe('counter advisor', () => {
  it('finds the cheap fix: Bibarel relearning Crunch walls Banette now', () => {
    const fixes = fixesFor('Banette');
    const crunch = fixes.find((f) => f.title === 'Teach Bibarel Crunch')!;
    expect(crunch.checks).toBe(true);
    expect(crunch.how[0]).toMatch(/^Move Reminder/);
    expect(crunch.set.level).toBe(cap - 4); // no levelling needed
    expect(crunch.after.walls).toBe(true);
    expect(fixes[0].checks).toBe(true);
  });

  it('never goes past the level cap', () => {
    for (const species of fantina.team.map((m) => m.species)) {
      for (const f of fixesFor(species)) expect(f.set.level, f.title).toBeLessThanOrEqual(cap);
    }
  });

  it("doesn't suggest the TM the boss itself hands out", () => {
    // RP's TM30 Shadow Ball is "Gift from Fantina"
    expect(rs.tms?.some((t) => /fantina/i.test(t.location))).toBe(true);
    for (const species of fantina.team.map((m) => m.species)) {
      for (const f of fixesFor(species)) expect(f.how.join(' '), f.title).not.toMatch(/fantina/i);
    }
  });

  it('lists checks first and every claimed check holds up', () => {
    const fixes = fixesFor('Mismagius');
    const firstMiss = fixes.findIndex((f) => !f.checks);
    if (firstMiss >= 0) expect(fixes.slice(firstMiss).every((f) => !f.checks)).toBe(true);
    const threat = setFromTrainerMon(rs, fantina.team.find((m) => m.species === 'Mismagius')!);
    // plain checks (not setup or Sash ones) re-verify against a fresh calc
    for (const f of fixes.filter((x) => x.checks && x.after.checks)) {
      expect(matchupOf(rs, { set: threat }, { set: f.set }).checks, f.title).toBe(true);
    }
  });

  it('asks for the fewest levels that work', () => {
    for (const mon of fantina.team) {
      const threat = setFromTrainerMon(rs, mon);
      for (const f of fixesFor(mon.species).filter((x) => x.kind === 'level' && x.checks)) {
        // one level lower must not already be a check, or the advice overstates the grind
        if (f.set.level - 1 <= f.member!.level) continue;
        expect(matchupOf(rs, { set: threat }, { set: { ...f.set, level: f.set.level - 1 } }).checks, f.title).toBe(false);
      }
    }
    // and a synthetic case where levelling is the answer: Bibarel with Crunch, far below the cap, against Banette
    const banette = setFromTrainerMon(rs, fantina.team.find((m) => m.species === 'Banette')!);
    const low = { ...team[2], level: cap - 15, moves: ['Crunch', 'Water Gun', 'Rollout', 'Defense Curl'] };
    const level = counterFixes({ rs, threat: banette, team: [low], cap, learnsets }).find((f) => f.kind === 'level');
    expect(level?.checks).toBe(true);
    expect(matchupOf(rs, { set: banette }, { set: { ...level!.set, level: level!.set.level - 1 } }).checks).toBe(false);
    expect(level!.set.level).toBeLessThanOrEqual(cap);
  });

  it('builds new catches from obtainable Pokémon, not the ones on the team', () => {
    const catches = fixesFor('Spiritomb').filter((f) => f.kind === 'catch');
    expect(catches.length).toBeGreaterThan(0);
    const poolNames = new Set(pool.map((s) => s.name));
    for (const c of catches) {
      expect(poolNames.has(c.set.species)).toBe(true);
      expect(['Infernape', 'Monferno', 'Chimchar', 'Staraptor', 'Bibarel', 'Gardevoir', 'Gallade']).not.toContain(c.set.species);
      expect(c.set.level).toBe(cap);
    }
  });

  it('skips members that already check the threat', () => {
    const threat = setFromTrainerMon(rs, fantina.team.find((m) => m.species === 'Banette')!);
    const crunchBibarel = { ...team[2], moves: ['Crunch', 'Water Gun', 'Rollout', 'Defense Curl'] };
    const fixes = counterFixes({ rs, threat, team: [crunchBibarel], cap, learnsets });
    expect(matchupOf(rs, { set: threat }, { set: crunchBibarel }).checks).toBe(true);
    expect(fixes).toEqual([]);
  });
});

describe('helpers', () => {
  it('reads level evolutions only', () => {
    expect(evoLevel('Level 30')).toBe(30);
    expect(evoLevel('Use Dawn Stone (male)')).toBeUndefined();
    expect(evoLevel(undefined)).toBeUndefined();
  });

  it('scores closeness between 0 and 1, with 1 only for checks', () => {
    const base = { member: team?.[0] ?? newSet(rs, 'Bibarel'), threatFaster: true, speedTie: false, walls: false, revengeKills: false, checks: false };
    expect(closeness({ ...base, checks: true, walls: true })).toBe(1);
    const near = closeness({ ...base, yourBest: { minPct: 45, maxPct: 55 } as never, theirBest: { minPct: 40, maxPct: 52 } as never });
    expect(near).toBeGreaterThan(0.5);
    expect(near).toBeLessThan(1);
  });
});
