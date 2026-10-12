import type { ReactElement } from 'react';
import '../core/library/paint/props/music';
import type { Sky } from '../core/library/sky';
import { tone } from './city-sprites';
import { PropImage } from './prop/prop-host';

// Stands de bière de la Fête de la musique (spec §7.6). Repère : centre du comptoir à x = 0, bas de sa face avant à y = 0 (sur
// la chaussée, à STAND_DEPTH sous le bord du trottoir), unités du monde à l'échelle 1 ; l'appelant applique l'échelle. Aucun id
// SVG fixe ; teinte nocturne par tone(c, sky).
// Ghibli (G5) : comptoir, gobelet, auvent (+ guirlande d'ampoules allumées la nuit), comptoir porté et toile roulée sont des
// images cellulo (paint/props/music.ts, cuites par le registre d'accessoires) au cadre du sprite classique, qui reste le repli
// tant que l'image n'est pas cuite. Le comptoir est cuit dans le sens `side` (fûts du côté opposé à la file), jamais retourné.

const WOOD = '#8A5A34';
const WOOD_TOP = '#B98A5C';
const STEEL = '#9AA2AC';
const BEER = '#E9B533';
const FOAM = '#FBF6E6';

// Fût de bière (cylindre d'acier), pieds à y = 0.
export function Keg({ x, sky }: { x: number; sky: Sky }): ReactElement {
  const t = (c: string): string => tone(c, sky);
  return (
    <g data-keg="">
      <rect x={x - 3.2} y={-8.5} width={6.4} height={8.5} rx={1.2} fill={t(STEEL)} />
      <rect x={x - 3.2} y={-6.2} width={6.4} height={0.9} fill={t('#6E7680')} />
      <rect x={x - 3.2} y={-2.6} width={6.4} height={0.9} fill={t('#6E7680')} />
      <rect x={x - 1} y={-9.6} width={2} height={1.2} fill={t('#3B3F4A')} />
    </g>
  );
}

// Comptoir (52 × 12), tireuse à deux becs, gobelets sur le zinc, deux fûts au pied, du côté opposé à la file (`side`).
export function StandCounter({ sky, side, ghibli = false }: { sky: Sky; side: 1 | -1; ghibli?: boolean }): ReactElement {
  const t = (c: string): string => tone(c, sky);
  const art = (
    <>
      <Keg x={-side * 31} sky={sky} />
      <Keg x={-side * 38} sky={sky} />
      <rect x={-26} y={-12} width={52} height={12} fill={t(WOOD)} />
      {[-13, 0, 13].map((x) => <line key={x} x1={x} y1={-10.5} x2={x} y2={0} stroke={t('#6A4426')} strokeWidth={0.6} />)}
      <rect x={-27.5} y={-13.6} width={55} height={2} rx={0.6} fill={t(WOOD_TOP)} />
      {/* Bandeau de la face avant : une chope dessinée (pas de texte). */}
      <rect x={-6} y={-9.4} width={8} height={6.6} rx={0.8} fill={t(BEER)} />
      <rect x={-6} y={-10.4} width={8} height={2} rx={0.8} fill={t(FOAM)} />
      <path d="M2 -8 h2.2 v3.4 h-2.2" fill="none" stroke={t(BEER)} strokeWidth={1} />
      {/* Tireuse : colonne et deux becs. */}
      <g data-beer-tap="">
        <rect x={-1.2} y={-21} width={2.4} height={7.4} fill={t('#C9CED4')} />
        <rect x={-4.5} y={-21.5} width={9} height={1.8} rx={0.6} fill={t('#C9CED4')} />
        <rect x={-4.4} y={-25} width={1.2} height={3.6} rx={0.5} fill={t('#2A2D34')} />
        <rect x={3.2} y={-25} width={1.2} height={3.6} rx={0.5} fill={t('#2A2D34')} />
      </g>
      {[-18, -15, 14, 17].map((x) => <BeerCup key={x} x={x} y={-13.6} sky={sky} />)}
    </>
  );
  return <g data-stand-counter="">{ghibli ? <PropImage spec={{ id: 'stand-counter', dir: side, day: sky.daylight }} fallback={art} /> : art}</g>;
}

// Gobelet de bière posé (bas à y). Ghibli : image `beer-cup` à l'origine, déplacée en (x, y).
export function BeerCup({ x = 0, y = 0, sky, ghibli = false }: { x?: number; y?: number; sky: Sky; ghibli?: boolean }): ReactElement {
  const t = (c: string): string => tone(c, sky);
  const art = (cx: number, cy: number): ReactElement => (
    <>
      <path d={`M${cx - 1.3} ${cy - 3.6} L${cx + 1.3} ${cy - 3.6} L${cx + 1} ${cy} L${cx - 1} ${cy} Z`} fill={t(BEER)} />
      <rect x={cx - 1.4} y={cy - 4.4} width={2.8} height={1} rx={0.4} fill={t(FOAM)} />
    </>
  );
  if (!ghibli) return <g data-beer-cup="">{art(x, y)}</g>;
  return (
    <g data-beer-cup="" transform={x || y ? `translate(${x} ${y})` : undefined}>
      <PropImage spec={{ id: 'beer-cup', day: sky.daylight }} fallback={art(0, 0)} />
    </g>
  );
}

// Auvent (tente) posé au-dessus du comptoir : quatre poteaux (ceux du fond plus haut sur l'image, ils sont plus loin), toile
// rayée et lambrequin festonné, enseigne en forme de chope au faîte. `side` : côté de la file (l'enseigne est centrée).
// Ghibli : image `stand-awning` ; `garland` : guirlande d'ampoules sous le lambrequin, `lit` : allumées (nuit).
export const AWNING = { front: -30, back: -36, half: 31, backY: -8 } as const;
export type AwningGhibli = { garland: boolean; lit: boolean };
export function StandAwning({ sky, ghibli }: { sky: Sky; ghibli?: AwningGhibli }): ReactElement {
  const t = (c: string): string => tone(c, sky);
  const stripes: ReactElement[] = [];
  for (let i = 0; i < 10; i++) {
    const x0 = -AWNING.half + i * 6.2;
    stripes.push(<path key={i} d={`M${x0} ${AWNING.front} L${x0 + 6.2} ${AWNING.front} L${x0 + 6.2 * 0.92 + 2.4} ${AWNING.back} L${x0 * 0.92 + 2.4} ${AWNING.back} Z`} fill={t(i % 2 === 0 ? '#C8322E' : '#F4F1EA')} />);
  }
  const art = (
    <>
      {/* Poteaux du fond (plus loin) puis de devant. */}
      {[-26, 26].map((x) => <line key={`b${x}`} x1={x} y1={AWNING.backY} x2={x} y2={AWNING.back} stroke={t('#5E636C')} strokeWidth={1} />)}
      {[-29, 29].map((x) => <line key={`f${x}`} x1={x} y1={0} x2={x} y2={AWNING.front} stroke={t('#6E747E')} strokeWidth={1.2} />)}
      {stripes}
      {/* Lambrequin festonné. */}
      <path
        d={`M${-AWNING.half} ${AWNING.front} ${Array.from({ length: 8 }, () => "a3.9 2.4 0 0 0 7.75 0").join(' ')}`}
        fill={t('#C8322E')}
        stroke={t('#9E2624')}
        strokeWidth={0.4}
      />
      {/* Enseigne : une chope. */}
      <g data-stand-sign="">
        <rect x={-7} y={AWNING.back - 9} width={14} height={9} rx={1.5} fill={t('#2A2D34')} />
        <rect x={-3.6} y={AWNING.back - 6.6} width={5.2} height={5} rx={0.6} fill={t(BEER)} />
        <rect x={-3.6} y={AWNING.back - 7.6} width={5.2} height={1.6} rx={0.6} fill={t(FOAM)} />
        <path d={`M1.6 ${AWNING.back - 5.6} h1.8 v2.8 h-1.8`} fill="none" stroke={t(BEER)} strokeWidth={0.8} />
      </g>
    </>
  );
  return (
    <g data-stand-awning="">
      {ghibli ? <PropImage spec={{ id: 'stand-awning', args: { garland: ghibli.garland }, day: sky.daylight, lit: ghibli.lit }} fallback={art} /> : art}
    </g>
  );
}

// Comptoir porté à deux (sans tireuse ni gobelets : on les pose après), centre en x = 0, bas à y = 0 ; ses deux fûts voyagent
// couchés sur le zinc (sortis avec lui du camion plateau, posés à son pied).
export function CarriedCounter({ sky, ghibli = false }: { sky: Sky; ghibli?: boolean }): ReactElement {
  const t = (c: string): string => tone(c, sky);
  const art = (
    <>
      <rect x={-26} y={-12} width={52} height={12} fill={t(WOOD)} />
      <rect x={-27.5} y={-13.6} width={55} height={2} rx={0.6} fill={t(WOOD_TOP)} />
      {[-12, 2].map((x) => (
        <g key={x} data-carried-keg="">
          <rect x={x} y={-19.6} width={8.5} height={6} rx={1.2} fill={t(STEEL)} />
          <rect x={x + 2.6} y={-19.6} width={0.9} height={6} fill={t('#6E7680')} />
          <rect x={x + 5.6} y={-19.6} width={0.9} height={6} fill={t('#6E7680')} />
        </g>
      ))}
    </>
  );
  return <g data-carried-counter="">{ghibli ? <PropImage spec={{ id: 'carried-counter', day: sky.daylight }} fallback={art} /> : art}</g>;
}

// Toile de l'auvent roulée (tenue à la main, repère : main à y = 0, vers +x). Ghibli : image cuite dans le sens `dir` (le
// repli classique est retourné à −1, comme les pièces tenues d'install-sprites).
export function HeldRoll({ sky, ghibli }: { sky: Sky; ghibli?: { dir: 1 | -1 } }): ReactElement {
  const t = (c: string): string => tone(c, sky);
  const art = (
    <>
      <rect x={-2} y={-1.6} width={10} height={3.2} rx={1.6} fill={t('#C8322E')} />
      <rect x={1} y={-1.6} width={2} height={3.2} fill={t('#F4F1EA')} />
      <rect x={5} y={-1.6} width={2} height={3.2} fill={t('#F4F1EA')} />
    </>
  );
  return (
    <g data-held-piece="roll">
      {ghibli ? <PropImage spec={{ id: 'held-roll', dir: ghibli.dir, day: sky.daylight }} fallback={ghibli.dir < 0 ? <g transform="scale(-1 1)">{art}</g> : art} /> : art}
    </g>
  );
}
