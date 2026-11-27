// Bag items, which Showdown's engine doesn't have. As in the games, an item is used at the start of
// the turn, before anyone moves, and takes the user's whole action: the engine still submits a move
// for that Pokémon (the sim needs one), and the `ppbagturn` volatile cancels it silently before it
// runs, so it spends no PP, sets no choice lock, and isn't anyone's "last move".
import type { Battle, Pokemon } from '@pkmn/sim';

export type BagItemId =
  | 'potion' | 'superpotion' | 'hyperpotion' | 'maxpotion' | 'fullrestore'
  | 'antidote' | 'burnheal' | 'iceheal' | 'awakening' | 'paralyzeheal' | 'fullheal'
  | 'revive' | 'maxrevive'
  | 'ether' | 'maxether' | 'elixir' | 'maxelixir'
  | 'xattack' | 'xdefense' | 'xspatk' | 'xspdef' | 'xspeed' | 'xaccuracy' | 'direhit' | 'guardspec';

export interface BagItem {
  id: BagItemId;
  name: string;
  /** Who it can be used on: an active or benched Pokémon that's still standing, a fainted one, or the active one only */
  target: 'party' | 'fainted' | 'active';
  /** Needs a move picked too (Ether, Max Ether) */
  pickMove?: boolean;
  /** First gen it's in */
  since: number;
  shortDesc: (gen: number) => string;
}

/** HP healed: potions got stronger and weaker over the gens (Super and Hyper Potion changed in Gen 7) */
export function healAmount(id: BagItemId, gen: number): number | 'full' | undefined {
  switch (id) {
    case 'potion':
      return 20;
    case 'superpotion':
      return gen >= 7 ? 60 : 50;
    case 'hyperpotion':
      return gen >= 7 ? 120 : 200;
    case 'maxpotion':
    case 'fullrestore':
      return 'full';
    default:
      return undefined;
  }
}

const STATUS_CURES: Partial<Record<BagItemId, string[]>> = {
  antidote: ['psn', 'tox'],
  burnheal: ['brn'],
  iceheal: ['frz'],
  awakening: ['slp'],
  paralyzeheal: ['par'],
  fullheal: ['psn', 'tox', 'brn', 'frz', 'slp', 'par'],
  fullrestore: ['psn', 'tox', 'brn', 'frz', 'slp', 'par'],
};

const X_ITEMS: Partial<Record<BagItemId, 'atk' | 'def' | 'spa' | 'spd' | 'spe' | 'accuracy'>> = {
  xattack: 'atk',
  xdefense: 'def',
  xspatk: 'spa',
  xspdef: 'spd',
  xspeed: 'spe',
  xaccuracy: 'accuracy',
};

const potion = (n: number | 'full' | undefined) => (n === 'full' ? 'Fully restores HP' : `Restores ${n} HP`);
export const BAG_ITEMS: BagItem[] = [
  { id: 'potion', name: 'Potion', target: 'party', since: 1, shortDesc: (g) => potion(healAmount('potion', g)) },
  { id: 'superpotion', name: 'Super Potion', target: 'party', since: 1, shortDesc: (g) => potion(healAmount('superpotion', g)) },
  { id: 'hyperpotion', name: 'Hyper Potion', target: 'party', since: 1, shortDesc: (g) => potion(healAmount('hyperpotion', g)) },
  { id: 'maxpotion', name: 'Max Potion', target: 'party', since: 1, shortDesc: () => 'Fully restores HP' },
  { id: 'fullrestore', name: 'Full Restore', target: 'party', since: 1, shortDesc: () => 'Fully restores HP and cures any status and confusion' },
  { id: 'antidote', name: 'Antidote', target: 'party', since: 1, shortDesc: () => 'Cures poison' },
  { id: 'burnheal', name: 'Burn Heal', target: 'party', since: 1, shortDesc: () => 'Cures a burn' },
  { id: 'iceheal', name: 'Ice Heal', target: 'party', since: 1, shortDesc: () => 'Thaws a frozen Pokémon' },
  { id: 'awakening', name: 'Awakening', target: 'party', since: 1, shortDesc: () => 'Wakes a sleeping Pokémon' },
  { id: 'paralyzeheal', name: 'Paralyze Heal', target: 'party', since: 1, shortDesc: () => 'Cures paralysis' },
  { id: 'fullheal', name: 'Full Heal', target: 'party', since: 1, shortDesc: () => 'Cures any status and confusion' },
  { id: 'revive', name: 'Revive', target: 'fainted', since: 1, shortDesc: () => 'Revives a fainted Pokémon with half its HP' },
  { id: 'maxrevive', name: 'Max Revive', target: 'fainted', since: 1, shortDesc: () => 'Revives a fainted Pokémon with full HP' },
  { id: 'ether', name: 'Ether', target: 'party', pickMove: true, since: 1, shortDesc: () => 'Restores 10 PP to one move' },
  { id: 'maxether', name: 'Max Ether', target: 'party', pickMove: true, since: 1, shortDesc: () => "Fully restores one move's PP" },
  { id: 'elixir', name: 'Elixir', target: 'party', since: 1, shortDesc: () => 'Restores 10 PP to every move' },
  { id: 'maxelixir', name: 'Max Elixir', target: 'party', since: 1, shortDesc: () => "Fully restores every move's PP" },
  { id: 'xattack', name: 'X Attack', target: 'active', since: 1, shortDesc: (g) => `Raises Attack ${g >= 7 ? 2 : 1} stage${g >= 7 ? 's' : ''}` },
  { id: 'xdefense', name: 'X Defense', target: 'active', since: 1, shortDesc: (g) => `Raises Defense ${g >= 7 ? 2 : 1} stage${g >= 7 ? 's' : ''}` },
  { id: 'xspatk', name: 'X Sp. Atk', target: 'active', since: 1, shortDesc: (g) => `Raises Sp. Atk ${g >= 7 ? 2 : 1} stage${g >= 7 ? 's' : ''}` },
  { id: 'xspdef', name: 'X Sp. Def', target: 'active', since: 4, shortDesc: (g) => `Raises Sp. Def ${g >= 7 ? 2 : 1} stage${g >= 7 ? 's' : ''}` },
  { id: 'xspeed', name: 'X Speed', target: 'active', since: 1, shortDesc: (g) => `Raises Speed ${g >= 7 ? 2 : 1} stage${g >= 7 ? 's' : ''}` },
  { id: 'xaccuracy', name: 'X Accuracy', target: 'active', since: 1, shortDesc: (g) => `Raises accuracy ${g >= 7 ? 2 : 1} stage${g >= 7 ? 's' : ''}` },
  { id: 'direhit', name: 'Dire Hit', target: 'active', since: 1, shortDesc: (g) => `Raises the critical-hit ratio ${g >= 7 ? 2 : 1} stage${g >= 7 ? 's' : ''}` },
  { id: 'guardspec', name: 'Guard Spec.', target: 'active', since: 1, shortDesc: () => "Stops the opponent lowering your team's stats for 5 turns" },
];

export const bagItem = (id: BagItemId) => BAG_ITEMS.find((i) => i.id === id)!;
export const bagItemsFor = (gen: number) => BAG_ITEMS.filter((i) => i.since <= gen);

/** Conditions the sim mod registers for the bag */
export const BAG_CONDITIONS = {
  // the Pokémon's trainer used an item this turn: its move never happens
  ppbagturn: {
    name: 'ppbagturn',
    duration: 1,
    onBeforeMovePriority: 200,
    onBeforeMove() {
      return false;
    },
  },
  // Dire Hit: a crit-ratio boost that lasts while the Pokémon stays in
  ppdirehit: {
    name: 'ppdirehit',
    onModifyCritRatio(this: Battle, ratio: number) {
      return ratio + (this.gen >= 7 ? 2 : 1);
    },
  },
};

export interface BagUse {
  item: BagItemId;
  /** Index into the side's party, in the sim's current order */
  target: number;
  /** Move slot (0-3) for Ether and Max Ether */
  move?: number;
}

/** Whether an item would do anything for that Pokémon now (the games refuse a Potion at full HP) */
export function bagUsable(battle: Battle, side: 0 | 1, use: BagUse): boolean {
  const item = bagItem(use.item);
  const mon = battle.sides[side].pokemon[use.target];
  if (!mon) return false;
  if (item.target === 'fainted') return mon.fainted;
  if (mon.fainted) return false;
  if (item.target === 'active' && !mon.isActive) return false;
  const heal = healAmount(use.item, battle.gen);
  const cures = STATUS_CURES[use.item];
  const canHeal = heal !== undefined && mon.hp < mon.maxhp;
  const curesConfusion = use.item === 'fullrestore' || use.item === 'fullheal';
  const canCure = !!cures && (cures.includes(mon.status) || (curesConfusion && !!mon.volatiles.confusion));
  if (heal !== undefined || cures) return canHeal || canCure;
  if (use.item === 'ether' || use.item === 'maxether') {
    const slot = mon.moveSlots[use.move ?? -1];
    return !!slot && slot.pp < slot.maxpp;
  }
  if (use.item === 'elixir' || use.item === 'maxelixir') return mon.moveSlots.some((s) => s.pp < s.maxpp);
  const stat = X_ITEMS[use.item];
  if (stat) return mon.boosts[stat] < 6;
  if (use.item === 'direhit') return !mon.volatiles.ppdirehit && !mon.volatiles.focusenergy;
  if (use.item === 'guardspec') return !battle.sides[side].sideConditions.mist;
  return false;
}

/** Applies an item's effect straight to the battle state and logs it; the caller makes the turn a pass */
export function applyBagItem(battle: Battle, side: 0 | 1, use: BagUse) {
  const s = battle.sides[side];
  const mon: Pokemon = s.pokemon[use.target];
  const item = bagItem(use.item);
  battle.add('message', `${s.name} used ${/^[AEIOU]/.test(item.name) ? 'an' : 'a'} ${item.name} on ${mon.name}!`);

  if (use.item === 'revive' || use.item === 'maxrevive') {
    // as Revival Blessing does it
    mon.fainted = false;
    mon.faintQueued = false;
    mon.subFainted = false;
    mon.status = '' as Pokemon['status'];
    mon.hp = 1;
    mon.sethp(use.item === 'maxrevive' ? mon.maxhp : Math.floor(mon.maxhp / 2));
    s.pokemonLeft++;
    battle.add('-heal', mon, mon.getHealth, '[silent]');
    return;
  }
  const heal = healAmount(use.item, battle.gen);
  if (heal !== undefined && mon.hp < mon.maxhp) {
    mon.heal(heal === 'full' ? mon.maxhp : heal);
    battle.add('-heal', mon, mon.getHealth, '[silent]');
  }
  const cures = STATUS_CURES[use.item];
  if (cures && cures.includes(mon.status)) mon.cureStatus();
  if ((use.item === 'fullrestore' || use.item === 'fullheal') && mon.volatiles.confusion) mon.removeVolatile('confusion');

  if (use.item === 'ether' || use.item === 'maxether') {
    const slot = mon.moveSlots[use.move ?? 0];
    slot.pp = use.item === 'maxether' ? slot.maxpp : Math.min(slot.maxpp, slot.pp + 10);
  }
  if (use.item === 'elixir' || use.item === 'maxelixir') {
    for (const slot of mon.moveSlots) slot.pp = use.item === 'maxelixir' ? slot.maxpp : Math.min(slot.maxpp, slot.pp + 10);
  }
  const stat = X_ITEMS[use.item];
  if (stat) {
    const by = battle.gen >= 7 ? 2 : 1;
    const gained = mon.boostBy({ [stat]: by });
    battle.add('-boost', mon, stat, gained);
  }
  if (use.item === 'direhit') mon.addVolatile('ppdirehit');
  if (use.item === 'guardspec') s.addSideCondition('mist', mon);
}
