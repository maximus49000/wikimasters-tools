import { mulberry32 } from '../../scene-world';
import type { PaintCtx } from '../paint-ctx';
import { INK, R as celR, cel, dot, glint, lightOf, type CelOpts } from './cel';
import type { ShopPaintCtx } from './ctx';

// Entrées d'immeuble cellulo (G4a), portées de la maquette validée (docs/superpowers/maquettes/g4-commerces/devantures.html) :
// porte cochère cintrée à imposte rayonnante sous clé de voûte (0), double porte vitrée à ferronnerie sous corniche (1),
// porte à panneaux sous imposte à petits bois (2) ; encadrement en pierre, marche, plaque émaillée numérotée, interphone.
// Peintes dans les tranches du décor (aucune transformation n'y est permise) : chaque point de la maquette (u, v) — porte
// centrée en 0, base en 0 — est tracé en (cx + u·s, base + v·s) par un contexte adaptateur. Imposte toujours éteinte (le
// hall allumé est posé par-dessus, hors filtre).
const WOODS = ['#7A3B2A', '#2E5A7E', '#3E6A4A', '#5A3A5A'];
const GLASS = '#A8C8DA';
const STONE = '#E4D6BA';

// Contexte qui ramène les coordonnées locales de la maquette dans le monde (translation + échelle, sans transformation).
function mapped(ctx: PaintCtx, cx: number, base: number, s: number): ShopPaintCtx {
  const X = (u: number): number => cx + u * s;
  const Y = (v: number): number => base + v * s;
  const text = ctx as Partial<ShopPaintCtx>;
  const none = (): never => {
    throw new Error('transformation interdite dans une tranche');
  };
  return {
    get fillStyle() { return ctx.fillStyle; },
    set fillStyle(v) { ctx.fillStyle = v; },
    get strokeStyle() { return ctx.strokeStyle; },
    set strokeStyle(v) { ctx.strokeStyle = v; },
    get lineWidth() { return ctx.lineWidth / s; },
    set lineWidth(v) { ctx.lineWidth = v * s; },
    get globalAlpha() { return ctx.globalAlpha; },
    set globalAlpha(v) { ctx.globalAlpha = v; },
    get globalCompositeOperation() { return ctx.globalCompositeOperation; },
    set globalCompositeOperation(v) { ctx.globalCompositeOperation = v; },
    lineCap: 'round',
    lineJoin: 'round',
    font: '1px sans-serif',
    textAlign: 'center',
    textBaseline: 'middle',
    save: () => ctx.save(),
    restore: () => ctx.restore(),
    beginPath: () => ctx.beginPath(),
    closePath: () => ctx.closePath(),
    moveTo: (u, v) => ctx.moveTo(X(u), Y(v)),
    lineTo: (u, v) => ctx.lineTo(X(u), Y(v)),
    quadraticCurveTo: (a, b, u, v) => ctx.quadraticCurveTo(X(a), Y(b), X(u), Y(v)),
    bezierCurveTo: none,
    ellipse: (u, v, rx, ry, rot, a0, a1) => ctx.ellipse(X(u), Y(v), rx * s, ry * s, rot, a0, a1),
    arc: (u, v, r, a0, a1) => ctx.arc(X(u), Y(v), r * s, a0, a1),
    rect: (u, v, w, h) => ctx.rect(X(u), Y(v), w * s, h * s),
    roundRect: (u, v, w, h) => ctx.rect(X(u), Y(v), w * s, h * s),
    fill: () => ctx.fill(),
    stroke: () => ctx.stroke(),
    clip: () => ctx.clip(),
    fillRect: (u, v, w, h) => ctx.fillRect(X(u), Y(v), w * s, h * s),
    strokeRect: (u, v, w, h) => ctx.strokeRect(X(u), Y(v), w * s, h * s),
    createLinearGradient: (a, b, c, d) => ctx.createLinearGradient(X(a), Y(b), X(c), Y(d)),
    translate: none,
    rotate: none,
    scale: none,
    // Texte (plaque) : seulement si le contexte sait écrire ; police en px du monde.
    fillText: (str, u, v) => {
      if (!text.fillText) return;
      text.font = `bold ${(1.5 * s).toFixed(2)}px sans-serif`;
      text.textAlign = 'center';
      text.textBaseline = 'middle';
      text.fillText(str, X(u), Y(v));
    },
    strokeText: () => undefined,
    measureText: (str) => ({ width: str.length * 0.55 * 1.5 }),
  };
}

type MOpts = { sh?: number; shX?: number; li?: number; liW?: number; lw?: number; box?: [number, number, number, number] };
const mo = ({ sh = 0.28, shX = 0.68, li = 0.22, liW = 0.18, lw = 0.5, box }: MOpts = {}): CelOpts => ({ s: sh, sx: shX, l: li, lx: liW, lw, ...(box ? { box } : {}) });
const disc = (x: ShopPaintCtx, u: number, v: number, r: number, c: string, lw = 0.3): void => {
  dot(x, u, v, r, c);
  if (lw) {
    x.beginPath();
    x.arc(u, v, r, 0, Math.PI * 2);
    x.strokeStyle = INK;
    x.lineWidth = lw;
    x.stroke();
  }
};

export function paintEntrance(ctx: PaintCtx, cx: number, base: number, s: number, variant: 0 | 1 | 2, seed: number): void {
  const x = mapped(ctx, cx, base, s);
  const R = (u: number, v: number, w: number, h: number, c: string, o: MOpts = {}): void => celR(x, u, v, w, h, c, mo(o));
  const r = mulberry32(seed >>> 0);
  const wood = WOODS[Math.floor(r() * WOODS.length)]!;
  const line = (pts: readonly (readonly [number, number])[], c: string, lw: number): void => {
    x.strokeStyle = c;
    x.lineWidth = lw;
    x.beginPath();
    pts.forEach(([u, v], i) => (i ? x.lineTo(u, v) : x.moveTo(u, v)));
    x.stroke();
  };
  if (variant === 0) {
    // Porte cochère cintrée : arc en pierre, vantaux en bois à panneaux, imposte rayonnante, clé de voûte.
    const arch = (hw: number) => (): void => {
      x.moveTo(-hw, 0);
      x.lineTo(-hw, -17);
      x.arc(0, -17, hw, Math.PI, 0);
      x.lineTo(hw, 0);
      x.closePath();
    };
    cel(x, arch(7.5), STONE, mo({ lw: 0.6, box: [-7.5, -25, 15, 25], sh: 0.25, shX: 0.7 }));
    cel(x, arch(6), wood, mo({ lw: 0.5, box: [-6, -23, 12, 23], sh: 0.3, shX: 0.5, li: 0.2, liW: 0.25 }));
    x.save();
    x.beginPath();
    x.moveTo(-6, -17);
    x.arc(0, -17, 6, Math.PI, 0);
    x.closePath();
    x.fillStyle = GLASS;
    x.fill();
    x.strokeStyle = INK;
    x.lineWidth = 0.4;
    x.stroke();
    for (let a = 1; a < 4; a++) line([[0, -17], [Math.cos(Math.PI + (a * Math.PI) / 4) * 6, -17 + Math.sin(Math.PI + (a * Math.PI) / 4) * 6]], INK, 0.3);
    x.restore();
    line([[0, -17], [0, 0]], INK, 0.4);
    line([[-6, -17], [6, -17]], INK, 0.4);
    for (const sx of [-1, 1]) {
      R(sx * 3 - 1.6, -15.5, 3.2, 6, lightOf(wood, 0.15), { lw: 0.3, sh: 0.3, li: 0 });
      R(sx * 3 - 1.6, -7.5, 3.2, 6, lightOf(wood, 0.15), { lw: 0.3, sh: 0.3, li: 0 });
    }
    R(-1.2, -25.6, 2.4, 2.4, lightOf(STONE, 0.2), { lw: 0.4, sh: 0.2, li: 0 });
  } else if (variant === 1) {
    // Double porte vitrée à ferronnerie sous corniche.
    R(-7.5, -25, 15, 25, STONE, { lw: 0.6, sh: 0.25, shX: 0.7 });
    R(-6, -23.5, 12, 23.5, '#2A2A30', { lw: 0.5, sh: 0, li: 0 });
    for (const sx of [-6, 0.3]) {
      x.fillStyle = GLASS;
      x.fillRect(sx + 0.6, -22.8, 5, 15);
      glint(x, sx + 0.6, -22.8, 5, 15, 0.3);
      x.strokeStyle = '#1A1A1A';
      x.lineWidth = 0.35;
      x.beginPath();
      for (let k = 0; k < 3; k++) {
        x.moveTo(sx + 3.1, -21 + k * 4.6);
        x.arc(sx + 3.1, -19.6 + k * 4.6, 1.4, -Math.PI / 2, Math.PI * 1.5);
      }
      x.stroke();
      x.strokeRect(sx + 0.6, -22.8, 5, 15);
      R(sx + 0.6, -7, 5, 6.4, '#3A3A42', { lw: 0.3, sh: 0, li: 0.2 });
    }
    R(-8.2, -26.4, 16.4, 1.8, lightOf(STONE, 0.2), { lw: 0.4, sh: 0, li: 0 });
  } else {
    // Porte à panneaux sous imposte à petits bois.
    R(-7.5, -25, 15, 25, STONE, { lw: 0.6, sh: 0.25, shX: 0.7 });
    R(-6, -23.5, 12, 5, GLASS, { lw: 0.4, sh: 0, li: 0 });
    for (let k = 1; k < 4; k++) line([[-6 + k * 3, -23.5], [-6 + k * 3, -18.5]], INK, 0.3);
    R(-6, -18, 12, 18, wood, { lw: 0.5, sh: 0.3, shX: 0.55, li: 0.2, liW: 0.2 });
    for (const [pu, pv, ph] of [[-4.6, -16.4, 7], [1, -16.4, 7], [-4.6, -8, 6.6], [1, -8, 6.6]] as const) R(pu, pv, 3.6, ph, lightOf(wood, 0.15), { lw: 0.3, sh: 0.3, li: 0 });
  }
  disc(x, variant === 1 ? -1 : 2.4, -9.5, 0.45, '#E8C060', 0.2);
  // Marche, plaque émaillée numérotée, interphone en laiton.
  R(-8.4, -0.6, 16.8, 1.4, '#C8BCA4', { lw: 0.4, sh: 0, li: 0 });
  R(8.4, -17, 3.6, 2.6, '#2A4A9A', { lw: 0.3, sh: 0, li: 0 });
  x.strokeStyle = '#FFFFFF';
  x.lineWidth = 0.2;
  x.strokeRect(8.7, -16.7, 3, 2);
  x.fillStyle = '#FFFFFF';
  x.fillText(String(3 + Math.floor(r() * 40)), 10.2, -15.7);
  R(-10.6, -13, 2, 3.2, '#C8A040', { lw: 0.3, sh: 0.2, li: 0 });
  for (let k = 0; k < 3; k++) disc(x, -9.6, -12.3 + k * 0.9, 0.25, '#3A3A3A', 0);
}

// Imposte d'une entrée (repère de la maquette) : là où la lumière du hall se voit la nuit.
export function transomOf(variant: 0 | 1 | 2): { kind: 'arch'; cy: number; r: number } | { kind: 'rects'; rects: [number, number, number, number][] } {
  if (variant === 0) return { kind: 'arch', cy: -17, r: 6 };
  if (variant === 1) return { kind: 'rects', rects: [[-5.4, -22.8, 5, 15], [0.9, -22.8, 5, 15]] };
  return { kind: 'rects', rects: [[-6, -23.5, 12, 5]] };
}
