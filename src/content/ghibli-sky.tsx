import { useEffect, useId, useState, type ReactElement } from 'react';
import { MOON_SIZE, SKY_TEXTURE, SUN_SIZE } from '../core/library/paint/sky-painter';
import { mixHex } from '../core/library/sky';
import type { PaintedSky } from './painted-sky';

// Ciel peint de la Ville (vague Ghibli, G2), dans le décor fixe : aucune animation ici (les copies `<use>` de chaque fenêtre
// ne sont recalculées qu'à la minute). `shown` règle le fondu d'une seconde entre ciel actuel et ciel peint.
export const FADE_S = 1;
export const reducedMotion = (): boolean => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
// `still` (mouvement réduit) est lu une fois par rendu par l'appelant : pas de matchMedia à chaque nœud.
export const fadeStyle = (shown: boolean, still: boolean): { opacity: number; transition: string } => ({ opacity: shown ? 1 : 0, transition: still ? 'none' : `opacity ${FADE_S}s ease` });

// Fondu d'entrée : des nœuds peints tout juste montés restent à opacité 0 le temps d'un rendu, puis passent à `want` —
// sinon ils naîtraient à 1 et la transition ne jouerait pas. `mounted` : les nœuds peints sont dans le DOM.
// Mouvement réduit : bascule directe.
export function useShownAfterMount(mounted: boolean, want: boolean, still: boolean): boolean {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    setArmed(mounted);
  }, [mounted]);
  return mounted && want && (armed || still);
}
const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
const uid = (raw: string): string => raw.replace(/[^a-zA-Z0-9_-]/g, '');

export function GhibliSkyTexture({ width, height, url, shown, still }: { width: number; height: number; url: string; shown: boolean; still: boolean }): ReactElement {
  const id = `skytex${uid(useId())}`;
  return (
    <g>
      <defs>
        <pattern id={id} width={SKY_TEXTURE} height={SKY_TEXTURE} patternUnits="userSpaceOnUse">
          <image href={url} width={SKY_TEXTURE} height={SKY_TEXTURE} />
        </pattern>
      </defs>
      <rect data-sky-texture="" x={0} y={0} width={width} height={height} fill={`url(#${id})`} style={fadeStyle(shown, still)} />
    </g>
  );
}

type Star = { i: number; x: number; y: number; r: number };
// Croix des étoiles les plus brillantes (une sur dix, les plus grosses).
export function GhibliStarCrosses({ stars, opacity, shown, still }: { stars: Star[]; opacity: number; shown: boolean; still: boolean }): ReactElement {
  const bright = stars.filter((s) => s.r > 1.8);
  return (
    <g data-star-crosses="" style={fadeStyle(shown, still)}>
      <g opacity={opacity} style={{ transition: 'opacity 4s ease' }}>
        {opacity > 0 && bright.map((s) => (
          <path key={s.i} d={`M${s.x - 4} ${s.y}H${s.x + 4}M${s.x} ${s.y - 4}V${s.y + 4}`} stroke="#FFFAEB" strokeOpacity={0.55} strokeWidth={0.7} strokeLinecap="round" />
        ))}
      </g>
    </g>
  );
}

export function GhibliSun({ x, y, twilight, painted, shown, still }: { x: number; y: number; twilight: number; painted: PaintedSky; shown: boolean; still: boolean }): ReactElement {
  const id = `sunhalo${uid(useId())}`;
  const dusk = clamp01((twilight - 0.2) / 0.4);
  const half = SUN_SIZE / 2;
  return (
    <g data-ghibli-sun="" transform={`translate(${x} ${y})`} style={fadeStyle(shown, still)}>
      <defs>
        <radialGradient id={id}>
          <stop offset="0" stopColor={mixHex('#FFF6CD', '#FFAA5A', dusk)} stopOpacity={0.55} />
          <stop offset="1" stopColor="#FFF0C8" stopOpacity={0} />
        </radialGradient>
      </defs>
      <circle r={52} fill={`url(#${id})`} />
      <image href={painted.sunDay} x={-half} y={-half} width={SUN_SIZE} height={SUN_SIZE} opacity={1 - dusk} />
      <image href={painted.sunDusk} x={-half} y={-half} width={SUN_SIZE} height={SUN_SIZE} opacity={dusk} />
    </g>
  );
}

export function GhibliMoon({ x, y, painted, shown, still }: { x: number; y: number; painted: PaintedSky; shown: boolean; still: boolean }): ReactElement {
  const id = `moonhalo${uid(useId())}`;
  const half = MOON_SIZE / 2;
  return (
    <g data-ghibli-moon="" transform={`translate(${x} ${y})`} style={fadeStyle(shown, still)}>
      <defs>
        <radialGradient id={id}>
          <stop offset="0.3" stopColor="#DCE4FF" stopOpacity={0.35} />
          <stop offset="1" stopColor="#DCE4FF" stopOpacity={0} />
        </radialGradient>
      </defs>
      <circle r={40} fill={`url(#${id})`} />
      <image href={painted.moon} x={-half} y={-half} width={MOON_SIZE} height={MOON_SIZE} />
    </g>
  );
}
