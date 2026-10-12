import { INK } from '../cel';
import { L, shadeOf, type CelOpts } from '../shop/cel';
import type { TintedCtx } from '../shop/ctx';
import { ball, disc, flagArt, groundShadow, halo, PD, RD, RRD, tube, wheel } from './kit';
import { registerProps, type PropArgs, type PropPaint } from './index';

// Installations de fête cellulo (G5, tâche 5), portées de la maquette validée (docs/superpowers/maquettes/g5-fetes/index.html :
// `barrier`, `stageFloor`, `truss`, `stageFrame`, `stageSpots`, `heldTruss`, `heldSpot`, `liftArm` (nacelle), `flagCrate`,
// `stowedLadder`, `cargoBike`, `flatbedLoad`) dans le repère de chaque sprite classique d'install-sprites.tsx (notes.md §1).
// Seule la lentille des projecteurs est lumineuse (glowing quand `lit`) ; le reste est teint par le registre. Les flèches du
// bras articulé restent des tubes SVG tracés par la couche (leur longueur change à chaque image) ; les faisceaux de scène
// restent des polygones (stage-band.tsx). Les drapeaux de la caisse sont roulés, fixes (pas de vague).

const IRON = '#4A5A58';
const STEEL = '#9CA3AC';
const GALVA = '#B9C0C8';
const POLE = '#6B5B4A';
// Options de la maquette (lw, sh, shX, li, liW) → celles du kit (lw, s, sx, l, lx).
const op = (lw: number, s: number, sx: number, l: number, lx = 0.18): CelOpts => ({ lw, s, sx, l, lx });
const DARK = '#22252C';

// Barrière Vauban (Barrier : cadre −11..11 × −11..−2,5, barreaux tous les 2,4 de −10,5 à −3, plaque −6..6 × −8,6..−5,6, pieds à
// ±11, patins ±8..±14) : barreaux `tube` rouge/blanc, cadre galvanisé cerné (encre 2, galva 1,1, rehaut), plaque à filet blanc.
function barrier(x: TintedCtx): void {
  groundShadow(x, 1, 0.4, 13, 1.2, 0.16);
  for (const s of [-1, 1]) {
    L(x, s * 8, 0, s * 14, 0, INK, 1.6);
    L(x, s * 8, 0, s * 14, 0, '#4A5058', 0.9);
  }
  tube(x, -11, 0, -11, -2.5, 1.2, GALVA, { lw: 0.35 });
  tube(x, 11, 0, 11, -2.5, 1.2, GALVA, { lw: 0.35 });
  // Barreaux alternés rouge / blanc, derrière le cadre.
  let i = 0;
  for (let bx = -9.5; bx < 10; bx += 2.4, i++) tube(x, bx, -10.5, bx, -3, 1, i % 2 === 0 ? '#D0302A' : '#F4F4F2', { lw: 0.35, li: 0.4 });
  x.beginPath();
  x.roundRect(-11, -11, 22, 8.5, 1);
  x.strokeStyle = INK;
  x.lineWidth = 2;
  x.stroke();
  x.strokeStyle = GALVA;
  x.lineWidth = 1.1;
  x.stroke();
  x.strokeStyle = 'rgba(255,255,255,0.55)';
  x.lineWidth = 0.35;
  x.beginPath();
  x.moveTo(-10.6, -3);
  x.lineTo(-10.6, -10.4);
  x.lineTo(10, -10.4);
  x.stroke();
  RD(x, -6, -8.6, 12, 3, '#D0302A', op(0.45, 0.25, 0.72, 0.2, 0.15));
  x.strokeStyle = 'rgba(255,255,255,0.7)';
  x.lineWidth = 0.3;
  x.strokeRect(-5.5, -8.1, 11, 2);
}

// Scène (STAGE d'install-sprites : half 48, plancher 8, dessus 3, traverse à −60, montants à ±44, projecteurs à (−28, 0, 28 ; −55)).
const S = { half: 48, floor: 8, deck: 3, truss: 60, postX: 44, spotXs: [-28, 0, 28], spotY: -55 } as const;

// Plancher : face avant sombre à lames, dessus bois à lames, nez clair.
function stageFloor(x: TintedCtx): void {
  groundShadow(x, 2, 0.5, S.half + 2, 1.6, 0.16);
  RD(x, -S.half, -S.floor, S.half * 2, S.floor, '#262A34', op(0.5, 0.2, 0.75, 0.08));
  for (const sx of [-36, -12, 12, 36]) L(x, sx, -S.floor + 1.6, sx, 0, 'rgba(90,96,110,0.6)', 0.6);
  x.strokeStyle = 'rgba(255,255,255,0.08)';
  x.lineWidth = 0.4;
  for (let sx = -S.half + 6; sx < S.half; sx += 6) {
    x.beginPath();
    x.moveTo(sx, -S.floor + 2);
    x.lineTo(sx, -0.6);
    x.stroke();
  }
  PD(x, [[-S.half + 1.5, -S.floor - S.deck], [S.half - 1.5, -S.floor - S.deck], [S.half, -S.floor], [-S.half, -S.floor]], '#9A7A5A', op(0.5, 0.22, 0.78, 0.22, 0.15));
  x.strokeStyle = 'rgba(42,26,24,0.35)';
  x.lineWidth = 0.3;
  for (let sx = -S.half + 4; sx < S.half; sx += 4) {
    x.beginPath();
    x.moveTo(sx, -S.floor - S.deck);
    x.lineTo(sx + 0.4, -S.floor);
    x.stroke();
  }
  RD(x, -S.half, -S.floor, S.half * 2, 1.6, '#6A5848', op(0.4, 0.2, 0.68, 0.25));
}

// Treillis (Truss) : zigzag ombré entre deux tubes alu (±1,5 de l'axe), vertical ou horizontal.
function truss(x: TintedCtx, x1: number, y1: number, x2: number, y2: number, c: string = STEEL): void {
  const v = x1 === x2;
  const len = v ? Math.abs(y2 - y1) : Math.abs(x2 - x1);
  const n = Math.max(1, Math.round(len / 4));
  x.strokeStyle = shadeOf(c, 0.25);
  x.lineWidth = 0.45;
  x.beginPath();
  for (let i = 0; i <= n; i++) {
    const s = i / n;
    const side = i % 2 === 0 ? -1.5 : 1.5;
    const px = v ? x1 + side : x1 + (x2 - x1) * s;
    const py = v ? y1 + (y2 - y1) * s : y1 + side;
    if (i) x.lineTo(px, py);
    else x.moveTo(px, py);
  }
  x.stroke();
  if (v) {
    tube(x, x1 - 1.5, y1, x2 - 1.5, y2, 0.9, c, { lw: 0.35 });
    tube(x, x1 + 1.5, y1, x2 + 1.5, y2, 0.9, c, { lw: 0.35 });
  } else {
    tube(x, x1, y1 - 1.5, x2, y2 - 1.5, 0.9, c, { lw: 0.35 });
    tube(x, x1, y1 + 1.5, x2, y2 + 1.5, 0.9, c, { lw: 0.35 });
  }
}

// Ossature : toile de fond bleu nuit à plis entre les montants, deux montants en treillis, traverse.
function stageFrame(x: TintedCtx): void {
  const top = -S.truss + 1.5;
  const h = S.truss - S.floor - S.deck - 1.5;
  RD(x, -S.postX - 1.5, top, S.postX * 2 + 3, h, '#2A3050', op(0.5, 0.25, 0.8, 0.1, 0.08));
  for (const px of [-30, -15, 0, 15, 30]) {
    x.fillStyle = 'rgba(20,22,50,0.5)';
    x.fillRect(px - 0.6, top, 1.4, h);
    x.fillStyle = 'rgba(120,130,200,0.18)';
    x.fillRect(px + 1, top, 0.8, h);
  }
  truss(x, -S.postX, -S.floor - S.deck, -S.postX, -S.truss);
  truss(x, S.postX, -S.floor - S.deck, S.postX, -S.truss);
  truss(x, -S.postX - 2, -S.truss, S.postX + 2, -S.truss);
}

// Projecteurs (StageSpots : tête 4,4 × 4,6 inclinée de −x/3°, lentille r 1,6 à (0, 3)) : tête à volets, lentille `ball` ;
// allumés : lentille claire et halo r 4,5, dans glowing (ils gardent leur couleur la nuit).
function stageSpots(x: TintedCtx, _a: PropArgs, p: PropPaint): void {
  for (const sx of S.spotXs) {
    x.save();
    x.translate(sx, S.spotY);
    tube(x, 0, -3.5, 0, -1.5, 0.7, IRON, { lw: 0.3 });
    x.rotate(((-sx / 3) * Math.PI) / 180);
    RRD(x, -2.2, -1.8, 4.4, 4.6, 0.8, DARK, op(0.45, 0.3, 0.6, 0.22, 0.3));
    for (const s of [-1, 1]) PD(x, [[s * 2.2, 2.4], [s * 3.2, 4.2], [s * 2.6, 4.4], [s * 1.6, 2.8]], DARK, op(0.35, 0.2, 0.68, 0.2));
    ball(x, 0, 3, 1.6, p.lit ? '#FFF1B8' : '#5A5F6A', 0.35);
    if (p.lit) {
      x.glowing(() => {
        halo(x, 0, 3, 4.5, '#FFF1B8', 0.45);
        disc(x, 0, 3, 1.6, '#FFF8D8', 0);
        disc(x, -0.4 * p.dir, 2.6, 0.6, '#FFFFFF', 0);
      });
    }
    x.restore();
  }
}

// Pièces tenues par l'ouvrier de la nacelle (main à y = 0, vers +x) : tronçon de treillis (−5..9), projecteur (lentille à (3,8, 0)).
function heldTruss(x: TintedCtx): void {
  truss(x, -5, 0, 9, 0);
}
function heldSpot(x: TintedCtx): void {
  tube(x, 0, 0, 0, -2.4, 0.7, IRON, { lw: 0.3 });
  RRD(x, -2.4, -2.4, 6, 4.8, 0.9, DARK, op(0.45, 0.3, 0.6, 0.22, 0.3));
  ball(x, 3.8, 0, 1.6, '#5A5F6A', 0.35);
}

// Nacelle (LiftTruck, unité u = 1 : l'hôte applique `scale(u)` ; bas de la nacelle à l'origine) : caisse blanche à liseré
// jaune, lisse et rambarde en tubes fer (2,2 u au-dessus du bord). L'ouvrier est dessiné avant, la paroi cache ses jambes.
const YELLOW = '#E8B923';
function liftBucket(x: TintedCtx): void {
  const bw = 10;
  const bh = 7;
  RRD(x, -bw / 2, -bh, bw, bh, 0.8, '#F2F2F0', op(0.5, 0.25, 0.7, 0.15));
  x.strokeStyle = YELLOW;
  x.lineWidth = 0.8;
  x.beginPath();
  x.roundRect(-bw / 2 + 0.4, -bh + 0.4, bw - 0.8, bh - 0.8, 0.6);
  x.stroke();
  tube(x, -bw / 2, -bh, bw / 2, -bh, 0.9, IRON, { lw: 0.35 });
  tube(x, -bw / 2, -bh - 2.2, -bw / 2, -bh, 0.6, IRON, { lw: 0.3 });
  tube(x, bw / 2, -bh - 2.2, bw / 2, -bh, 0.6, IRON, { lw: 0.3 });
  tube(x, -bw / 2, -bh - 2.2, bw / 2, -bh - 2.2, 0.6, IRON, { lw: 0.3 });
}

// Caisse de drapeaux (FlagCrate : w × 5,5, bas à y = 0) : bois à lattes ; `n` petits drapeaux roulés qui dépassent (hampes de 6
// à partir de −5, tissu 3,6 × 2,4), répartis comme les repères `data-stored-item` du classique.
const crateN = (a: PropArgs): number => Math.max(0, Math.floor(Number(a.n) || 0));
const crateW = (a: PropArgs): number => Math.max(4, Number(a.w) || 14);
const crateFlagX = (i: number, n: number, w: number): number => -w / 2 + 1.5 + ((i + 0.5) * (w - 3)) / Math.max(1, n);
function flagCrate(x: TintedCtx, n: number, w: number): void {
  for (let i = 0; i < n; i++) {
    const fx = crateFlagX(i, n, w);
    tube(x, fx, -5, fx, -11, 0.6, POLE, { lw: 0.3 });
    x.save();
    x.translate(fx, -11);
    flagArt(x, { w: 3.6, h: 2.4, t: 0, wave: false, phase: 0 });
    x.restore();
  }
  RRD(x, -w / 2, -5.5, w, 5.5, 0.6, '#9A6B3E', op(0.45, 0.28, 0.7, 0.2, 0.15));
  L(x, -w / 2, -2.8, w / 2, -2.8, 'rgba(60,36,18,0.8)', 0.5);
  x.strokeStyle = 'rgba(42,26,24,0.3)';
  x.lineWidth = 0.25;
  for (let lx = -w / 2 + 2; lx < w / 2; lx += 2.5) {
    x.beginPath();
    x.moveTo(lx, -5.5);
    x.lineTo(lx, 0);
    x.stroke();
  }
}
function flagCrateBox(a: PropArgs): readonly [number, number, number, number] {
  const n = crateN(a);
  const w = crateW(a);
  const x1 = Math.max(w / 2, n ? crateFlagX(n - 1, n, w) + 3.6 : 0) + 0.3;
  return [-w / 2 - 0.3, -11.5, x1 + w / 2 + 0.3, 11.8];
}

// Échelle couchée (StowedLadder : rails à ±1, longueur len, barreaux tous les ~3) : rails alu `tube`, barreaux encrés.
const ladderLen = (a: PropArgs): number => Math.max(4, Number(a.len) || 30);
function stowedLadder(x: TintedCtx, len: number): void {
  tube(x, -len / 2, 1, len / 2, 1, 0.9, '#9EA6AE', { lw: 0.35 });
  tube(x, -len / 2, -1, len / 2, -1, 0.9, '#9EA6AE', { lw: 0.35 });
  const n = Math.max(2, Math.round(len / 3));
  for (let i = 0; i < n; i++) {
    const rx = -len / 2 + 0.5 + (i * (len - 1)) / (n - 1);
    L(x, rx, -1, rx, 1, INK, 0.9);
    L(x, rx, -1, rx, 1, '#B9C0C8', 0.45);
  }
}

// Vélo porteur (CargoBike : roues r 5 à (−20, −5) et (14, −5), cadre vert, selle −6,5..−1,5 × −17,4, guidon (8..12, −18),
// caisse à (−25, −12) w 20, échelle à (−20, −21) len 34) : roues `wheel`, cadre `tube`, pédalier. Le cycliste reste le pantin.
function cargoBike(x: TintedCtx, a: PropArgs): void {
  const fr = '#2F7D5B';
  wheel(x, -20, -5, 5);
  wheel(x, 14, -5, 5);
  const seg = (x1: number, y1: number, x2: number, y2: number): void => tube(x, x1, y1, x2, y2, 1.4, fr, { lw: 0.45 });
  seg(-36, -12, -8, -12);
  seg(-30, -12, -20, -5);
  seg(-12, -12, -20, -5);
  seg(-20, -5, -6, -12);
  seg(-6, -12, 8, -12);
  seg(8, -12, 14, -5);
  seg(-6, -12, -4, -16);
  seg(8, -12, 9, -18);
  ball(x, -4, -12, 1.6, '#2A2D34', 0.3);
  RRD(x, -6.5, -17.4, 5, 1.4, 0.6, '#2A2D34', op(0.35, 0.2, 0.68, 0.2));
  tube(x, 8, -18, 12, -18.5, 1.1, '#2A2D34', { lw: 0.35 });
  x.save();
  x.translate(-25, -12);
  flagCrate(x, crateN({ n: a.flags ?? 0 }), 20);
  x.restore();
  if (a.ladder === true) {
    x.save();
    x.translate(-20, -21);
    stowedLadder(x, 34);
    x.restore();
  }
}

// Chargement du plateau (Flatbed : deck à −11 ; planches 27 × 1,9 à x = −44 ; treillis −15..3 ; projecteurs à 5, 11, 17 ;
// comptoirs 24 × 2,1 avec leurs deux fûts ; toiles roulées 22 × 2,5) : les pièces encore à poser, en piles tassées.
const loadN = (a: PropArgs, k: string): number => Math.max(0, Math.floor(Number(a[k]) || 0));
const DECK = -11;
function flatbedLoad(x: TintedCtx, a: PropArgs): void {
  const counters = loadN(a, 'counters');
  const rolls = loadN(a, 'rolls');
  if (loadN(a, 'floor')) for (let i = 0; i < 4; i++) RD(x, -44, DECK - 2 * (i + 1), 27, 1.9, i % 2 ? '#7A6048' : '#9A7E62', op(0.3, 0.22, 0.75, 0.15));
  if (loadN(a, 'frame')) truss(x, -15, DECK - 3.4, 3, DECK - 3.4);
  if (loadN(a, 'spots')) {
    for (const sx of [5, 11, 17]) {
      RRD(x, sx, DECK - 5.5, 5.2, 5.5, 0.8, DARK, op(0.4, 0.3, 0.6, 0.2, 0.3));
      ball(x, sx + 2.6, DECK - 2.8, 1.4, '#5A5F6A', 0.3);
    }
  }
  for (let i = 0; i < counters; i++) {
    RD(x, -44, DECK - 2.3 * (i + 1), 24, 2.1, '#8A5A34', op(0.3, 0.25, 0.75, 0.15));
    for (let j = 0; j < 2; j++) RRD(x, -18 + i * 7.4 + j * 3.5, DECK - 5.2, 3.2, 5.2, 0.8, '#9AA2AC', op(0.35, 0.3, 0.6, 0.3, 0.25));
  }
  for (let i = 0; i < rolls; i++) {
    const y = DECK - 2.3 * counters - 2.6 * (i + 1);
    RRD(x, -43, y, 22, 2.5, 1.2, '#C8322E', op(0.35, 0.3, 0.6, 0.3));
    for (const rx of [-38, -31, -25]) RD(x, rx, y, 2, 2.5, '#F4F1EA', op(0.2, 0.25, 0.5, 0));
  }
}
// Cadre : à droite, les projecteurs (22,2) ou la rangée de fûts du dernier comptoir (−18 + 7,4·(n − 1) + 3,5 + 3,2 : jusqu'à
// 8 stands sur une rue large) ; en haut, les planches ou la pile comptoirs + toiles.
function flatbedLoadBox(a: PropArgs): readonly [number, number, number, number] {
  const counters = loadN(a, 'counters');
  const x1 = Math.max(22.7, counters ? -18 + (counters - 1) * 7.4 + 6.7 + 0.5 : 0);
  const y0 = Math.min(-19.5, DECK - 2.3 * counters - 2.6 * loadN(a, 'rolls') - 0.3);
  return [-44.5, y0, x1 + 44.5, -10.5 - y0];
}

const paintOf = (fn: (x: TintedCtx, a: PropArgs) => void) => (x: TintedCtx, a: PropArgs, _p: PropPaint): void => fn(x, a);

registerProps({
  barrier: { box: () => [-15, -12.2, 30, 14.2], paint: paintOf(barrier) },
  'stage-floor': { box: () => [-50.5, -11.5, 103, 14], paint: paintOf(stageFloor) },
  'stage-frame': { box: () => [-47, -62.5, 94, 52], paint: paintOf(stageFrame) },
  'stage-spots': { box: () => [-34, -59.5, 68, 12.5], paint: stageSpots },
  'held-truss': { box: () => [-6, -2.6, 16, 5.2], paint: paintOf(heldTruss) },
  'held-spot': { box: () => [-2.8, -3.2, 8.6, 6], paint: paintOf(heldSpot) },
  'flag-crate': { box: flagCrateBox, paint: paintOf((x, a) => flagCrate(x, crateN(a), crateW(a))) },
  'lift-bucket': { box: () => [-5.8, -9.8, 11.6, 10.3], paint: paintOf(liftBucket) },
  'cargo-bike': { box: () => [-38, -23.5, 58.5, 25], paint: paintOf(cargoBike) },
  'flatbed-load': { box: flatbedLoadBox, paint: paintOf(flatbedLoad) },
  'stowed-ladder': { box: (a) => [-ladderLen(a) / 2 - 0.8, -2, ladderLen(a) + 1.6, 4], paint: paintOf((x, a) => stowedLadder(x, ladderLen(a))) },
});
