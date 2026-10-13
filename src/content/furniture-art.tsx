import type { PxRect } from '../core/library/room-grid';

const NO_REFERRER = { referrerPolicy: 'no-referrer' } as object;

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
