import { useMemo, type CSSProperties, type ReactElement } from 'react';
import type { PxRect } from '../core/library/room-grid';
import { mulberry32 } from '../core/library/scene-world';
import type { Palette } from '../core/library/styles';

const GLASS_INSET = 7;

// Zone de la vitre (là où le décor se voit), en pixels de la pièce.
export const glassRect = (rect: PxRect): PxRect => ({ x: rect.x + GLASS_INSET, y: rect.y + GLASS_INSET, w: rect.w - 2 * GLASS_INSET, h: rect.h - 2 * GLASS_INSET });

// `weatherHref` / `weatherGroundHref` : groupes de la météo (ciel par-dessus les acteurs, sol en dessous), absents sans météo.
// `drops` : il pleut assez pour des gouttes sur la vitre (sinon ni gouttes ni animation).
type Props = { rect: PxRect; palette: Palette; steampunk: boolean; worldHref: string; actorsHref: string; weatherHref?: string; weatherGroundHref?: string; drops?: boolean; clipId: string };

// Opacité des gouttes sur la vitre : suit `--wmt-precip` (posée sur le <svg> de la pièce par la boucle de météo), nulle en pluie fine.
const DROPS_STYLE = { opacity: 'clamp(0, calc((var(--wmt-precip, 0) - 0.12) * 3), 1)' } as unknown as CSSProperties;

// Quelques gouttes qui glissent sur la vitre.
function GlassDrops({ glass }: { glass: PxRect }): ReactElement {
  const drops = useMemo(
    () =>
      Array.from({ length: Math.max(3, Math.round(glass.w / 55)) }, (_, i) => {
        const rng = mulberry32(i * 7919 + Math.round(glass.x));
        return { x: glass.x + 6 + rng() * (glass.w - 12), y: glass.y + rng() * glass.h * 0.5, len: 8 + rng() * 14, dur: 5 + rng() * 6, begin: rng() * 4 };
      }),
    [glass.x, glass.y, glass.w, glass.h],
  );
  const still = typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  return (
    <g data-glass-drops="" style={DROPS_STYLE}>
      {drops.map((d, i) => (
        <ellipse key={i} data-glass-drop="" cx={d.x} cy={d.y} rx={1.6} ry={2.6} fill="#FFFFFF" opacity={0.55}>
          {!still && <animate attributeName="cy" values={`${d.y};${d.y + d.len * 3}`} dur={`${d.dur}s`} begin={`${d.begin}s`} repeatCount="indefinite" />}
        </ellipse>
      ))}
    </g>
  );
}

// Une fenêtre : le décor commun vu à travers un cadre. Le décor (fixe, puis acteurs animés) est le MÊME pour toutes
// les fenêtres (`<use>`) : ce qu'on voit à gauche et à droite se raccorde, et un passant traverse l'une puis l'autre.
export function WindowArt({ rect, palette, steampunk, worldHref, actorsHref, weatherHref, weatherGroundHref, drops = false, clipId }: Props): ReactElement {
  const glass = glassRect(rect);
  const frame = steampunk ? '#B5833A' : palette.skirt;
  const edge = steampunk ? '#6E4A1E' : palette.edge;
  const bars: ReactElement[] = [];
  if (glass.w >= 120) bars.push(<rect key="v" x={glass.x + glass.w / 2 - 2} y={glass.y} width={4} height={glass.h} fill={frame} />);
  if (glass.h >= 110) bars.push(<rect key="h" x={glass.x} y={glass.y + glass.h / 2 - 2} width={glass.w} height={4} fill={frame} />);
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
      <rect x={glass.x} y={glass.y} width={glass.w} height={glass.h} fill="#9CC4E8" />
      <g clipPath={`url(#${clipId})`}>
        <use data-window-view="" href={worldHref} />
        {weatherGroundHref && <use data-window-weather-ground="" href={weatherGroundHref} />}
        <use data-window-actors="" href={actorsHref} />
        {weatherHref && <use data-window-weather="" href={weatherHref} />}
        {weatherHref && drops && <GlassDrops glass={glass} />}
      </g>
      {bars}
      <rect x={rect.x + 3} y={rect.y + 3} width={rect.w - 6} height={rect.h - 6} rx={steampunk ? 14 : 3} fill="none" stroke={frame} strokeWidth={GLASS_INSET - 1} />
      <rect x={rect.x} y={rect.y} width={rect.w} height={rect.h} rx={steampunk ? 16 : 4} fill="none" stroke={edge} strokeWidth={1.2} />
      <rect x={rect.x - 6} y={rect.y + rect.h} width={rect.w + 12} height={7} rx={2} fill={frame} stroke={edge} strokeWidth={1} />
      {rivets}
    </g>
  );
}
