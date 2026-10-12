import type { ReactElement, ReactNode } from 'react';
import type { ItemKind } from '../core/library/city/install';
import type { Outfit } from '../core/library/city/people';
import { INK } from '../core/library/paint/cel';
import '../core/library/paint/props/install';
import { mixHex, type Sky } from '../core/library/sky';
import { Cyclist, PersonSprite, tone } from './city-sprites';
import { GhibliRider } from './figure/ghibli-cyclist';
import { PropImage, PropInMirror } from './prop/prop-host';
import { ScriptedCar } from './vehicle/scripted-car';
import type { WorkerPose } from './shop-sprites';

// Décors de fête posés par des équipes et matériel des équipes (spec §7, tâche 10). Repère des sprites : pieds / sol à y = 0,
// centrés sur x = 0, regard vers +x ; l'appelant applique l'échelle. Aucun id SVG fixe. Animations SMIL seulement hors
// mouvement réduit (`still`) ; teinte nocturne par tone(c, sky).
// Ghibli (G5) : barrière, scène, pièces tenues, nacelle, caisse de drapeaux, échelle couchée, triporteur et chargement du plateau
// sont des images cellulo (paint/props/install.ts, cuites par le registre d'accessoires) au cadre du sprite classique, qui reste
// le repli tant que l'image n'est pas cuite ; les flèches du bras articulé restent des tubes SVG cellulo (longueur variable).

const BLUE = '#2B4FA0';
const WHITE = '#F2F2F2';
const RED = '#C0302B';
const POLE = '#6B5B4A';
const STEEL = '#3B3F4A';
const GALVA = '#A7ADB4';
// Cellulo (tubes SVG du bras) : ombre teintée violet, rehaut soleil, comme le kit.
const COOL = '#5A4A9C';
const SUN = '#FFF6D0';

// Graphisme Ghibli d'un véhicule de transport (V5) : carrosserie peinte (vehicle/scripted-car.tsx) dans le repère du sprite,
// éléments dynamiques classiques par-dessus. L'appelant n'applique alors PAS `scale(dir·k, k)` : `dir` et `k` sont ici ;
// `worldX` et `move` : position (px du monde) et transition du déplacement (roues) ; `occupied` : conducteur à bord.
export type GhibliTransport = { rainy: boolean; dir: 1 | -1; k: number; worldX: number; move?: string; occupied: boolean; still: boolean };

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

// Barrière de type Vauban (24 × 11) : cadre blanc liseré de sombre, barreaux alternés rouge et blanc (contraste sur le
// trottoir clair comme sur la chaussée), deux pieds plats.
// Ghibli : image `barrier` (barreaux tube rouge/blanc, cadre galvanisé cerné, plaque à filet), repli classique.
const BARRIER_RED = '#D0302A';
export function Barrier({ sky, ghibli = false }: { sky: Sky; ghibli?: boolean }): ReactElement {
  const t = (c: string): string => tone(c, sky);
  const bars: number[] = [];
  for (let x = -9.5; x < 10; x += 2.4) bars.push(x);
  const art = (
    <g fill="none" strokeLinecap="round">
      <rect x={-11} y={-11} width={22} height={8.5} rx={1} stroke={t('#2E323C')} strokeWidth={1.5} />
      {bars.map((x, i) => (
        <line key={x} x1={x} y1={-10.5} x2={x} y2={-3} stroke={t(i % 2 === 0 ? BARRIER_RED : '#F4F4F2')} strokeWidth={1} />
      ))}
      <rect x={-11} y={-11} width={22} height={8.5} rx={1} stroke={t('#F4F4F2')} strokeWidth={0.8} />
      <rect x={-6} y={-8.6} width={12} height={3} fill={t(BARRIER_RED)} stroke={t('#F4F4F2')} strokeWidth={0.4} />
      <line x1={-11} y1={-2.5} x2={-11} y2={0} stroke={t('#F4F4F2')} strokeWidth={0.9} />
      <line x1={11} y1={-2.5} x2={11} y2={0} stroke={t('#F4F4F2')} strokeWidth={0.9} />
      <line x1={-14} y1={0} x2={-8} y2={0} stroke={t('#2E323C')} strokeWidth={1.2} />
      <line x1={8} y1={0} x2={14} y2={0} stroke={t('#2E323C')} strokeWidth={1.2} />
    </g>
  );
  return <g data-barrier-art="">{ghibli ? <PropImage spec={{ id: 'barrier', day: sky.daylight }} fallback={art} /> : art}</g>;
}
// Demi-largeur (pieds compris) et demi-écart des montants, unités du sprite.
export const BARRIER = { half: 14, post: 11, height: 11 } as const;

// ---------- Scène de la Fête de la musique (repère : sol y = 0, centre x = 0, unités du monde à l'échelle 1) ----------
// Plancher 96 × 8 vu un peu d'en haut (dessus de `deck` de profondeur au-dessus de la face avant), deux montants en treillis
// jusqu'à la traverse (y = -60) tendus d'une toile de fond, trois projecteurs accrochés sous la traverse.
export const STAGE = { half: 48, floor: 8, deck: 3, truss: 60, postX: 44, spotXs: [-28, 0, 28] as const, spotY: -55 } as const;
// Ligne où se posent les pieds des musiciens : au milieu du dessus du plancher.
export const STAGE_STAND = -STAGE.floor - STAGE.deck / 2;

// Centre de la lentille du projecteur i dans le repère de la scène (la tête est inclinée de -x/3 degrés autour de son accroche).
export function spotLens(i: number): { x: number; y: number } {
  const x = STAGE.spotXs[i]!;
  const a = (-x / 3) * (Math.PI / 180);
  return { x: x - 3 * Math.sin(a), y: STAGE.spotY + 3 * Math.cos(a) };
}

// Ghibli : images `stage-floor`, `stage-frame`, `stage-spots` (`lit`), repli classique.
export function StageFloor({ sky, ghibli = false }: { sky: Sky; ghibli?: boolean }): ReactElement {
  const t = (c: string): string => tone(c, sky);
  const art = (
    <>
      <rect x={-STAGE.half + 1.5} y={-STAGE.floor - STAGE.deck} width={STAGE.half * 2 - 3} height={STAGE.deck} fill={t('#8A7058')} />
      <rect x={-STAGE.half} y={-STAGE.floor} width={STAGE.half * 2} height={STAGE.floor} fill={t('#24262E')} />
      <rect x={-STAGE.half} y={-STAGE.floor} width={STAGE.half * 2} height={1.6} fill={t('#6A5848')} />
      {[-36, -12, 12, 36].map((x) => (
        <line key={x} x1={x} y1={-STAGE.floor + 1.6} x2={x} y2={0} stroke={t('#3A3D46')} strokeWidth={0.6} />
      ))}
    </>
  );
  return <g data-stage-part="floor">{ghibli ? <PropImage spec={{ id: 'stage-floor', day: sky.daylight }} fallback={art} /> : art}</g>;
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

// Ghibli : les repères `data-stage-backdrop` / `data-stage-spot` restent des éléments vides à côté de l'image (la tâche 7 s'y
// accroche) ; le repli classique ne les porte alors pas (jamais deux fois le même repère).
export function StageFrame({ sky, ghibli = false }: { sky: Sky; ghibli?: boolean }): ReactElement {
  const c = tone('#9CA3AC', sky);
  const art = (marks: boolean): ReactElement => (
    <>
      {/* Toile de fond tendue entre les montants : la scène masque ce qui passe derrière elle. */}
      <rect {...(marks ? { 'data-stage-backdrop': '' } : {})} x={-STAGE.postX - 1.5} y={-STAGE.truss + 1.5} width={STAGE.postX * 2 + 3} height={STAGE.truss - STAGE.floor - STAGE.deck - 1.5} fill={tone('#2C2F3D', sky)} />
      {[-30, -15, 0, 15, 30].map((x) => (
        <line key={x} x1={x} y1={-STAGE.truss + 1.5} x2={x} y2={-STAGE.floor - STAGE.deck} stroke={tone('#3A3E4E', sky)} strokeWidth={1.2} />
      ))}
      <Truss x1={-STAGE.postX} y1={-STAGE.floor - STAGE.deck} x2={-STAGE.postX} y2={-STAGE.truss} c={c} />
      <Truss x1={STAGE.postX} y1={-STAGE.floor - STAGE.deck} x2={STAGE.postX} y2={-STAGE.truss} c={c} />
      <Truss x1={-STAGE.postX - 2} y1={-STAGE.truss} x2={STAGE.postX + 2} y2={-STAGE.truss} c={c} />
    </>
  );
  if (!ghibli) return <g data-stage-part="frame">{art(true)}</g>;
  return (
    <g data-stage-part="frame">
      <g data-stage-backdrop="" />
      <PropImage spec={{ id: 'stage-frame', day: sky.daylight }} fallback={art(false)} />
    </g>
  );
}

// Projecteurs accrochés sous la traverse, orientés vers le plancher. `lit` : lentille allumée (les faisceaux sont dans stage-band.tsx).
export function StageSpots({ sky, lit, ghibli = false }: { sky: Sky; lit: boolean; ghibli?: boolean }): ReactElement {
  const t = (c: string): string => tone(c, sky);
  const art = (marks: boolean): ReactElement[] => STAGE.spotXs.map((x, i) => (
    <g key={x} {...(marks ? { 'data-stage-spot': i } : {})} transform={`translate(${x} ${STAGE.spotY})`}>
      <line x1={0} y1={-3.5} x2={0} y2={-1.5} stroke={t(STEEL)} strokeWidth={0.6} />
      <rect x={-2.2} y={-1.8} width={4.4} height={4.6} rx={0.8} fill={t('#1E2026')} transform={`rotate(${-x / 3})`} />
      <circle cx={0} cy={3} r={1.6} fill={lit ? '#FFF1B8' : t('#5A5F6A')} transform={`rotate(${-x / 3})`} />
    </g>
  ));
  if (!ghibli) return <g data-stage-part="spots">{art(true)}</g>;
  return (
    <g data-stage-part="spots">
      {STAGE.spotXs.map((x, i) => <g key={x} data-stage-spot={i} transform={`translate(${x} ${STAGE.spotY})`} />)}
      <PropImage spec={{ id: 'stage-spots', day: sky.daylight, lit }} fallback={art(false)} />
    </g>
  );
}

// Structure complète (plancher, ossature, projecteurs) ; `parts` pour n'en dessiner qu'une partie.
export function StageStructure({ sky, lit, parts = { floor: true, frame: true, spots: true }, ghibli = false }: { sky: Sky; lit: boolean; parts?: { floor: boolean; frame: boolean; spots: boolean }; ghibli?: boolean }): ReactElement {
  return (
    <g data-stage-structure="">
      {parts.frame && <StageFrame sky={sky} ghibli={ghibli} />}
      {parts.floor && <StageFloor sky={sky} ghibli={ghibli} />}
      {parts.spots && <StageSpots sky={sky} lit={lit} ghibli={ghibli} />}
    </g>
  );
}

// ---------- Travailleur en tenue de chantier (repère du passant, regarde vers +x) ----------
// Gilet orange à bande réfléchissante par-dessus la veste ; bras levés pour atteindre (`reach`), tendus pour porter (`carry`),
// vers l'avant et le bas pour tenir une charge par ses montants (`hold`), vers l'arrière et le bas pour la tirer (`tow`).
export type CrewPose = WorkerPose | 'hold' | 'tow';
// Main de la pose `hold` (et, en miroir, de `tow`), unités du sprite.
export const HOLD_HAND = { x: 9, y: -21 } as const;
export function CrewWorker({ outfit, sky, rainy, pose }: { outfit: Outfit; sky: Sky; rainy: boolean; pose: CrewPose }): ReactElement {
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
      {pose === 'hold' && <path d={`M1 -26 L5 -22 L${HOLD_HAND.x} ${HOLD_HAND.y}`} stroke={sleeve} strokeWidth={2.2} strokeLinecap="round" fill="none" />}
      {pose === 'tow' && <path d={`M-1 -26 L-5 -22 L${-HOLD_HAND.x} ${HOLD_HAND.y}`} stroke={sleeve} strokeWidth={2.2} strokeLinecap="round" fill="none" />}
    </g>
  );
}

// Pièces tenues par l'ouvrier de la nacelle pendant le montage de la scène (repère : main à y = 0, vers +x) : un tronçon de
// treillis (ossature) ou un projecteur (projecteurs). Ghibli : image cuite dans le sens `dir` (l'hôte ne retourne plus le
// groupe : le repli classique est retourné ici pour −x).
type HeldGhibli = { dir: 1 | -1 };
function heldImage(id: string, sky: Sky, ghibli: HeldGhibli, art: ReactElement): ReactElement {
  return <PropImage spec={{ id, dir: ghibli.dir, day: sky.daylight }} fallback={ghibli.dir < 0 ? <g transform="scale(-1 1)">{art}</g> : art} />;
}
export function HeldTruss({ sky, ghibli }: { sky: Sky; ghibli?: HeldGhibli }): ReactElement {
  const c = tone('#9CA3AC', sky);
  const art = (
    <g stroke={c} fill="none">
      <line x1={-5} y1={-1.5} x2={9} y2={-1.5} strokeWidth={0.8} />
      <line x1={-5} y1={1.5} x2={9} y2={1.5} strokeWidth={0.8} />
      <polyline points="-5 -1.5 -2 1.5 1 -1.5 4 1.5 7 -1.5 9 1.5" strokeWidth={0.45} />
    </g>
  );
  return <g data-held-piece="truss">{ghibli ? heldImage('held-truss', sky, ghibli, art) : art}</g>;
}
export function HeldSpot({ sky, ghibli }: { sky: Sky; ghibli?: HeldGhibli }): ReactElement {
  const t = (c: string): string => tone(c, sky);
  const art = (
    <>
      <line x1={0} y1={0} x2={0} y2={-2.4} stroke={t(STEEL)} strokeWidth={0.7} />
      <rect x={-2.4} y={-2.4} width={6} height={4.8} rx={0.9} fill={t('#1E2026')} />
      <circle cx={3.8} cy={0} r={1.6} fill={t('#5A5F6A')} />
    </>
  );
  return <g data-held-piece="spot">{ghibli ? heldImage('held-spot', sky, ghibli, art) : art}</g>;
}

// ---------- Camionnette de l'équipe (repère des véhicules : roues à y = 0, regard vers +x) ----------
// Blanche à bande orange, galerie de toit ; `ladder` : l'échelle est rangée sur la galerie (centrée en x = VAN_LADDER.x, à
// y = VAN_LADDER.y, 25 unités : à l'échelle de la camionnette, la longueur de celle que l'équipe porte) ; `open` : la
// portière arrière est ouverte (les ouvriers descendent ou remontent).
export const VAN_LADDER = { x: -6, y: -28 } as const;
// `stored` : éléments entreposés dans la caisse fermée (barrières, planches) : repères sans dessin (`data-stored-item`).
// Portière arrière ouverte : l'embrasure sombre et le battant rabattu vers l'arrière.
function VanDoor({ sky }: { sky: Sky }): ReactElement {
  const t = (c: string): string => tone(c, sky);
  return (
    <g data-van-door="">
      <rect x={-24} y={-22} width={5} height={17} fill={t('#2A2C30')} />
      <path d="M-25 -23 L-31 -21 L-31 -6 L-25 -5 Z" fill={t('#DCDCD8')} stroke={t('#B8B8B2')} strokeWidth={0.5} />
      <rect x={-30} y={-14} width={4} height={1.6} fill={t('#E8601C')} />
    </g>
  );
}
// Ghibli : la même échelle couchée (25 unités, centrée en VAN_LADDER) en image, dans le groupe en miroir de la camionnette.
function VanLadder({ sky, ghibli }: { sky: Sky; ghibli?: GhibliTransport }): ReactElement {
  const t = (c: string): string => tone(c, sky);
  const art = (
    <g stroke={t('#B9C0C8')} strokeLinecap="round">
      <line x1={-18.5} y1={-27} x2={6.5} y2={-27} strokeWidth={0.8} />
      <line x1={-18.5} y1={-29} x2={6.5} y2={-29} strokeWidth={0.8} />
      {Array.from({ length: 9 }, (_, i) => <line key={i} x1={-18 + i * 3} y1={-29} x2={-18 + i * 3} y2={-27} strokeWidth={0.5} />)}
    </g>
  );
  if (!ghibli) return <g data-van-ladder="">{art}</g>;
  return (
    <g data-van-ladder="" transform={`translate(${VAN_LADDER.x} ${VAN_LADDER.y})`}>
      <PropInMirror spec={{ id: 'stowed-ladder', args: { len: 25 }, dir: ghibli.dir, day: sky.daylight }} fallback={<g transform={`translate(${-VAN_LADDER.x} ${-VAN_LADDER.y})`}>{art}</g>} />
    </g>
  );
}
export function Van({ sky, ladder, lights, open = false, stored = [], ghibli }: { sky: Sky; ladder: boolean; lights: boolean; open?: boolean; stored?: readonly string[]; ghibli?: GhibliTransport }): ReactElement {
  const t = (c: string): string => tone(c, sky);
  const marks = stored.map((id) => <g key={id} data-stored-item={id} data-carried="van" />);
  if (ghibli)
    return (
      <g data-van="" data-van-open={open ? 'true' : 'false'}>
        <ScriptedCar spec={{ id: 'crew-van', seed: 1 }} dir={ghibli.dir} k={ghibli.k} sky={sky} rainy={ghibli.rainy} lights={lights} still={ghibli.still} occupied={ghibli.occupied} roll={{ worldX: ghibli.worldX, move: ghibli.move }}>
          {marks}
          {open && <VanDoor sky={sky} />}
          {ladder && <VanLadder sky={sky} ghibli={ghibli} />}
        </ScriptedCar>
      </g>
    );
  return (
    <g data-van="" data-van-open={open ? 'true' : 'false'}>
      {marks}
      <rect x={-25} y={-24} width={50} height={20} rx={3} fill={t('#ECECEA')} />
      <rect x={-25} y={-13} width={50} height={2.4} fill={t('#E8601C')} />
      {open && <VanDoor sky={sky} />}
      <rect x={12} y={-21} width={9} height={7} fill={t('#CFE4F2')} opacity={0.85} />
      <line x1={-22} y1={-25.5} x2={10} y2={-25.5} stroke={t(STEEL)} strokeWidth={0.8} />
      {[-20, -6, 8].map((x) => <line key={x} x1={x} y1={-25.5} x2={x} y2={-24} stroke={t(STEEL)} strokeWidth={0.6} />)}
      {ladder && <VanLadder sky={sky} />}
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

// `cargo` : chargement posé sur le plateau, dans le repère du véhicule (caisse de drapeaux `FlagCrate`, posée en LIFT_CRATE).
type LiftProps = { sky: Sky; still: boolean; dir: 1 | -1; k: number; u: number; outrigger: number; bucket: { x: number; y: number }; rider: ReactNode; beacon: boolean; cargo?: ReactNode; ghibli?: GhibliTransport; lights?: boolean };
export const LIFT_CRATE = { x: -2, y: -12 } as const;

export function LiftTruck({ sky, still, dir, k, u, outrigger, bucket, rider, beacon, cargo = null, ghibli, lights = false }: LiftProps): ReactElement {
  const t = (c: string): string => tone(c, sky);
  const yellow = t('#E8B923');
  const p = liftPivot(dir, k);
  const l1 = LIFT.boom1 * u;
  const l2 = LIFT.boom2 * u;
  const e = liftElbow(p, bucket, l1, l2);
  const leg = 6 * clamp(outrigger, 0, 1);
  const bw = 10 * u;
  const bh = 7 * u;
  // Stabilisateurs (vérins) : descendent jusqu'au sol au déploiement.
  const outriggers = [-27, 13].map((x) => (
    <g key={x} data-outrigger="">
      <rect x={x - 1.5} y={-9} width={3} height={2 + leg} fill={t(STEEL)} />
      <rect x={x - 3} y={-7 + leg} width={6} height={1.2} fill={t(STEEL)} />
    </g>
  ));
  const crate = cargo && <g transform={`translate(${LIFT_CRATE.x} ${LIFT_CRATE.y})`}>{cargo}</g>;
  return (
    <g data-lift="">
      {ghibli ? (
        <ScriptedCar spec={{ id: 'lift', seed: 1 }} dir={dir} k={k} sky={sky} rainy={ghibli.rainy} lights={lights} still={ghibli.still} occupied={ghibli.occupied} roll={{ worldX: ghibli.worldX, move: ghibli.move }} under={outriggers}>
          {crate}
        </ScriptedCar>
      ) : (
      <g transform={`scale(${(dir * k).toFixed(3)} ${k.toFixed(3)})`}>
        {outriggers}
        <rect x={-32} y={-12} width={48} height={6} fill={yellow} />
        <rect x={-32} y={-8} width={48} height={1.2} fill={t('#3B3F4A')} />
        <rect x={16} y={-24} width={16} height={20} rx={2.5} fill={t('#ECECEA')} />
        <rect x={22} y={-21.5} width={8} height={7} fill={t('#CFE4F2')} opacity={0.85} />
        <rect x={-23} y={-18} width={10} height={6} rx={1} fill={yellow} />
        {crate}
        <rect x={20} y={-26} width={4} height={2} rx={0.8} fill="#E8601C">
          {beacon && !still && <animate attributeName="opacity" values="1;0.25;1" dur="0.9s" repeatCount="indefinite" />}
        </rect>
        <circle cx={-20} cy={-4.5} r={4.5} fill="#222" />
        <circle cx={22} cy={-4.5} r={4.5} fill="#222" />
      </g>
      )}
      {/* Bras articulé : flèche basse (pivot → coude), flèche haute (coude → nacelle). Ghibli (maquette `liftArm`) : vérin de
          levage fer, flèches jaunes en tubes cellulo (leur longueur change à chaque image : pas d'image cuite), articulations
          modelées. */}
      {ghibli ? (
        <>
          <g data-lift-arm="">
            <CelTube x1={p.x + dir * 6 * u} y1={p.y + 3 * u} x2={(p.x + e.x) / 2} y2={(p.y + e.y) / 2} w={1.1 * u} lw={0.35 * u} c={LIFT_IRON} sky={sky} />
            <CelTube x1={p.x} y1={p.y} x2={e.x} y2={e.y} w={2.4 * u} lw={0.5 * u} c={LIFT_YELLOW} sky={sky} />
            <CelTube x1={e.x} y1={e.y} x2={bucket.x} y2={bucket.y - bh * 0.5} w={1.8 * u} lw={0.5 * u} c={LIFT_YELLOW} sky={sky} />
          </g>
          <CelBall cx={e.x} cy={e.y} r={1.4 * u} lw={0.35 * u} c={LIFT_IRON} sky={sky} />
          <CelBall cx={p.x} cy={p.y} r={1.6 * u} lw={0.35 * u} c={LIFT_IRON} sky={sky} />
        </>
      ) : (
        <>
          <g data-lift-arm="" stroke={yellow} strokeLinecap="round">
            <line x1={p.x} y1={p.y} x2={e.x} y2={e.y} strokeWidth={2.4 * u} />
            <line x1={e.x} y1={e.y} x2={bucket.x} y2={bucket.y - bh * 0.5} strokeWidth={1.8 * u} />
          </g>
          <circle cx={e.x} cy={e.y} r={1.4 * u} fill={t(STEEL)} />
          <circle cx={p.x} cy={p.y} r={1.6 * u} fill={t(STEEL)} />
        </>
      )}
      {/* Nacelle : le travailleur est dessiné avant la paroi, qui cache ses jambes. Ghibli : image `lift-bucket` (caisse blanche
          à liseré jaune et rambarde) à l'unité u, repli classique à la même échelle. */}
      <g data-lift-bucket="" transform={`translate(${bucket.x.toFixed(2)} ${bucket.y.toFixed(2)})`}>
        {rider}
        {ghibli ? (
          <g transform={`scale(${u.toFixed(3)})`}>
            <PropImage
              spec={{ id: 'lift-bucket', day: sky.daylight }}
              fallback={
                <>
                  <rect x={-5} y={-7} width={10} height={7} rx={0.8} fill={t('#F2F2F0')} stroke={yellow} strokeWidth={0.6} />
                  <line x1={-5} y1={-7} x2={5} y2={-7} stroke={t(STEEL)} strokeWidth={0.7} />
                </>
              }
            />
          </g>
        ) : (
          <>
            <rect x={-bw / 2} y={-bh} width={bw} height={bh} rx={0.8 * u} fill={t('#F2F2F0')} stroke={yellow} strokeWidth={0.6 * u} />
            <line x1={-bw / 2} y1={-bh} x2={bw / 2} y2={-bh} stroke={t(STEEL)} strokeWidth={0.7 * u} />
          </>
        )}
      </g>
    </g>
  );
}

// Tube cellulo en SVG (bras articulé, en px du monde) : trait encré, couleur, bande d'ombre côté bas-droite et rehaut côté
// haut-gauche du monde (lumière en haut à gauche ; les positions sont déjà dans le sens du camion : jamais de miroir). Mêmes
// proportions que `tube` du kit.
const LIFT_IRON = '#4A5A58';
const LIFT_YELLOW = '#E8B923';
function CelTube({ x1, y1, x2, y2, w, lw, c, sky }: { x1: number; y1: number; x2: number; y2: number; w: number; lw: number; c: string; sky: Sky }): ReactElement {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const s = nx * -0.7 + ny * -0.7 > 0 ? 1 : -1;
  const so = -s * w * 0.28;
  const lo = s * w * 0.26;
  const f = (v: number): string => v.toFixed(2);
  return (
    <g strokeLinecap="round">
      <line x1={f(x1)} y1={f(y1)} x2={f(x2)} y2={f(y2)} stroke={tone(INK, sky)} strokeWidth={f(w + lw * 2)} />
      <line x1={f(x1)} y1={f(y1)} x2={f(x2)} y2={f(y2)} stroke={tone(c, sky)} strokeWidth={f(w)} />
      <line x1={f(x1 + nx * so)} y1={f(y1 + ny * so)} x2={f(x2 + nx * so)} y2={f(y2 + ny * so)} stroke={tone(mixHex(c, COOL, 0.3), sky)} strokeWidth={f(w * 0.36)} strokeLinecap="butt" />
      <line x1={f(x1 + nx * lo)} y1={f(y1 + ny * lo)} x2={f(x2 + nx * lo)} y2={f(y2 + ny * lo)} stroke={tone(mixHex(c, SUN, 0.35), sky)} strokeWidth={f(w * 0.26)} strokeLinecap="butt" />
    </g>
  );
}
// Articulation modelée (comme `ball` du kit, sans clipPath : ombre en disque inscrit en bas à droite, point de lumière en haut
// à gauche, trait encré).
function CelBall({ cx, cy, r, lw, c, sky }: { cx: number; cy: number; r: number; lw: number; c: string; sky: Sky }): ReactElement {
  const f = (v: number): string => v.toFixed(2);
  return (
    <g data-lift-joint="">
      <circle cx={f(cx)} cy={f(cy)} r={f(r)} fill={tone(c, sky)} />
      <circle cx={f(cx + r * 0.28)} cy={f(cy + r * 0.28)} r={f(r * 0.6)} fill={tone(mixHex(c, COOL, 0.3), sky)} />
      <circle cx={f(cx - r * 0.35)} cy={f(cy - r * 0.35)} r={f(r * 0.35)} fill={tone(mixHex(c, SUN, 0.4), sky)} />
      <circle cx={f(cx)} cy={f(cy)} r={f(r)} fill="none" stroke={tone(INK, sky)} strokeWidth={f(lw)} />
    </g>
  );
}

// ---------- Caisse de drapeaux (plateau du camion élévateur, porte-bagages du vélo porteur) ----------
// Repère : centre du bas de la caisse à (0, 0), unités du véhicule. Un petit drapeau roulé dépasse de la caisse par élément
// encore entreposé (`data-stored-item`, `data-carried` = `tag`) ; la caisse se vide à mesure qu'on les pose.
// Dessin classique de la caisse : `n` drapeaux ; avec `flags` + `tag`, chaque drapeau porte son repère `data-stored-item`.
function CrateArt({ sky, n, w, flags, tag }: { sky: Sky; n: number; w: number; flags?: readonly string[]; tag?: string }): ReactElement {
  const t = (c: string): string => tone(c, sky);
  return (
    <>
      {Array.from({ length: n }, (_, i) => {
        const x = -w / 2 + 1.5 + ((i + 0.5) * (w - 3)) / Math.max(1, n);
        const marks = flags && tag ? { 'data-stored-item': flags[i], 'data-carried': tag } : {};
        return (
          <g key={flags?.[i] ?? i} {...marks} transform={`translate(${x.toFixed(2)} -5)`}>
            <line x1={0} y1={0} x2={0} y2={-6} stroke={t(POLE)} strokeWidth={0.6} />
            <g transform="translate(0 -6)"><FlagArt sky={sky} w={3.6} h={2.4} /></g>
          </g>
        );
      })}
      <rect x={-w / 2} y={-5.5} width={w} height={5.5} rx={0.6} fill={t('#9A6B3E')} stroke={t('#6E4A28')} strokeWidth={0.4} />
      <line x1={-w / 2} y1={-2.8} x2={w / 2} y2={-2.8} stroke={t('#6E4A28')} strokeWidth={0.4} />
    </>
  );
}
// Repères des éléments entreposés (sans dessin), pour l'image Ghibli.
const storedMarks = (flags: readonly string[], tag: string): ReactElement[] => flags.map((id) => <g key={id} data-stored-item={id} data-carried={tag} />);
// Ghibli : image `flag-crate` (bois à lattes, drapeaux roulés) dans le groupe en miroir du véhicule (`dir`), repères conservés.
export function FlagCrate({ sky, flags, tag, w = 14, ghibli }: { sky: Sky; flags: readonly string[]; tag: string; w?: number; ghibli?: { dir: 1 | -1 } }): ReactElement {
  const n = flags.length;
  if (!ghibli) return <g data-flag-crate=""><CrateArt sky={sky} n={n} w={w} flags={flags} tag={tag} /></g>;
  return (
    <g data-flag-crate="">
      {storedMarks(flags, tag)}
      <PropInMirror spec={{ id: 'flag-crate', args: { n, w }, dir: ghibli.dir, day: sky.daylight }} fallback={<CrateArt sky={sky} n={n} w={w} />} />
    </g>
  );
}

// Échelle couchée (rangée sur un véhicule) : longueur `len`, centrée en x = 0, rails à y = ±1. Ghibli : image `stowed-ladder`
// dans le groupe en miroir du véhicule (`dir`).
function StowedLadder({ sky, len, ghibli }: { sky: Sky; len: number; ghibli?: { dir: 1 | -1 } }): ReactElement {
  const t = (c: string): string => tone(c, sky);
  const n = Math.max(2, Math.round(len / 3));
  const art = (
    <g stroke={t('#8E969F')} strokeLinecap="round">
      <line x1={-len / 2} y1={1} x2={len / 2} y2={1} strokeWidth={0.8} />
      <line x1={-len / 2} y1={-1} x2={len / 2} y2={-1} strokeWidth={0.8} />
      {Array.from({ length: n }, (_, i) => {
        const x = -len / 2 + 0.5 + (i * (len - 1)) / (n - 1);
        return <line key={i} x1={x} y1={-1} x2={x} y2={1} strokeWidth={0.5} />;
      })}
    </g>
  );
  return <g data-van-ladder="">{ghibli ? <PropInMirror spec={{ id: 'stowed-ladder', args: { len }, dir: ghibli.dir, day: sky.daylight }} fallback={art} /> : art}</g>;
}

// ---------- Vélo porteur (repère des véhicules : roues à y = 0, regard vers +x) ----------
// Vélo à long porte-bagages arrière : une caisse de drapeaux sur le porte-bagages, l'échelle couchée par-dessus (`ladder`) ;
// `rider` : l'ouvrier en selle (gilet orange, `data-worker`), null quand il en est descendu. Ghibli (`ghibli`) : l'ouvrier est
// un pantin à vélo en gilet de chantier, pédalier à l'image `phase`, retourné selon `dir` (sens du groupe, déjà en miroir).
export const BIKE = { half: 40, door: 26, saddle: -4, crate: { x: -25, y: -12 }, ladder: { x: -20, y: -21, len: 34 } } as const;
// Ghibli : vélo, caisse et échelle en une image `cargo-bike` (roues `wheel`, cadre vert en tubes) dans le groupe en miroir de
// l'hôte (`dir`), repères des drapeaux entreposés conservés ; le cycliste reste le pantin.
export function CargoBike({ sky, lights, ladder, flags, rider, ghibli }: { sky: Sky; lights: boolean; ladder: boolean; flags: readonly string[]; rider: Outfit | null; ghibli?: { rainy: boolean; dir: 1 | -1; phase: number } }): ReactElement {
  const t = (c: string): string => tone(c, sky);
  const frame = t('#2F7D5B');
  const art = (marks: boolean): ReactElement => (
    <>
      <g fill="none" stroke={t('#2A2D34')} strokeWidth={1.2}>
        <circle cx={-20} cy={-5} r={5} />
        <circle cx={14} cy={-5} r={5} />
      </g>
      {/* Cadre allongé, porte-bagages jusqu'à l'arrière, potence et guidon. */}
      <path d="M-20 -5 L-6 -12 L8 -12 L14 -5 M-6 -12 L-4 -16 M8 -12 L9 -18 M-36 -12 L-8 -12 M-30 -12 L-20 -5 M-12 -12 L-20 -5" fill="none" stroke={frame} strokeWidth={1.4} strokeLinecap="round" />
      <rect x={-6.5} y={-17.4} width={5} height={1.4} rx={0.6} fill={t('#2A2D34')} />
      <line x1={8} y1={-18} x2={12} y2={-18.5} stroke={t('#2A2D34')} strokeWidth={1.1} strokeLinecap="round" />
      <g transform={`translate(${BIKE.crate.x} ${BIKE.crate.y})`}>
        {marks ? <FlagCrate sky={sky} flags={flags} tag="bike" w={20} /> : <g data-flag-crate=""><CrateArt sky={sky} n={flags.length} w={20} /></g>}
      </g>
      {ladder && <g transform={`translate(${BIKE.ladder.x} ${BIKE.ladder.y})`}><StowedLadder sky={sky} len={BIKE.ladder.len} /></g>}
    </>
  );
  return (
    <g data-cargo-bike="">
      {ghibli ? (
        <g data-cargo-bike-art="">
          {storedMarks(flags, 'bike')}
          <PropInMirror spec={{ id: 'cargo-bike', args: { flags: flags.length, ladder }, dir: ghibli.dir, day: sky.daylight }} fallback={art(false)} />
        </g>
      ) : art(true)}
      {rider && ghibli && (
        <g data-worker="">
          <GhibliRider outfit={rider} sky={sky} rainy={ghibli.rainy} dir={ghibli.dir} phase={ghibli.phase} work="vest" seatX={-4} seatY={-17.6} />
        </g>
      )}
      {rider && !ghibli && (
        <g data-worker="" data-bike-rider="" transform="translate(-1 -1.5)">
          <Cyclist outfit={rider} sky={sky} />
          <path d="M-4 -17 L-1.9 -22.6 L1.1 -21.8 L-0.9 -16.2Z" fill={t('#F28C28')} />
        </g>
      )}
      {lights && <circle cx={16} cy={-15} r={1.5} fill="#FFE9A0" />}
    </g>
  );
}

// ---------- Camion plateau (repère des véhicules : roues à y = 0, regard vers +x) ----------
// Cabine à l'avant, petite grue de chargement repliée derrière elle, plateau à ridelles basses, hayon à l'arrière (`open` :
// abaissé pendant qu'on décharge ou charge). Chargement (`load`, entreposé : `data-stored-item`, `data-carried="truck"`) posé
// sur le plateau en piles tassées : planches, treillis et projecteurs de la scène ; panneaux de comptoir, fûts et toiles
// d'auvent roulées des stands. `ladder` : échelle accrochée au flanc (stands).
export const FLATBED = { half: 52, door: 47, cab: 36, deck: -11, ladder: { x: -24, y: -16.5, len: 30 } } as const;
export type FlatbedLoad = { id: string; kind: ItemKind };
export function Flatbed({ sky, lights, open, ladder, load, ghibli }: { sky: Sky; lights: boolean; open: boolean; ladder: boolean; load: readonly FlatbedLoad[]; ghibli?: GhibliTransport }): ReactElement {
  const t = (c: string): string => tone(c, sky);
  const deck = FLATBED.deck;
  // Ghibli : le chargement est une image (`flatbed-load`, comptes par pièce) ; les repères entreposés sont posés à part.
  const tagged = (id: string, node: ReactNode): ReactElement => (ghibli ? <g key={id}>{node}</g> : <g key={id} data-stored-item={id} data-carried="truck">{node}</g>);
  const of = (k: ItemKind): FlatbedLoad[] => load.filter((l) => l.kind === k);
  const counters = of('stand-counter');
  const rolls = of('stand-awning');
  const pieces: ReactElement[] = [];
  // Scène : planches (plancher), treillis (portique), trois projecteurs.
  for (const l of of('stage-floor')) {
    pieces.push(tagged(l.id, (
      <g>
        {[0, 1, 2, 3].map((i) => <rect key={i} x={-44} y={deck - 2 * (i + 1)} width={27} height={1.9} fill={t(i % 2 ? '#7A6048' : '#9A7E62')} stroke={t('#5A4634')} strokeWidth={0.25} />)}
      </g>
    )));
  }
  for (const l of of('stage-frame')) {
    const zig = Array.from({ length: 7 }, (_, i) => `${-15 + i * 3} ${i % 2 ? deck - 6 : deck - 0.8}`).join(' ');
    pieces.push(tagged(l.id, (
      <g stroke={t('#9CA3AC')} fill="none">
        <line x1={-15} y1={deck - 0.8} x2={3} y2={deck - 0.8} strokeWidth={0.9} />
        <line x1={-15} y1={deck - 6} x2={3} y2={deck - 6} strokeWidth={0.9} />
        <polyline points={zig} strokeWidth={0.4} />
      </g>
    )));
  }
  for (const l of of('stage-spots')) {
    pieces.push(tagged(l.id, (
      <g>
        {[5, 11, 17].map((x) => (
          <g key={x}>
            <rect x={x} y={deck - 5.5} width={5.2} height={5.5} rx={0.8} fill={t('#1E2026')} />
            <circle cx={x + 2.6} cy={deck - 2.8} r={1.4} fill={t('#5A5F6A')} />
          </g>
        ))}
      </g>
    )));
  }
  // Stands : panneaux de comptoir empilés (avec leurs deux fûts dans la rangée de fûts), toiles roulées par-dessus la pile.
  counters.forEach((l, i) => {
    pieces.push(tagged(l.id, (
      <g>
        <rect x={-44} y={deck - 2.3 * (i + 1)} width={24} height={2.1} fill={t('#8A5A34')} stroke={t('#6A4426')} strokeWidth={0.2} />
        {[0, 1].map((j) => <rect key={j} x={-18 + i * 7.4 + j * 3.5} y={deck - 5.2} width={3.2} height={5.2} rx={0.8} fill={t('#9AA2AC')} stroke={t('#6E7680')} strokeWidth={0.3} />)}
      </g>
    )));
  });
  rolls.forEach((l, i) => {
    const y = deck - 2.3 * counters.length - 2.6 * (i + 1);
    pieces.push(tagged(l.id, (
      <g>
        <rect x={-43} y={y} width={22} height={2.5} rx={1.2} fill={t('#C8322E')} />
        {[-38, -31, -25].map((x) => <rect key={x} x={x} y={y} width={2} height={2.5} fill={t('#F4F1EA')} />)}
      </g>
    )));
  });
  // Hayon : relevé, ou abaissé (rabattu vers le sol) pendant le déchargement.
  const gate = open ? (
    <path data-flatbed-tailgate="open" d={`M-46 ${deck + 1} L-52 -3 L-50.4 -2 L-45 ${deck + 3}Z`} fill={t('#B9BEC4')} stroke={t('#8A9098')} strokeWidth={0.4} />
  ) : (
    <rect data-flatbed-tailgate="closed" x={-47.5} y={deck - 3} width={1.8} height={6} fill={t('#B9BEC4')} />
  );
  const stowed = ladder && <g transform={`translate(${FLATBED.ladder.x} ${FLATBED.ladder.y})`}><StowedLadder sky={sky} len={FLATBED.ladder.len} ghibli={ghibli ? { dir: ghibli.dir } : undefined} /></g>;
  if (ghibli) {
    const args = { floor: of('stage-floor').length, frame: of('stage-frame').length, spots: of('stage-spots').length, counters: counters.length, rolls: rolls.length };
    return (
      <g data-flatbed="" data-flatbed-open={open ? 'true' : 'false'}>
        <ScriptedCar spec={{ id: 'flatbed', seed: 1 }} dir={ghibli.dir} k={ghibli.k} sky={sky} rainy={ghibli.rainy} lights={lights} still={ghibli.still} occupied={ghibli.occupied} roll={{ worldX: ghibli.worldX, move: ghibli.move }}>
          <g data-flatbed-load="">
            {storedMarks(load.map((l) => l.id), 'truck')}
            <PropInMirror spec={{ id: 'flatbed-load', args, dir: ghibli.dir, day: sky.daylight }} fallback={pieces} />
          </g>
          {gate}
          {stowed}
        </ScriptedCar>
      </g>
    );
  }
  return (
    <g data-flatbed="" data-flatbed-open={open ? 'true' : 'false'}>
      {/* Grue de chargement repliée (mât derrière la cabine, flèche couchée vers l'arrière). */}
      <rect x={20} y={-30} width={3.4} height={20} fill={t('#E8B923')} />
      <line x1={21.7} y1={-28.5} x2={-10} y2={-26} stroke={t('#E8B923')} strokeWidth={1.8} strokeLinecap="round" />
      <line x1={-10} y1={-26} x2={-10} y2={-21} stroke={t('#3B3F4A')} strokeWidth={0.4} />
      {pieces}
      {/* Plateau, ridelles basses, châssis. */}
      <rect x={-46} y={deck} width={70} height={3.5} fill={t('#7A5A3A')} />
      <rect x={-46} y={deck - 1.6} width={70} height={1.6} fill={t('#B9BEC4')} stroke={t('#8A9098')} strokeWidth={0.3} />
      <rect x={-46} y={-7.5} width={74} height={2.5} fill={t('#2E323C')} />
      {gate}
      {stowed}
      {/* Cabine. */}
      <rect x={24} y={-28} width={22} height={23} rx={2.5} fill={t('#2F5E8E')} />
      <rect x={33} y={-25} width={11} height={8} fill={t('#CFE4F2')} opacity={0.85} />
      <line x1={31} y1={-25} x2={31} y2={-8} stroke={t('#244A70')} strokeWidth={0.6} />
      <rect x={27} y={-30} width={5} height={2} rx={0.8} fill="#E8601C" />
      <circle cx={-33} cy={-4.5} r={4.5} fill="#222" />
      <circle cx={-22} cy={-4.5} r={4.5} fill="#222" />
      <circle cx={36} cy={-4.5} r={4.5} fill="#222" />
      {lights && <circle cx={46} cy={-10} r={2.2} fill="#FFE9A0" />}
    </g>
  );
}
