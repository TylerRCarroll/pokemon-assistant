import type { MoveInfo, StatsTable } from '../rulesets/types';

export const statTotal = (s: StatsTable) => s.hp + s.atk + s.def + s.spa + s.spd + s.spe;

export const formatPower = (m: MoveInfo) => (m.category === 'Status' || !m.basePower ? '—' : String(m.basePower));
export const formatAccuracy = (m: MoveInfo) => (m.accuracy === true ? '—' : `${m.accuracy}%`);

const TYPE_COLORS: Record<string, string> = {
  Normal: '#9fa19f',
  Fire: '#e62829',
  Water: '#2980ef',
  Electric: '#fac000',
  Grass: '#3fa129',
  Ice: '#3dcef3',
  Fighting: '#ff8000',
  Poison: '#9141cb',
  Ground: '#915121',
  Flying: '#81b9ef',
  Psychic: '#ef4179',
  Bug: '#91a119',
  Rock: '#afa981',
  Ghost: '#704170',
  Dragon: '#5060e1',
  Dark: '#624d4e',
  Steel: '#60a1b8',
  Fairy: '#ef70ef',
};

export function typeColor(type: string) {
  return TYPE_COLORS[type] ?? '#888';
}
