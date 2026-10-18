import { INK, TAU } from '../cel';
import { fitText, glint, L, type CelOpts } from '../shop/cel';
import type { TintedCtx } from '../shop/ctx';
import type { FestiveMark } from '../../city/people';
import type { HeavyPiece } from '../../city/shops/moving-crew';
import { FLAG_CYCLE_S } from './install';
import { ball, celD, disc, ED, flagArt, PD, RD, RRD, tube, upright } from './kit';
import { registerProps, type PropArgs, type PropPaint } from './index';

// Déménagement et signes festifs cellulo (G5, tâche 11), portés de la maquette validée (docs/superpowers/maquettes/g5-fetes/
// index.html : `tailgate`, `piece`, `mark`) dans le repère de chaque sprite classique (notes.md §1) : hayon du camion
// (moving-truck.tsx Tailgate), meubles portés à deux (PieceSprite), carton « FRAGILE » (BoxSprite), signes tenus par les
// passants (festive-marks.tsx MarkHeld). Rien n'est lumineux : tout est teint par le registre.

const IRON = '#4A5A58';
const POLE = '#6B5B4A';
// Options de la maquette (lw, sh, shX, li, liW) → celles du kit (lw, s, sx, l, lx).
const op = (lw: number, s: number, sx: number, l: number, lx = 0.18): CelOpts => ({ lw, s, sx, l, lx });

// ---------- Hayon (Tailgate : charnière à l'origine = (TRUCK_REAR, HINGE_Y) du camion ; panneau −1,6..0 × −27..0, rotation
// −90°·open autour de la charnière) : panneau galvanisé à nervures, charnière `ball`. `open` quantifié au 1/8 (0 : fermé,
// vertical ; 1 : rampe à plat vers l'arrière). Le composant pose l'image fermée dans son groupe tournant (la transition CSS de
// la manœuvre est conservée) ; l'ouverture peinte sert au banc et aux rendus figés.
const openOf = (a: PropArgs): number => Math.min(1, Math.max(0, Math.round((Number(a.open) || 0) * 8) / 8));
const tailAngle = (open: number): number => (-90 * open * Math.PI) / 180;
function tailgate(x: TintedCtx, a: PropArgs): void {
  x.save();
  x.rotate(tailAngle(openOf(a)));
  RD(x, -1.6, -27, 1.6, 27, '#D8DCE2', op(0.45, 0.25, 0.5, 0.3, 0.4));
  x.strokeStyle = 'rgba(42,26,24,0.3)';
  x.lineWidth = 0.3;
  for (let y = -24; y < 0; y += 4) {
    x.beginPath();
    x.moveTo(-1.6, y);
    x.lineTo(0, y);
    x.stroke();
  }
  x.restore();
  ball(x, 0, 0, 0.9, IRON, 0.3);
}
function tailgateBox(a: PropArgs): readonly [number, number, number, number] {
  const th = tailAngle(openOf(a));
  const c = Math.cos(th);
  const s = Math.sin(th);
  let x0 = -1.2;
  let y0 = -1.2;
  let x1 = 1.2;
  let y1 = 1.2;
  for (const [px, py] of [[-1.6, -27], [0, -27], [-1.6, 0], [0, 0]] as const) {
    const rx = px * c - py * s;
    const ry = px * s + py * c;
    x0 = Math.min(x0, rx);
    y0 = Math.min(y0, ry);
    x1 = Math.max(x1, rx);
    y1 = Math.max(y1, ry);
  }
  return [x0 - 0.5, y0 - 0.5, x1 - x0 + 1, y1 - y0 + 1];
}

// ---------- Meubles portés (PieceSprite : centrés en x = 0, posés sur les mains à y = 0, longueur `len` en unités ; l'hôte
// applique l'échelle du monde) : vitrine à vitre et reflet, étagère à livres, table retournée pieds en l'air, fauteuil.
export const PIECE_LEN = 15;
const PIECE_H: Readonly<Record<HeavyPiece, number>> = { vitrine: 6, etagere: 7, table: 5, fauteuil: 6 };
const pieceLen = (a: PropArgs): number => Math.max(4, Number(a.len) || PIECE_LEN);
const pieceKind = (a: PropArgs): HeavyPiece => (a.kind as HeavyPiece) in PIECE_H ? (a.kind as HeavyPiece) : 'fauteuil';
function piece(x: TintedCtx, a: PropArgs): void {
  const len = pieceLen(a);
  const x0 = -len / 2;
  switch (pieceKind(a)) {
    case 'vitrine':
      RD(x, x0, -6, len, 6, '#5A606C', op(0.5, 0.3, 0.7, 0.2));
      RD(x, x0 + 0.8, -5.2, len - 1.6, 3.4, '#BFE3F0', op(0.35, 0.15, 0.75, 0));
      glint(x, x0 + 0.8, -5.2, len - 1.6, 3.4, 0.4);
      break;
    case 'etagere': {
      RD(x, x0, -7, len, 7, '#8A5A2B', op(0.5, 0.3, 0.7, 0.2));
      for (const y of [-4.8, -2.4]) RD(x, x0, y, len, 0.6, '#5A3A1A', op(0.25, 0, 0.66, 0.2));
      const books = ['#C84A3A', '#3A6AA8', '#E8B83A'];
      for (let k = 0; k < Math.floor(len / 4); k++) RD(x, x0 + 1 + k * 4, -6.6, 1.2, 1.6, books[k % 3]!, op(0.2, 0, 0.66, 0));
      break;
    }
    case 'table':
      RD(x, x0, -1.6, len, 1.6, '#A8743A', op(0.5, 0.3, 0.7, 0.2));
      for (const px of [x0 + 0.6, -x0 - 1.4]) tube(x, px + 0.4, -1.6, px + 0.4, -5, 0.8, '#7A5226', { lw: 0.35 });
      break;
    default:
      RRD(x, x0, -3, len, 3, 0.8, '#9A2A3A', op(0.5, 0.3, 0.7, 0.2));
      RRD(x, x0, -6, 2.4, 6, 0.8, '#7A1A2A', op(0.45, 0.3, 0.6, 0.2));
      RRD(x, -x0 - 2.4, -5, 2.4, 5, 0.8, '#7A1A2A', op(0.45, 0.3, 0.6, 0.2));
      x.strokeStyle = 'rgba(42,26,24,0.3)';
      x.lineWidth = 0.3;
      x.beginPath();
      x.moveTo(x0 + 3, -2);
      x.lineTo(-x0 - 3, -2);
      x.stroke();
      break;
  }
}
const pieceBox = (a: PropArgs): readonly [number, number, number, number] => {
  const len = pieceLen(a);
  const h = PIECE_H[pieceKind(a)];
  return [-len / 2 - 0.6, -h - 0.6, len + 1.2, h + 1.2];
};

// ---------- Carton (BoxSprite, repère du passant : 4,5..13,5 × −27..−20) : kraft à rabat, ruban, « FRAGILE » redressé.
function box(x: TintedCtx): void {
  RD(x, 4.5, -27, 9, 7, '#C8A06A', op(0.45, 0.3, 0.7, 0.2));
  RD(x, 4.5, -24, 9, 1.1, '#8A6A3A', op(0, 0, 0.66, 0));
  L(x, 9, -27, 9, -20, 'rgba(90,60,30,0.6)', 0.4);
  upright(x, 9, () => fitText(x, 'FRAGILE', 9, -21.6, 1.5, '#8A3A2A', { bold: true, w: 7 }));
}

// ---------- Signes festifs tenus (MarkHeld : repère du passant, tête à −33, main droite « hold » ; le composant les pose à
// l'accroche du pantin par le décalage HELD_AT). 8 poses clés : ballon qui tangue (±2 u sur 2π/1,6 s), note qui flotte
// (±1,5 u sur π s), serpentin qui ondule (π/2 s), drapeau dont le tissu ondule (cycle des drapeaux) ; les autres sont fixes
// (toutes les poses identiques : une seule image cuite, le composant ne les fait pas cycler). `still` : drapeau plat.
export const MARK_FRAMES = 8;
export const MARK_CYCLE_S: Readonly<Record<FestiveMark, number | null>> = {
  crown: null,
  'heart-balloon': TAU / 1.6,
  basket: null,
  lily: null,
  flag: FLAG_CYCLE_S,
  poppy: null,
  streamer: TAU / 4,
  note: TAU / 2,
};
const markKind = (a: PropArgs): FestiveMark => (typeof a.kind === 'string' && a.kind in MARK_CYCLE_S ? (a.kind as FestiveMark) : 'crown');
const markT = (kind: FestiveMark, p: PropPaint): number => ((MARK_CYCLE_S[kind] ?? 0) * p.frame) / MARK_FRAMES;

// Ruban : trait épais cerné d'encre.
function ribbon(x: TintedCtx, path: () => void, c: string, w: number): void {
  x.beginPath();
  path();
  x.strokeStyle = INK;
  x.lineWidth = w + 0.6;
  x.lineCap = 'round';
  x.stroke();
  x.strokeStyle = c;
  x.lineWidth = w;
  x.stroke();
}

function mark(x: TintedCtx, a: PropArgs, p: PropPaint): void {
  const kind = markKind(a);
  const t = markT(kind, p);
  switch (kind) {
    case 'crown':
      PD(x, [[-3.6, -37.2], [-3.6, -41], [-1.8, -39], [0, -42], [1.8, -39], [3.6, -41], [3.6, -37.2]], '#E8B923', op(0.4, 0.3, 0.62, 0.25));
      for (const cx of [-1.8, 0, 1.8]) disc(x, cx, -39.4 + (cx ? 0.6 : -0.8), 0.5, cx ? '#E0305A' : '#3B6FD6', 0.2);
      break;
    case 'heart-balloon': {
      const sw = Math.sin(t * 1.6) * 2;
      x.beginPath();
      x.moveTo(6, -14);
      x.quadraticCurveTo(9 + sw * 0.5, -30, 8 + sw, -44);
      x.strokeStyle = '#6B5B4A';
      x.lineWidth = 0.6;
      x.stroke();
      x.save();
      x.translate(8 + sw, -44);
      celD(
        x,
        () => {
          x.moveTo(0, 0);
          x.bezierCurveTo(-5, -4, -4, -11, 0, -8);
          x.bezierCurveTo(4, -11, 5, -4, 0, 0);
        },
        '#E0305A',
        { box: [-5, -11, 10, 11], ...op(0.45, 0.3, 0.62, 0.25) },
      );
      x.fillStyle = 'rgba(255,255,255,0.5)';
      x.beginPath();
      x.ellipse(-2 * p.dir, -7, 0.9, 1.4, 0.4 * p.dir, 0, TAU);
      x.fill();
      x.restore();
      break;
    }
    case 'basket': {
      PD(x, [[5, -11], [13, -11], [12, -5], [6, -5]], '#B07A3A', op(0.4, 0.3, 0.65, 0.2));
      x.strokeStyle = 'rgba(42,26,24,0.35)';
      x.lineWidth = 0.25;
      for (let bx = 6.5; bx < 12.5; bx += 1.4) {
        x.beginPath();
        x.moveTo(bx, -10.6);
        x.lineTo(bx - 0.4, -5.4);
        x.stroke();
      }
      ribbon(x, () => { x.moveTo(6, -11); x.quadraticCurveTo(9, -16, 12, -11); }, '#B07A3A', 0.6);
      ball(x, 7.5, -12, 1.4, '#F7C6D9', 0.25);
      ball(x, 10.5, -12.2, 1.4, '#FFF2A8', 0.25);
      break;
    }
    case 'lily':
      ribbon(x, () => { x.moveTo(7, -19); x.quadraticCurveTo(9, -27, 7.5, -34); }, '#1F9E4A', 1.4);
      celD(x, () => { x.moveTo(7.2, -22); x.quadraticCurveTo(2.5, -25, 2, -31); x.quadraticCurveTo(6, -28, 7.2, -22); }, '#1F9E4A', { box: [2, -31, 5.5, 9], ...op(0.4, 0.3, 0.6, 0.2) });
      celD(x, () => { x.moveTo(7.4, -24); x.quadraticCurveTo(12, -26, 12.5, -31); x.quadraticCurveTo(8.5, -29, 7.4, -24); }, '#1F9E4A', { box: [7, -31, 5.5, 7], ...op(0.4, 0.35, 0.5, 0) });
      [-34, -31.5, -29].forEach((y, k) => ball(x, 8.2 + (k % 2 === 0 ? 1.6 : -0.2), y, 2.1, '#FFFFFF', 0.3));
      break;
    case 'flag':
      tube(x, 8, -14, 8, -42, 0.8, POLE, { lw: 0.3 });
      x.save();
      x.translate(8, -42);
      flagArt(x, { w: 9, h: 6, t, wave: a.still !== true, phase: 0 });
      x.restore();
      break;
    case 'poppy':
      for (let k = 0; k < 5; k++) {
        const an = (k * TAU) / 5;
        ED(x, 3 + Math.cos(an) * 1.1, -24 + Math.sin(an) * 1.1, 1.1, 0.8, '#C0302B', op(0.3, 0.3, 0.6, 0.2));
      }
      disc(x, 3, -24, 0.6, '#222222', 0);
      break;
    case 'streamer': {
      // En main (poignet à l'origine) : bâtonnet et deux rubans qui ondulent (le chapeau pointu de la maquette va sur la tête,
      // pas à la main : le serpentin tenu suit le dessin Ghibli précédent).
      const w = Math.sin(t * 4);
      tube(x, 0, 1, 0.8, -4, 0.8, POLE, { lw: 0.3 });
      ribbon(x, () => {
        x.moveTo(0.8, -4);
        x.quadraticCurveTo(5 + w, -7, 1.5, -10);
        x.quadraticCurveTo(-2.5 - w, -13, 2.5, -16);
        x.quadraticCurveTo(6.5 + w * 0.8, -19, 2.5 - w * 0.6, -22);
      }, '#E07A8C', 1.2);
      ribbon(x, () => {
        x.moveTo(0.8, -4);
        x.quadraticCurveTo(-3 - w * 0.6, -8, 0, -12);
        x.quadraticCurveTo(2.5 + w * 0.6, -15, -0.5 + w * 0.5, -18);
      }, '#F2C94C', 1);
      break;
    }
    case 'note': {
      const sw = Math.sin(t * 2) * 1.5;
      x.save();
      x.translate(0, sw);
      const head = (cx: number, cy: number): void => {
        ED(x, cx, cy, 2.6, 2, '#FFE27A', op(0, 0.3, 0.6, 0.25));
        x.beginPath();
        x.ellipse(cx, cy, 2.6, 2, 0, 0, TAU);
        x.strokeStyle = '#7A4FD0';
        x.lineWidth = 0.5;
        x.stroke();
      };
      head(6, -41);
      ribbon(x, () => { x.moveTo(8.4, -41); x.lineTo(8.4, -52); x.quadraticCurveTo(12.5, -50.5, 12, -46); }, '#FFE27A', 1.4);
      head(14, -45);
      x.restore();
      break;
    }
  }
}
// Cadres par signe (repère du passant ; ballon, note : course du tangage comprise).
const MARK_BOX: Readonly<Record<FestiveMark, readonly [number, number, number, number]>> = {
  crown: [-4.2, -42.6, 8.4, 6],
  'heart-balloon': [0.5, -55.8, 15.5, 42.6],
  basket: [4.4, -16.8, 9.6, 12.4],
  lily: [1.4, -36.8, 11.7, 18.6],
  flag: [6.8, -43.8, 11.2, 30.6],
  poppy: [0.3, -26.4, 5.4, 4.8],
  streamer: [-5, -24.5, 13, 27],
  note: [2.8, -55.8, 14.6, 19.6],
};

const paintOf = (fn: (x: TintedCtx, a: PropArgs) => void) => (x: TintedCtx, a: PropArgs, _p: PropPaint): void => fn(x, a);

registerProps({
  tailgate: { box: tailgateBox, paint: paintOf(tailgate) },
  piece: { box: pieceBox, paint: paintOf(piece) },
  box: { box: () => [4, -27.5, 10, 8], paint: paintOf((x) => box(x)) },
  mark: { box: (a) => MARK_BOX[markKind(a)], frames: MARK_FRAMES, paint: mark },
});
