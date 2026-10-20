import { useEffect, useId, useState, type ReactElement } from 'react';
import { MOON_SIZE, SKY_TEXTURE, SUN_SIZE } from '../core/library/paint/sky-painter';
import { mixHex } from '../core/library/sky';
import type { MoonPhase } from '../core/library/astro';
import type { PaintedSky } from './painted-sky';

// Ciel peint de la Ville (vague Ghibli, G2), dans le décor fixe : aucune animation ici (la copie `<use>` d’une fenêtre soulevée
// n’est recalculée qu’à la minute). `shown` règle le fondu d'une seconde entre ciel actuel et ciel peint.
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

// `daylight` : la nuit, les touches claires ressortent sur le ciel sombre — texture atténuée (0,4 la nuit, 1 en plein jour).
export function GhibliSkyTexture({ width, height, url, shown, still, daylight }: { width: number; height: number; url: string; shown: boolean; still: boolean; daylight: number }): ReactElement {
  const id = `skytex${uid(useId())}`;
  return (
    <g opacity={Number((0.4 + 0.6 * clamp01(daylight)).toFixed(2))}>
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
          <stop offset="0" stopColor={mixHex('#FFF6CD', '#FFAA5A', dusk)} stopOpacity={0.65} />
          <stop offset="0.35" stopColor={mixHex('#FFF3C4', '#FFB070', dusk)} stopOpacity={0.3} />
          <stop offset="1" stopColor="#FFF0C8" stopOpacity={0} />
        </radialGradient>
      </defs>
      <circle r={70} fill={`url(#${id})`} />
      <image href={painted.sunDay} x={-half} y={-half} width={SUN_SIZE} height={SUN_SIZE} opacity={1 - dusk} />
      <image href={painted.sunDusk} x={-half} y={-half} width={SUN_SIZE} height={SUN_SIZE} opacity={dusk} />
    </g>
  );
}

// De jour, la lune levée reste pâle sur le bleu.
export const moonOpacity = (daylight: number): number => Number((1 - 0.55 * clamp01(daylight)).toFixed(2));

// Partie éclairée d'une lune de rayon `r` dont la part éclairée vaut `lit` (0 à 1), bord éclairé vers la droite (+x) :
// demi-disque côté droit, refermé par le terminateur (demi-ellipse) qui bombe vers la droite pour un croissant, vers la
// gauche pour une lune gibbeuse. Tourner le chemin oriente le bord éclairé.
export function moonLitPath(r: number, lit: number): string {
  const k = clamp01(lit);
  const rx = Number((r * Math.abs(1 - 2 * k)).toFixed(2));
  return `M0 ${-r}A${r} ${r} 0 0 1 0 ${r}A${rx} ${r} 0 0 ${k < 0.5 ? 0 : 1} 0 ${-r}Z`;
}

// Rayon du disque de la lune peinte (16 px de touches et leur étalement).
const MOON_R = 17;

// Lune peinte à sa phase : le disque peint entier, très atténué, donne la lumière cendrée (surtout visible sur un croissant) ; la partie éclairée est découpée
// dans le même disque, tournée vers le soleil. De jour, elle pâlit.
// `light` : éclat de la lune (phase et hauteur) : le halo grandit et s'avive avec lui.
export function GhibliMoon({ x, y, phase, light, daylight, painted, shown, still }: { x: number; y: number; phase: MoonPhase; light: number; daylight: number; painted: PaintedSky; shown: boolean; still: boolean }): ReactElement {
  const raw = uid(useId());
  const halo = `moonhalo${raw}`;
  const clip = `moonlit${raw}`;
  const disc = `moondisc${raw}`;
  const half = MOON_SIZE / 2;
  const night = 1 - clamp01(daylight);
  const deg = ((phase.limb * 180) / Math.PI).toFixed(1);
  return (
    <g data-ghibli-moon="" data-moon-lit={phase.lit.toFixed(2)} transform={`translate(${x} ${y})`} style={fadeStyle(shown, still)}>
      <defs>
        <radialGradient id={halo}>
          <stop offset="0.3" stopColor="#DCE4FF" stopOpacity={0.35} />
          <stop offset="1" stopColor="#DCE4FF" stopOpacity={0} />
        </radialGradient>
        {/* Bord net : les touches qui débordent du disque peint sont coupées. */}
        <clipPath id={clip}>
          <path d={moonLitPath(MOON_R, phase.lit)} transform={`rotate(${deg})`} />
        </clipPath>
        <clipPath id={disc}>
          <circle r={MOON_R} />
        </clipPath>
      </defs>
      <g opacity={moonOpacity(daylight)}>
        <circle r={Number((28 + 30 * light).toFixed(1))} fill={`url(#${halo})`} opacity={Number(((0.15 + 0.85 * light) * night).toFixed(2))} />
        <image href={painted.moon} x={-half} y={-half} width={MOON_SIZE} height={MOON_SIZE} clipPath={`url(#${disc})`} opacity={Number((0.16 * (1 - phase.lit) * night).toFixed(2))} />
        <image href={painted.moon} x={-half} y={-half} width={MOON_SIZE} height={MOON_SIZE} clipPath={`url(#${clip})`} />
      </g>
    </g>
  );
}
