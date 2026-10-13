import type { ReactElement } from 'react';
import type { Door } from '../../core/library/city/doors';
import { DOOR_WIDTH } from '../../core/library/city/metrics';
import { entranceScale } from '../../core/library/paint/city-plan';
import { transomOf } from '../../core/library/paint/shop/entrance';

// Imposte allumée d'une entrée peinte (G4a) : la lumière du hall remplit l'imposte et tombe en trapèze sur la marche.
// Allumée par la minuterie du hall (hall-lights.tsx, calque animé, au-dessus du décor peint et hors du filtre d'étalonnage).
export function GhibliEntranceLight({ door, unit, doorY }: { door: Door; unit: number; doorY: number }): ReactElement {
  const s = entranceScale(unit);
  const cx = door.x + DOOR_WIDTH / 2;
  const X = (u: number): number => cx + u * s;
  const Y = (v: number): number => doorY + v * s;
  const t = transomOf(door.variant);
  return (
    <g data-entrance-light={door.id}>
      {t.kind === 'arch' ? (
        <path d={`M${X(-t.r)} ${Y(t.cy)} A${t.r * s} ${t.r * s} 0 0 1 ${X(t.r)} ${Y(t.cy)} Z`} fill="#FFD890" />
      ) : (
        t.rects.map(([u, v, w, h], i) => <rect key={i} x={X(u)} y={Y(v)} width={w * s} height={h * s} fill="#FFD890" opacity={0.9} />)
      )}
      <polygon points={`${X(-6)},${Y(0)} ${X(6)},${Y(0)} ${X(9)},${Y(4)} ${X(-9)},${Y(4)}`} fill="#FFD282" opacity={0.28} />
    </g>
  );
}
