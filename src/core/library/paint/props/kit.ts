import { INK, TAU } from '../cel';
import { cel, lightOf, shadeOf, withAlpha, type Box, type CelOpts } from '../shop/cel';
import type { ShopPaintCtx } from '../shop/ctx';

// Kit cellulo des accessoires de rue (G5), porté de la maquette validée (docs/superpowers/maquettes/g5-fetes/index.html) :
// disques modelés, tubes cernés d'encre, halos à bord net, ombres portées, roues, drapeau tricolore. Couleurs : chaînes
// CSS ; la teinte de nuit est appliquée par le contexte (tintedCtx), jamais ici.

// Orientation du peintre en cours. Un accessoire tourné vers −x est dessiné en miroir géométrique (le peintre change le
// signe de ses abscisses), jamais par un miroir de l'image cuite : la lumière vient toujours du haut à gauche du monde,
// donc, à −1, l'ombre passe à GAUCHE du repère local et le rehaut à droite. Remis à 1 par l'hôte après chaque peinture.
let dir: 1 | -1 = 1;
export function facing(d: 1 | -1): void {
  dir = d;
}

// cel() qui respecte `facing` : à 1, exactement cel() ; à −1, ombre sur [x − 1, x + w·(1 − sx)], rehaut sur la droite.
export function celD(x: ShopPaintCtx, path: () => void, c: string, o: CelOpts = {}): void {
  if (dir === 1) return cel(x, path, c, o);
  const { box, s = 0.28, sx = 0.66, l = 0.2, lx = 0.2, lw = 0.2, a = 1 } = o;
  x.beginPath();
  path();
  x.fillStyle = withAlpha(c, a);
  x.fill();
  if (box && (s || l)) {
    x.save();
    x.beginPath();
    path();
    x.clip();
    if (s) {
      x.fillStyle = withAlpha(shadeOf(c, s), a);
      x.fillRect(box[0] - 1, box[1] - 1, box[2] * (1 - sx) + 1, box[3] + 2);
    }
    if (l) {
      x.fillStyle = withAlpha(lightOf(c, l), a);
      x.fillRect(box[0] + box[2] * (1 - lx), box[1] - 1, box[2] * lx + 1, box[3] + 2);
    }
    x.restore();
  }
  if (lw) {
    x.beginPath();
    path();
    x.strokeStyle = INK;
    x.lineWidth = lw;
    x.stroke();
  }
}

// R, RR, E, P de shop/cel.ts, sur celD.
export const RD = (x: ShopPaintCtx, x0: number, y0: number, w: number, h: number, c: string, o: CelOpts = {}): void =>
  celD(x, () => x.rect(x0, y0, w, h), c, { box: [x0, y0, w, h], ...o });
export const RRD = (x: ShopPaintCtx, x0: number, y0: number, w: number, h: number, r: number, c: string, o: CelOpts = {}): void =>
  celD(x, () => x.roundRect(x0, y0, w, h, r), c, { box: [x0, y0, w, h], ...o });
export const ED = (x: ShopPaintCtx, cx: number, cy: number, rx: number, ry: number, c: string, o: CelOpts = {}): void =>
  celD(x, () => x.ellipse(cx, cy, rx, ry, o.rot ?? 0, 0, TAU), c, { box: [cx - rx, cy - ry, rx * 2, ry * 2], ...o });
export function PD(x: ShopPaintCtx, pts: readonly (readonly [number, number])[], c: string, o: CelOpts = {}): void {
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const box: Box = [Math.min(...xs), Math.min(...ys), Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)];
  celD(
    x,
    () => {
      pts.forEach(([px, py], i) => (i ? x.lineTo(px, py) : x.moveTo(px, py)));
      x.closePath();
    },
    c,
    { box, ...o },
  );
}

// Trait (bout choisi : rond par défaut, carré pour les bandes d'ombre et de rehaut des tubes).
function line(x: ShopPaintCtx, x1: number, y1: number, x2: number, y2: number, c: string, w: number, cap = 'round'): void {
  x.beginPath();
  x.moveTo(x1, y1);
  x.lineTo(x2, y2);
  x.strokeStyle = c;
  x.lineWidth = w;
  x.lineCap = cap;
  x.stroke();
}

// Disque plein cerné d'encre (`lw` 0 : sans trait).
export function disc(x: ShopPaintCtx, cx: number, cy: number, r: number, c: string, lw = 0.3): void {
  x.beginPath();
  x.arc(cx, cy, r, 0, TAU);
  x.fillStyle = c;
  x.fill();
  if (lw) {
    x.strokeStyle = INK;
    x.lineWidth = lw;
    x.stroke();
  }
}

// Disque modelé : aplat, croissant d'ombre en bas (côté opposé à la lumière), point de lumière en haut, trait encré.
export function ball(x: ShopPaintCtx, cx: number, cy: number, r: number, c: string, lw = 0.35): void {
  disc(x, cx, cy, r, c, 0);
  x.save();
  x.beginPath();
  x.arc(cx, cy, r, 0, TAU);
  x.clip();
  x.fillStyle = shadeOf(c, 0.3);
  x.beginPath();
  x.arc(cx + r * 0.35 * dir, cy + r * 0.35, r, 0, TAU);
  x.fill();
  x.fillStyle = lightOf(c, 0.4);
  x.beginPath();
  x.arc(cx - r * 0.35 * dir, cy - r * 0.35, r * 0.35, 0, TAU);
  x.fill();
  x.restore();
  if (lw) {
    x.beginPath();
    x.arc(cx, cy, r, 0, TAU);
    x.strokeStyle = INK;
    x.lineWidth = lw;
    x.stroke();
  }
}

// Tube : trait épais cerné d'encre, bande d'ombre côté bas-droite du monde, rehaut côté haut-gauche (mâts, poteaux, membrures).
export function tube(x: ShopPaintCtx, x1: number, y1: number, x2: number, y2: number, w: number, c: string, { lw = 0.5, li = 0.35, sh = 0.3 }: { lw?: number; li?: number; sh?: number } = {}): void {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  if (lw) line(x, x1, y1, x2, y2, INK, w + lw * 2);
  line(x, x1, y1, x2, y2, c, w);
  // Normale orientée vers la lumière (haut-gauche du monde, soit haut-droite du repère local à −1).
  const s = nx * -0.7 * dir + ny * -0.7 > 0 ? 1 : -1;
  if (sh) {
    const o = -s * w * 0.28;
    line(x, x1 + nx * o, y1 + ny * o, x2 + nx * o, y2 + ny * o, shadeOf(c, sh), w * 0.36, 'butt');
  }
  if (li) {
    const o = s * w * 0.26;
    line(x, x1 + nx * o, y1 + ny * o, x2 + nx * o, y2 + ny * o, lightOf(c, li), w * 0.26, 'butt');
  }
}

// Halo de nuit à bord net, deux tons (à peindre dans glowing() : il garde sa couleur).
export function halo(x: ShopPaintCtx, cx: number, cy: number, r: number, c = '#FFE6A0', a = 0.3): void {
  x.fillStyle = withAlpha(c, a * 0.55);
  x.beginPath();
  x.arc(cx, cy, r, 0, TAU);
  x.fill();
  x.fillStyle = withAlpha(c, a);
  x.beginPath();
  x.arc(cx, cy, r * 0.5, 0, TAU);
  x.fill();
}

// Ombre portée au sol (ellipse violette).
export function groundShadow(x: ShopPaintCtx, cx: number, cy: number, rx: number, ry = rx * 0.3, a = 0.22): void {
  x.fillStyle = `rgba(70,50,130,${a})`;
  x.beginPath();
  x.ellipse(cx, cy, rx, ry, 0, 0, TAU);
  x.fill();
}

// Roue : ombre au sol, pneu cerné, jante claire, `spokes` rayons, moyeu modelé.
export function wheel(x: ShopPaintCtx, cx: number, cy: number, r: number, spokes = 8): void {
  groundShadow(x, cx + 0.5 * dir, cy + r + 0.2, r * 0.9, r * 0.22, 0.2);
  x.beginPath();
  x.arc(cx, cy, r, 0, TAU);
  x.strokeStyle = INK;
  x.lineWidth = 1.9;
  x.stroke();
  x.strokeStyle = '#2A2D34';
  x.lineWidth = 1.1;
  x.stroke();
  x.strokeStyle = 'rgba(170,180,190,0.9)';
  x.lineWidth = 0.35;
  x.beginPath();
  x.arc(cx, cy, r - 0.9, 0, TAU);
  x.stroke();
  for (let i = 0; i < spokes; i++) {
    const a = (i * TAU) / spokes;
    line(x, cx, cy, cx + Math.cos(a) * (r - 1), cy + Math.sin(a) * (r - 1), 'rgba(120,128,140,0.8)', 0.3, 'butt');
  }
  ball(x, cx, cy, 1, '#8A9098', 0.3);
}

// Tricolore par défaut (bleu à la hampe).
export const FLAG_COLORS = ['#2B4FA0', '#F4F2EA', '#C0302B'] as const;

// Tissu d'un drapeau (FlagArt) : hampe à x = 0, tissu vers +x, haut à y = 0. `wave` : bord haut
// y(u) = h·u·(0,08·sin(5,2u − 7,5t + φ) + 0,05·sin(2,6u − 5t + φ)), bord bas ×1,15 ; tranches descendantes ombrées, montantes
// rehaussées. Sans vague (mouvement réduit) : tissu plat, un pli d'ombre fixe par bande, indépendant de t et φ.
export function flagArt(x: ShopPaintCtx, o: { w: number; h: number; t: number; wave: boolean; phase: number; colors?: readonly [string, string, string] }): void {
  const { w, h, t, wave, phase } = o;
  const cols = o.colors ?? FLAG_COLORS;
  const n = 12;
  const b = w / 3;
  const yAt = (u: number): number => (wave ? Math.sin(u * 5.2 - t * 7.5 + phase) * h * 0.08 * u + Math.sin(u * 2.6 - t * 5 + phase) * h * 0.05 * u : 0);
  for (let k = 0; k < 3; k++) {
    const c = cols[k]!;
    x.beginPath();
    for (let i = 0; i <= n; i++) {
      const u = (k + i / n) / 3;
      x.lineTo(u * w, yAt(u));
    }
    for (let i = n; i >= 0; i--) {
      const u = (k + i / n) / 3;
      x.lineTo(u * w, h + yAt(u) * 1.15);
    }
    x.closePath();
    x.fillStyle = c;
    x.fill();
    // Plis : bandes d'ombre là où la vague descend, de rehaut là où elle monte.
    x.save();
    x.clip();
    if (wave) {
      for (let i = 0; i < n; i++) {
        const u0 = (k + i / n) / 3;
        const u1 = (k + (i + 1) / n) / 3;
        const d = yAt(u1) - yAt(u0);
        if (d > 0.03) x.fillStyle = shadeOf(c, 0.32);
        else if (d < -0.05) x.fillStyle = lightOf(c, 0.25);
        else continue;
        x.fillRect(u0 * w, -h, (u1 - u0) * w + 0.1, 3 * h);
      }
    } else {
      x.fillStyle = shadeOf(c, 0.3);
      x.fillRect(k * b + b * 0.7, -1, b, h + 2);
    }
    x.restore();
  }
  x.beginPath();
  for (let i = 0; i <= 3 * n; i++) x.lineTo((i / (3 * n)) * w, yAt(i / (3 * n)));
  for (let i = 3 * n; i >= 0; i--) x.lineTo((i / (3 * n)) * w, h + yAt(i / (3 * n)) * 1.15);
  x.closePath();
  x.strokeStyle = INK;
  x.lineWidth = 0.4;
  x.stroke();
}
