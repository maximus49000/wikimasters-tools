import { INK } from '../cel';
import { dot, F, fitText, L, lightOf, shadeOf } from '../shop/cel';
import type { TintedCtx } from '../shop/ctx';
import { ball, disc, groundShadow, halo, PD, RD, RRD, upright } from './kit';
import { registerProps, type PropArgs, type PropPaint } from './index';

// Mobilier de rue cellulo (G5, tâche 2), porté de la maquette validée (docs/superpowers/maquettes/g5-fetes/index.html :
// `lamp`, `trafficPole`, `busStop`, `crosswalk`) dans le repère de chaque sprite classique (notes.md §1). Les parties
// lumineuses passent par glowing() quand `lit` ; le reste est teint par le registre. Le drapeau du lampadaire est l'id
// `lamp-flag` (tâche 6) ; le halo et la flaque du lampadaire la nuit restent ceux de GhibliNightLight (tâche 4).

// Trait courbe (crosse du lampadaire) : une quadratique, bout rond.
function curve(x: TintedCtx, x1: number, y1: number, cx: number, cy: number, x2: number, y2: number, c: string, w: number): void {
  x.beginPath();
  x.moveTo(x1, y1);
  x.quadraticCurveTo(cx, cy, x2, y2);
  x.strokeStyle = c;
  x.lineWidth = w;
  x.lineCap = 'round';
  x.stroke();
}

// Lampadaire (LampSprite : pied y = 0, fût jusqu'à −72, crosse vers +x, lanterne 5..13 × −80..−76, centre lumineux (9, −77)).
const LAMP_C = '#3E5452';
function lamp(x: TintedCtx, _a: PropArgs, p: PropPaint): void {
  const c = LAMP_C;
  groundShadow(x, 2, 0.4, 4, 1.1, 0.18);
  // Socle cannelé.
  PD(x, [[-3.2, 0], [3.2, 0], [2.6, -2.2], [-2.6, -2.2]], c, { lw: 0.5, s: 0.3, sx: 0.6, l: 0.25, lx: 0.25 });
  PD(x, [[-2.4, -2.2], [2.4, -2.2], [1.9, -9], [-1.9, -9]], c, { lw: 0.5, s: 0.3, sx: 0.6, l: 0.25, lx: 0.25 });
  RD(x, -2.6, -9.6, 5.2, 1.2, c, { lw: 0.4, s: 0.3, sx: 0.6, l: 0.3, lx: 0.25 });
  // Fût fuselé, bague à mi-hauteur.
  PD(x, [[-1.5, -9.6], [1.5, -9.6], [1.05, -72], [-1.05, -72]], c, { lw: 0.5, s: 0.32, sx: 0.55, l: 0.28, lx: 0.25 });
  RD(x, -1.9, -40, 3.8, 1.4, c, { lw: 0.4, s: 0.3, sx: 0.6, l: 0.3, lx: 0.25 });
  // Crosse (q0 −6 8 −6 du classique) cernée d'encre, rehaut sur le dessus, volute en dessous.
  curve(x, 0, -72, 0, -78, 8, -78, INK, 3.3);
  curve(x, 0, -72, 0, -78, 8, -78, c, 2.3);
  curve(x, 0.2, -72.6, 0.4, -77.2, 7.5, -77.4, lightOf(c, 0.35), 0.6);
  curve(x, 2, -73.6, 4.8, -73.2, 5.4, -75.6, INK, 1.4);
  curve(x, 2, -73.6, 4.8, -73.2, 5.4, -75.6, c, 0.7);
  // Lanterne à pans suspendue à la crosse : attache, chapeau, pointe, verre, montants, fond.
  RD(x, 8.4, -80.4, 1.2, 1.6, c, { lw: 0.35, s: 0, l: 0 });
  PD(x, [[4.6, -80], [13.4, -80], [12.2, -82.2], [5.8, -82.2]], c, { lw: 0.5, s: 0.3, sx: 0.6, l: 0.3, lx: 0.3 });
  disc(x, 9, -82.8, 0.7, c, 0.35);
  const glass: readonly (readonly [number, number])[] = [[5.4, -80], [12.6, -80], [13, -75.2], [5, -75.2]];
  if (p.lit) {
    // Allumée : verre jaune plat, cœur blanc, un seul montant estompé ; le tout garde ses couleurs la nuit.
    x.glowing(() => {
      PD(x, glass, '#FFF3C4', { lw: 0.5, s: 0, l: 0 });
      F(x, 7.2, -79.2, 3.6, 2, '#FFFFFF');
      L(x, 9, -80, 9, -75.2, 'rgba(42,26,24,0.5)', 0.35);
    });
  } else {
    PD(x, glass, '#E8E2CC', { lw: 0.5, s: 0.22, sx: 0.62, l: 0.3, lx: 0.3 });
    L(x, 9, -80, 9, -75.2, INK, 0.35);
    L(x, 7.2, -80, 7, -75.2, INK, 0.25);
    L(x, 10.8, -80, 11, -75.2, INK, 0.25);
  }
  PD(x, [[5, -75.2], [13, -75.2], [12.2, -73.8], [5.8, -73.8]], c, { lw: 0.4, s: 0.3, sx: 0.6, l: 0.3, lx: 0.3 });
}

// Feu tricolore et boîtier à bouton (pole de traffic-layer : mât 0..−34, boîtier −3..3 × −46..−33, lampes r 1,7 à −42,6 /
// −39,4 / −36,2, boîtier jaune 0,8..4 × −20..−15,4, voyant (2,4, −19)). `color` : lampe allumée ; `pressed` : appel
// enregistré ; `lit` (nuit) : halo sur la lampe active et sur le voyant.
const LAMPS = [['red', -42.6, '#E0402F'], ['amber', -39.4, '#F2A33A'], ['green', -36.2, '#3FC06A']] as const;
const POLE_C = '#3A4440';
function trafficPole(x: TintedCtx, a: PropArgs, p: PropPaint): void {
  const color = String(a.color ?? 'green');
  const pressed = a.pressed === true;
  groundShadow(x, 1, 0.3, 2.4, 0.7, 0.18);
  PD(x, [[-1.6, 0], [1.6, 0], [1.2, -1.6], [-1.2, -1.6]], POLE_C, { lw: 0.4, s: 0.3, sx: 0.68, l: 0.25, lx: 0.18 });
  PD(x, [[-0.9, -1.6], [0.9, -1.6], [0.7, -34], [-0.7, -34]], POLE_C, { lw: 0.45, s: 0.32, sx: 0.5, l: 0.3, lx: 0.3 });
  RRD(x, -3, -46, 6, 13, 1.6, '#2A2E2C', { lw: 0.5, s: 0.3, sx: 0.6, l: 0.18, lx: 0.25 });
  for (const [id, y, c] of LAMPS) {
    // Visière au-dessus de chaque lampe ; lampe éteinte assombrie, allumée pleine (point blanc de jour, halo la nuit).
    PD(x, [[-3.2, y - 2.1], [3.2, y - 2.1], [2.6, y - 1.2], [-2.6, y - 1.2]], '#1E2220', { lw: 0.3, s: 0, l: 0.2, lx: 0.3 });
    const on = id === color;
    ball(x, 0, y, 1.7, on ? c : shadeOf(c, 0.6), 0.3);
    if (on && !p.lit) dot(x, -0.5 * p.dir, y - 0.5, 0.6, '#FFFFFF', 0.35);
  }
  // Boîtier jaune à bouton-poussoir, voyant d'appel.
  RRD(x, 0.8, -20, 3.2, 4.6, 0.6, '#E8C440', { lw: 0.4, s: 0.3, sx: 0.6, l: 0.25, lx: 0.3 });
  ball(x, 2.4, -17.2, 0.8, '#2A2626', 0.25);
  disc(x, 2.4, -19, 0.5, pressed ? '#FF5A3A' : '#6A2A22', 0.2);
  L(x, 1.4, -15.9, 3.4, -15.9, 'rgba(42,26,24,0.5)', 0.25);
  if (!p.lit) return;
  const active = LAMPS.find((l) => l[0] === color);
  x.glowing(() => {
    if (active) {
      const [, y, c] = active;
      halo(x, 0, y, 4.2, c, 0.5);
      ball(x, 0, y, 1.7, c, 0);
      dot(x, -0.4 * p.dir, y - 0.5, 0.55, '#FFFFFF', 0.5);
    }
    if (pressed) {
      halo(x, 2.4, -19, 1.6, '#FF5A3A', 0.5);
      disc(x, 2.4, -19, 0.5, '#FF8A6A', 0);
    }
  });
}

// Arrêt de bus (busStop de traffic-layer) : poteau 0..−30, drapeau « BUS » −4,2..4,2 × −40..−33, plaque émaillée de largeur
// `plate` à −33..−28,6 ouverte vers l'amont de la voie servie, pastilles des trois premières lignes. `lines` : « 12,C3,7 »
// ou « 12:#2E8B6A,C3:#C0463A » (couleur de repli par rang sinon).
const LINE_COLORS = ['#2E8B6A', '#C0463A', '#3B6FD6'] as const;
function stopLines(a: PropArgs): [string, string][] {
  return String(a.lines ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .slice(0, 3)
    .map((s, i) => {
      const m = /^(.*?)(?::(#[0-9a-fA-F]{6}))?$/.exec(s);
      return [m?.[1] ?? s, m?.[2] ?? LINE_COLORS[i]!];
    });
}
function stopPlate(a: PropArgs): { name: string; plate: number; px: number } {
  const name = String(a.name ?? 'Mairie');
  const plate = Math.max(12, name.length * 1.6 + 2.4);
  const px = a.served === 'near' ? -plate + 0.6 : -0.6;
  return { name, plate, px };
}
function busStopBox(a: PropArgs): readonly [number, number, number, number] {
  const { plate, px } = stopPlate(a);
  const n = stopLines(a).length;
  const x0 = Math.min(-4.2, px) - 0.6;
  const x1 = Math.max(4.2, px + plate, n ? px + 0.4 + (n - 1) * 5.6 + 5 : 0) + 0.6;
  return [x0, -40.6, x1 - x0, 41.8];
}
function busStop(x: TintedCtx, a: PropArgs): void {
  const { name, plate, px } = stopPlate(a);
  groundShadow(x, 0.6, 0.3, 2, 0.6, 0.18);
  PD(x, [[-1.2, 0], [1.2, 0], [0.9, -1.4], [-0.9, -1.4]], POLE_C, { lw: 0.4, s: 0.3, sx: 0.68, l: 0.25, lx: 0.18 });
  PD(x, [[-0.7, -1.4], [0.7, -1.4], [0.55, -30], [-0.55, -30]], POLE_C, { lw: 0.45, s: 0.32, sx: 0.5, l: 0.3, lx: 0.3 });
  // Drapeau vert à liseré clair.
  RRD(x, -4.2, -40, 8.4, 7, 1, '#2F7D64', { lw: 0.5, s: 0.28, sx: 0.7, l: 0.22, lx: 0.2 });
  x.strokeStyle = 'rgba(244,242,234,0.7)';
  x.lineWidth = 0.3;
  x.strokeRect(-3.5, -39.3, 7, 5.6);
  upright(x, 0, () => fitText(x, 'BUS', 0, -36.4, 4, '#F2EFE6', { bold: true }));
  // Plaque émaillée crème à filet bleu, nom de l'arrêt comprimé à la plaque.
  RD(x, px, -33, plate, 4.4, '#F4F1E6', { lw: 0.4, s: 0.15, sx: 0.8, l: 0.1, lx: 0.18 });
  L(x, px + 0.5, -32.5, px + plate - 0.5, -32.5, '#2A4A9A', 0.5);
  upright(x, px + plate / 2, () => fitText(x, name, px + plate / 2, -30.6, 2.7, '#2A2622', { bold: true, w: plate - 1.5 }));
  stopLines(a).forEach(([ref, col], i) => {
    RRD(x, px + 0.4 + i * 5.6, -28.2, 5, 3.4, 0.8, col, { lw: 0.3, s: 0.25, sx: 0.65, l: 0.2, lx: 0.25 });
    upright(x, px + 2.9 + i * 5.6, () => fitText(x, ref, px + 2.9 + i * 5.6, -26.5, 2.4, '#FFFFFF', { bold: true }));
  });
}

// Une bande du passage piéton (Crosswalk) : demi-largeur `h` (u entiers, l'hôte l'étire à la largeur exacte), 3 u de haut,
// coins 0,6 u ; ombre nette décalée (+0,6, +0,8), bande crème, trouées d'usure tirées de `h`.
function bandHalf(a: PropArgs): number {
  return Math.max(1, Math.round(Number(a.h) || 16));
}
function crosswalkBand(x: TintedCtx, a: PropArgs): void {
  const half = bandHalf(a);
  x.fillStyle = 'rgba(60,45,100,0.16)';
  x.beginPath();
  x.roundRect(-half + 0.6, 0.8, 2 * half, 3, 0.6);
  x.fill();
  x.fillStyle = 'rgba(244,240,228,0.85)';
  x.beginPath();
  x.roundRect(-half, 0, 2 * half, 3, 0.6);
  x.fill();
  x.fillStyle = 'rgba(150,140,130,0.35)';
  for (let k = 0; k < 4; k++) {
    const wx = -half + ((half * 7 + k * 11) % (2 * half));
    x.fillRect(wx, 0.6 + ((k * 3 + half) % 2), 1.2, 0.7);
  }
}

registerProps({
  lamp: { box: () => [-4, -84, 18, 85], paint: lamp },
  'traffic-pole': { box: () => [-4.4, -47, 8.8, 48.2], paint: trafficPole },
  'bus-stop': { box: busStopBox, paint: busStop },
  'crosswalk-band': { box: (a) => [-bandHalf(a), 0, 2 * bandHalf(a) + 0.6, 3.8], paint: crosswalkBand },
});
