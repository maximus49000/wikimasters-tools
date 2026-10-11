// Plan de peinture d'une voiture générée (spec véhicules §3) : profil et couches en opérations sur des tracés SVG, sans
// canvas (exécutées par content/vehicle/car-host.tsx). Portage de carProfile / drawGenCar de la maquette validée.
// Couches, de bas en haut à l'affichage : habitacle sombre (`interior`), occupants (pantins, hors plan), caisse (`body`)
// PERCÉE aux vitres (opération `hole`) pour recouvrir ce qui dépasse des occupants sans clipPath, vitrage translucide
// (`glazing`), roues (images tournées), jupes (`over`), feux. Couleurs de JOUR : l'exécuteur applique la teinte de nuit.
// Repère : roues au sol y = 0, regard vers +x, unités des sprites de véhicules.
import { mixHex } from '../../sky';
import type { ArmPose } from '../../figure/skeleton';
import type { Outfit } from '../people';
import { ARCHETYPES, hsl, type CarSpec, type Occupant, type Rim } from './cars';

export const INK = '#33241f';
export type Op =
  // Pièce peinte : ombre violette, trait d'encre, partie éclairée décalée vers la lumière, liseré clair.
  | { k: 'piece'; d: string; color: string; ink?: boolean; ox?: number; oy?: number }
  // Aplat ; `shade` : en couleur d'ombre ; `ink` : trait d'encre de cette largeur ; `clip` : rogné à ce tracé.
  | { k: 'fill'; d: string; color: string; alpha?: number; shade?: boolean; ink?: number; clip?: string }
  | { k: 'line'; d: string; color: string; w: number; alpha?: number }
  // Pièce sans encre rognée à `clip` (toit bicolore).
  | { k: 'clipPiece'; clip: string; d: string; color: string }
  // Perce la couche (vitres) : ce qui est dessous à l'affichage (occupants, habitacle) apparaît.
  | { k: 'hole'; d: string }
  | { k: 'glass'; d: string }
  | { k: 'shadow'; x0: number; x1: number }
  // Inscription (girouette, POLICE, TAXI…) : ancrée à gauche en (x, y) (ligne de base), redressée pour le sens −1 ; `bg` :
  // cartouche bordé d'encre.
  | { k: 'text'; x: number; y: number; text: string; size: number; color: string; bg?: string };
// Occupant : (x, headY) = tête du pantin assis (`seated`, défaut), selle (`mount` : pilote d'un deux-roues) ou pieds
// (`stand` : éboueur sur le marchepied). `over` : dessiné après les roues (par-dessus la machine).
export type Seat = { role: Occupant['role']; child: boolean; outfitSeed: number; x: number; headY: number; k: number; gait?: 'seated' | 'mount' | 'stand'; arms?: ArmPose; over?: boolean; outfit?: Outfit };
// Gyrophare ou lumineux : rectangle arrondi ; clignote entre `on` et `off`, ou feu fixe (`off` null : allumé la nuit).
export type Beacon = { x: number; y: number; w: number; h: number; on: string; off: string | null };
export type Box = { x: number; y: number; w: number; h: number };
export type CarArt = {
  len: number;
  x0: number;
  x1: number;
  top: number;
  interior: Op[];
  body: Op[];
  glazing: Op[];
  over: Op[];
  wheels: { x: number; r: number }[];
  cabin: Box | null;
  seats: Seat[];
  wheelHand: { x: number; y: number } | null;
  tail: { x: number; y: number };
  head: { x: number; y: number; round: boolean };
  exhaust: { x: number; y: number } | null;
  beacons: Beacon[];
};
// Échelle des pantins assis (adulte, enfant) : tête de rayon 4,4 × 0,45 ≈ 2 unités, comme les bustes de la maquette.
export const SEAT_K = { adult: 0.45, child: 0.34 } as const;

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const f = (n: number): string => (Math.abs(n) < 1e-9 ? '0' : n.toFixed(2));
const q = (x: number, y: number): string => `${f(x)} ${f(y)}`;
export const circlePath = (x: number, y: number, r: number): string => `M${q(x - r, y)} A${f(r)} ${f(r)} 0 1 0 ${q(x + r, y)} A${f(r)} ${f(r)} 0 1 0 ${q(x - r, y)} Z`;
export function roundRectPath(x: number, y: number, w: number, h: number, r: number): string {
  const k = Math.min(r, w / 2, h / 2);
  return `M${q(x + k, y)} L${q(x + w - k, y)} Q${q(x + w, y)} ${q(x + w, y + k)} L${q(x + w, y + h - k)} Q${q(x + w, y + h)} ${q(x + w - k, y + h)} L${q(x + k, y + h)} Q${q(x, y + h)} ${q(x, y + h - k)} L${q(x, y + k)} Q${q(x, y)} ${q(x + k, y)} Z`;
}
const rectPath = (x0: number, y0: number, x1: number, y1: number): string => `M${q(x0, y0)} L${q(x1, y0)} L${q(x1, y1)} L${q(x0, y1)} Z`;

// Tracé et polyligne en même temps : chaque courbe quadratique est approchée par 4 points (test d'auto-intersection).
class Path {
  d = '';
  pts: [number, number][] = [];
  private at: [number, number] = [0, 0];
  M(x: number, y: number): this {
    this.d += `M${q(x, y)} `;
    this.pts.push([x, y]);
    this.at = [x, y];
    return this;
  }
  L(x: number, y: number): this {
    this.d += `L${q(x, y)} `;
    this.pts.push([x, y]);
    this.at = [x, y];
    return this;
  }
  Q(cx: number, cy: number, x: number, y: number): this {
    this.d += `Q${q(cx, cy)} ${q(x, y)} `;
    const [ax, ay] = this.at;
    for (let i = 1; i <= 4; i++) {
      const t = i / 4;
      const u = 1 - t;
      this.pts.push([u * u * ax + 2 * u * t * cx + t * t * x, u * u * ay + 2 * u * t * cy + t * t * y]);
    }
    this.at = [x, y];
    return this;
  }
  Z(): this {
    this.d += 'Z';
    // Points confondus consécutifs retirés (segments nuls).
    this.pts = this.pts.filter((p, i, a) => i === 0 || Math.hypot(p[0] - a[i - 1]![0], p[1] - a[i - 1]![1]) > 1e-6);
    return this;
  }
}

export type Profile = { d: string; pts: [number, number][]; xWs: number; xRoofF: number; xRoofR: number; xRearTop: number; yRearTop: number; yBelt: number; yRoof: number; x0: number; x1: number; yb: number; nose: number; back: CarSpec['back'] };

// Silhouette de profil : bas de caisse, nez, capot, pare-brise, toit, lunette, coffre (formes de la maquette). Bornes
// ajoutées pour qu'aucun tirage ne replie la silhouette : toit arrière avant le toit avant, haut du coffre avant le toit.
export function carProfile(c: CarSpec): Profile {
  const x0 = -c.L / 2;
  const x1 = c.L / 2;
  const yb = -c.clear + 0.6;
  const yBelt = -c.belt;
  const yRoof = -c.H;
  const nose = -c.belt + (c.arch === 'sport' || c.arch === 'coupé' ? 2.4 : 1.2);
  const ra = c.round * 4 + 0.6;
  const xWs = x1 - c.hood;
  const wsRun = (lerp(2, 9, c.ws) * (c.H - c.belt)) / 9;
  const xRoofF = xWs - wsRun;
  const rsRun = (lerp(0.5, 12, c.rs) * (c.H - c.belt)) / 9;
  let xRoofR: number;
  let xRearTop: number;
  let yRearTop: number;
  const back = c.back;
  if (back === 'trunk') {
    xRearTop = x0 + c.trunk;
    xRoofR = xRearTop + rsRun;
    yRearTop = yBelt;
  } else if (back === 'hatch' || back === 'wagon') {
    xRoofR = x0 + 1 + rsRun * 0.6;
    xRearTop = x0 + Math.min(c.trunk, 0.4);
    yRearTop = yBelt;
  } else if (back === 'fast') {
    xRoofR = xRoofF - Math.max(3, (xRoofF - x0) * 0.25);
    xRearTop = x0 + c.trunk;
    yRearTop = yBelt + 0.8;
  } else if (back === 'pickup') {
    xRoofR = x0 + c.trunk + 1;
    xRearTop = x0 + c.trunk;
    yRearTop = yRoof;
  } else {
    xRoofR = xRoofF - 1;
    xRearTop = x0 + 2;
    yRearTop = yBelt;
  }
  xRoofR = Math.min(xRoofR, xRoofF - 2 * ra - 0.5);
  if (back !== 'pickup') xRearTop = Math.min(xRearTop, xRoofR - ra * 0.6 - 0.2);
  const p = new Path();
  if (back === 'open') {
    p.M(x0, yb).L(x0, yBelt + ra).Q(x0, yBelt, x0 + ra, yBelt).L(xWs, yBelt).L(x1 - ra, nose).Q(x1, nose, x1, nose + ra).L(x1, yb).Z();
  } else if (back === 'pickup') {
    const cabR = xRoofR;
    p.M(x0, yb)
      .L(x0, yBelt + 0.6)
      .L(cabR, yBelt + 0.6)
      .L(cabR, yRoof + ra * 0.5)
      .Q(cabR, yRoof, cabR + ra * 0.5, yRoof)
      .L(xRoofF - ra * 0.5, yRoof)
      .Q(xRoofF, yRoof, xRoofF + 0.4, yRoof + ra * 0.4)
      .L(xWs, yBelt)
      .L(x1 - ra, nose)
      .Q(x1, nose, x1, nose + ra)
      .L(x1, yb)
      .Z();
  } else {
    p.M(x0, yb)
      .L(x0, yRearTop + ra)
      .Q(x0, yRearTop, x0 + ra, yRearTop)
      .L(xRearTop, yRearTop)
      .L(xRoofR - ra * 0.6, yRoof + ra * 0.6)
      .Q(xRoofR, yRoof, xRoofR + ra, yRoof)
      .L(xRoofF - ra, yRoof)
      .Q(xRoofF, yRoof, xRoofF + ra * 0.5, yRoof + ra * 0.6)
      .L(xWs, yBelt)
      .L(x1 - ra, nose)
      .Q(x1, nose, x1, nose + ra)
      .L(x1, yb)
      .Z();
  }
  return { d: p.d, pts: p.pts, xWs, xRoofF, xRoofR, xRearTop, yRearTop, yBelt, yRoof, x0, x1, yb, nose, back };
}

// Roue centrée en (0, 0), sans le reflet (fixe, posé par l'affichage) : pneu, sculptures, jante, écrous, axe. Tournée en bloc
// à l'affichage : le moyeu reste centré (pas de faux balourd).
export function wheelOps(rim: Rim, color: string, r: number): Op[] {
  const ops: Op[] = [{ k: 'fill', d: circlePath(0, 0, r), color: '#2b2522', ink: 1 }];
  if (rim === 'flancs blancs') ops.push({ k: 'line', d: circlePath(0, 0, r * 0.72), color: '#f2efe6', w: r * 0.18 });
  let tread = '';
  for (let i = 0; i < 12; i++) {
    const b = (i * Math.PI) / 6;
    tread += `M${q(Math.cos(b) * r * 0.82, Math.sin(b) * r * 0.82)} L${q(Math.cos(b) * r * 0.96, Math.sin(b) * r * 0.96)} `;
  }
  ops.push({ k: 'line', d: tread, color: '#4a403a', w: r * 0.1 });
  const hubR = rim === 'rayons' ? r * 0.66 : r * 0.55;
  ops.push(rim === 'rayons' ? { k: 'fill', d: circlePath(0, 0, hubR), color: '#3a3236' } : { k: 'fill', d: circlePath(0, 0, hubR), color, shade: true });
  if (rim === 'rayons') {
    let d = '';
    for (let i = 0; i < 16; i++) {
      const b = (i * Math.PI) / 8;
      d += `M0 0 L${q(Math.cos(b) * hubR, Math.sin(b) * hubR)} `;
    }
    ops.push({ k: 'line', d, color: '#d9d6cf', w: 0.25 });
  } else if (rim === 'alliage') {
    for (let i = 0; i < 5; i++) {
      const b = (i * 2 * Math.PI) / 5;
      const R = hubR * 0.95;
      ops.push({ k: 'fill', d: `M0 0 L${q(Math.cos(b - 0.25) * R, Math.sin(b - 0.25) * R)} A${f(R)} ${f(R)} 0 0 1 ${q(Math.cos(b + 0.25) * R, Math.sin(b + 0.25) * R)} Z`, color });
    }
  } else if (rim === 'tôle') {
    ops.push({ k: 'fill', d: circlePath(0, 0, hubR * 0.85), color });
    let d = '';
    for (let i = 0; i < 6; i++) {
      const b = (i * Math.PI) / 3;
      d += circlePath(Math.cos(b) * hubR * 0.6, Math.sin(b) * hubR * 0.6, r * 0.08) + ' ';
    }
    ops.push({ k: 'fill', d, color: '#2b2522' });
  } else {
    ops.push({ k: 'fill', d: circlePath(0, 0, hubR * 0.78), color });
    let d = '';
    for (let i = 0; i < 4; i++) {
      const b = (i * Math.PI) / 2;
      d += circlePath(Math.cos(b) * r * 0.3, Math.sin(b) * r * 0.3, r * 0.07) + ' ';
    }
    ops.push({ k: 'fill', d, color: mixHex(color, INK, 0.55) });
  }
  ops.push({ k: 'fill', d: circlePath(0, 0, r * 0.1), color: INK });
  return ops;
}

// Haut de la silhouette (y le plus petit) à l'abscisse x, sur la polyligne du profil ; null hors de la voiture.
function topAt(pts: readonly (readonly [number, number])[], x: number): number | null {
  let best: number | null = null;
  for (let i = 0; i < pts.length; i++) {
    const [ax, ay] = pts[i]!;
    const [bx, by] = pts[(i + 1) % pts.length]!;
    if ((ax - x) * (bx - x) > 0 || ax === bx) continue;
    const y = ay + ((x - ax) / (bx - ax)) * (by - ay);
    if (best === null || y < best) best = y;
  }
  return best;
}

// Demi-encombrement d'une voiture (unités du sprite) : pare-chocs et pot (x0 − 1,6) compris, roue de secours (x0 − 4,2)
// pour un 4x4 qui en porte une ; le moteur en tire la demi-longueur (aucun chevauchement à l'arrêt pare-chocs contre
// pare-chocs).
export const carExtent = (c: CarSpec): number => Math.max(c.L / 2 + 1.6, c.spare ? c.L / 2 + 4.2 : 0);

const memo = new Map<string, CarArt>();
export function carArt(c: CarSpec): CarArt {
  const key = `${c.seed}|${c.arch}|${c.hue.toFixed(4)}`;
  const hit = memo.get(key);
  if (hit) return hit;
  const art = build(c);
  if (memo.size >= 512) memo.clear();
  memo.set(key, art);
  return art;
}

function build(c: CarSpec): CarArt {
  const p = carProfile(c);
  const isOpen = p.back === 'open';
  const isPickup = p.back === 'pickup';
  const wb = c.L / 2 - Math.max(c.wheelR + 2.6, c.L * 0.16);
  const wx = [-wb, wb];
  const xDrv = isOpen ? p.xWs - 4 : lerp(p.xRoofF, p.xWs, 0.15) - 2.4;
  const body: Op[] = [{ k: 'shadow', x0: p.x0, x1: p.x1 }, { k: 'piece', d: p.d, color: c.body }];
  const interior: Op[] = [];
  const glazing: Op[] = [];
  let cabin: Box | null = null;
  const yTop = p.yRoof + 1.3;
  const yBot = p.yBelt - 0.4;
  const xRearT = isPickup ? p.xRoofR + 1.2 : p.xRoofR + 0.4;
  const xRearB = isPickup ? p.xRoofR + 1.2 : Math.max(p.xRearTop + 0.6, p.xRoofR - 1);
  const xFrontB = p.xWs - 0.6;
  const xFrontT = p.xRoofF - 0.2;
  if (c.twoTone && !isOpen) {
    body.push({ k: 'clipPiece', clip: p.d, d: rectPath(p.x0 - 2, p.yRoof - 3, p.x1 + 2, p.yBelt - 0.2), color: c.twoTone });
    body.push({ k: 'line', d: p.d, color: INK, w: 1.1 });
  }
  if (!isOpen) {
    const gh = `M${q(xFrontB, yBot)} L${q(xFrontT, yTop)} L${q(xRearT, yTop)} L${q(xRearB, yBot)} Z`;
    interior.push({ k: 'fill', d: gh, color: '#3a3040' });
    body.push({ k: 'hole', d: gh });
    glazing.push({ k: 'glass', d: gh });
    const xa = Math.min(xRearT, xRearB);
    cabin = { x: xa, y: yTop, w: xFrontB - xa, h: yBot - yTop };
    // Montants : un par séparation de vitres (sur la caisse, au-dessus des occupants).
    const n = ARCHETYPES[c.arch].win;
    let pil = '';
    for (let i = 1; i < n; i++) {
      const x = lerp(p.xWs - 0.6, Math.max(p.xRearTop, p.xRoofR - 1), i / n) - 1;
      pil += `M${q(x, p.yRoof + 1)} L${q(x, p.yBelt - 0.3)} `;
    }
    if (pil) {
      body.push({ k: 'line', d: pil, color: INK, w: 2 });
      body.push({ k: 'line', d: pil, color: c.twoTone ?? c.body, w: 1 });
    }
  } else {
    glazing.push({ k: 'glass', d: `M${q(p.xWs - 0.6, p.yBelt)} L${q(p.xWs - 3.4, p.yBelt - 5.4)} L${q(p.xWs - 2.4, p.yBelt - 5.4)} L${q(p.xWs + 0.6, p.yBelt)} Z` });
  }
  if (isPickup) {
    body.push({ k: 'line', d: `M${q(p.x0 + 0.6, p.yBelt + 0.6)} L${q(p.xRoofR - 0.4, p.yBelt + 0.6)}`, color: INK, w: 0.6 });
    body.push({ k: 'piece', d: `M${q(p.x0 + 2, p.yBelt + 0.4)} L${q(p.x0 + 4, p.yBelt - 3.4)} L${q(p.x0 + 9, p.yBelt - 3.4)} L${q(p.x0 + 10, p.yBelt + 0.4)} Z`, color: hsl(c.seed * 0.11, 0.3, 0.55), ox: -0.2 });
  }
  // Portes, poignées, liseré.
  const doorX = lerp(p.xWs, p.xRoofR, 0.48);
  body.push({ k: 'line', d: `M${q(p.xWs - 1, p.yBelt)} L${q(p.xWs - 1.6, -c.clear - 0.4)} M${q(doorX, p.yBelt)} L${q(doorX, -c.clear - 0.4)}`, color: INK, w: 0.5, alpha: 0.6 });
  body.push({ k: 'line', d: `M${q(p.xWs - 4, p.yBelt + 1.6)} l1.4 0 M${q(doorX - 3.4, p.yBelt + 1.6)} l1.4 0`, color: c.chrome ? '#d9d6cf' : INK, w: 0.6 });
  if (c.stripe) body.push({ k: 'line', d: `M${q(p.x0 + 1, p.yBelt + 3)} L${q(p.x1 - 1, p.yBelt + 3)}`, color: c.stripe, w: 0.9 });
  // Passages de roue sombres (la roue est posée dessus à l'affichage), rognés à la silhouette : sur une voiture basse aux
  // grandes roues (sportive), ils dépassaient du capot.
  const R = c.wheelR + 1.4;
  for (const x of wx) body.push({ k: 'fill', d: `M${q(x - R, -c.clear + 0.6)} A${f(R)} ${f(R)} 0 0 1 ${q(x + R, -c.clear + 0.6)} Z`, color: '#2b2522', clip: p.d });
  // Pare-chocs.
  const bump = c.chrome ? '#d9d6cf' : mixHex(c.body, '#000000', 0.25);
  const cy0 = -c.clear - 2.4;
  const cy1 = -c.clear - 0.4;
  body.push({ k: 'piece', d: `M${q(p.x1 - 2, cy0)} L${q(p.x1 + 1, cy0)} Q${q(p.x1 + 1.6, -c.clear - 1.4)} ${q(p.x1 + 1, cy1)} L${q(p.x1 - 2, cy1)} Z`, color: bump, ox: -0.2, oy: -0.2 });
  body.push({ k: 'piece', d: `M${q(p.x0 + 2, cy0)} L${q(p.x0 - 1, cy0)} Q${q(p.x0 - 1.6, -c.clear - 1.4)} ${q(p.x0 - 1, cy1)} L${q(p.x0 + 2, cy1)} Z`, color: bump, ox: -0.2, oy: -0.2 });
  if (c.lamp === 'carré') body.push({ k: 'fill', d: roundRectPath(p.x1 - 2.4, p.nose + 1, 2.2, 1.4, 0.4), color: '#e8e2d0', ink: 0.5 });
  const yTail = isPickup ? p.yBelt + 0.6 : p.yRearTop;
  body.push({ k: 'fill', d: rectPath(p.x0 - 0.4, yTail + 1.2, p.x0 + 0.8, yTail + 3.4), color: '#c0392b' });
  let top = p.yRoof;
  if (c.rack && !isOpen) {
    body.push({ k: 'line', d: `M${q(p.xRoofR + 1, p.yRoof - 1.2)} L${q(p.xRoofF - 1, p.yRoof - 1.2)} M${q(p.xRoofR + 2, p.yRoof)} l0 -1.2 M${q(p.xRoofF - 2, p.yRoof)} l0 -1.2`, color: INK, w: 0.7 });
    const xb = lerp(p.xRoofR, p.xRoofF, 0.6);
    body.push({ k: 'piece', d: rectPath(p.xRoofR + 3, p.yRoof - 4, xb, p.yRoof - 1.4), color: hsl(c.seed * 0.23, 0.4, 0.45), ox: -0.2 });
    top = Math.min(top, p.yRoof - 4.6);
  }
  if (c.spare) {
    body.push({ k: 'fill', d: circlePath(p.x0 - 1.2, p.yBelt + 2.6, 3), color: '#2b2522', ink: 0.6 });
    body.push({ k: 'fill', d: circlePath(p.x0 - 1.2, p.yBelt + 2.6, 1.6), color: c.body });
  }
  if (c.antenna) {
    const ax = isPickup ? p.xRoofR + 1 : isOpen ? p.xWs - 1 : p.x0 + 3;
    const ay = isPickup ? p.yRoof : isOpen ? p.yBelt : p.yRearTop;
    body.push({ k: 'line', d: `M${q(ax, ay)} L${q(ax - 1.6, ay - 7)}`, color: INK, w: 0.35 });
    top = Math.min(top, ay - 7.4);
  }
  if (c.sunroof && !isOpen) body.push({ k: 'line', d: `M${q(lerp(p.xRoofR, p.xRoofF, 0.35), p.yRoof + 0.2)} L${q(lerp(p.xRoofR, p.xRoofF, 0.75), p.yRoof + 0.2)}`, color: '#3a3040', w: 1.2 });
  if (!isOpen) body.push({ k: 'line', d: `M${q(p.xWs - 0.4, p.yBelt - 0.6)} l1.4 -0.6 l0 -1.2`, color: bump, w: 0.9 });
  const exhaust = { x: p.x0 + 0.6, y: -c.clear - 0.2 };
  body.push({ k: 'fill', d: roundRectPath(exhaust.x - 2.2, exhaust.y - 0.5, 2.6, 1.1, 0.5), color: INK });
  // Jupe arrière : demi-ellipse de carrosserie sur le haut de la roue arrière.
  const over: Op[] = [];
  if (c.skirts) {
    const Rs = c.wheelR + 1.6;
    const cy = -c.wheelR * 0.9;
    over.push({ k: 'piece', d: `M${q(wx[0]! - Rs, cy)} A${f(Rs)} ${f(Rs * 0.85)} 0 0 1 ${q(wx[0]! + Rs, cy)} Z`, color: c.body, ox: -0.2 });
  }
  // Ailes : une roue dont le haut dépasse de la silhouette (voiture basse aux grandes roues : sportive, coupé) reçoit une aile
  // bombée couleur caisse, posée par-dessus la roue.
  for (const x of wx) {
    const top = topAt(p.pts, x);
    if (top === null || -2 * c.wheelR - 0.6 >= top) continue;
    const Ro = c.wheelR + 1.3;
    const Ri = c.wheelR + 0.25;
    const cy = -c.wheelR;
    over.push({ k: 'piece', d: `M${q(x - Ro, cy)} A${f(Ro)} ${f(Ro)} 0 0 1 ${q(x + Ro, cy)} L${q(x + Ri, cy)} A${f(Ri)} ${f(Ri)} 0 0 0 ${q(x - Ri, cy)} Z`, color: c.body, ox: -0.2, oy: -0.3 });
  }
  // Sièges : conducteur près du pare-brise, puis les autres vers l'arrière (bornés à l'habitacle).
  const headY = isOpen ? p.yBelt - 4.2 : p.yRoof + (p.yBelt - p.yRoof) * 0.52;
  const minX = cabin ? cabin.x + 2.5 : p.x0 + 4;
  const seats: Seat[] = c.occupants.map((o, i) => ({
    role: o.role,
    child: o.child,
    outfitSeed: o.outfitSeed,
    x: i === 0 ? xDrv : Math.max(minX, xDrv - (isOpen ? 8 : 9) * i),
    headY: headY + (o.child ? 1.2 : 0),
    k: o.child ? SEAT_K.child : SEAT_K.adult,
  }));
  return {
    len: c.L,
    x0: p.x0,
    x1: p.x1,
    top,
    interior,
    body,
    glazing,
    over,
    wheels: wx.map((x) => ({ x, r: c.wheelR })),
    cabin,
    seats,
    wheelHand: { x: xDrv + 3.4, y: headY + 4.2 },
    tail: { x: p.x0 + 0.2, y: yTail + 2.3 },
    head: { x: p.x1 - 1, y: p.nose + 1.8, round: c.lamp === 'rond' },
    exhaust,
    beacons: [],
  };
}
