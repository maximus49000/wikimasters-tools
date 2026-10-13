import type { SmallItem } from '../core/library/library-types';
import type { PxRect } from '../core/library/room-grid';
import type { Palette } from '../core/library/styles';

type LampProps = { rect: PxRect; palette: Palette; lit?: boolean };

// Petit objet posé sur une surface : centré dans sa boîte, le pied appuyé sur le dessus du porteur.
export function SmallArt({ item, rect, palette: p, lit = true }: LampProps & { item: SmallItem }) {
  const cx = rect.x + rect.w / 2;
  const base = rect.y + rect.h - 2;
  if (item === 'plant') {
    return (
      <g>
        <path d={`M${cx - 9} ${base} L${cx + 9} ${base} L${cx + 11} ${base - 13} L${cx - 11} ${base - 13} Z`} fill={p.leg} stroke={p.edge} />
        <ellipse cx={cx - 5} cy={base - 22} rx={4} ry={11} fill={p.leaf} transform={`rotate(-25 ${cx - 5} ${base - 22})`} />
        <ellipse cx={cx + 5} cy={base - 22} rx={4} ry={11} fill={p.leafDark} transform={`rotate(25 ${cx + 5} ${base - 22})`} />
        <ellipse cx={cx} cy={base - 25} rx={4} ry={12} fill={p.leaf} />
      </g>
    );
  }
  const shade = `M${cx - 12} ${base - 22} L${cx + 12} ${base - 22} L${cx + 8} ${base - 38} L${cx - 8} ${base - 38} Z`;
  return (
    <g>
      {lit && <ellipse data-lamp-halo="" pointerEvents="none" cx={cx} cy={base - 32} rx={22} ry={14} fill="#FFD38A" opacity={0.35} />}
      <rect x={cx - 8} y={base - 3} width={16} height={3} rx={1.5} fill={p.metal} />
      <rect x={cx - 1.5} y={base - 22} width={3} height={20} fill={p.metal} />
      <path d={shade} fill={p.shade} stroke={p.edge} />
      {!lit && <path d={shade} fill="#1B1B24" opacity={0.55} />}
    </g>
  );
}
