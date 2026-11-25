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

export function TypeBadge({ type, short = false }: { type: string; short?: boolean }) {
  return (
    <span
      className="inline-block rounded px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-white"
      style={{ backgroundColor: typeColor(type), textShadow: '0 1px 1px rgb(0 0 0 / 0.4)' }}
    >
      {short ? type.slice(0, 3) : type}
    </span>
  );
}
