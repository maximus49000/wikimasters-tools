import { mulberry32 } from '../scene-world';

// Lumière de nuit de la ville peinte (G5, « deux peintures », maquette g5-fetes notes §5) : géométrie pure. La version
// « éclairée » du décor de jour est révélée à travers un masque d'intensité fait de taches (`LightBlob`) : dégradés radiaux
// à décroissance en inverse du carré adoucie (`FALL`), étirés en ellipse, ou trapèzes linéaires (lumière d'une vitrine qui
// garde sa direction sur le trottoir). Toutes les longueurs sont dans le repère du monde (`u` = unité de la scène).

// Décroissance 1/(1+(d/r0)²) adoucie : [position sur le rayon, fraction du pic].
export const FALL: readonly (readonly [number, number])[] = [
  [0, 1],
  [0.15, 0.9],
  [0.35, 0.6],
  [0.6, 0.25],
  [0.85, 0.06],
  [1, 0],
];

// Tache de lumière : ellipse (cx, cy, rx, ry) d'intensité `peak` au centre. `clipTop` : seule la partie sous cette ligne
// compte (demi-ellipse posée sur le trottoir). `flare` défini : trapèze linéaire au lieu de l'ellipse, bord haut de
// cx ± rx à la ligne cy, bord bas de cx ± (rx + flare) à cy + ry, intensité `peak` en haut → 0 en bas.
export type LightBlob = { cx: number; cy: number; rx: number; ry: number; peak: number; clipTop?: number; flare?: number };

// Lanterne du sprite de lampadaire, repère du sprite (× k).
export const LANTERN = { dx: 9, dy: -77 } as const;

// Lampadaire au pied `x`, bord du trottoir `curb`, échelle du sprite `k` : mur et air autour de la lanterne (modeste : pas
// de brouillard), flaque du trottoir au pied du mât (la plus lumineuse, aplatie), chaussée (faible, rapide), et un cœur plus
// serré autour de la lanterne (ajout après comparaison au banc, tâche 15 : sur les tranches de nuit de l'app, plus claires
// que le multiply de la maquette, la seule lueur du mur se lisait à peine ; le cœur redonne l'îlot doré net de street-night).
// Les taches se cumulent dans le masque (alpha composé).
export function lampBlobs(x: number, curb: number, u: number, k: number): LightBlob[] {
  const gx = x + LANTERN.dx * k;
  const gy = curb + LANTERN.dy * k;
  return [
    { cx: gx, cy: gy + 12 * u, rx: 44 * u, ry: 40 * u, peak: 1 },
    { cx: x + 3 * u, cy: curb - 2 * u, rx: 56 * u, ry: 14 * u, peak: 1 },
    { cx: x + 3 * u, cy: curb + 9 * u, rx: 50 * u, ry: 10 * u, peak: 0.6 },
    { cx: gx, cy: gy + 6 * u, rx: 34 * u, ry: 32 * u, peak: 1 },
  ];
}

// Vitrine allumée (vitre de `x` à `x + w`, du haut `glassTop` au sol `ground`) : lueur faible sur le mur autour, demi-ellipse
// douce sur le trottoir et trapèze faible qui garde la direction de la lumière. L'intérieur de la vitre n'est pas révélé ici :
// la devanture peinte (GhibliShopFront) est dessinée par-dessus.
export function shopBlobs(x: number, w: number, ground: number, glassTop: number, u: number): LightBlob[] {
  const h = ground - glassTop;
  const cx = x + w / 2;
  return [
    { cx, cy: glassTop + h / 2, rx: w * 0.75, ry: h * 1.1, peak: 0.35 },
    { cx, cy: ground, rx: w / 2 + 10 * u, ry: 20 * u, peak: 0.85, clipTop: ground },
    { cx, cy: ground, rx: w / 2 - 2 * u, ry: 22 * u, peak: 0.35, flare: 7 * u },
  ];
}

// Boîte entière (px du monde) qui contient toutes les taches : cadre de l'image découpée.
export function patchBox(blobs: readonly LightBlob[]): { x: number; y: number; w: number; h: number } {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const b of blobs) {
    const half = b.rx + (b.flare ?? 0);
    const top = b.flare !== undefined ? b.cy : Math.max(b.cy - b.ry, b.clipTop ?? -Infinity);
    const bottom = b.cy + b.ry;
    x0 = Math.min(x0, b.cx - half);
    x1 = Math.max(x1, b.cx + half);
    y0 = Math.min(y0, top);
    y1 = Math.max(y1, bottom);
  }
  if (!Number.isFinite(x0)) return { x: 0, y: 0, w: 0, h: 0 };
  const x = Math.floor(x0);
  const y = Math.floor(y0);
  return { x, y, w: Math.ceil(x1) - x, h: Math.ceil(y1) - y };
}

// Ombre portée d'un acteur (pieds en footX, footY ; largeur w, hauteur h) par la lampe en lampX : quadrilatère de la base
// des pieds qui s'allonge À L'OPPOSÉ de la lampe de L = min(1,2h, 0,4h + 0,55|dx|) et descend de 3,4u ; opacité
// min(1, 1 − dist/90u) (le dégradé partagé va du pied à 50 % au milieu puis 0). Rien au-delà de 75u.
export type ActorShade = { points: string; opacity: number } | null;
export function actorShadow(footX: number, footY: number, w: number, h: number, lampX: number, u: number): ActorShade {
  const d = footX - lampX;
  const ad = Math.abs(d);
  if (ad > 75 * u) return null;
  const dir = d >= 0 ? 1 : -1;
  const L = Math.min(1.2 * h, 0.4 * h + 0.55 * ad);
  const top = footY - 0.6 * u;
  const bot = footY + 3.4 * u;
  const tip = footX + dir * L;
  const pts: [number, number][] = [
    [footX - w / 2, top],
    [footX + w / 2, top],
    [tip + (dir * w) / 4, bot],
    [tip - (dir * w) / 4, bot],
  ];
  return { points: pts.map(([px, py]) => `${px.toFixed(1)},${py.toFixed(1)}`).join(' '), opacity: Math.min(1, Math.max(0, 1 - ad / (90 * u))) };
}

// x de la lampe la plus proche (en x), null sans lampe.
export function nearestLamp(x: number, lamps: readonly { x: number }[]): number | null {
  let best: number | null = null;
  for (const l of lamps) if (best === null || Math.abs(l.x - x) < Math.abs(best - x)) best = l.x;
  return best;
}

// Pluie : colonne de lumière sous une lampe ou une vitrine (demi-largeur hw, du bord du trottoir sur `depth` px) : 90 petits
// traits horizontaux brisés (1,5..5,5u × 0,5u), qui s'élargissent et s'écartent vers le bas, densité en v², alpha décroissant
// vers le trottoir d'en face, un trait sur trois au cœur ambre. x relatif à l'axe de la colonne, y relatif au bord du trottoir.
export type WetStroke = { x: number; y: number; w: number; h: number; a: number; core: boolean };
export function wetStrokes(hw: number, depth: number, u: number, seed: number): WetStroke[] {
  const rng = mulberry32(seed);
  const out: WetStroke[] = [];
  for (let i = 0; i < 90; i++) {
    const v = rng();
    const f = v * v;
    const a = (1 - f) * (0.55 + 0.45 * rng()) * 0.75;
    const w = (1.5 + rng() * 4) * u * (1 + f * 1.2);
    const ox = (rng() - 0.5) * 2 * hw * (0.6 + 0.6 * f);
    out.push({ x: ox - w / 2, y: f * depth, w, h: 0.5 * u, a, core: i % 3 === 0 });
  }
  return out;
}
// Demi-largeur du cadre d'une colonne (traits les plus écartés et les plus larges compris).
export const wetHalfWidth = (hw: number, u: number): number => 1.2 * hw + 6.1 * u;
