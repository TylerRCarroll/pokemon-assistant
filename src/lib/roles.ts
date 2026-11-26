import type { Ruleset, SpeciesInfo } from '../rulesets/types';
import { findUsage } from './smogon';
import type { FormatData } from './smogonTypes';
import type { TeamSet } from './team';

/** What a member does for the team, detected from its set (moves, item, ability) and base stats */
export type Role =
  | 'hazards'
  | 'removal'
  | 'pivot'
  | 'speed'
  | 'setup'
  | 'breaker'
  | 'physicalWall'
  | 'specialWall'
  | 'status'
  | 'antiSetup'
  | 'cleric';

export const ROLE_LABELS: Record<Role, string> = {
  hazards: 'Hazards',
  removal: 'Hazard removal',
  pivot: 'Pivot',
  speed: 'Speed / priority',
  setup: 'Setup sweeper',
  breaker: 'Wallbreaker',
  physicalWall: 'Physical wall',
  specialWall: 'Special wall',
  status: 'Status',
  antiSetup: 'Setup answer',
  cleric: 'Cleric',
};

const ids = (...xs: string[]) => new Set(xs);
const HAZARDS = ids('stealthrock', 'spikes', 'toxicspikes', 'stickyweb', 'stoneaxe', 'ceaselessedge');
const REMOVAL = ids('defog', 'rapidspin', 'courtchange', 'mortalspin', 'tidyup');
const PIVOTS = ids('uturn', 'voltswitch', 'flipturn', 'partingshot', 'teleport', 'chillyreception', 'shedtail');
const SETUP = ids(
  'swordsdance', 'dragondance', 'nastyplot', 'calmmind', 'bulkup', 'quiverdance', 'shellsmash', 'shiftgear', 'coil',
  'bellydrum', 'agility', 'rockpolish', 'autotomize', 'tailglow', 'victorydance', 'clangoroussoul', 'noretreat',
  'geomancy', 'workup', 'growth', 'honeclaws', 'curse', 'irondefense', 'cosmicpower', 'amnesia', 'tidyup', 'filletaway',
);
const RECOVERY = ids(
  'recover', 'roost', 'softboiled', 'slackoff', 'moonlight', 'morningsun', 'synthesis', 'wish', 'shoreup', 'milkdrink',
  'strengthsap', 'healorder', 'junglehealing', 'lunarblessing', 'rest', 'leechseed', 'drainpunch', 'hornleech',
);
const STATUS = ids('willowisp', 'toxic', 'thunderwave', 'spore', 'sleeppowder', 'yawn', 'glare', 'nuzzle', 'stunspore', 'hypnosis', 'scald');
const ANTI_SETUP = ids('whirlwind', 'roar', 'dragontail', 'circlethrow', 'haze', 'clearsmog', 'encore', 'perishsong', 'taunt', 'yawn');
const CLERIC = ids('healbell', 'aromatherapy', 'wish', 'healingwish', 'lunardance', 'junglehealing', 'lifedew');
const BREAKER_ITEMS = ids('Choice Band', 'Choice Specs', 'Life Orb', 'Expert Belt');
const BREAKER_ABILITIES = ids('Huge Power', 'Pure Power', 'Adaptability', 'Sheer Force', 'Gorilla Tactics', 'Tough Claws', 'Supreme Overlord');
const BULK_ITEMS = ids('Leftovers', 'Heavy-Duty Boots', 'Eviolite', 'Rocky Helmet', 'Black Sludge');
/** Abilities that keep a Pokémon healthy over a long game (bulk boosters like Multiscale don't heal) */
const SUSTAIN_ABILITIES = ids('Regenerator', 'Poison Heal');

/**
 * The moves to judge a member by: its own, or (while it has none) the format's most common ones,
 * so a freshly added Pokémon still shows what it usually does.
 */
function movesFor(rs: Ruleset, set: TeamSet, meta?: FormatData): string[] {
  const names = set.moves.length ? set.moves : (meta && findUsage(meta, set.species)?.moves.slice(0, 4).map(([m]) => m)) || [];
  return names.flatMap((n) => {
    const m = rs.getMove(n);
    return m ? [m.id] : [];
  });
}

export function memberRoles(rs: Ruleset, set: TeamSet, species: SpeciesInfo, meta?: FormatData): Role[] {
  const moves = movesFor(rs, set, meta);
  const has = (list: Set<string>) => moves.some((m) => list.has(m));
  const attacks = moves.map((m) => rs.getMove(m)!).filter((m) => m.category !== 'Status' && m.basePower > 0);
  const b = species.baseStats;
  const offense = Math.max(b.atk, b.spa);
  const recovers = has(RECOVERY) || (!!set.ability && SUSTAIN_ABILITIES.has(set.ability));
  const sturdyItem = !!set.item && BULK_ITEMS.has(set.item);
  const roles: Role[] = [];

  if (has(HAZARDS)) roles.push('hazards');
  if (has(REMOVAL) || set.ability === 'Magic Bounce') roles.push('removal');
  if (has(PIVOTS)) roles.push('pivot');
  if (
    set.item === 'Choice Scarf' ||
    b.spe >= 100 ||
    attacks.some((m) => m.priority > 0 && m.basePower >= 40) ||
    has(ids('tailwind', 'trickroom', 'icywind', 'electroweb', 'stickyweb'))
  ) {
    roles.push('speed');
  }
  if (has(SETUP) && attacks.length) roles.push('setup');
  if (offense >= 110 && ((!!set.item && BREAKER_ITEMS.has(set.item)) || (!!set.ability && BREAKER_ABILITIES.has(set.ability)) || offense >= 130)) {
    roles.push('breaker');
  }
  // walls need the stats and a way to stay healthy: recovery, or a defensive item on truly huge bulk
  // (Heavy-Duty Boots on Great Tusk doesn't make it a wall; Leftovers on Ting-Lu does)
  const wall = (bulk: number, extra = false) => bulk >= 200 && (recovers || extra || (sturdyItem && bulk >= 250));
  if (wall(b.hp + b.def)) roles.push('physicalWall');
  if (wall(b.hp + b.spd, set.item === 'Assault Vest')) roles.push('specialWall');
  if (has(STATUS)) roles.push('status');
  if (has(ANTI_SETUP) || set.ability === 'Unaware') roles.push('antiSetup');
  if (has(CLERIC)) roles.push('cleric');
  return roles;
}

export interface RoleNeed {
  id: string;
  label: string;
  /** Any one of these roles meets the need */
  roles: Role[];
  core: boolean;
  why: string;
}

/**
 * What a team should cover. Competitive singles revolves around hazards and momentum; romhack bosses rarely
 * set hazards (about 1 in 5 Unbound and 1 in 12 Renegade Platinum boss teams) but often set up (44% / 29%).
 */
export function roleNeeds(rs: Ruleset): RoleNeed[] {
  const romhack = rs.kind === 'romhack';
  return [
    { id: 'speed', label: 'Speed / priority', roles: ['speed'], core: true, why: 'something fast or with priority to pick off weakened threats' },
    { id: 'wincon', label: 'Win condition', roles: ['setup', 'breaker'], core: true, why: 'a setup sweeper or wallbreaker to actually take KOs' },
    { id: 'physical', label: 'Physical bulk', roles: ['physicalWall'], core: romhack, why: 'a bulky, recovering answer to physical attackers' },
    { id: 'special', label: 'Special bulk', roles: ['specialWall'], core: romhack, why: 'a bulky, recovering answer to special attackers' },
    ...(romhack
      ? [
          { id: 'antiSetup', label: 'Setup answer', roles: ['antiSetup'] as Role[], core: true, why: 'phazing, Haze, Encore, or Unaware for bosses that set up' },
          { id: 'status', label: 'Status', roles: ['status'] as Role[], core: false, why: 'burn, paralysis, or sleep to cripple boss aces' },
          { id: 'removal', label: 'Hazard removal', roles: ['removal'] as Role[], core: false, why: 'Defog or Rapid Spin for the bosses that do use hazards' },
        ]
      : [
          { id: 'hazards', label: 'Hazards', roles: ['hazards'] as Role[], core: true, why: 'Stealth Rock or Spikes to wear down switch-ins' },
          { id: 'removal', label: 'Hazard removal', roles: ['removal'] as Role[], core: true, why: 'Defog, Rapid Spin, or Magic Bounce to keep your side clear' },
          { id: 'pivot', label: 'Pivoting', roles: ['pivot'] as Role[], core: false, why: 'U-turn or Volt Switch to keep momentum' },
          { id: 'antiSetup', label: 'Setup answer', roles: ['antiSetup'] as Role[], core: false, why: 'phazing, Haze, Encore, or Unaware against setup sweepers' },
        ]),
  ];
}

/** The moves that would give a member a role, for "teach X" tips */
export const ROLE_MOVES: Partial<Record<Role, Set<string>>> = {
  hazards: HAZARDS,
  removal: REMOVAL,
  pivot: PIVOTS,
  setup: SETUP,
  status: STATUS,
  antiSetup: ANTI_SETUP,
};
