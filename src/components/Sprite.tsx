import { useState } from 'react';

// Showdown's dex sprites cover every gen; gen5 sprites are the fallback for odd formes
const SOURCES = [
  (id: string) => `https://play.pokemonshowdown.com/sprites/dex/${id}.png`,
  (id: string) => `https://play.pokemonshowdown.com/sprites/gen5/${id}.png`,
];

export function Sprite({ id, name, size = 40 }: { id: string; name: string; size?: number }) {
  const [attempt, setAttempt] = useState(0);
  const src = SOURCES[attempt]?.(id);
  return (
    <span className="inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }}>
      {src && (
        <img
          key={src}
          src={src}
          alt={name}
          loading="lazy"
          width={size}
          height={size}
          className="max-h-full max-w-full object-contain [image-rendering:pixelated]"
          onError={() => setAttempt((a) => a + 1)}
        />
      )}
    </span>
  );
}
