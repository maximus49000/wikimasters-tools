import type { ShopPaintCtx } from './ctx';

// Kit des 32 intérieurs (G4a) : la pièce (mur, frise, lambris, carrelage, sol en lames), le mobilier et les objets
// reconnaissables de la maquette validée (docs/superpowers/maquettes/g4-commerces/interiors.js), en cellulo, portés à
// l'identique (mêmes nombres, même ordre de tracé). Repère local : x de 0 à w, y de 0 (plafond) à h (sol). Le comptoir
// et les tables passent au premier plan (devant le personnel) : `counter` et `bistroTable` appellent toFront().
export type Kit = { x: ShopPaintCtx & { toFront(): void }; w: number; h: number; lit: boolean; r: () => number };
export type InteriorFn = (k: Kit) => number;
export type Col = string | readonly (number | undefined)[] | undefined;
export type Pt = readonly [number, number];
export type CelO = { box?: readonly number[]; s?: number; sx?: number; l?: number; lx?: number; lw?: number; a?: number; rot?: number };

const hx = (h: string): number[] => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const mx = (a: readonly (number | undefined)[], b: readonly (number | undefined)[], t: number): number[] => [0, 1, 2].map((i) => (a[i] ?? 0) + ((b[i] ?? 0) - (a[i] ?? 0)) * t);
const rgba = (c: readonly (number | undefined)[], a = 1): string => `rgba(${(c[0] ?? 0) | 0},${(c[1] ?? 0) | 0},${(c[2] ?? 0) | 0},${a})`;
const SUN = hx('#FFF6D0');
const COOL = hx('#5A4A9C');
export const INK = '#2A1A18';
const sh = (c: readonly (number | undefined)[], t = 0.3): number[] => mx(c, COOL, t);
const li = (c: readonly (number | undefined)[], t = 0.3): number[] => mx(c, SUN, t);
// Couleur absente (case d'une palette hors bornes) : gris neutre.
const C = (c: Col): readonly (number | undefined)[] => (c === undefined ? hx('#888888') : typeof c === 'string' ? hx(c) : c);
const LW = 0.2;
export const PAL = ['#E8603A', '#3AA8E8', '#F2D24A', '#B84AE8', '#4AB86A', '#F28CB4', '#2A2A3A', '#F4EAD0'];
export { hx, mx, rgba, sh, li, C };

// Outils liés à un intérieur (contexte, générateur) : les dessins de la maquette les appellent tels quels.
export function tools(k: Kit) {
  const X = k.x;

  function cel(path: () => void, c: Col, { box, s = 0.28, sx = 0.66, l = 0.2, lx = 0.2, lw = LW, a = 1 }: CelO = {}) {
  const [b0 = 0, b1 = 0, b2 = 0, b3 = 0] = box ?? [];
  c = C(c); X.beginPath(); path(); X.fillStyle = rgba(c, a); X.fill();
  if (box && (s || l)) { X.save(); X.beginPath(); path(); X.clip();
    if (s) { X.fillStyle = rgba(sh(c, s), a); X.fillRect(b0 + b2 * sx, b1 - 1, b2 + 1, b3 + 2); }
    if (l) { X.fillStyle = rgba(li(c, l), a); X.fillRect(b0 - 1, b1 - 1, b2 * lx + 1, b3 + 2); }
    X.restore(); }
  if (lw) { X.beginPath(); path(); X.strokeStyle = INK; X.lineWidth = lw; X.stroke(); }
}

  function R(x: number, y: number, w: number, h: number, c: Col, o: CelO = {}) { return cel(() => X.rect(x, y, w, h), c, { box: [x, y, w, h], ...o }); }

  function RR(x: number, y: number, w: number, h: number, r: number, c: Col, o: CelO = {}) { return cel(() => X.roundRect(x, y, w, h, r), c, { box: [x, y, w, h], ...o }); }

  function E(cx: number, cy: number, rx: number, ry: number, c: Col, o: CelO = {}) { return cel(() => X.ellipse(cx, cy, rx, ry, o.rot || 0, 0, Math.PI * 2), c, { box: [cx - rx, cy - ry, rx * 2, ry * 2], ...o }); }

  function P(pts: Pt[], c: Col, o: CelO = {}) { const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]); const b = [Math.min(...xs), Math.min(...ys), Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)];
  cel(() => { pts.forEach(([x, y], i) => i ? X.lineTo(x, y) : X.moveTo(x, y)); X.closePath(); }, c, { box: b, ...o }); }

  function L(x1: number, y1: number, x2: number, y2: number, c: Col = INK, lw = LW) { X.strokeStyle = typeof c === 'string' ? c : rgba(c); X.lineWidth = lw; X.lineCap = 'round'; X.beginPath(); X.moveTo(x1, y1); X.lineTo(x2, y2); X.stroke(); }

  function F(x: number, y: number, w: number, h: number, c: Col, a = 1) { X.fillStyle = typeof c === 'string' ? (a < 1 ? rgba(hx(c), a) : c) : rgba(C(c), a); X.fillRect(x, y, w, h); }

  function dot(x: number, y: number, r: number, c: Col, a = 1) { X.fillStyle = typeof c === 'string' ? (a < 1 ? rgba(hx(c), a) : c) : rgba(C(c), a); X.beginPath(); X.arc(x, y, r, 0, 7); X.fill(); }

  function glow(x: number, y: number, r: number, c: Col, a = 0.3) { return dot(x, y, r, c, a); }

  function each(x0: number, x1: number, step: number, fn: (x: number, i: number) => void) { let i = 0; for (let x = x0; x + step <= x1 + 0.01; x += step) fn(x, i++); }

  function text(s: string, x: number, y: number, size: number, c: string | undefined, o: { b?: boolean; f?: string } = {}) { X.save(); X.font = `${o.b ? 'bold ' : ''}${size}px ${o.f || 'sans-serif'}`; X.textAlign = 'center'; X.textBaseline = 'middle'; X.fillStyle = c; X.fillText(s, x, y); X.restore(); }

  function room(w: number, h: number, wall: string, floor: string, { wainscot = null, tiles = null, paper = null }: { wainscot?: Col | null; tiles?: string | null; paper?: boolean | null; beam?: boolean } = {}) {
  F(0, 0, w, h, wall);
  if (paper) { X.fillStyle = rgba(sh(C(wall), 0.12)); for (let x = 1; x < w; x += 3) for (let y = 1.5; y < h; y += 3) { X.beginPath(); X.arc(x + ((y / 3 | 0) % 2) * 1.5, y, 0.35, 0, 7); X.fill(); } }
  if (tiles) { X.strokeStyle = rgba(sh(C(tiles), 0.25)); X.lineWidth = 0.12; F(0, 0, w, h, tiles); for (let y = 0; y < h; y += 1.6) { X.beginPath(); X.moveTo(0, y); X.lineTo(w, y); X.stroke(); } for (let y = 0; y < h; y += 1.6) for (let x = ((y / 1.6 | 0) % 2) * 0.8; x < w; x += 1.6) { X.beginPath(); X.moveTo(x, y); X.lineTo(x, y + 1.6); X.stroke(); } }
  if (wainscot) { R(0, h - 8, w, 6, wainscot, { s: 0.2, l: 0, lw: 0.15 }); each(0.6, w, 4, x => R(x, h - 7.2, 3.2, 4.4, li(C(wainscot), 0.12), { s: 0.25, sx: 0.8, l: 0, lw: 0.12 })); }
  F(0, 0, w, 1.2, sh(C(wall), 0.25)); // ombre du plafond
  const fl = C(floor); F(0, h - 2.2, w, 2.2, fl); X.strokeStyle = rgba(sh(fl, 0.3)); X.lineWidth = 0.12; for (let x = -2; x < w; x += 2.2) { X.beginPath(); X.moveTo(x, h); X.lineTo(x + 1.2, h - 2.2); X.stroke(); }
  L(0, h - 2.2, w, h - 2.2, INK, 0.15);
}

  function shelf(x: number, y: number, w: number, c: Col = '#9A6A44') { R(x, y, w, 0.6, c, { s: 0, l: 0, lw: 0.15 }); F(x, y + 0.6, w, 0.6, '#2A1A3A', 0.18); }

  function counter(x: number, w: number, h: number, top: Col, front: Col, o: { panels?: boolean } = {}) { X.toFront();  const y = h - 2.2 - 5.2; R(x, y + 0.9, w, 5.2, front, { s: 0.25, sx: 0.78, l: 0.15, lx: 0.12, lw: 0.25 }); R(x - 0.4, y, w + 0.8, 1, top, { s: 0, l: 0.25, lx: 0.5, lw: 0.22 }); if (o.panels) each(x + 0.8, x + w - 0.8, 3.4, px => R(px, y + 2.2, 2.6, 3, li(C(front), 0.1), { s: 0.25, sx: 0.75, l: 0, lw: 0.1 })); return y; }

  function pendant(x: number, h0: number, c: Col = '#F2C84A', lit = false) { L(x, 0, x, h0, '#3A3A3A', 0.15); P([[x - 1.3, h0 + 1.4], [x - 0.5, h0], [x + 0.5, h0], [x + 1.3, h0 + 1.4]], c, { s: 0.25, l: 0 }); if (lit) { glow(x, h0 + 2, 3.2, '#FFE6A0', 0.28); dot(x, h0 + 1.5, 0.5, '#FFF6D0'); } }

  function frame(x: number, y: number, w: number, h: number, c: Col = '#C8A040', pic: Col = '#7AA8C8') { R(x, y, w, h, c, { s: 0.25, l: 0.2, lw: 0.2 }); R(x + 0.6, y + 0.6, w - 1.2, h - 1.2, pic, { s: 0.2, l: 0, lw: 0.12 }); }

  function plant(x: number, b: number, s = 1) { R(x - 1 * s, b - 1.8 * s, 2 * s, 1.8 * s, '#C86A40', { s: 0.3, l: 0, lw: 0.15 }); for (const [dx, dy, r] of [[-0.8, -3, 1], [0.6, -3.4, 1.1], [0, -4.4, 1], [-1.2, -4.2, 0.8], [1.2, -4.6, 0.7]] as const) E(x + dx * s, b + dy * s, r * s, r * 0.8 * s, '#4E9C5A', { s: 0.3, l: 0.2, lw: 0.12 }); }

  function bottle(x: number, b: number, h: number, glass: Col, { label = '#F4EAD0', cap = '#C8A040', lw = 0.15 }: { label?: string | null; cap?: string | null; lw?: number } = {}) {
  const bw = h * 0.3, nw = bw * 0.36, g = C(glass);
  const path = () => { X.moveTo(x - bw / 2, b); X.lineTo(x - bw / 2, b - h * 0.58); X.quadraticCurveTo(x - bw / 2, b - h * 0.74, x - nw / 2, b - h * 0.8); X.lineTo(x - nw / 2, b - h); X.lineTo(x + nw / 2, b - h); X.lineTo(x + nw / 2, b - h * 0.8); X.quadraticCurveTo(x + bw / 2, b - h * 0.74, x + bw / 2, b - h * 0.58); X.lineTo(x + bw / 2, b); X.closePath(); };
  cel(path, g, { box: [x - bw / 2, b - h, bw, h], s: 0.3, sx: 0.6, l: 0, lw });
  if (label) F(x - bw / 2 + 0.05, b - h * 0.5, bw - 0.1, h * 0.28, label);
  if (cap) F(x - nw / 2, b - h, nw, h * 0.14, cap);
  F(x - bw / 2 + bw * 0.18, b - h * 0.62, bw * 0.12, h * 0.5, '#FFFFFF', 0.45);
}

  function vinyl(cx: number, cy: number, r: number, lab: Col = '#E84A3A') {
  dot(cx, cy, r, '#16141A'); X.strokeStyle = 'rgba(255,255,255,0.14)'; X.lineWidth = 0.08; for (const k of [0.88, 0.76, 0.64, 0.52]) { X.beginPath(); X.arc(cx, cy, r * k, 0, 7); X.stroke(); }
  X.strokeStyle = 'rgba(255,255,255,0.45)'; X.lineWidth = r * 0.12; X.beginPath(); X.arc(cx, cy, r * 0.72, -2.5, -1.7); X.stroke();
  dot(cx, cy, r * 0.34, lab); dot(cx, cy, r * 0.07, '#F4EAD0'); X.strokeStyle = INK; X.lineWidth = 0.15; X.beginPath(); X.arc(cx, cy, r, 0, 7); X.stroke();
}

  function sleeve(x: number, y: number, s: number, i: number) { // pochette de 33 tours avec un motif
  const a = PAL[i % PAL.length], b = PAL[(i * 3 + 2) % PAL.length];
  R(x, y, s, s, a, { s: 0.2, sx: 0.8, l: 0, lw: 0.15 });
  X.save(); X.beginPath(); X.rect(x, y, s, s); X.clip();
  switch (i % 6) {
    case 0: dot(x + s * 0.5, y + s * 0.5, s * 0.32, b); break;
    case 1: for (let k = -s; k < s; k += s * 0.3) { X.strokeStyle = b; X.lineWidth = s * 0.12; X.beginPath(); X.moveTo(x + k, y + s); X.lineTo(x + k + s, y); X.stroke(); } break;
    case 2: dot(x + s * 0.5, y + s * 0.42, s * 0.18, b); E(x + s * 0.5, y + s * 1.02, s * 0.36, s * 0.32, b, { s: 0, l: 0, lw: 0 }); break;
    case 3: F(x, y + s * 0.55, s, s * 0.45, b); dot(x + s * 0.7, y + s * 0.3, s * 0.14, '#FFF6D0'); break;
    case 4: P([[x + s * 0.5, y + s * 0.15], [x + s * 0.85, y + s * 0.8], [x + s * 0.15, y + s * 0.8]], b, { s: 0, l: 0, lw: 0 }); break;
    default: F(x + s * 0.12, y + s * 0.12, s * 0.76, s * 0.1, b); F(x + s * 0.12, y + s * 0.3, s * 0.5, s * 0.08, b);
  }
  X.restore();
}

  function bookRow(x0: number, x1: number, base: number, hMax: number, r: () => number, { lean = true }: { lean?: boolean } = {}) { let x = x0; while (x < x1 - 0.6) { const bw = 0.55 + r() * 0.5, bh = hMax * (0.68 + r() * 0.32); if (x + bw > x1) break; const c = ['#C84A3A', '#3A6AA8', '#E8B83A', '#4A8A4A', '#7A4A8A', '#E8D8B0', '#2A3A5A', '#A86A3A'][(r() * 8) | 0];
  if (lean && r() < 0.08 && x + bh * 0.5 < x1) { X.save(); X.translate(x, base); X.rotate(0.35); R(0, -bh, bw, bh, c, { s: 0, l: 0, lw: 0.1 }); X.restore(); x += bh * 0.38 + bw; continue; }
  R(x, base - bh, bw, bh, c, { s: 0, l: 0, lw: 0.1 }); F(x, base - bh * 0.8, bw, 0.18, '#F2D27A', 0.8); F(x, base - bh * 0.3, bw, 0.12, '#F2D27A', 0.6); x += bw + 0.02; } }

  function baguette(x: number, b: number, h: number, rot: number) { X.save(); X.translate(x, b); X.rotate(rot); E(0, -h / 2, 0.55, h / 2, '#D8963E', { s: 0.3, sx: 0.55, l: 0.25, lx: 0.3, lw: 0.15 }); for (let k = 0.2; k < 0.9; k += 0.2) L(-0.35, -h * k, 0.3, -h * k - 0.5, '#F6D89A', 0.15); X.restore(); }

  function boule(cx: number, cy: number, r: number) { E(cx, cy, r, r * 0.72, '#C88440', { s: 0.32, sx: 0.55, l: 0.25, lx: 0.35, lw: 0.15 }); L(cx - r * 0.5, cy - r * 0.15, cx + r * 0.4, cy - r * 0.35, '#F6D89A', 0.15); L(cx - r * 0.3, cy + r * 0.15, cx + r * 0.5, cy - r * 0.05, '#F6D89A', 0.15); }

  function croissant(cx: number, cy: number, s: number) { cel(() => { X.moveTo(cx - 1.4 * s, cy + 0.4 * s); X.quadraticCurveTo(cx, cy - 1.4 * s, cx + 1.4 * s, cy + 0.4 * s); X.quadraticCurveTo(cx, cy - 0.2 * s, cx - 1.4 * s, cy + 0.4 * s); }, '#E0A04A', { box: [cx - 1.4 * s, cy - s, 2.8 * s, 1.4 * s], s: 0.3, l: 0.3, lw: 0.12 }); for (const k of [-0.5, 0, 0.5]) L(cx + k * s, cy - 0.55 * s, cx + k * s * 1.2, cy + 0.05 * s, '#9A5A20', 0.1); }

  function basket(x: number, b: number, w: number) { R(x, b - 1.6, w, 1.6, '#B8864A', { s: 0.3, l: 0.2, lw: 0.15 }); X.strokeStyle = 'rgba(80,40,10,0.45)'; X.lineWidth = 0.1; for (let k = x + 0.4; k < x + w; k += 0.6) { X.beginPath(); X.moveTo(k, b - 1.6); X.lineTo(k + 0.3, b); X.stroke(); } }

  function cake(cx: number, b: number, w: number, h: number, body: Col, cream: Col, top: Col) { R(cx - w / 2, b - h, w, h, body, { s: 0.25, l: 0.15, lw: 0.15 }); F(cx - w / 2, b - h * 0.55, w, h * 0.12, cream); R(cx - w / 2 - 0.1, b - h - 0.5, w + 0.2, 0.6, cream, { s: 0, l: 0, lw: 0.12 }); for (let k = 0; k < 3; k++) dot(cx - w / 2 + w * (0.2 + k * 0.3), b - h - 0.6, 0.35, top); }

  function macarons(x: number, b: number, n: number) { for (let k = 0; k < n; k++) { const c = ['#F28CB4', '#B8E07A', '#F6E07A', '#B89AE8', '#8A5A3A'][k % 5]; E(x, b - 0.5 - k * 0.9, 0.9, 0.38, c, { s: 0.25, l: 0.2, lw: 0.1 }); F(x - 0.8, b - 0.55 - k * 0.9, 1.6, 0.12, '#FFF6E8'); } }

  function fish(cx: number, cy: number, len: number, c: Col = '#9AB8C8', dir = 1) { const h = len * 0.32; cel(() => { X.moveTo(cx - dir * len / 2, cy); X.quadraticCurveTo(cx, cy - h, cx + dir * len * 0.32, cy); X.quadraticCurveTo(cx, cy + h, cx - dir * len / 2, cy); }, c, { box: [cx - len / 2, cy - h / 2, len, h], s: 0.3, sx: 0.5, l: 0.25, lx: 0.5, lw: 0.12 });
  P([[cx + dir * len * 0.3, cy], [cx + dir * len / 2, cy - h * 0.5], [cx + dir * len / 2, cy + h * 0.5]], c, { s: 0.2, l: 0, lw: 0.12 }); dot(cx - dir * len * 0.33, cy - h * 0.08, 0.18, '#1A1A1A'); L(cx - dir * len * 0.22, cy - h * 0.25, cx - dir * len * 0.22, cy + h * 0.2, sh(C(c), 0.4), 0.08); }

  function steak(cx: number, cy: number, s: number) { E(cx, cy, 1.4 * s, 0.8 * s, '#C8343A', { s: 0.25, l: 0.15, lw: 0.12 }); L(cx - 0.8 * s, cy - 0.2 * s, cx + 0.6 * s, cy + 0.2 * s, '#F6E0D8', 0.2 * s); E(cx + 1.15 * s, cy, 0.3 * s, 0.7 * s, '#F6E8DC', { s: 0, l: 0, lw: 0.08 }); }

  function cheeseWheel(cx: number, b: number, r: number, c: Col = '#F2C84A', cut = false) { E(cx, b - r * 0.55, r, r * 0.55, c, { s: 0.25, sx: 0.6, l: 0.2, lw: 0.15 }); L(cx - r, b - r * 0.55, cx + r, b - r * 0.55, sh(C(c), 0.3), 0.12); if (cut) { P([[cx, b - r * 0.55], [cx + r, b - r * 0.75], [cx + r * 0.9, b - r * 0.25]], '#FFF2B0', { s: 0, l: 0, lw: 0.12 }); dot(cx + r * 0.6, b - r * 0.55, r * 0.08, '#E8B83A'); } }

  function wedge(x: number, b: number, s: number, c: Col = '#F6E08A') { P([[x, b], [x + 2.4 * s, b], [x + 2.4 * s, b - 1.4 * s]], c, { s: 0.2, l: 0.2, lw: 0.12 }); dot(x + 1.6 * s, b - 0.5 * s, 0.2 * s, sh(C(c), 0.25)); dot(x + 2 * s, b - 0.9 * s, 0.15 * s, sh(C(c), 0.25)); }

  function crate(x: number, b: number, w: number, fruit: string | undefined, r: () => number) { R(x, b - 2, w, 2, '#C89A5A', { s: 0.25, l: 0.2, lw: 0.15 }); L(x, b - 1, x + w, b - 1, '#8A5A2A', 0.1); for (let k = 0; k < w / 0.85 - 1; k++) for (let j = 0; j < 2; j++) fruitAt(x + 0.6 + k * 0.85 + j * 0.42, b - 2.1 - j * 0.6, fruit, r); }

  function fruitAt(x: number, y: number, f: string | undefined, _r?: () => number) {
  if (f === 'banana') { X.strokeStyle = '#F2D24A'; X.lineWidth = 0.5; X.beginPath(); X.arc(x, y + 0.6, 0.8, 3.6, 5.8); X.stroke(); return; }
  if (f === 'carrot') { P([[x - 0.25, y - 0.4], [x + 0.25, y - 0.4], [x, y + 0.9]], '#F28A2A', { s: 0, l: 0, lw: 0.08 }); F(x - 0.15, y - 0.8, 0.3, 0.4, '#4AA84A'); return; }
  if (f === 'salad') { E(x, y, 0.55, 0.45, '#8AD06A', { s: 0.3, l: 0, lw: 0.08 }); return; }
  if (f === 'grape') { for (let k = 0; k < 3; k++) dot(x - 0.2 + k * 0.2, y + k * 0.15, 0.22, '#7A3A9A'); return; }
  const c = ({ apple: '#D8343A', orange: '#F28A2A', lemon: '#F6E04A', pear: '#B8D04A', tomato: '#E8402A' } as Record<string, string>)[f ?? ''] || '#D8343A';
  dot(x, y, 0.42, c); dot(x - 0.14, y - 0.14, 0.12, '#FFFFFF', 0.6);
}

  function glasses(cx: number, cy: number, s: number, c: Col = '#2A2A2A', lens: Col = '#CFE6F2') { for (const d of [-1, 1]) { RR(cx + d * 0.95 * s - 0.75 * s, cy - 0.5 * s, 1.5 * s, 1 * s, 0.4 * s, lens, { s: 0, l: 0, lw: 0 }); X.strokeStyle = c; X.lineWidth = 0.22 * s; X.beginPath(); X.roundRect(cx + d * 0.95 * s - 0.75 * s, cy - 0.5 * s, 1.5 * s, 1 * s, 0.4 * s); X.stroke(); } L(cx - 0.2 * s, cy - 0.15 * s, cx + 0.2 * s, cy - 0.15 * s, c, 0.18 * s); L(cx - 1.7 * s, cy - 0.35 * s, cx - 2.1 * s, cy - 0.5 * s, c, 0.15 * s); L(cx + 1.7 * s, cy - 0.35 * s, cx + 2.1 * s, cy - 0.5 * s, c, 0.15 * s); }

  function flower(x: number, y: number, c: Col, k = 0) { if (k % 3 === 0) { for (let a = 0; a < 5; a++) dot(x + Math.cos(a * 1.26) * 0.38, y + Math.sin(a * 1.26) * 0.38, 0.3, c); dot(x, y, 0.2, '#F6E04A'); } else if (k % 3 === 1) { P([[x - 0.4, y - 0.1], [x - 0.25, y - 0.6], [x, y - 0.3], [x + 0.25, y - 0.6], [x + 0.4, y - 0.1], [x, y + 0.35]], c, { s: 0.2, l: 0, lw: 0.08 }); } else { dot(x, y, 0.45, c); X.strokeStyle = rgba(sh(C(c), 0.35)); X.lineWidth = 0.1; X.beginPath(); X.arc(x, y, 0.25, 0, 5); X.stroke(); } }

  function bucket(x: number, b: number, r: () => number, cols: Col[]) { for (let k = 0; k < 7; k++) { const fx = x - 1 + (k % 4) * 0.7 + (k > 3 ? 0.35 : 0), fy = b - 4.2 - (k > 3 ? 0.9 : 0) - r() * 0.6; L(x, b - 1.8, fx, fy, '#3A8A3A', 0.12); flower(fx, fy, cols[k % cols.length], k); } P([[x - 1.2, b - 2], [x + 1.2, b - 2], [x + 0.9, b], [x - 0.9, b]], '#7A8A9A', { s: 0.3, l: 0.2, lw: 0.15 }); }

  function hanger(x: number, top: number, c: Col, kind: number) { L(x, top, x, top + 0.6, '#5A5A5A', 0.1); L(x - 0.9, top + 1, x, top + 0.5, '#5A5A5A', 0.1); L(x + 0.9, top + 1, x, top + 0.5, '#5A5A5A', 0.1);
  if (kind === 0) P([[x - 1, top + 1], [x + 1, top + 1], [x + 1.2, top + 2.2], [x + 0.8, top + 2.2], [x + 0.8, top + 5], [x - 0.8, top + 5], [x - 0.8, top + 2.2], [x - 1.2, top + 2.2]], c, { s: 0.25, l: 0.15, lw: 0.12 });
  else P([[x - 0.7, top + 1], [x + 0.7, top + 1], [x + 1.5, top + 6], [x - 1.5, top + 6]], c, { s: 0.25, l: 0.15, lw: 0.12 }); }

  function screen(x: number, y: number, w: number, h: number, lit: boolean, k = 0) { R(x, y, w, h, '#1A1A22', { s: 0, l: 0, lw: 0.15 }); const sx = x + 0.3, sy = y + 0.3, sw = w - 0.6, s2 = h - 0.6; F(sx, sy, sw, s2, lit ? ['#2A4AD8', '#1A8A4A', '#8A2AB8'][k % 3] : '#22283A'); if (lit) { F(sx + sw * 0.15, sy + s2 * 0.6, sw * 0.2, s2 * 0.2, '#F6E04A'); F(sx + sw * 0.55, sy + s2 * 0.3, sw * 0.18, s2 * 0.18, '#F24A6A'); F(sx, sy + s2 * 0.85, sw, s2 * 0.15, '#4AE88A'); } }

  function person(cx: number, b: number, s: number, shirt: Col = '#3A6AA8', skin: Col = '#E8B890', hair: Col = '#3A2A1A') { E(cx, b - 3.1 * s, 0.75 * s, 0.85 * s, skin, { s: 0.25, l: 0, lw: 0.12 }); cel(() => { X.arc(cx, b - 3.3 * s, 0.8 * s, Math.PI, 0); }, hair, { s: 0, l: 0, lw: 0 }); P([[cx - 1.1 * s, b], [cx - 1 * s, b - 1.9 * s], [cx - 0.5 * s, b - 2.3 * s], [cx + 0.5 * s, b - 2.3 * s], [cx + 1 * s, b - 1.9 * s], [cx + 1.1 * s, b]], shirt, { s: 0.25, sx: 0.6, l: 0.15, lw: 0.12 }); }

  function bistroTable(cx: number, b: number, top: Col = '#F4F0E6', chair: Col = '#5A3A20') { X.toFront();  E(cx, b - 3.6, 1.6, 0.35, top, { s: 0, l: 0.2, lw: 0.15 }); F(cx - 0.15, b - 3.4, 0.3, 3, '#2A2A2A'); E(cx, b - 0.2, 0.9, 0.2, '#2A2A2A', { s: 0, l: 0, lw: 0 });
  for (const d of [-1, 1]) { X.strokeStyle = chair; X.lineWidth = 0.3; X.beginPath(); X.moveTo(cx + d * 2.2, b); X.lineTo(cx + d * 2.2, b - 2.4); X.moveTo(cx + d * 3.2, b); X.lineTo(cx + d * 3.2, b - 5); X.quadraticCurveTo(cx + d * 3.3, b - 5.8, cx + d * 2.6, b - 5.4); X.stroke(); E(cx + d * 2.7, b - 2.4, 0.8, 0.22, chair, { s: 0, l: 0, lw: 0.1 }); } }

  return { cel, R, RR, E, P, L, F, dot, glow, each, text, room, shelf, counter, pendant, frame, plant, bottle, vinyl, sleeve, bookRow, baguette, boule, croissant, basket, cake, macarons, fish, steak, cheeseWheel, wedge, crate, fruitAt, glasses, flower, bucket, hanger, screen, person, bistroTable };
}
export type Tools = ReturnType<typeof tools>;
