import type { PxRect } from '../core/library/room-grid';
import { shelfSlots } from '../core/library/room-grid';
import type { Palette } from '../core/library/styles';

const NO_REFERRER = { referrerPolicy: 'no-referrer' } as object;

type ArtProps = { rect: PxRect; palette: Palette };

export function ShelfArt({ rect, palette, showSlots, occupied }: ArtProps & { showSlots: boolean; occupied?: ReadonlySet<number> }) {
  const { x, y, w, h } = rect;
  const boardH = 5;
  const inner = 6;
  const levelH = (h - 2 * inner) / 3;
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={4} fill={palette.wood} stroke={palette.edge} strokeWidth={1.5} />
      <rect x={x + inner} y={y + inner} width={w - 2 * inner} height={h - 2 * inner} fill={palette.woodDark} />
      {[1, 2].map((i) => (
        <rect key={i} x={x + inner} y={y + inner + i * levelH - boardH / 2} width={w - 2 * inner} height={boardH} fill={palette.wood} />
      ))}
      {showSlots &&
        shelfSlots(rect).map((slot, i) => occupied?.has(i) ? null : (
          <rect key={i} x={slot.x} y={slot.y} width={slot.w} height={slot.h} rx={2} fill="none" stroke={palette.text} strokeWidth={1} strokeDasharray="3 3" />
        ))}
    </g>
  );
}

export function DeskArt({ rect, palette }: ArtProps) {
  const { x, y, w, h } = rect;
  return (
    <g>
      <rect x={x} y={y} width={w} height={8} rx={3} fill={palette.desk} stroke={palette.edge} strokeWidth={1} />
      <rect x={x + 10} y={y + 8} width={6} height={h - 8} fill={palette.leg} stroke={palette.edge} strokeWidth={1} />
      <rect x={x + w - 16} y={y + 8} width={6} height={h - 8} fill={palette.leg} stroke={palette.edge} strokeWidth={1} />
    </g>
  );
}

// Écran : affiche l'image d'une carte quand il y en a une.
export function ComputerArt({ rect, imageUrl }: { rect: PxRect; imageUrl?: string }) {
  const { x, y, w, h } = rect;
  const screenH = h - 12;
  return (
    <g>
      <rect x={x} y={y} width={w} height={screenH} rx={5} fill="#1D1D22" />
      <rect x={x + 5} y={y + 5} width={w - 10} height={screenH - 10} rx={2} fill="#A8C5E6" />
      {imageUrl && <image href={imageUrl} x={x + 5} y={y + 5} width={w - 10} height={screenH - 10} {...NO_REFERRER} preserveAspectRatio="xMidYMid slice" />}
      <rect x={x + w / 2 - 4} y={y + screenH} width={8} height={h - screenH - 4} fill="#555555" />
      <rect x={x + w / 2 - 17} y={y + h - 4} width={34} height={4} rx={2} fill="#555555" />
    </g>
  );
}
