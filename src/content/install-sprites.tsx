import type { ReactElement, ReactNode } from 'react';
import type { Outfit } from '../core/library/city/people';
import type { Sky } from '../core/library/sky';
import { PersonSprite, tone } from './city-sprites';
import type { WorkerPose } from './shop-sprites';

// Décors de fête posés par des équipes et matériel des équipes (spec §7, tâche 10). Repère des sprites : pieds / sol à y = 0,
// centrés sur x = 0, regard vers +x ; l'appelant applique l'échelle. Aucun id SVG fixe. Animations SMIL seulement hors
// mouvement réduit (`still`) ; teinte nocturne par tone(c, sky).

const BLUE = '#2B4FA0';
const WHITE = '#F2F2F2';
const RED = '#C0302B';
const POLE = '#6B5B4A';
const STEEL = '#3B3F4A';
const GALVA = '#A7ADB4';

// Tissu tricolore : hampe à x = 0, tissu vers +x (bleu à la hampe), haut à y = 0. Ondule hors mouvement réduit.
export function FlagArt({ sky, w = 9, h = 6, wave = false }: { sky: Sky; w?: number; h?: number; wave?: boolean }): ReactElement {
  const t = (c: string): string => tone(c, sky);
  const b = w / 3;
  return (
    <g data-flag-art="">
      {wave && <animateTransform attributeName="transform" additive="sum" type="skewY" values="0;-7;0;5;0" dur="1.6s" repeatCount="indefinite" />}
      <rect x={0} y={0} width={b} height={h} fill={t(BLUE)} />
      <rect x={b} y={0} width={b} height={h} fill={t(WHITE)} />
      <rect x={2 * b} y={0} width={b} height={h} fill={t(RED)} />
    </g>
  );
}

// Drapeau de lampadaire, dans le repère du lampadaire (LampSprite : pied y = 0, fût jusqu'à y = -72, crosse vers +x) :
// support oblique fixé au sommet du fût, côté opposé à la crosse, tissu qui pend vers l'extérieur.
export const LAMP_FLAG = { x: -11, y: -71 } as const;
export function LampFlag({ sky, still }: { sky: Sky; still: boolean }): ReactElement {
  return (
    <g data-lamp-flag="">
      <line x1={-1.2} y1={-62} x2={LAMP_FLAG.x} y2={LAMP_FLAG.y} stroke={tone(POLE, sky)} strokeWidth={0.9} strokeLinecap="round" />
      <circle cx={-1.2} cy={-62} r={0.9} fill={tone(STEEL, sky)} />
      <g transform={`translate(${LAMP_FLAG.x} ${LAMP_FLAG.y}) scale(-1 1)`}>
        <FlagArt sky={sky} w={10} h={7} wave={!still} />
      </g>
    </g>
  );
}

// Drapeau d'entrée, dans le repère de EntranceSprite (sprite 22 × 27, auvent en haut à y = -31) : hampe plantée sur l'auvent
// à x = 7 (dessin validé), tissu centré au-dessus de la porte.
export function DoorFlag({ sky }: { sky: Sky }): ReactElement {
  return (
    <g data-door-flag="">
      <line x1={7} y1={-31} x2={7} y2={-45} stroke={tone(POLE, sky)} strokeWidth={0.8} />
      <rect x={7} y={-45} width={3} height={5} fill={tone(BLUE, sky)} />
      <rect x={10} y={-45} width={3} height={5} fill={tone(WHITE, sky)} />
      <rect x={13} y={-45} width={3} height={5} fill={tone(RED, sky)} />
    </g>
  );
}

// Barrière de type Vauban (24 × 11) : cadre galvanisé, barreaux verticaux, deux pieds plats.
export function Barrier({ sky }: { sky: Sky }): ReactElement {
  const c = tone(GALVA, sky);
  const bars: number[] = [];
  for (let x = -9.5; x < 10; x += 2.4) bars.push(x);
  return (
    <g data-barrier-art="" stroke={c} fill="none" strokeLinecap="round">
      <rect x={-11} y={-11} width={22} height={8.5} rx={1} strokeWidth={0.9} />
      {bars.map((x) => (
        <line key={x} x1={x} y1={-10.5} x2={x} y2={-3} strokeWidth={0.45} />
      ))}
      <line x1={-11} y1={-2.5} x2={-11} y2={0} strokeWidth={0.9} />
      <line x1={11} y1={-2.5} x2={11} y2={0} strokeWidth={0.9} />
      <line x1={-14} y1={0} x2={-8} y2={0} strokeWidth={1.1} />
      <line x1={8} y1={0} x2={14} y2={0} strokeWidth={1.1} />
    </g>
  );
}

// ---------- Scène de la Fête de la musique (repère : sol y = 0, centre x = 0, unités du monde à l'échelle 1) ----------
// Plancher 96 × 8, deux montants en treillis jusqu'à la traverse (y = -60), trois projecteurs accrochés sous la traverse.
export const STAGE = { half: 48, floor: 8, truss: 60, postX: 44, spotXs: [-28, 0, 28] as const, spotY: -55 } as const;

// Centre de la lentille du projecteur i dans le repère de la scène (la tête est inclinée de -x/3 degrés autour de son accroche).
export function spotLens(i: number): { x: number; y: number } {
  const x = STAGE.spotXs[i]!;
  const a = (-x / 3) * (Math.PI / 180);
  return { x: x - 3 * Math.sin(a), y: STAGE.spotY + 3 * Math.cos(a) };
}

export function StageFloor({ sky }: { sky: Sky }): ReactElement {
  const t = (c: string): string => tone(c, sky);
  return (
    <g data-stage-part="floor">
      <rect x={-STAGE.half} y={-STAGE.floor} width={STAGE.half * 2} height={STAGE.floor} fill={t('#24262E')} />
      <rect x={-STAGE.half} y={-STAGE.floor} width={STAGE.half * 2} height={1.6} fill={t('#6A5848')} />
      {[-36, -12, 12, 36].map((x) => (
        <line key={x} x1={x} y1={-STAGE.floor + 1.6} x2={x} y2={0} stroke={t('#3A3D46')} strokeWidth={0.6} />
      ))}
    </g>
  );
}

// Treillis vertical (montant) ou horizontal (traverse) : deux tubes et des diagonales.
function Truss({ x1, y1, x2, y2, c }: { x1: number; y1: number; x2: number; y2: number; c: string }): ReactElement {
  const vertical = x1 === x2;
  const len = vertical ? Math.abs(y2 - y1) : Math.abs(x2 - x1);
  const n = Math.max(1, Math.round(len / 4));
  const zig: string[] = [];
  for (let i = 0; i <= n; i++) {
    const s = i / n;
    const side = i % 2 === 0 ? -1.5 : 1.5;
    zig.push(vertical ? `${x1 + side} ${y1 + (y2 - y1) * s}` : `${x1 + (x2 - x1) * s} ${y1 + side}`);
  }
  return (
    <g stroke={c} fill="none">
      {vertical ? (
        <>
          <line x1={x1 - 1.5} y1={y1} x2={x2 - 1.5} y2={y2} strokeWidth={0.7} />
          <line x1={x1 + 1.5} y1={y1} x2={x2 + 1.5} y2={y2} strokeWidth={0.7} />
        </>
      ) : (
        <>
          <line x1={x1} y1={y1 - 1.5} x2={x2} y2={y2 - 1.5} strokeWidth={0.7} />
          <line x1={x1} y1={y1 + 1.5} x2={x2} y2={y2 + 1.5} strokeWidth={0.7} />
        </>
      )}
      <polyline points={zig.join(' ')} strokeWidth={0.35} />
    </g>
  );
}

export function StageFrame({ sky }: { sky: Sky }): ReactElement {
  const c = tone('#9CA3AC', sky);
  return (
    <g data-stage-part="frame">
      <Truss x1={-STAGE.postX} y1={-STAGE.floor} x2={-STAGE.postX} y2={-STAGE.truss} c={c} />
      <Truss x1={STAGE.postX} y1={-STAGE.floor} x2={STAGE.postX} y2={-STAGE.truss} c={c} />
      <Truss x1={-STAGE.postX - 2} y1={-STAGE.truss} x2={STAGE.postX + 2} y2={-STAGE.truss} c={c} />
    </g>
  );
}

// Projecteurs accrochés sous la traverse, orientés vers le plancher. `lit` : lentille allumée (les faisceaux sont dans stage-band.tsx).
export function StageSpots({ sky, lit }: { sky: Sky; lit: boolean }): ReactElement {
  const t = (c: string): string => tone(c, sky);
  return (
    <g data-stage-part="spots">
      {STAGE.spotXs.map((x, i) => (
        <g key={x} data-stage-spot={i} transform={`translate(${x} ${STAGE.spotY})`}>
          <line x1={0} y1={-3.5} x2={0} y2={-1.5} stroke={t(STEEL)} strokeWidth={0.6} />
          <rect x={-2.2} y={-1.8} width={4.4} height={4.6} rx={0.8} fill={t('#1E2026')} transform={`rotate(${-x / 3})`} />
          <circle cx={0} cy={3} r={1.6} fill={lit ? '#FFF1B8' : t('#5A5F6A')} transform={`rotate(${-x / 3})`} />
        </g>
      ))}
    </g>
  );
}

// Structure complète (plancher, ossature, projecteurs) ; `parts` pour n'en dessiner qu'une partie.
export function StageStructure({ sky, lit, parts = { floor: true, frame: true, spots: true } }: { sky: Sky; lit: boolean; parts?: { floor: boolean; frame: boolean; spots: boolean } }): ReactElement {
  return (
    <g data-stage-structure="">
      {parts.frame && <StageFrame sky={sky} />}
      {parts.floor && <StageFloor sky={sky} />}
      {parts.spots && <StageSpots sky={sky} lit={lit} />}
    </g>
  );
}

// ---------- Travailleur en tenue de chantier (repère du passant, regarde vers +x) ----------
// Gilet orange à bande réfléchissante par-dessus la veste ; bras levés pour atteindre (`reach`), tendus pour porter (`carry`).
export function CrewWorker({ outfit, sky, rainy, pose }: { outfit: Outfit; sky: Sky; rainy: boolean; pose: WorkerPose }): ReactElement {
  const t = (c: string): string => tone(c, sky);
  const sleeve = t(outfit.topColor);
  return (
    <g data-crew-worker="">
      <PersonSprite outfit={outfit} sky={sky} rainy={rainy} umbrella={false} />
      <rect x={-5} y={-27.5} width={10} height={12} rx={1.5} fill={t('#F28C28')} opacity={0.95} />
      <rect x={-5} y={-21} width={10} height={1.4} fill={t('#E8E8E0')} />
      {pose === 'reach' && <path d="M1 -26 L4 -33 L5 -39" stroke={sleeve} strokeWidth={2.2} strokeLinecap="round" fill="none" />}
      {pose === 'carry' && <path d="M1 -25 L6 -23 L9 -24" stroke={sleeve} strokeWidth={2.2} strokeLinecap="round" fill="none" />}
      {pose === 'climb' && <path d="M1 -26 L4 -31" stroke={sleeve} strokeWidth={2.2} strokeLinecap="round" fill="none" />}
    </g>
  );
}

// ---------- Camionnette de l'équipe (repère des véhicules : roues à y = 0, regard vers +x) ----------
// Blanche à bande orange, galerie de toit ; `ladder` : l'échelle est rangée sur la galerie (en fin de journée).
export function Van({ sky, ladder, lights }: { sky: Sky; ladder: boolean; lights: boolean }): ReactElement {
  const t = (c: string): string => tone(c, sky);
  return (
    <g data-van="">
      <rect x={-25} y={-24} width={50} height={20} rx={3} fill={t('#ECECEA')} />
      <rect x={-25} y={-13} width={50} height={2.4} fill={t('#E8601C')} />
      <rect x={12} y={-21} width={9} height={7} fill={t('#CFE4F2')} opacity={0.85} />
      <line x1={-22} y1={-25.5} x2={10} y2={-25.5} stroke={t(STEEL)} strokeWidth={0.8} />
      {[-20, -6, 8].map((x) => <line key={x} x1={x} y1={-25.5} x2={x} y2={-24} stroke={t(STEEL)} strokeWidth={0.6} />)}
      {ladder && (
        <g data-van-ladder="" stroke={t('#B9C0C8')} strokeLinecap="round">
          <line x1={-24} y1={-27} x2={12} y2={-27} strokeWidth={0.8} />
          <line x1={-24} y1={-29} x2={12} y2={-29} strokeWidth={0.8} />
          {Array.from({ length: 12 }, (_, i) => <line key={i} x1={-23 + i * 3} y1={-29} x2={-23 + i * 3} y2={-27} strokeWidth={0.5} />)}
        </g>
      )}
      <circle cx={-14} cy={-3} r={4} fill="#222" />
      <circle cx={15} cy={-3} r={4} fill="#222" />
      {lights && <circle cx={25} cy={-9} r={2.2} fill="#FFE9A0" />}
    </g>
  );
}

// ---------- Camion élévateur à nacelle ----------
// Corps dessiné dans le repère des véhicules (échelle `k`, regard vers `dir`) ; le bras articulé (deux flèches) et la nacelle
// sont calculés dans le repère du MONDE relatif à l'origine du camion (non mis à l'échelle), pour que la nacelle atteigne
// exactement l'élément. `bucket` : bas de la nacelle (relatif au camion) ; `outrigger` : 0 = stabilisateurs repliés, 1 = au sol.
export const LIFT = { pivotX: -18, pivotY: -16, boom1: 24, boom2: 22 } as const;

const clamp = (x: number, a: number, b: number): number => Math.min(b, Math.max(a, x));

// Pivot de la tourelle (relatif au camion, unités du monde).
export const liftPivot = (dir: 1 | -1, k: number): { x: number; y: number } => ({ x: dir * LIFT.pivotX * k, y: LIFT.pivotY * k });
// Nacelle au repos : flèches couchées vers l'avant, nacelle au-dessus de la cabine.
export const liftRest = (dir: 1 | -1, k: number, u: number): { x: number; y: number } => {
  const p = liftPivot(dir, k);
  return { x: p.x + dir * 40 * u, y: p.y - 7 * u };
};

// Coude du bras articulé (cinématique à deux segments ; coude du côté le plus haut).
export function liftElbow(p: { x: number; y: number }, b: { x: number; y: number }, l1: number, l2: number): { x: number; y: number } {
  const dx = b.x - p.x;
  const dy = b.y - p.y;
  const d = clamp(Math.hypot(dx, dy), Math.abs(l1 - l2) + 1e-3, l1 + l2 - 1e-3);
  const a = Math.atan2(dy, dx);
  const beta = Math.acos(clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1));
  const e1 = { x: p.x + l1 * Math.cos(a + beta), y: p.y + l1 * Math.sin(a + beta) };
  const e2 = { x: p.x + l1 * Math.cos(a - beta), y: p.y + l1 * Math.sin(a - beta) };
  return e1.y < e2.y ? e1 : e2;
}

type LiftProps = { sky: Sky; still: boolean; dir: 1 | -1; k: number; u: number; outrigger: number; bucket: { x: number; y: number }; rider: ReactNode; beacon: boolean };

export function LiftTruck({ sky, still, dir, k, u, outrigger, bucket, rider, beacon }: LiftProps): ReactElement {
  const t = (c: string): string => tone(c, sky);
  const yellow = t('#E8B923');
  const p = liftPivot(dir, k);
  const l1 = LIFT.boom1 * u;
  const l2 = LIFT.boom2 * u;
  const e = liftElbow(p, bucket, l1, l2);
  const leg = 8 * clamp(outrigger, 0, 1);
  const bw = 10 * u;
  const bh = 7 * u;
  return (
    <g data-lift="">
      <g transform={`scale(${(dir * k).toFixed(3)} ${k.toFixed(3)})`}>
        {/* Stabilisateurs (vérins) : descendent jusqu'au sol au déploiement. */}
        {[-27, 13].map((x) => (
          <g key={x} data-outrigger="">
            <rect x={x - 1.5} y={-9} width={3} height={2 + leg} fill={t(STEEL)} />
            <rect x={x - 3} y={-7 + leg} width={6} height={1.2} fill={t(STEEL)} />
          </g>
        ))}
        <rect x={-32} y={-12} width={48} height={6} fill={yellow} />
        <rect x={-32} y={-8} width={48} height={1.2} fill={t('#3B3F4A')} />
        <rect x={16} y={-24} width={16} height={20} rx={2.5} fill={t('#ECECEA')} />
        <rect x={22} y={-21.5} width={8} height={7} fill={t('#CFE4F2')} opacity={0.85} />
        <rect x={-23} y={-18} width={10} height={6} rx={1} fill={yellow} />
        <rect x={20} y={-26} width={4} height={2} rx={0.8} fill="#E8601C">
          {beacon && !still && <animate attributeName="opacity" values="1;0.25;1" dur="0.9s" repeatCount="indefinite" />}
        </rect>
        <circle cx={-20} cy={-4.5} r={4.5} fill="#222" />
        <circle cx={22} cy={-4.5} r={4.5} fill="#222" />
      </g>
      {/* Bras articulé : flèche basse (pivot → coude), flèche haute (coude → nacelle). */}
      <g data-lift-arm="" stroke={yellow} strokeLinecap="round">
        <line x1={p.x} y1={p.y} x2={e.x} y2={e.y} strokeWidth={2.4 * u} />
        <line x1={e.x} y1={e.y} x2={bucket.x} y2={bucket.y - bh * 0.5} strokeWidth={1.8 * u} />
      </g>
      <circle cx={e.x} cy={e.y} r={1.4 * u} fill={t(STEEL)} />
      <circle cx={p.x} cy={p.y} r={1.6 * u} fill={t(STEEL)} />
      {/* Nacelle : le travailleur est dessiné avant la paroi, qui cache ses jambes. */}
      <g data-lift-bucket="" transform={`translate(${bucket.x.toFixed(2)} ${bucket.y.toFixed(2)})`}>
        {rider}
        <rect x={-bw / 2} y={-bh} width={bw} height={bh} rx={0.8 * u} fill={t('#F2F2F0')} stroke={yellow} strokeWidth={0.6 * u} />
        <line x1={-bw / 2} y1={-bh} x2={bw / 2} y2={-bh} stroke={t(STEEL)} strokeWidth={0.7 * u} />
      </g>
    </g>
  );
}
