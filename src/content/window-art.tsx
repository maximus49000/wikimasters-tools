import type { ReactElement } from 'react';
import { CELL_H, WALL_ROWS, type PxRect } from '../core/library/room-grid';
import type { Palette } from '../core/library/styles';

const GLASS_INSET = 7;

// Zone de la vitre (là où le décor se voit), en pixels de la pièce.
// Une fenêtre qui descend jusqu'au bas du mur (baie vitrée) montre la rue jusqu'au trottoir de devant : pas de traverse basse.
const touchesFloor = (rect: PxRect): boolean => rect.y + rect.h >= WALL_ROWS * CELL_H - 0.5;
export const glassRect = (rect: PxRect): PxRect => {
  const bottom = touchesFloor(rect) ? 2 : GLASS_INSET;
  return { x: rect.x + GLASS_INSET, y: rect.y + GLASS_INSET, w: rect.w - 2 * GLASS_INSET, h: rect.h - GLASS_INSET - bottom };
};

// Sans `view`, seul le cadre est dessiné : le décor est rendu UNE fois pour toutes les fenêtres, derrière (voir RoomView).
// `view` (copie soulevée pendant un glissé) : la vitre et le décor sont recopiés par `<use>` des vrais groupes, découpés par `clipId`.
// `weatherHref` / `weatherGroundHref` : groupes de la météo (ciel par-dessus les acteurs, sol en dessous), absents sans météo.
// La copie soulevée n'emporte ni pluie ni gouttes de vitre (canvas de rain-canvas.tsx, non recopiés par `<use>`) : elles
// reprennent quand la fenêtre est posée.
type Props = { rect: PxRect; palette: Palette; steampunk: boolean; view?: boolean; worldHref?: string; actorsHref?: string; weatherHref?: string; weatherGroundHref?: string; clipId?: string };

// Une fenêtre : le cadre seul (barreaux, bords, appui, rivets). Le décor (fixe, puis acteurs animés) est le MÊME pour
// toutes les fenêtres, rendu une seule fois derrière les cadres : ce qu'on voit à gauche et à droite se raccorde, et un
// passant traverse l'une puis l'autre. Seule la copie soulevée (`view`) le recopie par `<use>`.
export function WindowArt({ rect, palette, steampunk, view = false, worldHref, actorsHref, weatherHref, weatherGroundHref, clipId }: Props): ReactElement {
  const glass = glassRect(rect);
  const frame = steampunk ? '#B5833A' : palette.skirt;
  const edge = steampunk ? '#6E4A1E' : palette.edge;
  const bars: ReactElement[] = [];
  // Montants verticaux tous les ~120 px (un seul au centre jusqu'à 239 px, comme avant ; deux dès 240 px) ; traverse seulement hors baie.
  const posts = Math.floor(glass.w / 120);
  for (let k = 1; k <= posts; k++) bars.push(<rect key={`v${k}`} x={glass.x + (glass.w * k) / (posts + 1) - 2} y={glass.y} width={4} height={glass.h} fill={frame} />);
  const floor = touchesFloor(rect);
  const edgeR = steampunk ? 16 : 4;
  if (glass.h >= 110 && !floor) bars.push(<rect key="h" x={glass.x} y={glass.y + glass.h / 2 - 2} width={glass.w} height={4} fill={frame} />);
  const rivets: ReactElement[] = steampunk
    ? [
        [rect.x + 3.5, rect.y + 3.5],
        [rect.x + rect.w - 3.5, rect.y + 3.5],
        [rect.x + 3.5, rect.y + rect.h - 3.5],
        [rect.x + rect.w - 3.5, rect.y + rect.h - 3.5],
      ].map(([cx, cy], i) => <circle key={i} cx={cx} cy={cy} r={2} fill="#E8C57A" stroke={edge} strokeWidth={0.6} />)
    : [];
  return (
    <g data-window-art="">
      {view && (
        <>
          <rect x={glass.x} y={glass.y} width={glass.w} height={glass.h} fill="#9CC4E8" />
          <clipPath id={clipId}>
            <rect x={glass.x} y={glass.y} width={glass.w} height={glass.h} rx={steampunk ? 10 : 0} />
          </clipPath>
          <g clipPath={`url(#${clipId})`}>
            {worldHref && <use data-window-view="" href={worldHref} />}
            {weatherGroundHref && <use data-window-weather-ground="" href={weatherGroundHref} />}
            {actorsHref && <use data-window-actors="" href={actorsHref} />}
            {weatherHref && <use data-window-weather="" href={weatherHref} />}
          </g>
        </>
      )}
      {bars}
      {floor ? (
        // Baie : cadre en U renversé (haut + côtés), le bas reste ouvert sur la rue.
        <path d={`M${rect.x + 3} ${rect.y + rect.h} V${rect.y + 3} H${rect.x + rect.w - 3} V${rect.y + rect.h}`} fill="none" stroke={frame} strokeWidth={GLASS_INSET - 1} />
      ) : (
        <rect x={rect.x + 3} y={rect.y + 3} width={rect.w - 6} height={rect.h - 6} rx={steampunk ? 14 : 3} fill="none" stroke={frame} strokeWidth={GLASS_INSET - 1} />
      )}
      {floor ? (
        // Baie : bord extérieur ouvert en bas (coins hauts arrondis), sans appui.
        <path
          d={`M${rect.x} ${rect.y + rect.h} V${rect.y + edgeR} Q${rect.x} ${rect.y} ${rect.x + edgeR} ${rect.y} H${rect.x + rect.w - edgeR} Q${rect.x + rect.w} ${rect.y} ${rect.x + rect.w} ${rect.y + edgeR} V${rect.y + rect.h}`}
          fill="none"
          stroke={edge}
          strokeWidth={1.2}
        />
      ) : (
        <>
          <rect x={rect.x} y={rect.y} width={rect.w} height={rect.h} rx={edgeR} fill="none" stroke={edge} strokeWidth={1.2} />
          <rect x={rect.x - 6} y={rect.y + rect.h} width={rect.w + 12} height={7} rx={2} fill={frame} stroke={edge} strokeWidth={1} />
        </>
      )}
      {rivets}
    </g>
  );
}
