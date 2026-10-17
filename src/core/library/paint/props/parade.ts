import { INK, TAU } from '../cel';
import { L, lightOf, shadeOf, type CelOpts } from '../shop/cel';
import type { TintedCtx } from '../shop/ctx';
import { FLAG_CYCLE_S, FLAG_FRAMES } from './install';
import { ball, celD, disc, ED, flagArt, groundShadow, PD, RD, RRD, tube } from './kit';
import { registerProps, type PropArgs, type PropPaint } from './index';

// Cortège du 14 juillet cellulo (G5, tâche 8), porté de la maquette validée (docs/superpowers/maquettes/g5-fetes/index.html :
// `horse`, `tricolore`, `headgear`, `instrument`, `rifle`, `crowdProp`) dans le repère de chaque sprite classique de
// parade-sprites.tsx et parade-crowd.tsx (notes.md §1 et §2 « Cheval »). Rien n'est lumineux : aucun passage par glowing.
// Les animations sont des poses clés (`frame`, 8 par cycle) : cheval au pas (1,2 s), tissu des drapeaux (période de la
// vague FLAG_CYCLE_S), mailloche de la grosse caisse (1 s), baguette de la caisse claire (0,5 s), canne du tambour-major
// (2 s), drapeau agité du spectateur. Les humains sont des pantins (GhibliFigure) : les bras ne sont peints que sur
// demande (`arm`, silhouettes-repères de la maquette), jamais dans l'app.

const BLUE = '#2B4FA0';
const WHITE = '#F4F2EA';
const RED = '#C0302B';
const BRASS = '#D8B04A';
const POLE = '#6B5B4A';
const BLACK = '#1E1A18';
const MANE = '#2A1A10';
const LEATHER = '#3A2416';
const op = (lw: number, s: number, sx = 0.68, l = 0.22, lx = 0.18): CelOpts => ({ lw, s, sx, l, lx });
const num = (v: unknown, d = 0): number => (Number.isFinite(Number(v)) ? Number(v) : d);
const str = (v: unknown, d: string): string => (typeof v === 'string' && v ? v : d);
type Box = readonly [number, number, number, number];

// ---------- Cheval de la Garde (Horseman : pivots des jambes à (x, −14), x = −10,5 / 11,5 devant et −7 / 8 au fond, sabot à y = 0 ;
// corps −13..14 × −25..−11, encolure et tête jusqu'à (25, −37) ; tapis −6..4 × −24..−18, selle ; le cavalier, pantin `mount`
// posé par l'hôte à (−1, −24,5), n'est pas peint). Pas à quatre temps (notes §2) : angle 10°·sin(2π(t/1,2 + phase)), phases
// 0 / 0,25 / 0,5 / 0,75 ; la jambe qui avance (cos > 0) plie le canon de 22°·cos et le sabot se lève. Jambes du fond assombries
// (0,25) sans rehaut. Pose k = t à k/8 du cycle. ----------
export const HORSE_CYCLE_S = 1.2;
const HORSE_FRAMES = 8;
function horse(x: TintedCtx, a: PropArgs, p: PropPaint): void {
  const c = str(a.coat, '#6B3F22');
  const t = (p.frame / HORSE_FRAMES) * HORSE_CYCLE_S;
  const leg = (lx: number, phase: number, far: boolean): void => {
    const w = TAU * (t / HORSE_CYCLE_S + phase);
    const rad = (10 * Math.sin(w) * Math.PI) / 180;
    const bend = (Math.max(0, Math.cos(w)) * 22 * Math.PI) / 180;
    const col = far ? shadeOf(c, 0.25) : c;
    x.save();
    x.translate(lx, -14);
    x.rotate(rad);
    tube(x, 0, 0, 0.3, 7.4, 2.3, col, { lw: 0.45, li: far ? 0.1 : 0.3 });
    x.translate(0.3, 7.4);
    x.rotate(-bend);
    tube(x, 0, 0, 0.2, 5.6, 1.8, col, { lw: 0.45, li: far ? 0.1 : 0.3 });
    ball(x, 0, 0, 1.1, col, 0);
    PD(x, [[-1.4, 5.2], [1.6, 5.2], [1.8, 6.6], [-1.6, 6.6]], BLACK, op(0.35, 0.2, 0.68, 0.25));
    x.restore();
  };
  // Ombre au sol affleurant les sabots (rien sous y = 0,5).
  groundShadow(x, 1, -0.4, 16, 0.9, 0.18);
  leg(-7, 0.5, true);
  leg(8, 0.75, true);
  // Corps : poitrail, ventre, croupe.
  celD(
    x,
    () => {
      x.moveTo(-13, -20);
      x.quadraticCurveTo(-15.5, -16, -12, -13);
      x.quadraticCurveTo(-4, -11, 3, -12);
      x.quadraticCurveTo(10, -12.5, 14, -16);
      x.quadraticCurveTo(15, -20, 12, -22.5);
      x.quadraticCurveTo(4, -25, -6, -24.5);
      x.quadraticCurveTo(-12, -24, -13, -20);
      x.closePath();
    },
    c,
    { lw: 0.55, box: [-15, -25, 30, 14], s: 0.3, sx: 0.6, l: 0.22, lx: 0.2 },
  );
  // Ventre clair.
  x.fillStyle = lightOf(c, 0.3);
  x.beginPath();
  x.ellipse(-2, -13.5, 8, 1.4, 0, 0, TAU);
  x.fill();
  // Queue.
  x.beginPath();
  x.moveTo(-13.5, -21);
  x.quadraticCurveTo(-22, -17, -19, -6);
  x.strokeStyle = INK;
  x.lineWidth = 3;
  x.lineCap = 'round';
  x.stroke();
  x.strokeStyle = MANE;
  x.lineWidth = 2.2;
  x.stroke();
  x.beginPath();
  x.moveTo(-14, -21.5);
  x.quadraticCurveTo(-19, -18, -18.2, -9);
  x.strokeStyle = 'rgba(120,90,60,0.6)';
  x.lineWidth = 0.5;
  x.stroke();
  // Encolure et tête.
  celD(
    x,
    () => {
      x.moveTo(9, -23);
      x.quadraticCurveTo(13, -30, 16, -33);
      x.lineTo(20.5, -31);
      x.quadraticCurveTo(17, -25, 15, -19);
      x.closePath();
    },
    c,
    { lw: 0.55, box: [9, -33, 12, 14], s: 0.3, sx: 0.6, l: 0.2, lx: 0.18 },
  );
  celD(
    x,
    () => {
      x.moveTo(15, -33.5);
      x.quadraticCurveTo(19, -35.5, 24, -31);
      x.quadraticCurveTo(25, -28.5, 23.5, -26.2);
      x.quadraticCurveTo(21, -25.5, 19, -27);
      x.quadraticCurveTo(17, -29, 15.4, -30.5);
      x.closePath();
    },
    c,
    { lw: 0.55, box: [15, -36, 10, 10], s: 0.3, sx: 0.62, l: 0.22, lx: 0.18 },
  );
  // Oreilles.
  PD(x, [[16.2, -34], [17.4, -37.4], [18.6, -34.2]], c, op(0.4, 0.3, 0.68, 0.2));
  PD(x, [[18.6, -34.4], [20.2, -37.2], [20.8, -34]], c, op(0.4, 0.3, 0.68, 0.2));
  // Crinière.
  x.beginPath();
  x.moveTo(14.4, -33);
  x.quadraticCurveTo(12, -29, 11, -24);
  x.strokeStyle = INK;
  x.lineWidth = 2.4;
  x.stroke();
  x.strokeStyle = MANE;
  x.lineWidth = 1.6;
  x.stroke();
  // Œil, naseau, bouche.
  disc(x, 21.2, -31.6, 0.7, BLACK, 0);
  x.fillStyle = 'rgba(255,255,255,0.7)';
  x.fillRect(20.9, -32, 0.4, 0.4);
  disc(x, 23.8, -28.2, 0.45, BLACK, 0);
  L(x, 19, -27.5, 22, -28, 'rgba(42,26,24,0.5)', 0.3);
  // Bride et rênes.
  x.strokeStyle = LEATHER;
  x.lineWidth = 0.5;
  x.beginPath();
  x.moveTo(20, -33);
  x.lineTo(22.6, -27.2);
  x.moveTo(18, -30);
  x.lineTo(24.2, -29.6);
  x.stroke();
  x.beginPath();
  x.moveTo(23, -28.5);
  x.quadraticCurveTo(14, -26, 4, -27);
  x.stroke();
  leg(-10.5, 0, false);
  leg(11.5, 0.25, false);
  // Tapis de selle bleu à galon blanc, selle, sangle.
  RD(x, -6, -24, 10, 6, '#1F2A4A', op(0.45, 0.3, 0.7, 0.15));
  x.strokeStyle = WHITE;
  x.lineWidth = 0.5;
  x.strokeRect(-5.4, -23.4, 8.8, 4.8);
  celD(
    x,
    () => {
      x.moveTo(-5, -24);
      x.quadraticCurveTo(-1, -22, 3.5, -24.5);
      x.lineTo(3, -25.8);
      x.quadraticCurveTo(-1, -24.2, -4.6, -25.8);
      x.closePath();
    },
    LEATHER,
    { lw: 0.4, box: [-5, -26, 9, 3], s: 0.3, sx: 0.68, l: 0.3, lx: 0.18 },
  );
  L(x, -2, -24, -2, -18.5, LEATHER, 0.6);
}

// ---------- Drapeau tricolore de parade (Tricolore : hampe à x = 0, tissu w × h vers −x, bleu à la hampe, haut du tissu à
// l'origine ; l'hôte translate à `top`). `pole` > 0 : hampe `tube` de y = pole jusqu'à −2 et pointe laiton (porte-drapeaux ; les
// antennes des jeeps et du char gardent leur hampe SVG). Tissu `flagArt` en miroir, pose k = k/8 de la période de la vague ;
// `still` : tissu plat à pli fixe, indépendant de la pose. ----------
const flagT = (p: PropPaint): number => (p.frame / FLAG_FRAMES) * FLAG_CYCLE_S;
const flagArgs = (a: PropArgs): { w: number; h: number; pole: number; still: boolean } => ({ w: num(a.w, 12), h: num(a.h, 8), pole: num(a.pole, 0), still: a.still === true });
function paradeFlag(x: TintedCtx, a: PropArgs, p: PropPaint): void {
  const { w, h, pole, still } = flagArgs(a);
  if (pole > 0) {
    tube(x, 0, pole, 0, -2, 0.9, POLE, { lw: 0.35 });
    ball(x, 0, -2.6, 0.9, BRASS, 0.3);
  }
  x.save();
  x.scale(-1, 1);
  flagArt(x, { w, h, t: still ? 0 : flagT(p), wave: !still, phase: 0 });
  x.restore();
}
function paradeFlagBox(a: PropArgs): Box {
  const { w, h, pole, still } = flagArgs(a);
  const amp = still ? 0 : h * 0.14;
  const x0 = -w - 0.6;
  const x1 = pole > 0 ? 1.4 : 0.6;
  const y0 = Math.min(-amp - 0.6, pole > 0 ? -3.6 : 0);
  const y1 = Math.max(h + amp * 1.15 + 0.6, pole > 0 ? pole + 0.6 : 0);
  return [x0, y0, x1 - x0, y1 - y0];
}

// ---------- Coiffes (Headgear : repère du marcheur, tête centrée à (0, −33), r 4,4 ; sommet du crâne ≈ −37 ; l'hôte pose l'image
// à l'accroche `head` du pantin, translatée de 33). `cap` : couleur de la coiffe ; `capTop` : bandeau du képi (sinon `cap`),
// pompon du bicorne et plumet du casque (sinon rouge). ----------
type HeadKind = 'kepi' | 'beret' | 'shako' | 'bachi' | 'bicorne' | 'crested' | 'calot' | 'plume';
const HEAD_KINDS: readonly HeadKind[] = ['kepi', 'beret', 'shako', 'bachi', 'bicorne', 'crested', 'calot', 'plume'];
const headKind = (a: PropArgs): HeadKind => (HEAD_KINDS as readonly string[]).includes(String(a.kind)) ? (a.kind as HeadKind) : 'kepi';
const HEAD_BOX: Record<HeadKind, Box> = {
  kepi: [-4.7, -44, 11.4, 9.2],
  beret: [-9.1, -41, 15, 6.6],
  shako: [-4.7, -56, 11.9, 20.5],
  bachi: [-5.1, -42, 10.2, 6.8],
  bicorne: [-7.5, -45.5, 15, 9],
  crested: [-7.6, -49, 13.2, 18.5],
  calot: [-5.1, -40.1, 10.2, 4.2],
  plume: [-4.7, -54.5, 11.4, 19.7],
};
function kepiBody(x: TintedCtx, cap: string): void {
  PD(x, [[-4.2, -36], [-3.8, -42.5], [3.8, -42.5], [4.2, -36]], cap, op(0.45, 0.3, 0.62, 0.2));
  RRD(x, 1.8, -36.6, 4.4, 1.3, 0.5, BLACK, { lw: 0.3, s: 0, l: 0.25 });
}
function headgear(x: TintedCtx, a: PropArgs): void {
  const kind = headKind(a);
  const cap = str(a.cap, '#1F2A4A');
  const capTop = str(a.capTop, cap);
  const plume = str(a.capTop, RED);
  switch (kind) {
    case 'kepi':
      kepiBody(x, cap);
      RD(x, -3.8, -43.4, 7.6, 1.4, capTop, op(0.4, 0.3, 0.62, 0.25));
      L(x, -3.2, -39.2, 3.2, -39.2, BRASS, 0.5);
      break;
    case 'beret':
      // Grande « tarte » penchée sur le côté.
      ED(x, -1.6, -37.6, 7, 2.6, cap, op(0.45, 0.3, 0.62, 0.22));
      disc(x, -1.6, -40, 0.5, cap, 0.3);
      break;
    case 'shako':
      // Shako à casoar (plumet blanc et rouge).
      PD(x, [[-4.2, -36], [-4, -44], [4, -44], [4.2, -36]], cap, op(0.45, 0.3, 0.62, 0.2));
      RRD(x, 1.8, -36.6, 4.4, 1.3, 0.5, BLACK, { lw: 0.3, s: 0, l: 0.25 });
      celD(x, () => { x.moveTo(0, -44); x.quadraticCurveTo(-3, -50, -1, -55); x.quadraticCurveTo(2, -50, 0, -44); }, WHITE, { lw: 0.4, box: [-3, -55, 4, 11], s: 0.2, l: 0 });
      celD(x, () => { x.moveTo(0, -50); x.quadraticCurveTo(-1.4, -53, -0.6, -55); x.quadraticCurveTo(1.2, -53, 0, -50); }, RED, { lw: 0.3, s: 0, l: 0 });
      disc(x, 0, -41, 1, BRASS, 0.3);
      break;
    case 'bachi':
      // Bonnet blanc des marins à pompon rouge.
      celD(x, () => { x.moveTo(-4.6, -36.5); x.quadraticCurveTo(0, -40.5, 4.6, -36.5); x.closePath(); }, WHITE, { lw: 0.45, box: [-4.6, -40.5, 9.2, 4], s: 0.25, sx: 0.62, l: 0 });
      RD(x, -4.6, -37, 9.2, 1.4, BLACK, { lw: 0.35, s: 0, l: 0.2 });
      ball(x, 0, -40, 1.5, RED, 0.3);
      break;
    case 'bicorne':
      // Bicorne porté en bataille.
      celD(x, () => { x.moveTo(-7, -37); x.quadraticCurveTo(0, -45, 7, -37); x.quadraticCurveTo(0, -39.5, -7, -37); }, cap, { lw: 0.45, box: [-7, -45, 14, 8], s: 0.3, sx: 0.62, l: 0.2 });
      disc(x, 0, -40.6, 0.9, plume, 0.3);
      break;
    case 'crested':
      // Casque chromé à crinière noire et plumet rouge (Garde républicaine).
      celD(x, () => { x.moveTo(-4.4, -35.5); x.arc(0, -35.5, 4.5, Math.PI, 0); x.closePath(); }, cap, { lw: 0.45, box: [-4.5, -40, 9, 5], s: 0.3, sx: 0.6, l: 0.4, lx: 0.3 });
      x.beginPath();
      x.moveTo(-3, -40);
      x.quadraticCurveTo(2, -42.5, 4, -40);
      x.quadraticCurveTo(-1, -39, -6, -33);
      x.strokeStyle = INK;
      x.lineWidth = 2.2;
      x.lineCap = 'round';
      x.stroke();
      x.strokeStyle = BLACK;
      x.lineWidth = 1.5;
      x.stroke();
      celD(x, () => { x.moveTo(-1, -40); x.quadraticCurveTo(-2.4, -45, -0.4, -48); x.quadraticCurveTo(1, -45, -1, -40); }, plume, { lw: 0.3, box: [-3, -48, 4, 8], s: 0.25, l: 0 });
      break;
    case 'calot':
      PD(x, [[-4.6, -36.4], [-3.8, -39.6], [4.4, -38.4], [4.6, -36.4]], cap, op(0.4, 0.3, 0.62, 0.2));
      break;
    case 'plume':
      // Chef de musique : képi et haut plumet tricolore.
      kepiBody(x, cap);
      celD(x, () => { x.moveTo(0, -42); x.quadraticCurveTo(-2.6, -48, 0, -54); x.quadraticCurveTo(2.6, -48, 0, -42); }, RED, { lw: 0.35, box: [-2.6, -54, 5.2, 12], s: 0.25, l: 0 });
      celD(x, () => { x.moveTo(0, -46); x.quadraticCurveTo(-1.4, -49, 0, -52); x.quadraticCurveTo(1.4, -49, 0, -46); }, WHITE, { lw: 0.25, s: 0, l: 0 });
      break;
  }
}

// ---------- Instruments de fanfare (InstrumentArt : repère du marcheur, épaule à (0, −26) ; l'hôte pose l'image à la main du
// pantin avec le décalage de l'objet SVG). Cuivres BRASS cernés + rehaut ; mêmes pivots et amplitudes que le classique :
// mailloche de la grosse caisse −15° + 15°·cos(2πt) sur 1 s, baguette de la caisse claire −11° + 11°·cos(4πt) sur 0,5 s, canne
// 7,5° − 17,5°·cos(πt) sur 2 s, toutes autour de l'épaule ; cuivres immobiles (une seule image). ----------
type Instrument = 'tuba' | 'trumpet' | 'bass-drum' | 'snare' | 'bugle' | 'baton';
const INSTRUMENTS: readonly Instrument[] = ['tuba', 'trumpet', 'bass-drum', 'snare', 'bugle', 'baton'];
export const INSTRUMENT_CYCLE_S: Readonly<Partial<Record<Instrument, number>>> = { 'bass-drum': 1, snare: 0.5, baton: 2 };
const INSTRUMENT_FRAMES = 8;
const instrumentKind = (a: PropArgs): Instrument => (INSTRUMENTS as readonly string[]).includes(String(a.kind)) ? (a.kind as Instrument) : 'tuba';
const INSTRUMENT_BOX: Record<Instrument, Box> = {
  tuba: [-2.5, -46, 11.6, 31],
  trumpet: [-0.5, -35.5, 18, 10],
  'bass-drum': [-3, -34.6, 18, 22.3],
  snare: [-0.5, -27, 12.5, 13.5],
  bugle: [-0.5, -33.6, 15.2, 10.2],
  baton: [-0.5, -57, 23.5, 32],
};
function instrument(x: TintedCtx, a: PropArgs, p: PropPaint): void {
  const kind = instrumentKind(a);
  const tunic = str(a.tunic, '#1F2A4A');
  const withArm = a.arm === true;
  const cycle = INSTRUMENT_CYCLE_S[kind] ?? 0;
  const t = cycle ? (p.frame / INSTRUMENT_FRAMES) * cycle : 0;
  const arm = (x2: number, y2: number): void => {
    if (withArm) tube(x, 0, -26, x2, y2, 2.4, tunic, { lw: 0.4 });
  };
  // Geste autour de l'épaule (degrés).
  const swing = (deg: number, draw: () => void): void => {
    x.save();
    x.translate(0, -26);
    x.rotate((deg * Math.PI) / 180);
    x.translate(0, 26);
    draw();
    x.restore();
  };
  const ring = (cx: number, cy: number, rx: number, ry: number, ink: number, w: number): void => {
    x.beginPath();
    x.ellipse(cx, cy, rx, ry, 0, 0, TAU);
    x.strokeStyle = INK;
    x.lineWidth = ink;
    x.stroke();
    x.strokeStyle = BRASS;
    x.lineWidth = w;
    x.stroke();
  };
  switch (kind) {
    case 'tuba':
      arm(5, -22);
      ring(4, -22, 3.4, 6.5, 2.6, 1.8);
      x.strokeStyle = 'rgba(255,250,220,0.6)';
      x.lineWidth = 0.4;
      x.beginPath();
      x.ellipse(3.4, -22.6, 3, 6, 0, Math.PI * 1.1, Math.PI * 1.7);
      x.stroke();
      PD(x, [[3, -28], [-2, -44], [8, -44], [5, -28]], BRASS, op(0.45, 0.3, 0.6, 0.3, 0.3));
      ED(x, 3, -44, 5, 1.3, '#8A6A1E', op(0.4, 0.2, 0.68, 0.3));
      ED(x, 3, -44.3, 3.6, 0.7, lightOf(BRASS, 0.2), { lw: 0, s: 0, l: 0 });
      break;
    case 'trumpet':
      arm(6, -30);
      tube(x, 3, -32, 13, -31, 1.2, BRASS, { lw: 0.35 });
      PD(x, [[12, -31], [17, -34], [17, -28]], BRASS, op(0.4, 0.3, 0.6, 0.3, 0.3));
      RD(x, 6, -33.4, 3, 2, BRASS, op(0.3, 0.3, 0.68, 0.3));
      for (const px of [6.6, 7.6, 8.6]) L(x, px, -35, px, -33.4, INK, 0.6);
      break;
    case 'bass-drum':
      ball(x, 6, -21, 8, WHITE, 0.4);
      x.beginPath();
      x.arc(6, -21, 8, 0, TAU);
      x.strokeStyle = RED;
      x.lineWidth = 1.6;
      x.stroke();
      x.beginPath();
      x.arc(6, -21, 8.6, 0, TAU);
      x.strokeStyle = INK;
      x.lineWidth = 0.4;
      x.stroke();
      ball(x, 6, -21, 2, BLUE, 0.3);
      swing(-15 + 15 * Math.cos(TAU * t), () => {
        arm(9, -30);
        tube(x, 9, -30, 12, -26, 1, '#6B4A2A', { lw: 0.3 });
        ball(x, 12.4, -25.6, 1.6, WHITE, 0.3);
      });
      break;
    case 'snare':
      RD(x, 2, -19, 9, 5, WHITE, op(0.4, 0.25, 0.65, 0.15));
      x.strokeStyle = RED;
      x.lineWidth = 0.8;
      x.strokeRect(2.4, -18.6, 8.2, 4.2);
      x.beginPath();
      x.moveTo(2, -19);
      x.lineTo(4.2, -14);
      x.lineTo(6.4, -19);
      x.lineTo(8.6, -14);
      x.lineTo(11, -19);
      x.strokeStyle = BLUE;
      x.lineWidth = 0.6;
      x.stroke();
      swing(-11 + 11 * Math.cos(TAU * t * 2), () => {
        arm(5, -21);
        tube(x, 5, -21, 9, -20, 0.8, '#6B4A2A', { lw: 0.3 });
      });
      break;
    case 'bugle':
      arm(5, -29);
      ring(7, -29, 3, 2, 1.7, 1);
      tube(x, 3, -32, 8, -31, 1, BRASS, { lw: 0.3 });
      PD(x, [[9, -30], [14, -33], [14, -26]], BRASS, op(0.4, 0.3, 0.6, 0.3, 0.3));
      // Fanion du clairon.
      PD(x, [[8, -28], [13, -28], [13, -24], [10.5, -25.4], [8, -24]], RED, op(0.35, 0.25, 0.6, 0.2));
      x.fillStyle = BRASS;
      x.fillRect(9.5, -27.2, 2, 0.8);
      break;
    case 'baton':
      // Canne du tambour-major, levée et battue au pas.
      swing(7.5 - 17.5 * Math.cos((TAU * t) / 2), () => {
        arm(4, -36);
        tube(x, 4, -36, 9, -52, 1, BLACK, { lw: 0.3 });
        ball(x, 9.3, -53, 1.8, BRASS, 0.35);
        for (let k = 0; k < 4; k++) L(x, 4.8 + k * 1.2, -38.6 - k * 3.8, 5.6 + k * 1.2, -38.8 - k * 3.8, BRASS, 0.5);
      });
      break;
  }
}

// ---------- Fusil à l'épaule (Rifle : repère du marcheur ; canon de (4, −19) à (−5, −46), crosse à la hanche ; `arm` : bras
// (0, −26) → (4,4, −20) couleur `tunic`, silhouettes seulement). ----------
function rifle(x: TintedCtx, a: PropArgs): void {
  tube(x, 4, -19, -5, -46, 1.4, '#2E2A24', { lw: 0.4 });
  tube(x, 0.6, -29, -4.2, -44, 0.7, '#8A9098', { lw: 0.25 });
  PD(x, [[2.6, -21], [5.4, -17], [7, -19], [4.4, -22]], '#5A3E26', op(0.4, 0.3, 0.68, 0.2));
  if (a.arm === true) tube(x, 0, -26, 4.4, -20, 2.4, str(a.tunic, '#1F2A4A'), { lw: 0.4 });
}

// ---------- Accessoires des spectateurs (parade-crowd, repère de la main droite du pantin : main à l'origine ; le bras levé est
// celui du pantin, le balancement autour de la main reste celui du groupe hôte). Drapeau : hampe de y = 1 à −11, tissu 7,2 × 5
// vers +x, pose k = tissu à k/8 de la vague ; `still` : tissu plat ; téléphone immobile (une seule image). ----------
const CROWD_FRAMES = 8;
const crowdKind = (a: PropArgs): 'flag' | 'phone' => (a.kind === 'phone' ? 'phone' : 'flag');
function crowdProp(x: TintedCtx, a: PropArgs, p: PropPaint): void {
  if (crowdKind(a) === 'phone') {
    RRD(x, -1.8, -5.5, 3.6, 5.4, 0.6, '#1E1E24', { lw: 0.3, s: 0.2, l: 0.2 });
    x.fillStyle = '#9FD3FF';
    x.fillRect(-1.3, -5, 2.6, 4.2);
    return;
  }
  const still = a.still === true;
  tube(x, 0, 1, 0, -11, 0.8, POLE, { lw: 0.3 });
  x.save();
  x.translate(0, -11);
  flagArt(x, { w: 7.2, h: 5, t: still ? 0 : (p.frame / CROWD_FRAMES) * FLAG_CYCLE_S, wave: !still, phase: 0 });
  x.restore();
}
const crowdBox = (a: PropArgs): Box => (crowdKind(a) === 'phone' ? [-2.3, -6, 4.6, 6.5] : [-0.6, -12.4, 8.4, 14.1]);

const paintOf = (fn: (x: TintedCtx, a: PropArgs) => void) => (x: TintedCtx, a: PropArgs, _p: PropPaint): void => fn(x, a);

registerProps({
  horse: { box: () => [-23.5, -38.2, 49.7, 38.7], frames: HORSE_FRAMES, paint: horse },
  'parade-flag': { box: paradeFlagBox, frames: FLAG_FRAMES, paint: paradeFlag },
  headgear: { box: (a) => HEAD_BOX[headKind(a)], paint: paintOf(headgear) },
  instrument: { box: (a) => INSTRUMENT_BOX[instrumentKind(a)], frames: INSTRUMENT_FRAMES, paint: instrument },
  rifle: { box: () => [-6, -47, 14, 31], paint: paintOf(rifle) },
  'crowd-prop': { box: crowdBox, frames: CROWD_FRAMES, paint: crowdProp },
});
