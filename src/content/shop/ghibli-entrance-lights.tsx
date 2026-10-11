import type { ReactElement } from 'react';
import type { Door } from '../../core/library/city/doors';
import { DOOR_WIDTH } from '../../core/library/city/metrics';
import { entranceScale } from '../../core/library/paint/city-plan';
import { transomOf } from '../../core/library/paint/shop/entrance';

// Impostes allumées des entrées peintes (G4a) : la nuit, la lumière du hall éclairé (hallU < 0,6, comme le classique)
// remplit l'imposte et tombe en trapèze sur la marche. Dessinées hors du filtre d'étalonnage, au-dessus du décor peint.
export function GhibliEntranceLights({ doors, unit, doorY, dark }: { doors: readonly Door[]; unit: number; doorY: number; dark: boolean }): ReactElement | null {
  if (!dark) return null;
  const s = entranceScale(unit);
  return (
    <g data-entrance-lights="">
      {doors
        .filter((d) => d.hallU < 0.6)
        .map((d) => {
          const cx = d.x + DOOR_WIDTH / 2;
          const X = (u: number): number => cx + u * s;
          const Y = (v: number): number => doorY + v * s;
          const t = transomOf(d.variant);
          return (
            <g key={d.id} data-entrance-light={d.id}>
              {t.kind === 'arch' ? (
                <path d={`M${X(-t.r)} ${Y(t.cy)} A${t.r * s} ${t.r * s} 0 0 1 ${X(t.r)} ${Y(t.cy)} Z`} fill="#FFD890" />
              ) : (
                t.rects.map(([u, v, w, h], i) => <rect key={i} x={X(u)} y={Y(v)} width={w * s} height={h * s} fill="#FFD890" opacity={0.9} />)
              )}
              <polygon points={`${X(-6)},${Y(0)} ${X(6)},${Y(0)} ${X(9)},${Y(4)} ${X(-9)},${Y(4)}`} fill="#FFD282" opacity={0.28} />
            </g>
          );
        })}
    </g>
  );
}
