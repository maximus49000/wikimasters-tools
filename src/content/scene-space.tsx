import type { ReactElement } from 'react';
import { lampLit } from '../core/library/activity';
import { mulberry32 } from '../core/library/scene-world';
import { mixHex } from '../core/library/sky';
import type { SceneBodyProps } from './scene-panorama';

function StarField({ width, height, seed, density = 8 }: { width: number; height: number; seed: number; density?: number }): ReactElement {
  const rng = mulberry32(seed ^ 0x57a2);
  const stars = Array.from({ length: Math.round(width / density) }, (_, i) => ({ i, x: rng() * width, y: rng() * height, r: 0.6 + rng() * 1.5, a: 0.5 + rng() * 0.5 }));
  return (
    <g>
      {stars.map((s) => (
        <circle key={s.i} data-star="" cx={s.x} cy={s.y} r={s.r} fill="#FFFFFF" opacity={s.a} />
      ))}
    </g>
  );
}

export function SpaceScene({ width, height, seed }: SceneBodyProps): ReactElement {
  const rng = mulberry32(seed ^ 0xa11);
  const bodies = Array.from({ length: Math.max(2, Math.round(width / 600)) }, (_, i) => ({ i, x: rng() * width, y: height * (0.15 + rng() * 0.55), r: 14 + rng() * 34, hue: ['#C9B28A', '#7FA8C9', '#C98A7F', '#9AC99F'][Math.floor(rng() * 4)]! }));
  return (
    <g data-scene-body data-scene-art="space">
      <rect x={0} y={0} width={width} height={height} fill="#050714" />
      <StarField width={width} height={height} seed={seed} />
      {bodies.map((b) => (
        <g key={b.i}>
          <circle cx={b.x} cy={b.y} r={b.r} fill={b.hue} />
          <circle cx={b.x - b.r * 0.3} cy={b.y - b.r * 0.2} r={b.r * 0.7} fill="#FFFFFF" opacity={0.12} />
          {b.i % 2 === 0 && <ellipse cx={b.x} cy={b.y} rx={b.r * 1.7} ry={b.r * 0.3} fill="none" stroke="#E8DCC0" strokeWidth={2} opacity={0.6} />}
        </g>
      ))}
    </g>
  );
}

// La Terre vue d'en haut : un grand disque au bas du monde, dont le sommet reste sous le haut du cadre (horizon visible).
// La face éclairée suit la lumière du jour ; côté nuit, des villes lumineuses s'allument et s'éteignent comme les fenêtres d'immeuble.
// Terres et villes ne sont dessinées que sur le disque.
export function earthGeometry(width: number, height: number): { radius: number; cx: number; cy: number; surfaceY: (x: number) => number } {
  const radius = Math.max(width, 900);
  const cx = width / 2;
  const cy = height * 0.42 + radius;
  const surfaceY = (x: number): number => cy - Math.sqrt(Math.max(0, radius * radius - (x - cx) ** 2));
  return { radius, cx, cy, surfaceY };
}

export function EarthScene({ width, height, sky, minutes, seed }: SceneBodyProps): ReactElement {
  const { radius, cx, cy, surfaceY } = earthGeometry(width, height);
  const rng = mulberry32(seed ^ 0xea27);
  const lands = Array.from({ length: Math.round(width / 70) }, (_, i) => ({ i, x: cx + (rng() - 0.5) * width, rx: 20 + rng() * 40, ry: 6 + rng() * 12, dy: 6 + rng() * height * 0.45 })).filter(
    (l) => height - l.dy + 4 - l.ry > surfaceY(l.x) + 2,
  );
  const cities = Array.from({ length: Math.round(width / 26) }, (_, i) => ({ i, x: cx + (rng() - 0.5) * width * 0.98, dy: 8 + rng() * height * 0.5, u: rng() })).filter(
    (c) => height - c.dy > surfaceY(c.x) + 2,
  );
  const dim = 1 - sky.daylight;
  const surface = mixHex('#0E1A3A', '#2F6FB5', sky.daylight);
  const land = mixHex('#14281F', '#4E9A5A', sky.daylight);
  return (
    <g data-scene-body data-scene-art="earth">
      <rect x={0} y={0} width={width} height={height} fill="#03040C" />
      <StarField width={width} height={height} seed={seed} />
      <circle cx={cx} cy={cy} r={radius * 1.04} fill="#6FA8FF" opacity={0.18 + 0.2 * sky.daylight} />
      <circle data-earth="" cx={cx} cy={cy} r={radius} fill={surface} />
      {lands.map((l) => (
        <ellipse key={l.i} data-land="" cx={l.x} cy={height - l.dy + 4} rx={l.rx} ry={l.ry} fill={land} />
      ))}
      {cities.map((c) => {
        const lit = lampLit(c.u, minutes);
        return <circle key={c.i} data-lamp="" data-lit={lit ? 'true' : 'false'} cx={c.x} cy={height - c.dy} r={1.4} fill="#FFD27A" opacity={lit ? dim : 0} style={{ transition: 'opacity 4s ease' }} />;
      })}
    </g>
  );
}
