import type { ReactElement } from 'react';
import type { PxRect } from '../core/library/room-grid';

const NO_REFERRER = { referrerPolicy: 'no-referrer' } as object;

// Machine analytique : coffre de cuivre, écran à tube (image de la carte), cadrans à droite, clavier à touches rondes.
// Mêmes proportions que ComputerArt : la zone touchable de l'écran (RoomView) tombe dans le tube.
export function AnalyticalEngineArt({ rect: { x, y, w, h }, imageUrl }: { rect: PxRect; imageUrl?: string }): ReactElement {
  const bodyH = h - 12;
  const dialsX = x + w * 0.88;
  return (
    <g data-steampunk-art="analytical-engine">
      <rect x={x} y={y} width={w} height={bodyH} rx={5} fill="#B87333" stroke="#8A6A22" strokeWidth={1.5} />
      <rect x={x + 5} y={y + 5} width={w - 10} height={bodyH - 10} rx={4} fill="#1D1D22" />
      {imageUrl && <image href={imageUrl} x={x + 5} y={y + 5} width={w - 10} height={bodyH - 10} {...NO_REFERRER} preserveAspectRatio="xMidYMid slice" />}
      {[0.3, 0.7].map((f) => (
        <g key={f}>
          <circle cx={dialsX} cy={y + bodyH * f} r={Math.min(5, w * 0.045)} fill="#F4F0E0" stroke="#8A6A22" strokeWidth={1} />
          <line x1={dialsX} y1={y + bodyH * f} x2={dialsX + 2} y2={y + bodyH * f - 3} stroke="#3A2A12" strokeWidth={1} />
        </g>
      ))}
      <rect x={x + w * 0.1} y={y + bodyH} width={w * 0.8} height={12} rx={3} fill="#8A6A22" />
      {Array.from({ length: 7 }, (_, i) => (
        <circle key={i} cx={x + w * (0.17 + i * 0.11)} cy={y + bodyH + 6} r={2.4} fill="#C9A24B" stroke="#3A2A12" strokeWidth={0.6} />
      ))}
    </g>
  );
}
