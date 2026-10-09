import type { ReactElement } from 'react';
import type { SmallItem, StandingKind } from '../core/library/library-types';
import type { PxRect } from '../core/library/room-grid';
import type { Palette } from '../core/library/styles';

type Props = { rect: PxRect; palette: Palette };
type LampProps = Props & { lit?: boolean };

function Chair({ rect: { x, y, w, h }, palette: p }: Props) {
  return (
    <g>
      <rect x={x + w * 0.1} y={y} width={w * 0.1} height={h} fill={p.wood} />
      <rect x={x + w * 0.1} y={y + h * 0.05} width={w * 0.6} height={h * 0.08} fill={p.wood} />
      <rect x={x + w * 0.1} y={y + h * 0.15} width={w * 0.6} height={h * 0.08} fill={p.wood} />
      <rect x={x + w * 0.05} y={y + h * 0.5} width={w * 0.85} height={h * 0.1} rx={3} fill={p.desk} stroke={p.edge} />
      <rect x={x + w * 0.78} y={y + h * 0.6} width={w * 0.09} height={h * 0.4} fill={p.leg} stroke={p.edge} />
    </g>
  );
}

function Sofa({ rect: { x, y, w, h }, palette: p }: Props) {
  return (
    <g>
      <rect x={x} y={y + h * 0.05} width={w} height={h * 0.62} rx={h * 0.2} fill={p.fabric} />
      <rect x={x + w * 0.05} y={y + h * 0.4} width={w * 0.9} height={h * 0.42} rx={h * 0.14} fill={p.fabricLight} />
      <rect x={x} y={y + h * 0.3} width={w * 0.12} height={h * 0.55} rx={h * 0.15} fill={p.fabricDark} />
      <rect x={x + w * 0.88} y={y + h * 0.3} width={w * 0.12} height={h * 0.55} rx={h * 0.15} fill={p.fabricDark} />
      <line x1={x + w * 0.37} y1={y + h * 0.44} x2={x + w * 0.37} y2={y + h * 0.8} stroke={p.fabric} strokeWidth={1.5} />
      <line x1={x + w * 0.63} y1={y + h * 0.44} x2={x + w * 0.63} y2={y + h * 0.8} stroke={p.fabric} strokeWidth={1.5} />
      <rect x={x + w * 0.06} y={y + h * 0.85} width={w * 0.035} height={h * 0.15} fill={p.leg} />
      <rect x={x + w * 0.905} y={y + h * 0.85} width={w * 0.035} height={h * 0.15} fill={p.leg} />
    </g>
  );
}

function Armchair({ rect: { x, y, w, h }, palette: p }: Props) {
  return (
    <g>
      <rect x={x + w * 0.02} y={y + h * 0.05} width={w * 0.96} height={h * 0.7} rx={h * 0.2} fill={p.warm} />
      <rect x={x + w * 0.14} y={y + h * 0.45} width={w * 0.72} height={h * 0.35} rx={h * 0.1} fill={p.warmLight} />
      <rect x={x} y={y + h * 0.35} width={w * 0.18} height={h * 0.5} rx={h * 0.15} fill={p.warmDark} />
      <rect x={x + w * 0.82} y={y + h * 0.35} width={w * 0.18} height={h * 0.5} rx={h * 0.15} fill={p.warmDark} />
      <rect x={x + w * 0.1} y={y + h * 0.85} width={w * 0.07} height={h * 0.15} fill={p.leg} />
      <rect x={x + w * 0.83} y={y + h * 0.85} width={w * 0.07} height={h * 0.15} fill={p.leg} />
    </g>
  );
}

function Basket({ rect: { x, y, w, h }, palette: p }: Props) {
  return (
    <g>
      <path d={`M${x + w * 0.02} ${y + h} Q${x} ${y + h * 0.3} ${x + w * 0.12} ${y + h * 0.2} L${x + w * 0.88} ${y + h * 0.2} Q${x + w} ${y + h * 0.3} ${x + w * 0.98} ${y + h} Z`} fill={p.warm} stroke={p.warmDark} />
      <ellipse cx={x + w / 2} cy={y + h * 0.22} rx={w * 0.38} ry={h * 0.14} fill={p.warmLight} />
      {[0.25, 0.5, 0.75].map((f) => (
        <line key={f} x1={x + w * f} y1={y + h * 0.45} x2={x + w * f} y2={y + h * 0.95} stroke={p.warmDark} strokeWidth={1} />
      ))}
    </g>
  );
}

function Bowl({ rect: { x, y, w, h }, palette: p }: Props) {
  return (
    <g>
      <path d={`M${x + w * 0.05} ${y + h * 0.15} L${x + w * 0.95} ${y + h * 0.15} L${x + w * 0.85} ${y + h} L${x + w * 0.15} ${y + h} Z`} fill={p.fabric} stroke={p.fabricDark} />
      <ellipse cx={x + w / 2} cy={y + h * 0.17} rx={w * 0.45} ry={h * 0.15} fill={p.warmLight} />
    </g>
  );
}

// Station de recharge : un socle plat sur le sol, deux contacts et un voyant vert.
function Charger({ rect: { x, y, w, h }, palette: p }: Props) {
  return (
    <g>
      <rect x={x + w * 0.04} y={y + h * 0.35} width={w * 0.92} height={h * 0.65} rx={4} fill={p.metal} stroke={p.edge} />
      <rect x={x + w * 0.12} y={y + h * 0.42} width={w * 0.76} height={h * 0.2} rx={2} fill={p.woodDark} />
      <rect x={x + w * 0.3} y={y + h * 0.3} width={w * 0.1} height={h * 0.16} fill={p.edge} />
      <rect x={x + w * 0.6} y={y + h * 0.3} width={w * 0.1} height={h * 0.16} fill={p.edge} />
      <circle cx={x + w * 0.5} cy={y + h * 0.75} r={Math.max(2, h * 0.07)} fill="#4CD08A" />
    </g>
  );
}

function Kennel({ rect: { x, y, w, h }, palette: p }: Props) {
  return (
    <g>
      <rect x={x + w * 0.05} y={y + h * 0.3} width={w * 0.9} height={h * 0.7} fill={p.wood} stroke={p.woodDark} />
      <path d={`M${x} ${y + h * 0.36} L${x + w / 2} ${y} L${x + w} ${y + h * 0.36}`} fill="none" stroke={p.woodDark} strokeWidth={6} strokeLinejoin="round" />
      <path d={`M${x + w * 0.35} ${y + h} L${x + w * 0.35} ${y + h * 0.62} Q${x + w / 2} ${y + h * 0.4} ${x + w * 0.65} ${y + h * 0.62} L${x + w * 0.65} ${y + h} Z`} fill={p.door} />
    </g>
  );
}

function Plant({ rect: { x, y, w, h }, palette: p }: Props) {
  const cx = x + w / 2;
  const potTop = y + h * 0.68;
  return (
    <g>
      <path d={`M${x + w * 0.2} ${y + h} L${x + w * 0.8} ${y + h} L${x + w * 0.9} ${potTop} L${x + w * 0.1} ${potTop} Z`} fill={p.leg} stroke={p.edge} />
      <ellipse cx={cx} cy={y + h * 0.38} rx={w * 0.14} ry={h * 0.32} fill={p.leaf} />
      <ellipse cx={cx} cy={y + h * 0.46} rx={w * 0.12} ry={h * 0.26} fill={p.leaf} transform={`rotate(-28 ${cx} ${potTop})`} />
      <ellipse cx={cx} cy={y + h * 0.46} rx={w * 0.12} ry={h * 0.26} fill={p.leaf} transform={`rotate(28 ${cx} ${potTop})`} />
      <ellipse cx={cx} cy={y + h * 0.52} rx={w * 0.1} ry={h * 0.2} fill={p.leafDark} transform={`rotate(-55 ${cx} ${potTop})`} />
      <ellipse cx={cx} cy={y + h * 0.52} rx={w * 0.1} ry={h * 0.2} fill={p.leafDark} transform={`rotate(55 ${cx} ${potTop})`} />
    </g>
  );
}

// Halo chaud d'une lampe allumée (translucide) ; éteinte, l'abat-jour est assombri par un voile.
function Lamp({ rect: { x, y, w, h }, palette: p, lit = true }: LampProps) {
  const shade = `M${x} ${y + h * 0.17} L${x + w} ${y + h * 0.17} L${x + w * 0.8} ${y} L${x + w * 0.2} ${y} Z`;
  return (
    <g>
      {lit && <ellipse data-lamp-halo="" pointerEvents="none" cx={x + w / 2} cy={y + h * 0.1} rx={w * 1.1} ry={h * 0.2} fill="#FFD38A" opacity={0.35} />}
      <rect x={x + w * 0.1} y={y + h - 7} width={w * 0.8} height={7} rx={3} fill={p.metal} />
      <rect x={x + w / 2 - 1.5} y={y + h * 0.17} width={3} height={h * 0.83 - 6} fill={p.metal} />
      <path d={shade} fill={p.shade} stroke={p.edge} />
      {!lit && <path d={shade} fill="#1B1B24" opacity={0.55} />}
    </g>
  );
}

function CoffeeTable({ rect: { x, y, w, h }, palette: p }: Props) {
  return (
    <g>
      <rect x={x + w * 0.08} y={y + h * 0.3} width={w * 0.06} height={h * 0.7} fill={p.leg} stroke={p.edge} />
      <rect x={x + w * 0.86} y={y + h * 0.3} width={w * 0.06} height={h * 0.7} fill={p.leg} stroke={p.edge} />
      <rect x={x} y={y} width={w} height={h * 0.34} rx={4} fill={p.desk} stroke={p.edge} />
    </g>
  );
}

function Rug({ rect: { x, y, w, h }, palette: p }: Props) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={8} fill={p.rug} />
      <rect x={x + 8} y={y + 8} width={w - 16} height={h - 16} rx={5} fill="none" stroke={p.skirt} strokeWidth={2} strokeDasharray="6 4" />
    </g>
  );
}

type HomeKind = Exclude<StandingKind, 'shelf' | 'desk' | 'globe' | 'telescope' | 'automaton'>;
const ARTS: Record<HomeKind, (props: LampProps) => ReactElement> = {
  chair: Chair,
  sofa: Sofa,
  armchair: Armchair,
  basket: Basket,
  bowl: Bowl,
  kennel: Kennel,
  charger: Charger,
  plant: Plant,
  lamp: Lamp,
  'coffee-table': CoffeeTable,
  rug: Rug,
};

export function HomeArt({ kind, rect, palette, lit }: LampProps & { kind: HomeKind }) {
  const Art = ARTS[kind];
  return <Art rect={rect} palette={palette} lit={lit} />;
}

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
