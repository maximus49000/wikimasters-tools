import { hexRgb } from '../color';
import { FALL } from '../../city/night-light';
import { PALS } from '../../city/concert';
import { mulberry32 } from '../../scene-world';
import { INK, pick, TAU } from '../cel';
import { L, type CelOpts } from '../shop/cel';
import { tintedCtx, type TintedCtx } from '../shop/ctx';
import { stageFloor } from './install';
import { ball, disc, ED, groundShadow, halo, PD, RD, RRD, tube, upright } from './kit';
import { registerProps, type PropArgs, type PropPaint } from './index';

// Fête de la musique cellulo (G5, tâche 7), portée de la maquette validée (docs/superpowers/maquettes/g5-fetes/index.html :
// `keg`, `beerCup`, `standCounter`, `standAwning`, `carriedCounter`, `heldRoll`, `stageProp`, `stageExtras`) dans le repère
// de chaque sprite classique de music-sprites.tsx (notes.md §1). Parties lumineuses (glowing quand `lit`) : ampoules de la
// guirlande de l'auvent, lentilles des lyres, des contre-jours et cellules de la rampe LED des extras de concert. Le plancher
// révélé (`stage-glow`) est peint non teint, dans la couleur de la palette du moment, et masqué par un dégradé.

const IRON = '#4A5A58';
const WOOD = '#8A5A34';
const DARK = '#22252C';
const BEER = '#E9B533';
const FOAM = '#FBF6E6';
const STEEL = '#9AA2AC';
const op = (lw: number, s: number, sx: number, l: number, lx = 0.18): CelOpts => ({ lw, s, sx, l, lx });

// Fût (Keg : −3,2..3,2 × −8,5..0, cerclages à −6,2 et −2,6, bonde −1..1 × −9,6) : acier modelé, cerclages sombres.
function keg(x: TintedCtx, kx = 0): void {
  RRD(x, kx - 3.2, -8.5, 6.4, 8.5, 1.2, STEEL, op(0.45, 0.32, 0.6, 0.3, 0.25));
  RD(x, kx - 3.2, -6.2, 6.4, 0.9, '#6E7680', op(0.3, 0.25, 0.6, 0.2));
  RD(x, kx - 3.2, -2.6, 6.4, 0.9, '#6E7680', op(0.3, 0.25, 0.6, 0.2));
  RD(x, kx - 1, -9.6, 2, 1.2, '#3B3F4A', op(0.3, 0, 0.66, 0.2));
}

// Gobelet (BeerCup : trapèze de 2,6 à 2 de large, 3,6 de haut, mousse 2,8 × 1 au-dessus), bas en (cx, cy).
function beerCup(x: TintedCtx, cx = 0, cy = 0): void {
  PD(x, [[cx - 1.3, cy - 3.6], [cx + 1.3, cy - 3.6], [cx + 1, cy], [cx - 1, cy]], BEER, op(0.3, 0.3, 0.6, 0.3, 0.3));
  RRD(x, cx - 1.4, cy - 4.4, 2.8, 1, 0.4, FOAM, op(0.25, 0.15, 0.7, 0));
}

// Chope dessinée (enseigne et bandeau : glyphe, redressé à −1) : corps, mousse, anse.
function mug(x: TintedCtx, x0: number, y0: number, w: number, h: number, lw: number): void {
  upright(x, x0 + w / 2, () => {
    RRD(x, x0, y0, w, h, 0.8, BEER, op(0.4, 0.3, 0.6, 0.3, 0.3));
    RRD(x, x0, y0 - 1, w, h * 0.3, 0.8, FOAM, op(0.35, 0.15, 0.7, 0));
    x.beginPath();
    x.moveTo(x0 + w, y0 + h * 0.2);
    x.lineTo(x0 + w + lw * 1.4, y0 + h * 0.2);
    x.lineTo(x0 + w + lw * 1.4, y0 + h * 0.72);
    x.lineTo(x0 + w, y0 + h * 0.72);
    x.strokeStyle = INK;
    x.lineWidth = lw * 1.6;
    x.stroke();
    x.strokeStyle = BEER;
    x.lineWidth = lw;
    x.stroke();
  });
}

// Comptoir (StandCounter : 52 × 12, zinc 55 × 2 à −13,6, tireuse −1,2..1,2 × −21..−13,6, barre −4,5..4,5 à −21,5 et deux becs,
// 4 gobelets, deux fûts côté −x à −31 et −38 ; l'hôte retourne l'image pour `side` = −1) : planches, zinc chromé, chope sur le
// bandeau, tireuse chromée à deux becs noirs.
function standCounter(x: TintedCtx): void {
  keg(x, -31);
  keg(x, -38);
  groundShadow(x, 2, 0.4, 28, 1.6, 0.16);
  RD(x, -26, -12, 52, 12, WOOD, op(0.5, 0.25, 0.74, 0.2, 0.12));
  for (const px of [-13, 0, 13]) L(x, px, -10.5, px, 0, 'rgba(60,36,18,0.7)', 0.6);
  x.strokeStyle = 'rgba(42,26,24,0.3)';
  x.lineWidth = 0.3;
  for (let y = -9; y < 0; y += 3) {
    x.beginPath();
    x.moveTo(-26, y);
    x.lineTo(26, y);
    x.stroke();
  }
  RRD(x, -27.5, -13.6, 55, 2, 0.6, '#C4C8CC', op(0.45, 0.3, 0.7, 0.35, 0.2));
  mug(x, -6, -9.4, 8, 6.6, 1);
  // Tireuse chromée.
  RRD(x, -1.2, -21, 2.4, 7.4, 0.6, '#C9CED4', op(0.4, 0.3, 0.55, 0.4, 0.3));
  RRD(x, -4.5, -21.5, 9, 1.8, 0.6, '#C9CED4', op(0.4, 0.3, 0.6, 0.4, 0.25));
  for (const px of [-4.4, 3.2]) {
    RRD(x, px, -25, 1.2, 3.6, 0.5, '#2A2D34', op(0.3, 0.2, 0.66, 0.3));
    ball(x, px + 0.6, -25.2, 0.9, '#2A2D34', 0.3);
  }
  for (const px of [-18, -15, 14, 17]) beerCup(x, px, -13.6);
}

// Auvent (StandAwning : poteaux du fond ±26 de −8 à −36, de devant ±29 de 0 à −30, toile rayée entre −30 et −36 en glissant de
// 2,4, lambrequin 8 festons de 7,75, enseigne −7..7 × −45..−36) : bandes ombrées, lambrequin + ombre portée, enseigne-chope ;
// `garland` : guirlande d'ampoules sous le lambrequin (allumées la nuit : halos dans glowing).
const AWN = { front: -30, back: -36, half: 31, backY: -8 } as const;
const BULB_Y = -25.4;
const BULB_COLORS = ['#FFE27A', '#FF8A6A', '#8AE0FF'] as const;
const garlandOn = (a: PropArgs): boolean => a.garland === true;
function standAwning(x: TintedCtx, a: PropArgs, p: PropPaint): void {
  for (const px of [-26, 26]) tube(x, px, AWN.backY, px, AWN.back, 1, '#5E636C', { lw: 0.35 });
  for (const px of [-29, 29]) tube(x, px, 0, px, AWN.front, 1.2, '#6E747E', { lw: 0.4 });
  for (let i = 0; i < 10; i++) {
    const x0 = -AWN.half + i * 6.2;
    PD(x, [[x0, AWN.front], [x0 + 6.2, AWN.front], [(x0 + 6.2) * 0.92 + 2.4, AWN.back], [x0 * 0.92 + 2.4, AWN.back]], i % 2 === 0 ? '#C8322E' : '#F4F1EA', op(0.3, 0.22, 0.6, 0.12));
  }
  const scallops = (y: number): void => {
    x.moveTo(-AWN.half, y);
    for (let k = 0; k < 8; k++) {
      const sx = -AWN.half + k * 7.75;
      x.quadraticCurveTo(sx + 3.9, y + 3.2, sx + 7.75, y);
    }
  };
  x.beginPath();
  scallops(AWN.front);
  x.closePath();
  x.fillStyle = '#C8322E';
  x.fill();
  x.strokeStyle = INK;
  x.lineWidth = 0.4;
  x.stroke();
  // Ombre portée du lambrequin sur la toile.
  x.fillStyle = 'rgba(70,50,130,0.25)';
  x.beginPath();
  scallops(AWN.front + 0.3);
  x.lineTo(AWN.half, AWN.front - 1.2);
  x.lineTo(-AWN.half, AWN.front - 1.2);
  x.fill();
  // Enseigne.
  RRD(x, -7, AWN.back - 9, 14, 9, 1.5, '#2A2D34', op(0.5, 0.28, 0.7, 0.15, 0.15));
  mug(x, -3.6, AWN.back - 6.6, 5.2, 5, 0.8);
  if (!garlandOn(a)) return;
  // Guirlande : fil qui pend d'un feston à l'autre, une ampoule à chaque creux.
  x.strokeStyle = 'rgba(42,26,24,0.8)';
  x.lineWidth = 0.3;
  x.beginPath();
  x.moveTo(-28, BULB_Y - 1.2);
  for (let bx = -28; bx < 28; bx += 7) x.quadraticCurveTo(bx + 3.5, BULB_Y - 0.3, bx + 7, BULB_Y - 1.2);
  x.stroke();
  for (let bx = -28; bx <= 28; bx += 7) {
    const c = pick(BULB_COLORS, mulberry32(bx + 50));
    L(x, bx, BULB_Y - 1.2, bx, BULB_Y - 0.6, '#3A3E48', 0.4);
    if (p.lit) {
      x.glowing(() => {
        halo(x, bx, BULB_Y, 4, c, 0.5);
        disc(x, bx, BULB_Y, 0.9, c, 0);
        disc(x, bx, BULB_Y, 0.5, '#FFF8D8', 0);
      });
    } else disc(x, bx, BULB_Y, 0.9, c, 0.25);
  }
}

// Comptoir porté à deux (CarriedCounter : comptoir sans tireuse, deux fûts couchés sur le zinc à x = −12 et 2).
function carriedCounter(x: TintedCtx): void {
  RD(x, -26, -12, 52, 12, WOOD, op(0.5, 0.25, 0.74, 0.2, 0.12));
  for (const px of [-13, 0, 13]) L(x, px, -10.5, px, 0, 'rgba(60,36,18,0.7)', 0.6);
  RRD(x, -27.5, -13.6, 55, 2, 0.6, '#C4C8CC', op(0.45, 0.3, 0.7, 0.35, 0.2));
  for (const px of [-12, 2]) {
    RRD(x, px, -19.6, 8.5, 6, 1.2, STEEL, op(0.45, 0.3, 0.6, 0.3, 0.25));
    RD(x, px + 2.6, -19.6, 0.9, 6, '#6E7680', op(0.25, 0, 0.66, 0));
    RD(x, px + 5.6, -19.6, 0.9, 6, '#6E7680', op(0.25, 0, 0.66, 0));
  }
}

// Toile de l'auvent roulée (HeldRoll : main à y = 0, vers +x ; −2..8 × ±1,6) : rouleau rayé, bout de toile en spirale.
function heldRoll(x: TintedCtx): void {
  RRD(x, -2, -1.6, 10, 3.2, 1.6, '#C8322E', op(0.4, 0.3, 0.6, 0.3));
  for (const px of [1, 5]) RD(x, px, -1.6, 2, 3.2, '#F4F1EA', op(0.2, 0.25, 0.5, 0));
  ED(x, 8, 0, 0.9, 1.6, '#F4E0D8', op(0.3, 0, 0.66, 0));
  x.strokeStyle = '#C8322E';
  x.lineWidth = 0.4;
  x.beginPath();
  x.arc(8, 0, 0.5, 0, TAU);
  x.stroke();
}

// Instruments de scène (GhibliProp de stage-band.tsx : repère du pantin, poignet droit à l'origine ; `dx`, `dy` : main gauche
// relative à la main droite ; `foot` : y du plancher sous la main, 9 en marche). Guitare : caisse sous la main qui gratte,
// manche vers la main gauche et un peu au-delà ; micro à la main sur son pied ; caisse claire à la taille entre les deux
// mains, sur son pied, baguettes des deux mains vers la peau.
type StageProp = { kind: 'guitar' | 'mic' | 'drum'; dx: number; dy: number; foot: number };
const num = (v: unknown, d = 0): number => (Number.isFinite(Number(v)) ? Number(v) : d);
const stagePropArgs = (a: PropArgs): StageProp => ({ kind: a.kind === 'mic' || a.kind === 'drum' ? a.kind : 'guitar', dx: num(a.dx), dy: num(a.dy), foot: num(a.foot) });
function stageProp(x: TintedCtx, a: PropArgs): void {
  const { kind, dx, dy, foot } = stagePropArgs(a);
  if (kind === 'guitar') {
    const bx = -dx * 0.12;
    const by = -dy * 0.12 + 0.4;
    const ang = Math.atan2(dy, dx);
    tube(x, 0, 0, dx * 1.3, dy * 1.3, 0.9, '#5A3A22', { lw: 0.3 });
    ED(x, bx, by, 3.2, 2.5, '#B5723A', { ...op(0.45, 0.3, 0.62, 0.25), rot: ang });
    ED(x, bx + 0.3, by - 0.2, 2, 1.9, '#C8884A', { lw: 0, s: 0, l: 0.1, rot: ang });
    disc(x, bx, by, 0.8, '#2A1A10', 0.3);
    for (let k = 0; k < 3; k++) L(x, bx + k * 0.25, by - 0.6 + k * 0.4, dx * 1.25, dy * 1.25 - 0.3 + k * 0.3, 'rgba(255,240,200,0.6)', 0.15);
    return;
  }
  if (kind === 'mic') {
    tube(x, 0.6, -0.6, 0.6, foot, 0.6, '#2A2D34', { lw: 0.25 });
    tube(x, -1.8, foot, 3, foot, 0.7, '#2A2D34', { lw: 0.25 });
    ball(x, 0.6, -1.4, 1.2, '#4A4E58', 0.3);
    x.strokeStyle = 'rgba(255,255,255,0.3)';
    x.lineWidth = 0.2;
    x.beginPath();
    x.arc(0.6, -1.4, 0.75, 0, TAU);
    x.stroke();
    return;
  }
  const mx = dx / 2;
  const top = dy / 2 + 1.4;
  tube(x, mx - 4.4, top + 6, mx - 5, foot, 0.6, '#2A2D34', { lw: 0.25 });
  tube(x, mx + 4.4, top + 6, mx + 5, foot, 0.6, '#2A2D34', { lw: 0.25 });
  RRD(x, mx - 5.5, top, 11, 6.5, 1, '#B02A2A', op(0.45, 0.28, 0.7, 0.22, 0.15));
  RRD(x, mx - 5.5, top, 11, 1.5, 0.7, '#E8E8E0', op(0.3, 0.2, 0.7, 0));
  RD(x, mx - 5.5, top + 5.6, 11, 0.9, '#E8E8E0', op(0.25, 0.2, 0.7, 0));
  for (let lx = mx - 4; lx < mx + 4.5; lx += 2.2) L(x, lx, top + 1.5, lx, top + 5.6, 'rgba(42,26,24,0.4)', 0.25);
  tube(x, 0, 0, mx - 1.2, top + 0.2, 0.6, '#D8C8A0', { lw: 0.25 });
  tube(x, dx, dy, mx + 1.2, top + 0.2, 0.6, '#D8C8A0', { lw: 0.25 });
}
function stagePropBox(a: PropArgs): readonly [number, number, number, number] {
  const { kind, dx, dy, foot } = stagePropArgs(a);
  const bounds = (xs: number[], ys: number[], m: number): readonly [number, number, number, number] => {
    const x0 = Math.min(...xs) - m;
    const y0 = Math.min(...ys) - m;
    return [x0, y0, Math.max(...xs) + m - x0, Math.max(...ys) + m - y0];
  };
  if (kind === 'guitar') {
    const bx = -dx * 0.12;
    const by = -dy * 0.12 + 0.4;
    return bounds([0, dx * 1.3, bx - 3.6, bx + 3.6], [0, dy * 1.3, by - 3.6, by + 3.6], 0.8);
  }
  if (kind === 'mic') return bounds([-1.8, 3], [-2.6, foot], 0.8);
  const mx = dx / 2;
  const top = dy / 2 + 1.4;
  return bounds([0, dx, mx - 5.5, mx + 5.5], [0, dy, top, foot], 0.8);
}

// Scène (STAGE d'install-sprites) : plancher 8, dessus 3, traverse à −60, montants à ±44.
const S = { floor: 8, deck: 3, truss: 60, postX: 44 } as const;
const DECK_Y = -S.floor - S.deck;
const LYRE_XS = [-40, -14, 14, 40] as const;
const BACK_XS = [-30, 0, 30] as const;

// Extras de concert (notes §8) : façade son (deux piles de trois enceintes contre les montants, x ±36..±44, sur le plancher),
// trois retours en coin devant les musiciens (x −24, 0, 24), rampe LED sur la traverse (−40..40, 40 cellules), quatre lyres
// sous la traverse (x ±40, ±14), trois contre-jours au fond (x ±30, 0 ; y −40). De jour tout est éteint ; `lit` : cellules,
// lentilles des lyres et des contre-jours allumées (glowing).
function stageExtras(x: TintedCtx, _a: PropArgs, p: PropPaint): void {
  for (const sx of [-1, 1]) {
    const px = sx > 0 ? 36 : -44;
    for (let i = 0; i < 3; i++) {
      RRD(x, px, DECK_Y - 6.5 * (i + 1), 8, 6.2, 0.6, '#1E2026', op(0.45, 0.3, 0.65, 0.2));
      ball(x, px + 4, DECK_Y - 6.5 * i - 3.4, 1.9, '#2E323C', 0.3);
      disc(x, px + 4, DECK_Y - 6.5 * i - 3.4, 0.6, '#3A3E48', 0);
    }
  }
  for (const px of [-24, 0, 24]) PD(x, [[px - 4, DECK_Y], [px + 4, DECK_Y], [px + 3, DECK_Y - 3.2], [px - 4, DECK_Y - 2]], DARK, op(0.4, 0.3, 0.6, 0.2));
  RD(x, -40, -S.truss - 3.4, 80, 2.2, '#1A1C22', op(0.4, 0.2, 0.66, 0.1));
  for (let i = 0; i < 40; i++) {
    const cx = -39.5 + i * 2;
    if (p.lit) {
      x.glowing(() => {
        x.fillStyle = i % 2 ? '#FFD080' : '#FFF4D0';
        x.fillRect(cx, -S.truss - 3, 1.4, 1.4);
      });
    } else {
      x.fillStyle = '#3A3E48';
      x.fillRect(cx, -S.truss - 3, 1.4, 1.4);
    }
  }
  for (const px of LYRE_XS) {
    tube(x, px, -S.truss + 1.5, px, -S.truss + 3.2, 0.8, IRON, { lw: 0.3 });
    RRD(x, px - 1.6, -S.truss + 3.2, 3.2, 2.4, 0.6, DARK, op(0.4, 0.3, 0.6, 0.25));
    RRD(x, px - 1.2, -S.truss + 5.4, 2.4, 2.6, 0.5, '#2A2E36', op(0.35, 0.3, 0.6, 0.2));
    if (p.lit) x.glowing(() => disc(x, px, -S.truss + 7.4, 0.8, '#FFFFFF', 0));
  }
  for (const px of BACK_XS) {
    RRD(x, px - 1.8, -42, 3.6, 2.6, 0.5, DARK, op(0.35, 0.3, 0.6, 0.2));
    if (p.lit) x.glowing(() => disc(x, px, -40.7, 0.8, '#FFF8D8', 0));
  }
}

// Plancher révélé par l'éclairage de concert (notes §8 « la lumière touche les gens ») : le plancher repeint NON teint
// (glowing : il garde ses couleurs la nuit) dans la couleur c1 de la palette `pal` (multiply par c1 mélangé à 45 % de blanc,
// puis léger screen c1), masqué (destination-in) par une tache FALL centrée sur le dessus du plancher (54 × 7 u). Une image par
// palette, posée par ConcertLight, opacité pilotée par la boucle.
const palOf = (a: PropArgs): number => ((Math.floor(num(a.pal)) % PALS.length) + PALS.length) % PALS.length;
const hex2 = (v: number): string => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
export function litHex(hex: string, c1: string): string {
  const c = hexRgb(hex);
  const s = hexRgb(c1);
  const m = s.map((v) => v + (255 - v) * 0.45);
  const out = c.map((v, i) => {
    const mul = (v * m[i]!) / 255;
    const scr = 255 - ((255 - mul) * (255 - s[i]!)) / 255;
    return mul + 0.25 * (scr - mul);
  });
  return `#${out.map(hex2).join('')}`;
}
const GLOW = { cx: 0, cy: -9.5, rx: 54, ry: 7 } as const;
function stageGlow(x: TintedCtx, a: PropArgs): void {
  const c1 = PALS[palOf(a)]![1];
  x.glowing(() => {
    stageFloor(tintedCtx(x, (hex) => litHex(hex, c1)));
    const g = x.createRadialGradient?.(0, 0, 0, 0, 0, 1);
    if (!g) return;
    for (const [o, f] of FALL) g.addColorStop(o, `rgba(255,255,255,${f})`);
    x.save();
    x.globalCompositeOperation = 'destination-in';
    x.translate(GLOW.cx, GLOW.cy);
    x.scale(GLOW.rx, GLOW.ry);
    x.fillStyle = g;
    x.fillRect(-1, -1, 2, 2);
    x.restore();
  });
}

const paintOf = (fn: (x: TintedCtx, a: PropArgs) => void) => (x: TintedCtx, a: PropArgs, _p: PropPaint): void => fn(x, a);

registerProps({
  keg: { box: () => [-3.5, -9.9, 7, 10.2], paint: paintOf((x) => keg(x)) },
  'beer-cup': { box: () => [-1.7, -4.7, 3.4, 5], paint: paintOf((x) => beerCup(x)) },
  'stand-counter': { box: () => [-42, -26.5, 72.5, 29], paint: paintOf(standCounter) },
  'stand-awning': { box: () => [-32.5, -45.8, 65, 46.3], paint: standAwning },
  'carried-counter': { box: () => [-28, -20, 56, 20.3], paint: paintOf(carriedCounter) },
  'held-roll': { box: () => [-2.3, -1.9, 11.6, 3.8], paint: paintOf(heldRoll) },
  'stage-prop': { box: stagePropBox, paint: paintOf(stageProp) },
  'stage-extras': { box: () => [-45, -64, 90, 54], paint: stageExtras },
  'stage-glow': { box: () => [-54.5, -17, 109, 19.5], paint: paintOf(stageGlow) },
});
