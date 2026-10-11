import { useMemo, type ReactElement } from 'react';
import { lampLit, lampsFor } from '../core/library/city/lamps';
import { STREET_SCALE, cityMetrics } from '../core/library/city/metrics';
import { mulberry32 } from '../core/library/scene-world';

// Lumière des lampadaires la nuit sur la ville peinte (vague Ghibli, décor cellulo), hors filtre d'étalonnage : halo à
// deux tons autour de la lanterne, cône discret, flaque à deux tons à bord net sur le trottoir et la chaussée, reflets en
// traits sur les pavés. Un groupe par lampadaire (`lampsFor`), allumé selon la même règle que le sprite (`lampLit`) ;
// `dim` règle l'intensité (nuit ou ciel couvert). La lanterne du sprite (LampSprite) est en (9, −77) × échelle.
const LANTERN = { dx: 9, dy: -77 } as const;

type Props = { width: number; height: number; seed: number; minutes: number; daylight: number; dim: number; forcedNight?: boolean };

export function GhibliNightLight({ width, height, seed, minutes, daylight, dim, forcedNight = false }: Props): ReactElement {
  const lamps = useMemo(() => lampsFor(width, seed), [width, seed]);
  const m = cityMetrics(height);
  const k = m.unit * STREET_SCALE.lamp;
  const u = m.unit;
  return (
    <g data-ghibli-night="">
      {lamps.map((lamp) => {
        const lit = lampLit(lamp, minutes, daylight, forcedNight);
        const gx = lamp.x + LANTERN.dx * k;
        const gy = m.curb + LANTERN.dy * k;
        const rng = mulberry32(seed ^ (lamp.x * 7919));
        const streaks = Array.from({ length: 6 }, (_, i) => ({ x: lamp.x + 3 * u + (rng() - 0.5) * 5 * u, w: (1.2 + rng() * 2) * u, y: m.curb + (2 + i * 5) * u, a: 0.45 - i * 0.05 }));
        return (
          <g key={lamp.id} data-night-lamp={lamp.id} data-lit={lit ? 'true' : 'false'} opacity={lit ? dim : 0} style={{ transition: 'opacity 4s ease' }}>
            <circle cx={gx} cy={gy + 4 * u} r={22 * u} fill="#FFDC8C" opacity={0.18} />
            <circle cx={gx} cy={gy + 4 * u} r={11 * u} fill="#FFE6A0" opacity={0.3} />
            <path d={`M${(gx - 3 * u).toFixed(1)} ${gy.toFixed(1)}H${(gx + 3 * u).toFixed(1)}L${(gx + 30 * u).toFixed(1)} ${(m.curb + 10 * u).toFixed(1)}H${(gx - 26 * u).toFixed(1)}Z`} fill="#FFD78C" opacity={0.05} />
            <ellipse cx={lamp.x + 3 * u} cy={m.curb - 2 * u} rx={46 * u} ry={13 * u} fill="#FFD78C" opacity={0.26} />
            <ellipse cx={lamp.x + 3 * u} cy={m.curb - 2 * u} rx={24 * u} ry={7 * u} fill="#FFE6AA" opacity={0.42} />
            {streaks.map((s, i) => (
              <rect key={i} x={(s.x - s.w / 2).toFixed(1)} y={s.y.toFixed(1)} width={s.w.toFixed(1)} height={(3.6 * u).toFixed(1)} fill="#FFE1A0" opacity={s.a.toFixed(2)} />
            ))}
          </g>
        );
      })}
    </g>
  );
}
