// Intérieurs détaillés des 32 commerces, façon cellulo. IN.draw(ctx, type, x, y, w, h, lit) : vitrine de w × h (≈ 30-45 × 18-22),
// repère local 0..w, 0..h (plafond en haut, sol en bas). Tout en aplat + ombre nette + trait encré fin.
const IN = (() => {
const hx = h => [1,3,5].map(i => parseInt(h.slice(i, i + 2), 16));
const mx = (a, b, t) => [0,1,2].map(i => a[i] + (b[i] - a[i]) * t);
const rgba = (c, a = 1) => `rgba(${c[0]|0},${c[1]|0},${c[2]|0},${a})`;
const SUN = hx('#FFF6D0'), COOL = hx('#5A4A9C'), INK = '#2A1A18';
const sh = (c, t = 0.3) => mx(c, COOL, t), li = (c, t = 0.3) => mx(c, SUN, t);
const C = c => typeof c === 'string' ? hx(c) : c;
const rng = s => () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
let X; // contexte courant
const LW = 0.2;

// Forme : aplat, ombre nette à droite (shX), rehaut à gauche, trait.
function cel(path, c, { box, s = 0.28, sx = 0.66, l = 0.2, lx = 0.2, lw = LW, a = 1 } = {}) {
  c = C(c); X.beginPath(); path(); X.fillStyle = rgba(c, a); X.fill();
  if (box && (s || l)) { X.save(); X.beginPath(); path(); X.clip();
    if (s) { X.fillStyle = rgba(sh(c, s), a); X.fillRect(box[0] + box[2] * sx, box[1] - 1, box[2] + 1, box[3] + 2); }
    if (l) { X.fillStyle = rgba(li(c, l), a); X.fillRect(box[0] - 1, box[1] - 1, box[2] * lx + 1, box[3] + 2); }
    X.restore(); }
  if (lw) { X.beginPath(); path(); X.strokeStyle = INK; X.lineWidth = lw; X.stroke(); }
}
const R = (x, y, w, h, c, o = {}) => cel(() => X.rect(x, y, w, h), c, { box: [x, y, w, h], ...o });
const RR = (x, y, w, h, r, c, o = {}) => cel(() => X.roundRect(x, y, w, h, r), c, { box: [x, y, w, h], ...o });
const E = (cx, cy, rx, ry, c, o = {}) => cel(() => X.ellipse(cx, cy, rx, ry, o.rot || 0, 0, Math.PI * 2), c, { box: [cx - rx, cy - ry, rx * 2, ry * 2], ...o });
const P = (pts, c, o = {}) => { const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]); const b = [Math.min(...xs), Math.min(...ys), Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)];
  cel(() => { pts.forEach(([x, y], i) => i ? X.lineTo(x, y) : X.moveTo(x, y)); X.closePath(); }, c, { box: b, ...o }); };
const L = (x1, y1, x2, y2, c = INK, lw = LW) => { X.strokeStyle = typeof c === 'string' ? c : rgba(c); X.lineWidth = lw; X.lineCap = 'round'; X.beginPath(); X.moveTo(x1, y1); X.lineTo(x2, y2); X.stroke(); };
const F = (x, y, w, h, c, a = 1) => { X.fillStyle = typeof c === 'string' ? (a < 1 ? rgba(hx(c), a) : c) : rgba(c, a); X.fillRect(x, y, w, h); };
const dot = (x, y, r, c, a = 1) => { X.fillStyle = typeof c === 'string' ? (a < 1 ? rgba(hx(c), a) : c) : rgba(c, a); X.beginPath(); X.arc(x, y, r, 0, 7); X.fill(); };
const glow = (x, y, r, c, a = 0.3) => dot(x, y, r, c, a);
const each = (x0, x1, step, fn) => { let i = 0; for (let x = x0; x + step <= x1 + 0.01; x += step) fn(x, i++); };
const text = (s, x, y, size, c, o = {}) => { X.save(); X.font = `${o.b ? 'bold ' : ''}${size}px ${o.f || 'sans-serif'}`; X.textAlign = 'center'; X.textBaseline = 'middle'; X.fillStyle = c; X.fillText(s, x, y); X.restore(); };

// ---------- Murs et sols ----------
function room(w, h, wall, floor, { wainscot = null, tiles = null, paper = null, beam = true } = {}) {
  F(0, 0, w, h, wall);
  if (paper) { X.fillStyle = rgba(sh(C(wall), 0.12)); for (let x = 1; x < w; x += 3) for (let y = 1.5; y < h; y += 3) { X.beginPath(); X.arc(x + ((y / 3 | 0) % 2) * 1.5, y, 0.35, 0, 7); X.fill(); } }
  if (tiles) { X.strokeStyle = rgba(sh(C(tiles), 0.25)); X.lineWidth = 0.12; F(0, 0, w, h, tiles); for (let y = 0; y < h; y += 1.6) { X.beginPath(); X.moveTo(0, y); X.lineTo(w, y); X.stroke(); } for (let y = 0; y < h; y += 1.6) for (let x = ((y / 1.6 | 0) % 2) * 0.8; x < w; x += 1.6) { X.beginPath(); X.moveTo(x, y); X.lineTo(x, y + 1.6); X.stroke(); } }
  if (wainscot) { R(0, h - 8, w, 6, wainscot, { s: 0.2, l: 0, lw: 0.15 }); each(0.6, w, 4, x => R(x, h - 7.2, 3.2, 4.4, li(C(wainscot), 0.12), { s: 0.25, sx: 0.8, l: 0, lw: 0.12 })); }
  F(0, 0, w, 1.2, sh(C(wall), 0.25)); // ombre du plafond
  const fl = C(floor); F(0, h - 2.2, w, 2.2, fl); X.strokeStyle = rgba(sh(fl, 0.3)); X.lineWidth = 0.12; for (let x = -2; x < w; x += 2.2) { X.beginPath(); X.moveTo(x, h); X.lineTo(x + 1.2, h - 2.2); X.stroke(); }
  L(0, h - 2.2, w, h - 2.2, INK, 0.15);
}
function shelf(x, y, w, c = '#9A6A44') { R(x, y, w, 0.6, c, { s: 0, l: 0, lw: 0.15 }); F(x, y + 0.6, w, 0.6, '#2A1A3A', 0.18); }
function counter(x, w, h, top, front, o = {}) { const y = h - 2.2 - 5.2; R(x, y + 0.9, w, 5.2, front, { s: 0.25, sx: 0.78, l: 0.15, lx: 0.12, lw: 0.25 }); R(x - 0.4, y, w + 0.8, 1, top, { s: 0, l: 0.25, lx: 0.5, lw: 0.22 }); if (o.panels) each(x + 0.8, x + w - 0.8, 3.4, px => R(px, y + 2.2, 2.6, 3, li(C(front), 0.1), { s: 0.25, sx: 0.75, l: 0, lw: 0.1 })); return y; }
function pendant(x, h0, c = '#F2C84A', lit = false) { L(x, 0, x, h0, '#3A3A3A', 0.15); P([[x - 1.3, h0 + 1.4], [x - 0.5, h0], [x + 0.5, h0], [x + 1.3, h0 + 1.4]], c, { s: 0.25, l: 0 }); if (lit) { glow(x, h0 + 2, 3.2, '#FFE6A0', 0.28); dot(x, h0 + 1.5, 0.5, '#FFF6D0'); } }
function frame(x, y, w, h, c = '#C8A040', pic = '#7AA8C8') { R(x, y, w, h, c, { s: 0.25, l: 0.2, lw: 0.2 }); R(x + 0.6, y + 0.6, w - 1.2, h - 1.2, pic, { s: 0.2, l: 0, lw: 0.12 }); }
function plant(x, b, s = 1) { R(x - 1 * s, b - 1.8 * s, 2 * s, 1.8 * s, '#C86A40', { s: 0.3, l: 0, lw: 0.15 }); for (const [dx, dy, r] of [[-0.8, -3, 1], [0.6, -3.4, 1.1], [0, -4.4, 1], [-1.2, -4.2, 0.8], [1.2, -4.6, 0.7]]) E(x + dx * s, b + dy * s, r * s, r * 0.8 * s, '#4E9C5A', { s: 0.3, l: 0.2, lw: 0.12 }); }

// ---------- Objets ----------
function bottle(x, b, h, glass, { label = '#F4EAD0', cap = '#C8A040', lw = 0.15 } = {}) {
  const bw = h * 0.3, nw = bw * 0.36, g = C(glass);
  const path = () => { X.moveTo(x - bw / 2, b); X.lineTo(x - bw / 2, b - h * 0.58); X.quadraticCurveTo(x - bw / 2, b - h * 0.74, x - nw / 2, b - h * 0.8); X.lineTo(x - nw / 2, b - h); X.lineTo(x + nw / 2, b - h); X.lineTo(x + nw / 2, b - h * 0.8); X.quadraticCurveTo(x + bw / 2, b - h * 0.74, x + bw / 2, b - h * 0.58); X.lineTo(x + bw / 2, b); X.closePath(); };
  cel(path, g, { box: [x - bw / 2, b - h, bw, h], s: 0.3, sx: 0.6, l: 0, lw });
  if (label) F(x - bw / 2 + 0.05, b - h * 0.5, bw - 0.1, h * 0.28, label);
  if (cap) F(x - nw / 2, b - h, nw, h * 0.14, cap);
  F(x - bw / 2 + bw * 0.18, b - h * 0.62, bw * 0.12, h * 0.5, '#FFFFFF', 0.45);
}
function vinyl(cx, cy, r, lab = '#E84A3A') {
  dot(cx, cy, r, '#16141A'); X.strokeStyle = 'rgba(255,255,255,0.14)'; X.lineWidth = 0.08; for (const k of [0.88, 0.76, 0.64, 0.52]) { X.beginPath(); X.arc(cx, cy, r * k, 0, 7); X.stroke(); }
  X.strokeStyle = 'rgba(255,255,255,0.45)'; X.lineWidth = r * 0.12; X.beginPath(); X.arc(cx, cy, r * 0.72, -2.5, -1.7); X.stroke();
  dot(cx, cy, r * 0.34, lab); dot(cx, cy, r * 0.07, '#F4EAD0'); X.strokeStyle = INK; X.lineWidth = 0.15; X.beginPath(); X.arc(cx, cy, r, 0, 7); X.stroke();
}
const PAL = ['#E8603A', '#3AA8E8', '#F2D24A', '#B84AE8', '#4AB86A', '#F28CB4', '#2A2A3A', '#F4EAD0'];
function sleeve(x, y, s, i) { // pochette de 33 tours avec un motif
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
function bookRow(x0, x1, base, hMax, r, { lean = true } = {}) { let x = x0; while (x < x1 - 0.6) { const bw = 0.55 + r() * 0.5, bh = hMax * (0.68 + r() * 0.32); if (x + bw > x1) break; const c = ['#C84A3A', '#3A6AA8', '#E8B83A', '#4A8A4A', '#7A4A8A', '#E8D8B0', '#2A3A5A', '#A86A3A'][(r() * 8) | 0];
  if (lean && r() < 0.08 && x + bh * 0.5 < x1) { X.save(); X.translate(x, base); X.rotate(0.35); R(0, -bh, bw, bh, c, { s: 0, l: 0, lw: 0.1 }); X.restore(); x += bh * 0.38 + bw; continue; }
  R(x, base - bh, bw, bh, c, { s: 0, l: 0, lw: 0.1 }); F(x, base - bh * 0.8, bw, 0.18, '#F2D27A', 0.8); F(x, base - bh * 0.3, bw, 0.12, '#F2D27A', 0.6); x += bw + 0.02; } }
function baguette(x, b, h, rot) { X.save(); X.translate(x, b); X.rotate(rot); E(0, -h / 2, 0.55, h / 2, '#D8963E', { s: 0.3, sx: 0.55, l: 0.25, lx: 0.3, lw: 0.15 }); for (let k = 0.2; k < 0.9; k += 0.2) L(-0.35, -h * k, 0.3, -h * k - 0.5, '#F6D89A', 0.15); X.restore(); }
function boule(cx, cy, r) { E(cx, cy, r, r * 0.72, '#C88440', { s: 0.32, sx: 0.55, l: 0.25, lx: 0.35, lw: 0.15 }); L(cx - r * 0.5, cy - r * 0.15, cx + r * 0.4, cy - r * 0.35, '#F6D89A', 0.15); L(cx - r * 0.3, cy + r * 0.15, cx + r * 0.5, cy - r * 0.05, '#F6D89A', 0.15); }
function croissant(cx, cy, s) { cel(() => { X.moveTo(cx - 1.4 * s, cy + 0.4 * s); X.quadraticCurveTo(cx, cy - 1.4 * s, cx + 1.4 * s, cy + 0.4 * s); X.quadraticCurveTo(cx, cy - 0.2 * s, cx - 1.4 * s, cy + 0.4 * s); }, '#E0A04A', { box: [cx - 1.4 * s, cy - s, 2.8 * s, 1.4 * s], s: 0.3, l: 0.3, lw: 0.12 }); for (const k of [-0.5, 0, 0.5]) L(cx + k * s, cy - 0.55 * s, cx + k * s * 1.2, cy + 0.05 * s, '#9A5A20', 0.1); }
function basket(x, b, w) { R(x, b - 1.6, w, 1.6, '#B8864A', { s: 0.3, l: 0.2, lw: 0.15 }); X.strokeStyle = 'rgba(80,40,10,0.45)'; X.lineWidth = 0.1; for (let k = x + 0.4; k < x + w; k += 0.6) { X.beginPath(); X.moveTo(k, b - 1.6); X.lineTo(k + 0.3, b); X.stroke(); } }
function cake(cx, b, w, h, body, cream, top) { R(cx - w / 2, b - h, w, h, body, { s: 0.25, l: 0.15, lw: 0.15 }); F(cx - w / 2, b - h * 0.55, w, h * 0.12, cream); R(cx - w / 2 - 0.1, b - h - 0.5, w + 0.2, 0.6, cream, { s: 0, l: 0, lw: 0.12 }); for (let k = 0; k < 3; k++) dot(cx - w / 2 + w * (0.2 + k * 0.3), b - h - 0.6, 0.35, top); }
function macarons(x, b, n) { for (let k = 0; k < n; k++) { const c = ['#F28CB4', '#B8E07A', '#F6E07A', '#B89AE8', '#8A5A3A'][k % 5]; E(x, b - 0.5 - k * 0.9, 0.9, 0.38, c, { s: 0.25, l: 0.2, lw: 0.1 }); F(x - 0.8, b - 0.55 - k * 0.9, 1.6, 0.12, '#FFF6E8'); } }
function fish(cx, cy, len, c = '#9AB8C8', dir = 1) { const h = len * 0.32; cel(() => { X.moveTo(cx - dir * len / 2, cy); X.quadraticCurveTo(cx, cy - h, cx + dir * len * 0.32, cy); X.quadraticCurveTo(cx, cy + h, cx - dir * len / 2, cy); }, c, { box: [cx - len / 2, cy - h / 2, len, h], s: 0.3, sx: 0.5, l: 0.25, lx: 0.5, lw: 0.12 });
  P([[cx + dir * len * 0.3, cy], [cx + dir * len / 2, cy - h * 0.5], [cx + dir * len / 2, cy + h * 0.5]], c, { s: 0.2, l: 0, lw: 0.12 }); dot(cx - dir * len * 0.33, cy - h * 0.08, 0.18, '#1A1A1A'); L(cx - dir * len * 0.22, cy - h * 0.25, cx - dir * len * 0.22, cy + h * 0.2, sh(C(c), 0.4), 0.08); }
function steak(cx, cy, s) { E(cx, cy, 1.4 * s, 0.8 * s, '#C8343A', { s: 0.25, l: 0.15, lw: 0.12 }); L(cx - 0.8 * s, cy - 0.2 * s, cx + 0.6 * s, cy + 0.2 * s, '#F6E0D8', 0.2 * s); E(cx + 1.15 * s, cy, 0.3 * s, 0.7 * s, '#F6E8DC', { s: 0, l: 0, lw: 0.08 }); }
function cheeseWheel(cx, b, r, c = '#F2C84A', cut = false) { E(cx, b - r * 0.55, r, r * 0.55, c, { s: 0.25, sx: 0.6, l: 0.2, lw: 0.15 }); L(cx - r, b - r * 0.55, cx + r, b - r * 0.55, sh(C(c), 0.3), 0.12); if (cut) { P([[cx, b - r * 0.55], [cx + r, b - r * 0.75], [cx + r * 0.9, b - r * 0.25]], '#FFF2B0', { s: 0, l: 0, lw: 0.12 }); dot(cx + r * 0.6, b - r * 0.55, r * 0.08, '#E8B83A'); } }
function wedge(x, b, s, c = '#F6E08A') { P([[x, b], [x + 2.4 * s, b], [x + 2.4 * s, b - 1.4 * s]], c, { s: 0.2, l: 0.2, lw: 0.12 }); dot(x + 1.6 * s, b - 0.5 * s, 0.2 * s, sh(C(c), 0.25)); dot(x + 2 * s, b - 0.9 * s, 0.15 * s, sh(C(c), 0.25)); }
function crate(x, b, w, fruit, r) { R(x, b - 2, w, 2, '#C89A5A', { s: 0.25, l: 0.2, lw: 0.15 }); L(x, b - 1, x + w, b - 1, '#8A5A2A', 0.1); for (let k = 0; k < w / 0.85 - 1; k++) for (let j = 0; j < 2; j++) fruitAt(x + 0.6 + k * 0.85 + j * 0.42, b - 2.1 - j * 0.6, fruit, r); }
function fruitAt(x, y, f, r) {
  if (f === 'banana') { X.strokeStyle = '#F2D24A'; X.lineWidth = 0.5; X.beginPath(); X.arc(x, y + 0.6, 0.8, 3.6, 5.8); X.stroke(); return; }
  if (f === 'carrot') { P([[x - 0.25, y - 0.4], [x + 0.25, y - 0.4], [x, y + 0.9]], '#F28A2A', { s: 0, l: 0, lw: 0.08 }); F(x - 0.15, y - 0.8, 0.3, 0.4, '#4AA84A'); return; }
  if (f === 'salad') { E(x, y, 0.55, 0.45, '#8AD06A', { s: 0.3, l: 0, lw: 0.08 }); return; }
  if (f === 'grape') { for (let k = 0; k < 3; k++) dot(x - 0.2 + k * 0.2, y + k * 0.15, 0.22, '#7A3A9A'); return; }
  const c = { apple: '#D8343A', orange: '#F28A2A', lemon: '#F6E04A', pear: '#B8D04A', tomato: '#E8402A' }[f] || '#D8343A';
  dot(x, y, 0.42, c); dot(x - 0.14, y - 0.14, 0.12, '#FFFFFF', 0.6);
}
function glasses(cx, cy, s, c = '#2A2A2A', lens = '#CFE6F2') { for (const d of [-1, 1]) { RR(cx + d * 0.95 * s - 0.75 * s, cy - 0.5 * s, 1.5 * s, 1 * s, 0.4 * s, lens, { s: 0, l: 0, lw: 0 }); X.strokeStyle = c; X.lineWidth = 0.22 * s; X.beginPath(); X.roundRect(cx + d * 0.95 * s - 0.75 * s, cy - 0.5 * s, 1.5 * s, 1 * s, 0.4 * s); X.stroke(); } L(cx - 0.2 * s, cy - 0.15 * s, cx + 0.2 * s, cy - 0.15 * s, c, 0.18 * s); L(cx - 1.7 * s, cy - 0.35 * s, cx - 2.1 * s, cy - 0.5 * s, c, 0.15 * s); L(cx + 1.7 * s, cy - 0.35 * s, cx + 2.1 * s, cy - 0.5 * s, c, 0.15 * s); }
function flower(x, y, c, k = 0) { if (k % 3 === 0) { for (let a = 0; a < 5; a++) dot(x + Math.cos(a * 1.26) * 0.38, y + Math.sin(a * 1.26) * 0.38, 0.3, c); dot(x, y, 0.2, '#F6E04A'); } else if (k % 3 === 1) { P([[x - 0.4, y - 0.1], [x - 0.25, y - 0.6], [x, y - 0.3], [x + 0.25, y - 0.6], [x + 0.4, y - 0.1], [x, y + 0.35]], c, { s: 0.2, l: 0, lw: 0.08 }); } else { dot(x, y, 0.45, c); X.strokeStyle = rgba(sh(C(c), 0.35)); X.lineWidth = 0.1; X.beginPath(); X.arc(x, y, 0.25, 0, 5); X.stroke(); } }
function bucket(x, b, r, cols) { for (let k = 0; k < 7; k++) { const fx = x - 1 + (k % 4) * 0.7 + (k > 3 ? 0.35 : 0), fy = b - 4.2 - (k > 3 ? 0.9 : 0) - r() * 0.6; L(x, b - 1.8, fx, fy, '#3A8A3A', 0.12); flower(fx, fy, cols[k % cols.length], k); } P([[x - 1.2, b - 2], [x + 1.2, b - 2], [x + 0.9, b], [x - 0.9, b]], '#7A8A9A', { s: 0.3, l: 0.2, lw: 0.15 }); }
function hanger(x, top, c, kind) { L(x, top, x, top + 0.6, '#5A5A5A', 0.1); L(x - 0.9, top + 1, x, top + 0.5, '#5A5A5A', 0.1); L(x + 0.9, top + 1, x, top + 0.5, '#5A5A5A', 0.1);
  if (kind === 0) P([[x - 1, top + 1], [x + 1, top + 1], [x + 1.2, top + 2.2], [x + 0.8, top + 2.2], [x + 0.8, top + 5], [x - 0.8, top + 5], [x - 0.8, top + 2.2], [x - 1.2, top + 2.2]], c, { s: 0.25, l: 0.15, lw: 0.12 });
  else P([[x - 0.7, top + 1], [x + 0.7, top + 1], [x + 1.5, top + 6], [x - 1.5, top + 6]], c, { s: 0.25, l: 0.15, lw: 0.12 }); }
function screen(x, y, w, h, lit, k = 0) { R(x, y, w, h, '#1A1A22', { s: 0, l: 0, lw: 0.15 }); const sx = x + 0.3, sy = y + 0.3, sw = w - 0.6, s2 = h - 0.6; F(sx, sy, sw, s2, lit ? ['#2A4AD8', '#1A8A4A', '#8A2AB8'][k % 3] : '#22283A'); if (lit) { F(sx + sw * 0.15, sy + s2 * 0.6, sw * 0.2, s2 * 0.2, '#F6E04A'); F(sx + sw * 0.55, sy + s2 * 0.3, sw * 0.18, s2 * 0.18, '#F24A6A'); F(sx, sy + s2 * 0.85, sw, s2 * 0.15, '#4AE88A'); } }
function person(cx, b, s, shirt = '#3A6AA8', skin = '#E8B890', hair = '#3A2A1A') { E(cx, b - 3.1 * s, 0.75 * s, 0.85 * s, skin, { s: 0.25, l: 0, lw: 0.12 }); cel(() => { X.arc(cx, b - 3.3 * s, 0.8 * s, Math.PI, 0); }, hair, { s: 0, l: 0, lw: 0 }); P([[cx - 1.1 * s, b], [cx - 1 * s, b - 1.9 * s], [cx - 0.5 * s, b - 2.3 * s], [cx + 0.5 * s, b - 2.3 * s], [cx + 1 * s, b - 1.9 * s], [cx + 1.1 * s, b]], shirt, { s: 0.25, sx: 0.6, l: 0.15, lw: 0.12 }); }

// ---------- Les 32 intérieurs ----------
const D = {};
// Alimentation
D.bakery = (w, h, lit, r) => { room(w, h, '#F3E2C0', '#C9A06A', { wainscot: '#B88A5A' });
  // mur à pains : casiers en bois, baguettes debout, boules, couronnes
  R(w * 0.38, 1.6, w * 0.6, h - 9, '#A87048', { s: 0.2, l: 0, lw: 0.2 }); each(w * 0.38 + 0.5, w * 0.98 - 0.5, 4, (x, i) => { R(x, 2.2, 3.4, h - 10.2, '#8A5634', { s: 0.25, sx: 0.85, l: 0, lw: 0.12 }); if (i % 2 === 0) for (let k = 0; k < 5; k++) baguette(x + 0.6 + k * 0.55, h - 8.3, h - 11, -0.08 + k * 0.04); else { boule(x + 1.7, h - 9.4, 1.4); boule(x + 1.7, 4.6, 1.3); boule(x + 1.7, 7, 1.4); } });
  dot(w * 0.2, 4.4, 2.2, '#F6E8C8'); E(w * 0.2, 4.4, 2.2, 2.2, '#F6E8C8', { s: 0.2, l: 0, lw: 0.15 }); text('PAIN', w * 0.2, 4.4, 1.3, '#8A4B1E', { b: true, f: 'Georgia, serif' });
  const y = counter(0.6, w * 0.7, h, '#E8D8B8', '#C8A070', { panels: true }); // vitrine réfrigérée avec viennoiseries
  R(1, y - 3.2, w * 0.66, 3.2, '#DDEEF4', { s: 0, l: 0, lw: 0.15, a: 0.85 }); for (let k = 0; k < w * 0.66 / 2.4 - 0.5; k++) croissant(2.4 + k * 2.4, y - 1, 0.8); F(1.2, y - 3, w * 0.66 - 0.4, 0.4, '#FFFFFF', 0.5);
  basket(w * 0.75, h - 2.4, 4); for (let k = 0; k < 4; k++) baguette(w * 0.75 + 0.7 + k * 0.9, h - 3.4, 6, -0.25 + k * 0.15);
  return w * 0.35; };
D.pastry = (w, h, lit, r) => { room(w, h, '#FBE3EC', '#E8C4D0', { paper: true });
  // étagères à gâteaux, présentoir à étages de macarons, guirlande
  shelf(w * 0.45, 6, w * 0.53, '#FFFFFF'); shelf(w * 0.45, 11, w * 0.53, '#FFFFFF'); each(w * 0.46, w * 0.98, 3.4, (x, i) => { cake(x + 1.6, 6, 2.6, 2.2, ['#8A4A2A', '#F6E0B0', '#F28CB4'][i % 3], '#FFF6E8', '#D8243A'); cake(x + 1.6, 11, 2.4, 2, ['#F6E0B0', '#B8E07A', '#8A4A2A'][i % 3], '#F28CB4', '#FFFFFF'); });
  // présentoir à étages
  const px = w * 0.24; L(px, 2, px, 12, '#C8A040', 0.25); for (const [yy, rr] of [[4.6, 2.2], [8, 3], [11.6, 3.8]]) { E(px, yy, rr, 0.4, '#FFFFFF', { s: 0, l: 0, lw: 0.15 }); for (let k = -rr + 0.7; k < rr - 0.3; k += 1.1) { E(px + k, yy - 0.6, 0.5, 0.3, ['#F28CB4', '#B8E07A', '#F6E07A', '#B89AE8'][(k * 3 + yy | 0) & 3], { s: 0.2, l: 0, lw: 0.08 }); } }
  const y = counter(0.6, w * 0.88, h, '#FFFFFF', '#F6D0DC', { panels: true }); R(1, y - 3, w * 0.86, 3, '#EAF6FA', { s: 0, l: 0, lw: 0.15, a: 0.8 });
  each(1.6, w * 0.86, 2.6, (x, i) => i % 3 === 2 ? macarons(x + 1, y, 3) : cake(x + 1.1, y, 1.8, 1.4, ['#F6E0B0', '#8A4A2A'][i % 2], '#F28CB4', '#D8243A'));
  return w * 0.5; };
D.chocolatier = (w, h, lit, r) => { room(w, h, '#7B4B32', '#A9714F', { wainscot: '#4A2A1A' });
  // vitrines de pralinés, boîtes dorées à rubans, tablettes, fontaine
  for (const yy of [4.5, 8.6]) { shelf(1, yy, w - 2, '#C8A040'); each(1.4, w - 1.4, 3.6, (x, i) => { if ((i + yy | 0) % 2) { R(x, yy - 2.6, 3, 2.6, '#E8C060', { s: 0.25, l: 0.25, lw: 0.12 }); L(x + 1.5, yy - 2.6, x + 1.5, yy, '#C8243A', 0.25); L(x, yy - 1.3, x + 3, yy - 1.3, '#C8243A', 0.25); } else { R(x, yy - 1.4, 3, 1.4, '#3A1A10', { s: 0, l: 0, lw: 0.12 }); each(x + 0.4, x + 2.8, 0.75, xx => dot(xx + 0.3, yy - 0.8, 0.28, ['#6A3A20', '#E8D0A0', '#8A4A2A'][(xx * 3 | 0) % 3])); } }); }
  const y = counter(0.6, w * 0.9, h, '#E8C890', '#4A2A1A', { panels: true }); R(1, y - 2.6, w * 0.88, 2.6, '#F2E8DA', { s: 0, l: 0, lw: 0.15, a: 0.75 });
  each(1.6, w * 0.86, 1.1, (x, i) => { dot(x + 0.4, y - 0.6, 0.42, ['#3A1A10', '#6A3A20', '#E8D0A0', '#A8682A'][i % 4]); dot(x + 0.25, y - 0.8, 0.12, '#FFFFFF', 0.5); });
  return w * 0.55; };
D.butcher = (w, h, lit, r) => { room(w, h, '#F4EDE6', '#D9D2CA', { tiles: '#F6F2EE' });
  F(0, 5.6, w, 0.5, '#A3262A'); // frise rouge dans la faïence
  // rail : jambons, saucissons, chapelets de saucisses
  L(0.5, 1.6, w - 0.5, 1.6, '#8A8A8A', 0.25); each(1.5, w - 1, 3.4, (x, i) => { L(x + 1, 1.6, x + 1, 2.6, '#5A5A5A', 0.12); if (i % 3 === 0) cel(() => { X.moveTo(x + 1, 2.6); X.quadraticCurveTo(x + 2.4, 3.6, x + 2, 6.6); X.quadraticCurveTo(x + 1, 7.8, x, 6.6); X.quadraticCurveTo(x - 0.3, 3.6, x + 1, 2.6); }, '#C8584A', { box: [x - 0.3, 2.6, 2.7, 5], s: 0.3, l: 0.2, lw: 0.15 }); else if (i % 3 === 1) for (let k = 0; k < 4; k++) E(x + 1, 3.2 + k * 1.1, 0.4, 0.55, '#A8483A', { s: 0.25, l: 0, lw: 0.1 }); else { E(x + 1, 4.4, 0.55, 1.8, '#8A3A2A', { s: 0.3, l: 0.15, lw: 0.12 }); for (let k = 0; k < 4; k++) dot(x + 0.8 + (k % 2) * 0.4, 3.4 + k * 0.6, 0.12, '#F6E8DC'); } });
  // planche, couteaux aimantés
  each(w * 0.55, w - 1, 1.2, (x, i) => { F(x, 7.2, 0.25, 1.4, '#3A3A3A'); P([[x - 0.2, 8.6], [x + 0.45, 8.6], [x + 0.35, 10.6], [x - 0.2, 10.2]], '#C8D0D8', { s: 0.2, l: 0, lw: 0.08 }); });
  const y = counter(0.6, w * 0.95, h, '#E8E8E8', '#F6F4F0'); R(0.9, y - 3.6, w * 0.93, 3.6, '#E8F4F8', { s: 0, l: 0, lw: 0.15, a: 0.6 }); F(0.9, y - 0.9, w * 0.93, 0.9, '#4A8A4A'); // persil
  each(1.6, w * 0.92, 2.8, (x, i) => i % 2 ? steak(x + 1.3, y - 1.4, 0.75) : (E(x + 1.3, y - 1.4, 1.2, 0.7, '#E87A6A', { s: 0.2, l: 0, lw: 0.1 }), L(x + 0.4, y - 1.4, x + 2.2, y - 1.4, '#F6E0D8', 0.15)));
  return w * 0.35; };
D.fishmonger = (w, h, lit, r) => { room(w, h, '#DCEBF2', '#B7CAD3', { tiles: '#E6F2F8' });
  // filets de pêche, bouée, ardoise des arrivages
  X.strokeStyle = 'rgba(90,110,130,0.5)'; X.lineWidth = 0.1; for (let k = 0; k < w * 0.5; k += 1.2) { X.beginPath(); X.moveTo(w * 0.45 + k, 1.2); X.lineTo(w * 0.45 + k + 3, 7); X.stroke(); X.beginPath(); X.moveTo(w * 0.45 + k + 3, 1.2); X.lineTo(w * 0.45 + k, 7); X.stroke(); }
  E(w * 0.85, 4, 1.8, 1.8, '#E8402A', { s: 0.2, l: 0, lw: 0.15 }); E(w * 0.85, 4, 0.9, 0.9, '#E6F2F8', { s: 0, l: 0, lw: 0.15 }); F(w * 0.85 - 0.3, 2.2, 0.6, 0.6, '#FFFFFF'); F(w * 0.85 - 0.3, 5.2, 0.6, 0.6, '#FFFFFF');
  R(1.2, 1.8, w * 0.32, 5.4, '#2E3A34', { s: 0, l: 0, lw: 0.2 }); for (let k = 0; k < 4; k++) L(1.8, 3 + k * 1.1, 1.8 + w * 0.22 - (k % 2) * 2, 3 + k * 1.1, 'rgba(255,255,255,0.75)', 0.18);
  // étal incliné sur glace pilée
  const y = h - 7.4; P([[0.5, y + 0.6], [w - 0.5, y + 0.6], [w - 0.5, y - 3.4], [0.5, y - 1.4]], '#F2F8FB', { s: 0.12, l: 0, lw: 0.2 }); X.fillStyle = 'rgba(160,200,220,0.6)'; for (let k = 0; k < 60; k++) { X.beginPath(); X.arc(0.8 + r() * (w - 1.6), y - 0.8 - r() * 2.2 * (1), 0.18, 0, 7); X.fill(); }
  each(1.2, w - 2.4, 4.2, (x, i) => { fish(x + 2, y - 1.3 - i * 0.12, 3.6, ['#9AB8C8', '#C8A8B8', '#B8C8A8'][i % 3], i % 2 ? 1 : -1); });
  each(2.2, w - 3, 5.6, (x, i) => { if (i % 2) { E(x + 1.6, y - 2.6, 0.9, 0.55, '#E8603A', { s: 0.25, l: 0, lw: 0.1 }); L(x + 0.8, y - 2.8, x + 0.2, y - 3.3, '#C8402A', 0.15); L(x + 2.4, y - 2.8, x + 3, y - 3.3, '#C8402A', 0.15); } else { for (let k = 0; k < 3; k++) { X.strokeStyle = '#F28A8A'; X.lineWidth = 0.35; X.beginPath(); X.arc(x + 0.8 + k * 0.9, y - 2.6, 0.35, 0.5, 4.5); X.stroke(); } } });
  each(1.2, w - 1.2, 1.6, (x, i) => i % 3 === 0 && fruitAt(x, y - 0.6, 'lemon'));
  R(0.5, y + 0.6, w - 1, 4.6, '#F6F4F0', { s: 0.2, sx: 0.8, l: 0, lw: 0.2 }); F(0.5, y + 1.4, w - 1, 0.5, '#2D6F9A');
  return w * 0.3; };
D.cheese = (w, h, lit, r) => { room(w, h, '#F6E8B8', '#D8BE7A', { wainscot: '#8A6A3A' });
  // étagères en bois : meules, tommes, pyramides, cloche
  for (const yy of [5, 9.6]) { shelf(0.6, yy, w - 1.2, '#8A6A3A'); let x = 1.4; let i = 0; while (x < w - 3) { const k = (r() * 4) | 0; if (k === 0) { cheeseWheel(x + 1.5, yy, 1.6, '#E8C060', r() < 0.4); x += 3.6; } else if (k === 1) { cheeseWheel(x + 1, yy, 1, '#F6F0E0'); x += 2.4; } else if (k === 2) { P([[x, yy], [x + 2, yy], [x + 1.4, yy - 1.6], [x + 0.6, yy - 1.6]], '#4A4A4A', { s: 0.2, l: 0.15, lw: 0.12 }); x += 2.6; } else { cheeseWheel(x + 1.3, yy, 1.3, '#C87A3A'); x += 3; } i++; } }
  const y = counter(0.6, w * 0.92, h, '#F4EAD0', '#8A6A3A', { panels: true });
  each(1.4, w * 0.9, 3, (x, i) => i % 2 ? wedge(x, y, 0.9, ['#F6E08A', '#F6F0E0'][i % 2]) : cheeseWheel(x + 1.2, y, 1, '#F2C84A', true));
  E(w * 0.8, y - 1.6, 1.5, 1.6, '#DDEEF4', { s: 0, l: 0.2, lw: 0.15, a: 0.7 }); dot(w * 0.8, y - 3.3, 0.3, '#C8A040');
  return w * 0.4; };
D.greengrocer = (w, h, lit, r) => { room(w, h, '#E6F1D3', '#BFCF9D', { wainscot: '#7A8A4A' });
  // gradins de cageots inclinés, ardoise de prix, balance
  const fruits = ['apple', 'orange', 'lemon', 'pear', 'tomato', 'grape', 'banana', 'salad', 'carrot'];
  for (let row = 0; row < 3; row++) { const b = 5 + row * 4.4; each(0.8 + row * 0.6, w - 0.8, 4.2, (x, i) => { crate(x, b, 3.8, fruits[(i * 3 + row * 2) % fruits.length], r); R(x + 1.2, b - 0.8, 1.4, 0.9, '#FFFFFF', { s: 0, l: 0, lw: 0.08 }); }); }
  const y = counter(w * 0.62, w * 0.36, h, '#E8E0C8', '#8A6A3A'); R(w * 0.66, y - 1.6, 3, 1.6, '#E8E8E8', { s: 0.25, l: 0.2, lw: 0.12 }); E(w * 0.66 + 1.5, y - 2, 1.6, 0.4, '#C8C8C8', { s: 0, l: 0, lw: 0.12 });
  return w * 0.75; };
D.wine = (w, h, lit, r) => { room(w, h, '#8B3A52', '#6E4A3A', { wainscot: '#4A2A1A' });
  // casiers en losange, bouteilles vues par le cul, rangée de bouteilles debout, tonneau-table
  const cx0 = w * 0.42; R(cx0, 1.4, w - cx0 - 0.6, h - 8.4, '#6A4A2A', { s: 0.2, l: 0, lw: 0.2 });
  for (let yy = 2.2; yy < h - 8; yy += 1.2) for (let xx = cx0 + 0.7 + ((yy / 1.2 | 0) % 2) * 0.6; xx < w - 1.1; xx += 1.2) { dot(xx, yy + 0.4, 0.5, '#1E2A1A'); dot(xx, yy + 0.4, 0.22, ['#6A1A2A', '#2E4A2A', '#C8A040'][(xx * yy | 0) % 3]); X.strokeStyle = INK; X.lineWidth = 0.08; X.beginPath(); X.arc(xx, yy + 0.4, 0.5, 0, 7); X.stroke(); }
  shelf(0.8, 7.2, cx0 - 1.6, '#C8A070'); each(1.2, cx0 - 1, 1.1, (x, i) => bottle(x + 0.5, 7.2, 4.8, ['#2E4A2A', '#5A1A2A', '#1E2A1A', '#C8D8A8'][i % 4], { cap: ['#C8A040', '#A8243A', '#E8E8E8'][i % 3] }));
  shelf(0.8, 12.2, cx0 - 1.6, '#C8A070'); each(1.2, cx0 - 1, 1.6, (x, i) => { X.save(); X.translate(x + 0.8, 12.2); X.rotate(-1.5708); bottle(0, 0, 3.6, ['#2E4A2A', '#5A1A2A'][i % 2], { label: null, cap: '#C8A040' }); X.restore(); });
  // tonneau
  const bx = w * 0.18, by = h - 2.2; cel(() => { X.moveTo(bx - 2.4, by); X.quadraticCurveTo(bx - 3, by - 3, bx - 2.4, by - 6); X.lineTo(bx + 2.4, by - 6); X.quadraticCurveTo(bx + 3, by - 3, bx + 2.4, by); X.closePath(); }, '#A86A3A', { box: [bx - 3, by - 6, 6, 6], s: 0.3, l: 0.2, lw: 0.2 }); for (const k of [1.2, 4.8]) L(bx - 2.6, by - k, bx + 2.6, by - k, '#3A3A3A', 0.3);
  bottle(bx - 1, by - 6, 3.4, '#5A1A2A', { cap: '#A8243A' }); cel(() => { X.moveTo(bx + 0.7, by - 7.2); X.lineTo(bx + 1.9, by - 7.2); X.lineTo(bx + 1.6, by - 6.4); X.lineTo(bx + 1, by - 6.4); X.closePath(); }, '#E8F0F4', { s: 0, l: 0, lw: 0.1 }); F(bx + 0.85, by - 6.9, 0.9, 0.45, '#8A1A2A'); L(bx + 1.3, by - 6.4, bx + 1.3, by - 6, INK, 0.1);
  const y = counter(w * 0.52, w * 0.46, h, '#C8A070', '#4A2A1A', { panels: true });
  return w * 0.75; };
D.grocery = (w, h, lit, r) => { room(w, h, '#F2DDB4', '#B89A66', { wainscot: '#8A5A2A' });
  // bocaux, conserves, sacs de jute avec pelle, tresses d'ail
  for (const yy of [4.6, 8.8]) { shelf(0.6, yy, w - 1.2, '#8A5A2A'); each(1, w - 1, 2, (x, i) => { if ((i + yy | 0) % 3 === 0) { R(x, yy - 2.6, 1.6, 2.6, '#DDEEF4', { s: 0, l: 0.15, lw: 0.12, a: 0.85 }); F(x + 0.1, yy - 1.8, 1.4, 1.7, ['#E8A030', '#C8402A', '#6A9A3A', '#F2E8C0'][i % 4]); R(x - 0.1, yy - 3, 1.8, 0.5, '#C8A040', { s: 0, l: 0, lw: 0.1 }); } else { R(x, yy - 2, 1.6, 2, ['#E8402A', '#3A7AC8', '#F2C83A', '#4A9A4A'][i % 4], { s: 0.25, sx: 0.7, l: 0.25, lw: 0.12 }); F(x, yy - 1.4, 1.6, 0.8, '#F6EAD0'); } }); }
  for (const x of [w * 0.86, w * 0.94]) { L(x, 1, x, 6, '#C8A880', 0.15); for (let k = 0; k < 5; k++) dot(x + ((k % 2) - 0.5) * 0.5, 2 + k * 0.9, 0.42, '#F6F0E0'); }
  each(0.8, w * 0.6, 3.6, (x, i) => { cel(() => { X.moveTo(x, h - 2.2); X.lineTo(x + 0.3, h - 6.4); X.quadraticCurveTo(x + 1.6, h - 7, x + 2.9, h - 6.4); X.lineTo(x + 3.2, h - 2.2); X.closePath(); }, '#C8A870', { box: [x, h - 7, 3.2, 4.8], s: 0.3, l: 0.2, lw: 0.15 }); E(x + 1.6, h - 6.4, 1.3, 0.35, ['#5A3A20', '#F6F0E0', '#E8A030'][i % 3], { s: 0, l: 0, lw: 0.1 }); L(x + 2, h - 6.6, x + 2.8, h - 7.6, '#C8C8C8', 0.25); });
  const y = counter(w * 0.62, w * 0.36, h, '#E8D8B8', '#8A5A2A'); R(w * 0.66, y - 2.4, 3.4, 2.4, '#3A3A3A', { s: 0.2, l: 0.2, lw: 0.15 }); F(w * 0.66 + 0.4, y - 2, 2.6, 0.8, '#7AE8A0');
  return w * 0.78; };
D.minimarket = (w, h, lit, r) => { room(w, h, '#E8EEF4', '#C5CDD6');
  F(0, 1.2, w, 1.4, '#1C6FB8'); text('FRAIS · ÉPICERIE · BOISSONS', w * 0.45, 1.9, 0.9, '#FFE45C', { b: true });
  // frigos vitrés lumineux, gondoles de paquets, caisse
  const fx = w * 0.7; R(fx, 3, w - fx - 0.4, h - 5.2, '#D8DEE4', { s: 0.2, l: 0, lw: 0.2 }); for (let k = 0; k < 2; k++) { const gx = fx + 0.5 + k * (w - fx - 1.3) / 2; F(gx, 3.5, (w - fx - 1.3) / 2 - 0.2, h - 6.2, lit ? '#E8F8FF' : '#B8D0DC'); for (let yy = 5.6; yy < h - 3; yy += 2.6) { F(gx, yy, (w - fx - 1.3) / 2 - 0.2, 0.25, '#9AA8B0'); each(gx + 0.2, gx + (w - fx - 1.3) / 2 - 0.4, 0.8, (x, i) => bottle(x + 0.35, yy, 2.2, ['#E8402A', '#3AA8E8', '#F2D24A', '#4AB86A', '#FFFFFF'][(i + yy | 0) % 5], { label: '#FFFFFF', cap: '#3A3A3A', lw: 0.06 })); } }
  for (const yy of [6, 10.4]) { shelf(0.6, yy, fx - 1.2, '#9AA8B0'); each(1, fx - 1, 1.3, (x, i) => R(x, yy - 2.6 + (i % 3) * 0.3, 1.1, 2.6 - (i % 3) * 0.3, ['#E84A3A', '#3A8AE8', '#F2C83A', '#4AB84A', '#F4F4F4', '#B84AE8'][(i * 7 + yy | 0) % 6], { s: 0.25, sx: 0.7, l: 0, lw: 0.1 })); }
  const y = counter(0.6, w * 0.4, h, '#3A3A3A', '#1C6FB8'); R(w * 0.06, y - 2.2, 2.6, 2.2, '#2A2A2A', { s: 0, l: 0.2, lw: 0.12 }); F(w * 0.06 + 0.3, y - 1.9, 2, 0.8, lit ? '#7AE8A0' : '#2A4A3A'); each(w * 0.2, w * 0.4, 1.2, (x, i) => R(x, y - 1.2, 1, 1.2, ['#F2C83A', '#E84A3A', '#4AB84A'][i % 3], { s: 0, l: 0, lw: 0.08 }));
  return w * 0.2; };
// Services et boutiques
D.pharmacy = (w, h, lit, r) => { room(w, h, '#EAF5EE', '#C9DCCF');
  // mur de tiroirs, étagères de boîtes, croix verte lumineuse, affiche
  const x0 = w * 0.45; for (let yy = 1.6; yy < 7.2; yy += 1.8) each(x0, w - 0.3, 2.2, x => { R(x, yy, 2, 1.6, '#FAFCFB', { s: 0.15, sx: 0.8, l: 0, lw: 0.12 }); dot(x + 1, yy + 0.8, 0.2, '#8A9A92'); });
  for (const yy of [9.6, 12.6]) { shelf(x0, yy, w - x0 - 0.4, '#FFFFFF'); each(x0 + 0.3, w - 0.6, 1.3, (x, i) => { R(x, yy - 1.9, 1.1, 1.9, ['#FFFFFF', '#E8F4EC', '#FFFFFF', '#F6F0E0'][i % 4], { s: 0.2, sx: 0.7, l: 0, lw: 0.1 }); F(x, yy - 1.4, 1.1, 0.35, ['#1E8A4C', '#3A7AC8', '#E8402A', '#F2C83A'][(i * 3) % 4]); }); }
  const cx = w * 0.18; if (lit) glow(cx, 4.6, 3.4, '#2EE06A', 0.25); cel(() => { X.rect(cx - 0.8, 2.2, 1.6, 4.8); X.rect(cx - 2.4, 3.8, 4.8, 1.6); }, lit ? '#3CF27A' : '#1E8A4C', { s: 0, l: 0, lw: 0.15 });
  R(w * 0.3, 2, 3.4, 4.6, '#FFFFFF', { s: 0, l: 0, lw: 0.12 }); F(w * 0.3 + 0.4, 2.5, 2.6, 1.6, '#7AC8E8'); F(w * 0.3 + 0.4, 4.6, 2.6, 0.3, '#3A3A3A'); F(w * 0.3 + 0.4, 5.3, 1.8, 0.3, '#3A3A3A');
  const y = counter(0.6, w * 0.88, h, '#F6F8F7', '#D6E2DC'); F(0.6, y + 1.6, w * 0.88, 0.5, '#1E8A4C'); R(w * 0.6, y - 1.8, 2.4, 1.8, '#2A2A2A', { s: 0, l: 0.2, lw: 0.12 }); F(w * 0.6 + 0.3, y - 1.5, 1.8, 0.7, '#7AE8A0'); each(w * 0.15, w * 0.45, 2.4, (x, i) => R(x, y - 1.6, 1.8, 1.6, ['#FFFFFF', '#F6E0E8'][i % 2], { s: 0.2, l: 0, lw: 0.1 }));
  return w * 0.3; };
D.florist = (w, h, lit, r) => { room(w, h, '#FBE6EE', '#D6B6C2');
  const cols = [['#F05A8A', '#FFFFFF'], ['#FFD84A', '#F28A2A'], ['#B85AE8', '#F05A8A'], ['#E8402A', '#FFFFFF'], ['#FFFFFF', '#F6C0D0']];
  // plantes suspendues, étagère de pots, seaux de fleurs coupées, bouquet emballé
  each(2, w - 2, 7, (x, i) => { L(x, 0, x, 2.4, '#8A6A4A', 0.12); R(x - 1, 2.4, 2, 1.4, '#C86A40', { s: 0.3, l: 0, lw: 0.12 }); for (let k = 0; k < 4; k++) { X.strokeStyle = '#3A8A3A'; X.lineWidth = 0.3; X.beginPath(); X.moveTo(x - 0.8 + k * 0.5, 3.6); X.quadraticCurveTo(x - 1.2 + k * 0.6, 5.6, x - 0.6 + k * 0.4, 6.6 + (k % 2)); X.stroke(); } });
  shelf(0.6, 9, w - 1.2, '#FFFFFF'); each(1.6, w - 1.6, 3.4, (x, i) => plant(x + 1, 9, 0.7));
  each(0.6, w - 0.6, 3.2, (x, i) => bucket(x + 1.6, h - 2.4, r, cols[i % cols.length]));
  return w * 0.55; };
D.bookshop = (w, h, lit, r) => { room(w, h, '#E7DEC9', '#9C7A55');
  // bibliothèque toute hauteur, échelle, table de nouveautés, panneau « coup de cœur »
  R(0.4, 1.2, w - 0.8, h - 3.4, '#7A5434', { s: 0.15, l: 0, lw: 0.2 }); for (let yy = 4.4; yy < h - 2.4; yy += 3.4) { R(0.9, yy - 3, w - 1.8, 3, '#4A3020', { s: 0, l: 0, lw: 0 }); bookRow(1, w - 1, yy, 2.7, r); shelf(0.6, yy, w - 1.2, '#8A6040'); }
  const lx = w * 0.62; L(lx, 1.4, lx + 2.4, h - 2.2, '#5A3A20', 0.4); L(lx + 1.6, 1.4, lx + 4, h - 2.2, '#5A3A20', 0.4); for (let k = 2.5; k < h - 3; k += 1.8) L(lx + (k / h) * 2.4, k, lx + 1.6 + (k / h) * 2.4, k, '#5A3A20', 0.25);
  const ty = h - 6.2; R(1.4, ty, w * 0.42, 0.8, '#A87A4A', { s: 0, l: 0.2, lw: 0.15 }); F(2, ty + 0.8, 0.6, h - 2.2 - ty - 0.8, '#5A3A20'); F(w * 0.42, ty + 0.8, 0.6, h - 2.2 - ty - 0.8, '#5A3A20');
  each(2, w * 0.42, 2.6, (x, i) => { for (let k = 0; k < 3; k++) R(x + (k % 2) * 0.2, ty - 0.55 - k * 0.55, 2, 0.55, ['#C84A3A', '#3A6AA8', '#F2D27A', '#4A8A4A'][(i + k) % 4], { s: 0, l: 0, lw: 0.08 }); });
  R(w * 0.2, ty - 3.6, 2.6, 1.6, '#F6F0E0', { s: 0, l: 0, lw: 0.1 }); text('♥', w * 0.2 + 1.3, ty - 2.8, 1.2, '#C8243A');
  return w * 0.8; };
D.records = (w, h, lit, r) => { room(w, h, '#34343C', '#56565F');
  // mur de pochettes de 33 tours, affiches, bacs à disques, platine qui tourne
  let i = 0; for (let yy = 1.6; yy < 8; yy += 3.1) each(0.8, w - 0.8, 3.1, x => sleeve(x, yy, 2.8, i++));
  // disque à moitié sorti de sa pochette au mur
  vinyl(w * 0.2 + 2.6, 4.6, 1.6, '#F2D24A'); sleeve(w * 0.2, 3.2, 2.8, 3);
  // bacs à disques : pochettes vues par le haut, inclinées
  const by = h - 2.2; for (const bx of [0.8, w * 0.5]) { const bw = w * 0.42; for (let k = 0; k < bw / 0.9 - 1; k++) { X.save(); X.translate(bx + 0.8 + k * 0.85, by - 2.6); X.rotate(-0.25 + r() * 0.12); R(0, -2.4, 2.6, 2.4, PAL[(k * 5 + (bx | 0)) % PAL.length], { s: 0.15, sx: 0.8, l: 0, lw: 0.1 }); X.restore(); }
    R(bx, by - 3.4, bw, 3.4, '#A86A3A', { s: 0.25, sx: 0.8, l: 0.2, lw: 0.2 }); text('A–Z', bx + bw / 2, by - 1.7, 1, '#F6E0B0', { b: true }); }
  // platine sur un meuble
  const tx = w * 0.72, ty = 9.6; R(tx - 0.4, ty, 6.4, 1.2, '#2A2A30', { s: 0, l: 0.2, lw: 0.15 }); R(tx, ty - 0.9, 5.6, 0.9, '#C8B8A0', { s: 0.2, l: 0.2, lw: 0.15 }); E(tx + 2.3, ty - 1.05, 2.1, 0.32, '#16141A', { s: 0, l: 0, lw: 0.1 }); E(tx + 2.3, ty - 1.1, 0.6, 0.12, '#E8603A', { s: 0, l: 0, lw: 0 }); L(tx + 5, ty - 1.2, tx + 3.6, ty - 1.3, '#C8C8C8', 0.2);
  return w * 0.5; };
D.games = (w, h, lit, r) => { room(w, h, '#E5DAF5', '#A592CC');
  // boîtes de jeux de société, consoles, peluches, écran de démo
  for (const yy of [5, 9.4]) { shelf(0.6, yy, w * 0.6, '#FFFFFF'); each(1, w * 0.6, 2.6, (x, i) => { R(x, yy - 3.4 + (i % 2) * 0.6, 2.3, 3.4 - (i % 2) * 0.6, ['#E84A3A', '#3A8AE8', '#F2C83A', '#4AB84A', '#B84AE8'][(i * 3 + yy | 0) % 5], { s: 0.25, sx: 0.75, l: 0.15, lw: 0.12 }); dot(x + 1.1, yy - 2 + (i % 2) * 0.3, 0.55, '#FFFFFF'); F(x + 0.3, yy - 0.9, 1.7, 0.3, '#FFFFFF', 0.7); }); }
  screen(w * 0.66, 1.8, w * 0.3, 5.4, lit || true, 0); R(w * 0.66 + w * 0.15 - 0.4, 7.2, 0.8, 0.8, '#2A2A30', { s: 0, l: 0, lw: 0.1 });
  // manettes et peluches
  each(w * 0.66, w - 0.8, 2.4, (x, i) => { E(x + 1, 9.6, 1, 0.55, ['#2A2A30', '#E8E8E8'][i % 2], { s: 0.2, l: 0.2, lw: 0.1 }); dot(x + 0.6, 9.5, 0.15, '#E84A3A'); dot(x + 1.4, 9.5, 0.15, '#3A8AE8'); });
  const y = counter(w * 0.04, w * 0.55, h, '#E8E0F4', '#6A3FB5'); for (const [x, c] of [[w * 0.12, '#F6C83A'], [w * 0.3, '#F28CB4']]) { E(x, y - 1.2, 1.1, 1.1, c, { s: 0.25, l: 0.2, lw: 0.12 }); dot(x - 0.8, y - 2.3, 0.45, c); dot(x + 0.8, y - 2.3, 0.45, c); dot(x - 0.35, y - 1.4, 0.15, '#1A1A1A'); dot(x + 0.35, y - 1.4, 0.15, '#1A1A1A'); }
  return w * 0.42; };
D.hairdresser = (w, h, lit, r) => { room(w, h, '#DFF1F0', '#B0C9C8');
  F(0, h - 2.2, w, 2.2, '#F4F4F4'); X.fillStyle = '#2A2A2A'; for (let x = 0; x < w; x += 1.2) for (let k = 0; k < 2; k++) if (((x / 1.2 | 0) + k) % 2) X.fillRect(x, h - 2.2 + k * 1.1, 1.2, 1.1); // damier
  // postes : grand miroir rond, tablette de produits, fauteuil, casque sèche-cheveux, bac
  const n = w >= 30 ? 3 : 2; for (let k = 0; k < n; k++) { const cx = (w / n) * (k + 0.5); E(cx, 5, 2.6, 3, '#C8A040', { s: 0.25, l: 0.2, lw: 0.2 }); E(cx, 5, 2.2, 2.6, '#D6E8F0', { s: 0.12, l: 0, lw: 0.12 }); L(cx - 1, 3.4, cx + 0.2, 2.6, '#FFFFFF', 0.25);
    R(cx - 2.4, 8.6, 4.8, 0.5, '#FFFFFF', { s: 0, l: 0, lw: 0.12 }); for (let j = 0; j < 4; j++) bottle(cx - 1.6 + j * 1.05, 8.6, 1.4 + (j % 2) * 0.4, ['#E8A0C8', '#7AC8E8', '#F2E8C0', '#3A3A3A'][j], { label: null, cap: '#2A2A2A', lw: 0.08 });
    // fauteuil (dossier, assise, pied chromé)
    RR(cx - 1.7, h - 10, 3.4, 4.4, 0.6, '#1A1A1A', { s: 0, l: 0.25, lw: 0.15 }); RR(cx - 2.1, h - 6, 4.2, 1.3, 0.4, '#1A1A1A', { s: 0, l: 0.2, lw: 0.12 }); F(cx - 0.3, h - 4.7, 0.6, 2.4, '#C8D0D8'); E(cx, h - 2.4, 1.6, 0.3, '#C8D0D8', { s: 0, l: 0, lw: 0.1 });
    if (k === n - 1) { L(cx + 2.8, h - 2.2, cx + 2.8, h - 10, '#C8D0D8', 0.3); cel(() => { X.arc(cx + 1.6, h - 10, 2.2, Math.PI * 0.95, Math.PI * 2.05); X.closePath(); }, '#F28CB4', { box: [cx - 0.6, h - 12.2, 4.4, 2.2], s: 0.25, l: 0.2, lw: 0.15 }); } }
  return w / n * 0.5 + 2.6; };
D.optician = (w, h, lit, r) => { room(w, h, '#EEF1F8', '#C3C9DA');
  // présentoirs muraux de montures (vraies lunettes), miroir, tableau d'acuité, fauteuil d'examen
  const x0 = w * 0.3; for (let yy = 2.6; yy < 11; yy += 2.2) { F(x0, yy + 0.5, w - x0 - 0.6, 0.3, '#B8C0D0'); each(x0 + 0.4, w - 1, 4.6, (x, i) => glasses(x + 2.2, yy, 0.95, ['#2A2A2A', '#8A3A2A', '#2A4A9A', '#C8A040', '#C83A6A'][(i + yy | 0) % 5], ['#DCEEF6', '#E8D8C8', '#DCEEF6'][i % 3])); }
  // tableau d'acuité
  R(1, 1.8, w * 0.22, 7, '#FFFFFF', { s: 0, l: 0, lw: 0.15 }); [1.4, 1.1, 0.85, 0.65, 0.5].forEach((s, k) => text(['E', 'F P', 'T O Z', 'L P E D', 'P E C F D'][k], 1 + w * 0.11, 2.8 + k * 1.3, s, '#1A1A1A', { b: true }));
  RR(w * 0.12, h - 9, 2.6, 4, 0.5, '#243B8A', { s: 0, l: 0.2, lw: 0.15 }); RR(w * 0.1, h - 5.2, 3.6, 1.2, 0.4, '#243B8A', { s: 0, l: 0.2, lw: 0.12 }); F(w * 0.12 + 1, h - 4, 0.5, 1.8, '#C8D0D8');
  const y = counter(w * 0.36, w * 0.6, h, '#FFFFFF', '#DCE2EE'); each(w * 0.4, w * 0.92, 4, (x, i) => glasses(x + 2, y - 0.7, 0.8, ['#C83A6A', '#2A2A2A', '#2A4A9A'][i % 3])); E(w * 0.88, y - 2.6, 1.2, 1.8, '#C8D0D8', { s: 0.15, l: 0.2, lw: 0.15 });
  return w * 0.5; };
D.tattoo = (w, h, lit, r) => { room(w, h, '#2B2B2B', '#4A4A4A');
  // planches de « flash » au mur (dessins), fauteuil inclinable, lampe articulée, encres
  each(0.8, w - 0.8, 4, (x, i) => { const yy = 1.6 + (i % 2) * 0.6; R(x, yy, 3.6, 4.4, '#F4EAD0', { s: 0, l: 0, lw: 0.12 }); const k = i % 4; if (k === 0) { cel(() => { X.moveTo(x + 1.8, yy + 3.6); X.bezierCurveTo(x + 0.2, yy + 2.2, x + 0.8, yy + 0.8, x + 1.8, yy + 1.8); X.bezierCurveTo(x + 2.8, yy + 0.8, x + 3.4, yy + 2.2, x + 1.8, yy + 3.6); }, '#E63B3B', { s: 0, l: 0, lw: 0.12 }); } else if (k === 1) { L(x + 1.8, yy + 0.6, x + 1.8, yy + 3.2, '#1A1A1A', 0.3); E(x + 1.8, yy + 3.4, 0.9, 0.4, '#1A1A1A', { s: 0, l: 0, lw: 0 }); L(x + 0.9, yy + 1.2, x + 2.7, yy + 1.2, '#1A1A1A', 0.3); } else if (k === 2) { X.strokeStyle = '#2A6A3A'; X.lineWidth = 0.3; X.beginPath(); X.moveTo(x + 0.6, yy + 3.6); X.bezierCurveTo(x + 3.4, yy + 3, x + 0.4, yy + 1.4, x + 3, yy + 0.8); X.stroke(); dot(x + 3, yy + 0.8, 0.4, '#E63B3B'); } else { dot(x + 1.8, yy + 2.2, 1.2, '#F2C83A'); for (let a = 0; a < 8; a++) L(x + 1.8 + Math.cos(a * 0.785) * 1.3, yy + 2.2 + Math.sin(a * 0.785) * 1.3, x + 1.8 + Math.cos(a * 0.785) * 1.7, yy + 2.2 + Math.sin(a * 0.785) * 1.7, '#F2C83A', 0.2); } });
  // fauteuil de tatouage : pied central, assise rembourrée, dossier incliné avec appui-tête, repose-jambes
  { const fx = w * 0.32, b = h - 2.2; E(fx, b - 0.3, 2.2, 0.35, '#5A5A62', { s: 0, l: 0, lw: 0.12 }); F(fx - 0.35, b - 4.6, 0.7, 4.3, '#C8D0D8'); L(fx - 0.35, b - 4.6, fx - 0.35, b - 0.3, INK, 0.1);
    RR(fx - 3.6, b - 5.8, 7.2, 1.5, 0.6, '#1A1A1A', { s: 0, l: 0.3, lx: 0.6, lw: 0.15 });
    X.save(); X.translate(fx + 3.4, b - 5.4); X.rotate(-0.95); RR(0, -1.5, 6, 1.5, 0.6, '#1A1A1A', { s: 0, l: 0.3, lx: 0.6, lw: 0.15 }); RR(6.2, -1.3, 1.8, 1.2, 0.5, '#1A1A1A', { s: 0, l: 0.3, lw: 0.12 }); X.restore();
    X.save(); X.translate(fx - 3.4, b - 5); X.rotate(0.85); RR(0, -1.4, 4.4, 1.4, 0.5, '#1A1A1A', { s: 0, l: 0.3, lx: 0.6, lw: 0.15 }); X.restore();
    F(fx - 3.4, b - 4.7, 7.2, 0.25, '#E63B3B'); }
  // lampe articulée
  const lx = w * 0.8; L(lx, h - 2.2, lx, 7, '#C8D0D8', 0.3); L(lx, 7, lx - 3, 5, '#C8D0D8', 0.3); P([[lx - 4.2, 6.2], [lx - 3.4, 4.4], [lx - 2.2, 5]], '#E8E8E8', { s: 0.2, l: 0, lw: 0.12 }); if (lit) glow(lx - 3.6, 6.4, 2.6, '#FFFFFF', 0.25);
  each(w * 0.68, w - 0.6, 0.9, (x, i) => bottle(x + 0.35, 10.6, 1.4, ['#1A1A1A', '#E63B3B', '#2A6AC8', '#F2C83A', '#3A9A4A'][i % 5], { label: null, cap: '#2A2A2A', lw: 0.06 })); shelf(w * 0.66, 10.6, w * 0.32, '#5A5A5A');
  return w * 0.72; };
D.thrift = (w, h, lit, r) => { room(w, h, '#F5E3D0', '#C79C78', { paper: true });
  // portant de vêtements, mannequin habillé, chapeaux, chaussures, miroir sur pied
  L(0.8, 2.6, w * 0.62, 2.6, '#8A8A8A', 0.3); L(1, 2.6, 1, h - 2.2, '#8A8A8A', 0.25); L(w * 0.62 - 0.2, 2.6, w * 0.62 - 0.2, h - 2.2, '#8A8A8A', 0.25);
  each(1.8, w * 0.6, 1.6, (x, i) => hanger(x + 0.4, 2.6, ['#E8603A', '#3AA8E8', '#F2D24A', '#4AB86A', '#F28CB4', '#8A5A3A', '#F4EAD0', '#6A3FB5'][(i * 3) % 8], i % 3 === 2 ? 1 : 0));
  // mannequin
  const mx0 = w * 0.78; F(mx0 - 0.2, h - 6, 0.4, 3.8, '#5A3A20'); E(mx0, h - 2.4, 1.4, 0.3, '#5A3A20', { s: 0, l: 0, lw: 0.1 }); P([[mx0 - 1.4, 4.6], [mx0 + 1.4, 4.6], [mx0 + 1, h - 8], [mx0 + 1.8, h - 6], [mx0 - 1.8, h - 6], [mx0 - 1, h - 8]], '#2E5E8E', { s: 0.25, sx: 0.6, l: 0.15, lw: 0.15 }); E(mx0, 3.6, 0.8, 1, '#E8D8C8', { s: 0.2, l: 0, lw: 0.12 }); E(mx0, 2.8, 1.4, 0.35, '#C8402A', { s: 0, l: 0, lw: 0.12 }); E(mx0, 2.5, 0.8, 0.5, '#C8402A', { s: 0.2, l: 0, lw: 0.12 });
  shelf(w * 0.66, 9.6, w * 0.32, '#8A5A3A'); for (const [x, c] of [[w * 0.7, '#3A3A3A'], [w * 0.86, '#C8A060']]) { E(x + 1, 9.1, 1.2, 0.35, c, { s: 0, l: 0, lw: 0.1 }); E(x + 1, 8.6, 0.7, 0.6, c, { s: 0.2, l: 0, lw: 0.1 }); }
  each(1.4, w * 0.55, 2.4, (x, i) => P([[x, h - 2.3], [x + 1.6, h - 2.3], [x + 1.6, h - 2.8], [x + 0.6, h - 3.4], [x, h - 3.4]], ['#8A3A2A', '#1A1A1A', '#C8A060'][i % 3], { s: 0.2, l: 0.2, lw: 0.1 }));
  return w * 0.68; };
D.antiques = (w, h, lit, r) => { room(w, h, '#6E6446', '#8C7650', { paper: true });
  // horloge comtoise, tableaux à cadre doré, gramophone, lustre, commode, vases
  const cx = w * 0.12; R(cx - 1.4, 2, 2.8, h - 4.2, '#7A4A2A', { s: 0.3, l: 0.2, lw: 0.2 }); E(cx, 4.4, 1.1, 1.1, '#F6EAD0', { s: 0, l: 0, lw: 0.15 }); L(cx, 4.4, cx, 3.6, INK, 0.12); L(cx, 4.4, cx + 0.6, 4.6, INK, 0.12); R(cx - 0.8, 6.6, 1.6, 5, '#3A2414', { s: 0, l: 0, lw: 0.12 }); L(cx, 6.8, cx, 10.2, '#C8A040', 0.12); dot(cx, 10.4, 0.5, '#C8A040');
  frame(w * 0.3, 2, 5, 4, '#C8A040', '#5A7A5A'); frame(w * 0.5, 1.6, 4, 5.6, '#C8A040', '#8A6A9A'); frame(w * 0.68, 2.4, 6, 3.6, '#C8A040', '#C8A07A');
  // lustre
  const lx = w * 0.62; L(lx, 0, lx, 1.2, '#C8A040', 0.15); E(lx, 1.6, 2.2, 0.4, '#C8A040', { s: 0, l: 0, lw: 0.12 }); for (let k = -2; k <= 2; k += 1) dot(lx + k, 2.2, 0.3, lit ? '#FFF0B0' : '#F6EAD0'); if (lit) glow(lx, 2, 3.6, '#FFE6A0', 0.25);
  // commode + gramophone
  const cy = h - 2.2; R(w * 0.32, cy - 5, w * 0.42, 5, '#8A5434', { s: 0.25, l: 0.2, lw: 0.2 }); for (let k = 0; k < 2; k++) { R(w * 0.34, cy - 4.4 + k * 2.2, w * 0.38, 1.8, '#9A6440', { s: 0.2, sx: 0.8, l: 0, lw: 0.1 }); dot(w * 0.53, cy - 3.5 + k * 2.2, 0.2, '#C8A040'); }
  const gx = w * 0.42; R(gx - 1.2, cy - 6.4, 2.4, 1.4, '#5A3A20', { s: 0.2, l: 0.2, lw: 0.12 }); L(gx + 0.4, cy - 6.4, gx + 1, cy - 8.2, '#C8A040', 0.25); P([[gx + 1, cy - 8.2], [gx + 3.4, cy - 11], [gx + 4.2, cy - 8.4]], '#C8A040', { s: 0.3, l: 0.25, lw: 0.15 });
  cel(() => { X.moveTo(w * 0.62, cy - 5); X.quadraticCurveTo(w * 0.62 - 1.4, cy - 6.8, w * 0.62 - 0.4, cy - 8.4); X.lineTo(w * 0.62 + 0.8, cy - 8.4); X.quadraticCurveTo(w * 0.62 + 1.8, cy - 6.8, w * 0.62 + 0.4, cy - 5); X.closePath(); }, '#2E5E9E', { box: [w * 0.62 - 1.4, cy - 8.4, 3.2, 3.4], s: 0.25, l: 0.2, lw: 0.15 });
  // fauteuil médaillon
  const fx = w * 0.86; E(fx, cy - 5.6, 1.6, 2, '#A84A5A', { s: 0.25, l: 0.2, lw: 0.15 }); R(fx - 2, cy - 3.6, 4, 1.4, '#A84A5A', { s: 0.25, l: 0.2, lw: 0.12 }); L(fx - 1.7, cy - 2.2, fx - 1.9, cy, '#7A4A2A', 0.3); L(fx + 1.7, cy - 2.2, fx + 1.9, cy, '#7A4A2A', 0.3);
  return w * 0.25; };
D.petshop = (w, h, lit, r) => { room(w, h, '#FBEBC8', '#D6BE8C');
  // mur d'aquariums lumineux avec poissons, cage à oiseau, sacs de croquettes, arbre à chat
  const ax = w * 0.5; for (let row = 0; row < 2; row++) each(ax, w - 0.6, 5, (x, i) => { const y = 1.6 + row * 4.2; R(x, y, 4.6, 3.6, lit ? '#7AD0F0' : '#5AA8C8', { s: 0, l: 0, lw: 0.2 }); F(x, y, 4.6, 0.6, '#1A1A1A'); F(x, y + 3, 4.6, 0.6, '#E8D8A8'); for (let k = 0; k < 3; k++) fish(x + 1 + r() * 2.6, y + 1.2 + r() * 1.6, 1, ['#F28A2A', '#F2D24A', '#E84A6A', '#3AE8E8'][(k + i) % 4], r() < 0.5 ? 1 : -1); L(x + 3.8, y + 3, x + 3.6, y + 1.6, '#3A9A4A', 0.25); dot(x + 1.2, y + 2, 0.15, '#FFFFFF', 0.7); if (lit) glow(x + 2.3, y + 1.8, 2.8, '#AEE8FF', 0.15); });
  // cage
  const cx = w * 0.18; L(cx, 0, cx, 1.6, '#5A5A5A', 0.12); cel(() => { X.moveTo(cx - 2, 6.4); X.lineTo(cx - 2, 3.4); X.quadraticCurveTo(cx, 1.4, cx + 2, 3.4); X.lineTo(cx + 2, 6.4); X.closePath(); }, '#F6F0E0', { box: [cx - 2, 1.4, 4, 5], s: 0, l: 0, lw: 0.15, a: 0.4 }); for (let k = -1.6; k <= 1.6; k += 0.55) L(cx + k, 2.6 + Math.abs(k) * 0.4, cx + k, 6.4, '#C8A040', 0.1); E(cx, 4.6, 0.7, 0.55, '#F2D24A', { s: 0.2, l: 0, lw: 0.1 }); dot(cx + 0.55, 4.3, 0.3, '#F2D24A'); dot(cx + 0.65, 4.2, 0.08, '#1A1A1A'); L(cx - 1.6, 5.4, cx + 1.6, 5.4, '#8A5A3A', 0.15);
  // arbre à chat avec chat
  const tx = w * 0.36; F(tx - 0.4, h - 12, 0.8, 9.8, '#C8B090'); R(tx - 2, h - 12.6, 4, 1, '#B8A8C8', { s: 0.2, l: 0.2, lw: 0.12 }); R(tx - 2, h - 7.4, 4, 1, '#B8A8C8', { s: 0.2, l: 0.2, lw: 0.12 }); E(tx, h - 13.6, 1.4, 0.9, '#F28A2A', { s: 0.25, l: 0.2, lw: 0.12 }); P([[tx - 1, h - 14.2], [tx - 0.7, h - 15.2], [tx - 0.3, h - 14.4]], '#F28A2A', { s: 0, l: 0, lw: 0.1 }); P([[tx + 0.3, h - 14.4], [tx + 0.7, h - 15.2], [tx + 1, h - 14.2]], '#F28A2A', { s: 0, l: 0, lw: 0.1 }); X.strokeStyle = '#F28A2A'; X.lineWidth = 0.3; X.beginPath(); X.moveTo(tx + 1.3, h - 13.4); X.quadraticCurveTo(tx + 2.2, h - 12.6, tx + 1.6, h - 11.8); X.stroke();
  // sacs de croquettes
  each(0.6, w * 0.3, 2.6, (x, i) => { R(x, h - 6.4, 2.3, 4.2, ['#E8402A', '#3A8AE8', '#4AB84A'][i % 3], { s: 0.25, sx: 0.7, l: 0.2, lw: 0.12 }); E(x + 1.15, h - 4.6, 0.7, 0.6, '#FFFFFF', { s: 0, l: 0, lw: 0.08 }); dot(x + 1.15, h - 4.6, 0.25, '#8A5A3A'); });
  return w * 0.48; };
D.bikes = (w, h, lit, r) => { room(w, h, '#EFE8E2', '#B7AEA6');
  // panneau d'outils, roues suspendues, vélos au mur et au sol, casques
  R(w * 0.04, 1.6, w * 0.3, 5.6, '#C8A070', { s: 0, l: 0, lw: 0.15 }); X.fillStyle = 'rgba(90,60,30,0.4)'; for (let x = w * 0.04 + 0.6; x < w * 0.34; x += 0.8) for (let y = 2.2; y < 7; y += 0.8) { X.beginPath(); X.arc(x, y, 0.1, 0, 7); X.fill(); }
  L(w * 0.08, 2.6, w * 0.08, 6, '#3A3A3A', 0.35); L(w * 0.13, 2.6, w * 0.14, 5.4, '#C83A3A', 0.35); E(w * 0.2, 3.6, 0.8, 0.8, '#3A3A3A', { s: 0, l: 0, lw: 0 }); E(w * 0.2, 3.6, 0.4, 0.4, '#C8A070', { s: 0, l: 0, lw: 0 }); L(w * 0.2, 4.4, w * 0.2, 6.2, '#3A3A3A', 0.35); L(w * 0.27, 2.6, w * 0.3, 6.2, '#8A8A8A', 0.3);
  each(w * 0.4, w - 1, 4.4, (x, i) => { L(x + 2, 1, x + 2, 1.6, '#5A5A5A', 0.15); X.strokeStyle = '#2A2A2A'; X.lineWidth = 0.35; X.beginPath(); X.arc(x + 2, 3.6, 1.9, 0, 7); X.stroke(); X.strokeStyle = '#B8B8B8'; X.lineWidth = 0.08; for (let a = 0; a < 6; a++) { X.beginPath(); X.moveTo(x + 2 + Math.cos(a * 0.52) * 1.8, 3.6 + Math.sin(a * 0.52) * 1.8); X.lineTo(x + 2 - Math.cos(a * 0.52) * 1.8, 3.6 - Math.sin(a * 0.52) * 1.8); X.stroke(); } dot(x + 2, 3.6, 0.3, '#8A8A8A'); });
  const bike = (bx, by, c, s = 1) => { const rr = 2 * s; for (const d of [-1, 1]) { X.strokeStyle = '#1A1A1A'; X.lineWidth = 0.38 * s; X.beginPath(); X.arc(bx + d * 2.6 * s, by - rr, rr, 0, 7); X.stroke(); X.strokeStyle = '#C8C8C8'; X.lineWidth = 0.06; for (let a = 0; a < 4; a++) { X.beginPath(); X.moveTo(bx + d * 2.6 * s + Math.cos(a * 0.785) * rr * 0.9, by - rr + Math.sin(a * 0.785) * rr * 0.9); X.lineTo(bx + d * 2.6 * s - Math.cos(a * 0.785) * rr * 0.9, by - rr - Math.sin(a * 0.785) * rr * 0.9); X.stroke(); } }
    X.strokeStyle = c; X.lineWidth = 0.42 * s; X.lineJoin = 'round'; X.beginPath(); X.moveTo(bx - 2.6 * s, by - rr); X.lineTo(bx - 0.4 * s, by - rr); X.lineTo(bx - 1.2 * s, by - rr - 2.4 * s); X.lineTo(bx - 2.6 * s, by - rr); X.moveTo(bx - 0.4 * s, by - rr); X.lineTo(bx + 1.6 * s, by - rr - 2.2 * s); X.lineTo(bx - 1.2 * s, by - rr - 2.4 * s); X.moveTo(bx + 1.6 * s, by - rr - 2.2 * s); X.lineTo(bx + 2.6 * s, by - rr); X.stroke();
    L(bx - 1.2 * s, by - rr - 2.4 * s, bx - 1.4 * s, by - rr - 3 * s, '#1A1A1A', 0.25 * s); E(bx - 1.4 * s, by - rr - 3.1 * s, 0.8 * s, 0.25 * s, '#1A1A1A', { s: 0, l: 0, lw: 0 }); L(bx + 1.6 * s, by - rr - 2.2 * s, bx + 1.4 * s, by - rr - 3.2 * s, '#1A1A1A', 0.25 * s); L(bx + 1.4 * s, by - rr - 3.2 * s, bx + 2.2 * s, by - rr - 3.3 * s, '#1A1A1A', 0.25 * s); };
  each(0.6, w - 0.6, 7, (x, i) => bike(x + 3.5, h - 2.3, ['#E0412B', '#2E78C8', '#2E9A5A', '#F2C83A'][i % 4], 0.85));
  shelf(w * 0.04, 9.4, w * 0.3, '#8A8A8A'); each(w * 0.05, w * 0.32, 2.4, (x, i) => cel(() => { X.arc(x + 1.1, 9.4, 1.1, Math.PI, 0); X.closePath(); }, ['#E0412B', '#F2F2F2', '#2E78C8'][i % 3], { box: [x, 8.3, 2.2, 1.1], s: 0.25, l: 0.25, lw: 0.12 }));
  return w * 0.3; };
D.laundry = (w, h, lit, r) => { room(w, h, '#E3F3FA', '#B9D6E2', { tiles: '#EAF6FB' });
  // rangée de lave-linge à hublot (linge qui tourne), sèche-linge superposés, table de pliage, paniers, distributeur
  const ux = w * 0.72; for (let k = 0; k < 2; k++) { R(ux, 1.6 + k * 5, w - ux - 0.4, 4.8, '#F4F6F8', { s: 0.15, sx: 0.85, l: 0, lw: 0.15 }); E(ux + (w - ux) / 2, 4 + k * 5, 1.7, 1.7, '#9AA8B0', { s: 0, l: 0, lw: 0.15 }); E(ux + (w - ux) / 2, 4 + k * 5, 1.3, 1.3, '#2A3A4A', { s: 0, l: 0, lw: 0 }); dot(ux + (w - ux) / 2 - 0.3, 4.2 + k * 5, 0.6, '#F28CB4'); dot(ux + (w - ux) / 2 + 0.4, 3.6 + k * 5, 0.5, '#7AC8E8'); }
  each(0.6, ux - 0.4, 4.4, (x, i) => { const y = h - 2.2 - 6.4; R(x, y, 4.2, 6.4, '#F4F6F8', { s: 0.15, sx: 0.85, l: 0, lw: 0.2 }); F(x + 0.4, y + 0.4, 3.4, 0.8, '#C8D0D8'); dot(x + 3.2, y + 0.8, 0.25, lit ? '#4AE88A' : '#3A8A5A'); E(x + 2.1, y + 3.8, 1.7, 1.7, '#9AA8B0', { s: 0, l: 0, lw: 0.15 }); E(x + 2.1, y + 3.8, 1.35, 1.35, '#BFE0F0', { s: 0, l: 0, lw: 0 }); X.save(); X.beginPath(); X.arc(x + 2.1, y + 3.8, 1.35, 0, 7); X.clip(); F(x + 0.6, y + 4.2, 3, 1.4, ['#F28CB4', '#F2D24A', '#7AC8E8', '#4AB86A'][i % 4]); dot(x + 2.6, y + 3.4, 0.6, ['#E8603A', '#FFFFFF'][i % 2]); X.restore(); L(x + 1.2, y + 2.8, x + 1.8, y + 2.4, '#FFFFFF', 0.2); });
  R(0.6, 1.8, w * 0.22, 3.4, '#FFFFFF', { s: 0, l: 0, lw: 0.12 }); text('5 kg  4 €', 0.6 + w * 0.11, 2.8, 0.9, '#3AA9D6', { b: true }); text('8 kg  6 €', 0.6 + w * 0.11, 4.1, 0.9, '#3AA9D6', { b: true });
  R(w * 0.3, 2, 2.6, 3.6, '#3AA9D6', { s: 0.25, l: 0.2, lw: 0.15 }); F(w * 0.3 + 0.5, 2.6, 1.6, 0.8, '#1A1A1A'); dot(w * 0.3 + 1.3, 4.6, 0.3, '#F2C83A');
  return w * 0.35; };
// Restauration
function bistroTable(cx, b, top = '#F4F0E6', chair = '#5A3A20') { E(cx, b - 3.6, 1.6, 0.35, top, { s: 0, l: 0.2, lw: 0.15 }); F(cx - 0.15, b - 3.4, 0.3, 3, '#2A2A2A'); E(cx, b - 0.2, 0.9, 0.2, '#2A2A2A', { s: 0, l: 0, lw: 0 });
  for (const d of [-1, 1]) { X.strokeStyle = chair; X.lineWidth = 0.3; X.beginPath(); X.moveTo(cx + d * 2.2, b); X.lineTo(cx + d * 2.2, b - 2.4); X.moveTo(cx + d * 3.2, b); X.lineTo(cx + d * 3.2, b - 5); X.quadraticCurveTo(cx + d * 3.3, b - 5.8, cx + d * 2.6, b - 5.4); X.stroke(); E(cx + d * 2.7, b - 2.4, 0.8, 0.22, chair, { s: 0, l: 0, lw: 0.1 }); } }
D.cafe = (w, h, lit, r) => { room(w, h, '#E8D4B8', '#A8815A', { wainscot: '#7A3E2A' });
  // comptoir en zinc, percolateur, bouteilles sur étagères, miroir, ardoise, tables bistrot
  R(w * 0.48, 1.4, w * 0.5, 4.6, '#C8D8E0', { s: 0.1, l: 0, lw: 0.2 }); X.strokeStyle = '#C8A040'; X.lineWidth = 0.4; X.strokeRect(w * 0.48, 1.4, w * 0.5, 4.6); L(w * 0.52, 2, w * 0.58, 4.8, '#FFFFFF', 0.3);
  shelf(w * 0.5, 6.4, w * 0.46, '#7A3E2A'); each(w * 0.52, w * 0.96, 1, (x, i) => bottle(x + 0.4, 6.4, 2.6 + (i % 3) * 0.4, ['#2E4A2A', '#C88A3A', '#E8E8D8', '#6A1A2A', '#3A7A8A'][i % 5], { label: i % 2 ? '#F4EAD0' : null, cap: '#2A2A2A', lw: 0.08 }));
  R(1.2, 1.6, w * 0.26, 4.6, '#2E3A34', { s: 0, l: 0, lw: 0.2 }); text('Café 1€80', 1.2 + w * 0.13, 2.8, 0.9, '#FFFFFF'); text('Crème 3€', 1.2 + w * 0.13, 4, 0.9, '#FFFFFF'); text('Croque 6€', 1.2 + w * 0.13, 5.2, 0.9, '#F2D27A');
  if (lit) for (const x of [w * 0.2, w * 0.4]) pendant(x, 6.4, '#E8C060', true);
  const y = counter(w * 0.5, w * 0.48, h, '#C8D0D8', '#7A3E2A', { panels: true });
  // percolateur
  const px = w * 0.62; R(px, y - 3.4, 4.4, 3.4, '#C8D0D8', { s: 0.25, l: 0.3, lw: 0.15 }); R(px + 0.3, y - 4.2, 3.8, 0.8, '#C8A040', { s: 0, l: 0.2, lw: 0.12 }); F(px + 0.8, y - 1.4, 0.6, 0.6, '#2A2A2A'); F(px + 2.8, y - 1.4, 0.6, 0.6, '#2A2A2A'); for (let k = 0; k < 3; k++) R(w * 0.82 + k * 1.1, y - 0.9, 0.9, 0.9, '#FFFFFF', { s: 0.2, l: 0, lw: 0.08 });
  bistroTable(w * 0.2, h - 2.2); if (w > 34) bistroTable(w * 0.38, h - 2.2);
  return w * 0.75; };
D.restaurant = (w, h, lit, r) => { room(w, h, '#C9A98A', '#7B4F36', { wainscot: '#5A2A1A', paper: true });
  // tables nappées blanches avec verres et bougies, tableaux, lustre, desserte à vin
  frame(w * 0.1, 2, 5, 3.6, '#C8A040', '#7A9A6A'); frame(w * 0.42, 2.2, 4, 3.2, '#C8A040', '#C88A5A');
  if (lit) { pendant(w * 0.28, 5.4, '#F2C84A', true); pendant(w * 0.62, 5.4, '#F2C84A', true); }
  const tbl = (cx) => { const b = h - 2.2; R(cx - 3, b - 4, 6, 0.6, '#FFFFFF', { s: 0, l: 0, lw: 0.15 }); P([[cx - 3, b - 3.4], [cx + 3, b - 3.4], [cx + 2.6, b - 1.4], [cx - 2.6, b - 1.4]], '#FFFFFF', { s: 0.15, sx: 0.7, l: 0, lw: 0.15 }); F(cx - 2.4, b - 1.4, 0.4, 1.4, '#3A2414'); F(cx + 2, b - 1.4, 0.4, 1.4, '#3A2414');
    for (const d of [-1.6, 1.6]) { cel(() => { X.moveTo(cx + d - 0.45, b - 5.6); X.lineTo(cx + d + 0.45, b - 5.6); X.lineTo(cx + d + 0.3, b - 4.8); X.lineTo(cx + d - 0.3, b - 4.8); X.closePath(); }, '#E8F0F4', { s: 0, l: 0, lw: 0.1, a: 0.85 }); F(cx + d - 0.35, b - 5.3, 0.7, 0.45, '#8A1A2A'); L(cx + d, b - 4.8, cx + d, b - 4, INK, 0.1); }
    F(cx - 0.2, b - 5.4, 0.4, 1.4, '#F6F0E0'); dot(cx, b - 5.7, 0.25, '#F2A03A'); if (lit) glow(cx, b - 5.6, 1.6, '#FFD890', 0.35);
    for (const d of [-1, 1]) { X.strokeStyle = '#3A2414'; X.lineWidth = 0.35; X.beginPath(); X.moveTo(cx + d * 4, b); X.lineTo(cx + d * 4, b - 6.4); X.stroke(); R(cx + d * 3.6 - 0.8, b - 2.6, 1.6, 0.5, '#8B1E2D', { s: 0, l: 0, lw: 0.1 }); } };
  tbl(w * 0.28); if (w > 34) tbl(w * 0.66);
  R(w - 5.2, h - 8.8, 4.6, 6.6, '#5A2A1A', { s: 0.25, l: 0.15, lw: 0.2 }); each(w - 4.8, w - 0.8, 1, (x, i) => bottle(x + 0.45, h - 6, 2.4, ['#5A1A2A', '#2E4A2A'][i % 2], { cap: '#C8A040', lw: 0.08 }));
  return w * 0.45; };
D.pizzeria = (w, h, lit, r) => { room(w, h, '#F3DCC0', '#9B6B4A', { tiles: '#F6E8D8' });
  // four à bois en dôme de briques avec feu, pelle, pizzas, nappes à carreaux, piments et ail suspendus
  const ox = w * 0.72, ob = h - 6.4; cel(() => { X.moveTo(ox - 5, ob); X.quadraticCurveTo(ox - 5, ob - 7.6, ox, ob - 8); X.quadraticCurveTo(ox + 5, ob - 7.6, ox + 5, ob); X.closePath(); }, '#C8603A', { box: [ox - 5, ob - 8, 10, 8], s: 0.3, sx: 0.65, l: 0.2, lw: 0.25 });
  X.strokeStyle = 'rgba(120,40,20,0.5)'; X.lineWidth = 0.1; for (let k = 1; k < 7; k++) { X.beginPath(); X.moveTo(ox - 5 + k * 0.2, ob - k * 1.05); X.lineTo(ox + 5 - k * 0.2, ob - k * 1.05); X.stroke(); }
  cel(() => { X.moveTo(ox - 2.2, ob); X.lineTo(ox - 2.2, ob - 1.8); X.quadraticCurveTo(ox, ob - 3.6, ox + 2.2, ob - 1.8); X.lineTo(ox + 2.2, ob); X.closePath(); }, '#2A1410', { s: 0, l: 0, lw: 0.2 }); for (let k = 0; k < 4; k++) P([[ox - 1.6 + k * 0.9, ob], [ox - 1.2 + k * 0.9, ob - 1.6 - (k % 2)], [ox - 0.8 + k * 0.9, ob]], ['#F2A03A', '#F2D24A'][k % 2], { s: 0, l: 0, lw: 0 }); glow(ox, ob - 0.8, 3, '#F28A2A', 0.3);
  R(ox - 5.4, ob, 10.8, 4.2, '#E8D8C0', { s: 0.2, sx: 0.8, l: 0, lw: 0.2 }); L(ox + 5, ob - 3, ox + 7, ob - 7, '#A87A4A', 0.3);
  each(1, ox - 6.4, 2.4, (x, i) => { L(x + 1, 0, x + 1, 1.4, '#8A6A4A', 0.1); if (i % 2) for (let k = 0; k < 4; k++) P([[x + 0.6 + (k % 2) * 0.6, 1.6 + k * 0.8], [x + 1.4 + (k % 2) * 0.6, 1.6 + k * 0.8], [x + 1 + (k % 2) * 0.6, 3 + k * 0.8]], '#D8243A', { s: 0, l: 0, lw: 0.08 }); else for (let k = 0; k < 4; k++) E(x + 1 + ((k % 2) - 0.5) * 0.6, 2 + k * 0.8, 0.5, 0.45, '#F2EAD8', { s: 0.25, l: 0, lw: 0.12 }); });
  const tb = h - 2.2; R(1, tb - 4, w * 0.4, 0.7, '#FFFFFF', { s: 0, l: 0, lw: 0.15 }); X.fillStyle = '#D8243A'; for (let x = 1; x < 1 + w * 0.4; x += 0.8) X.fillRect(x, tb - 4, 0.4, 0.7); P([[1, tb - 3.3], [1 + w * 0.4, tb - 3.3], [w * 0.4 - 0.4, tb - 1.6], [1.4, tb - 1.6]], '#FFFFFF', { s: 0.15, l: 0, lw: 0.12 }); F(2, tb - 1.6, 0.4, 1.6, '#3A2414'); F(w * 0.4 - 1, tb - 1.6, 0.4, 1.6, '#3A2414');
  for (const cx of [w * 0.12, w * 0.32]) { E(cx, tb - 4.3, 1.8, 0.4, '#E8B860', { s: 0, l: 0, lw: 0.12 }); E(cx, tb - 4.35, 1.5, 0.3, '#D8402A', { s: 0, l: 0, lw: 0 }); for (let k = 0; k < 4; k++) dot(cx - 1 + k * 0.65, tb - 4.4 + (k % 2) * 0.1, 0.18, k % 2 ? '#F6F0E0' : '#3A6A2A'); }
  return w * 0.5; };
D.kebab = (w, h, lit, r) => { room(w, h, '#F2E2C8', '#A9835C', { tiles: '#F6EEE0' });
  // panneaux-menus lumineux, broche verticale qui grille, plaque, sauces, frigo à boissons
  F(0.6, 1.2, w - 1.2, 4, lit ? '#FFF4D0' : '#F4E8C8'); each(1, w - 1, 4.4, (x, i) => { R(x, 1.5, 4, 3.4, ['#C87A3A', '#E8C84A', '#8AB84A', '#E8603A'][i % 4], { s: 0.15, l: 0.15, lw: 0.12 }); F(x + 0.4, 4.2, 3.2, 0.5, '#FFFFFF', 0.85); text(`${5 + i},50€`, x + 2, 4.45, 0.55, '#C8352B', { b: true }); });
  // broche
  const sx = w * 0.3, sb = h - 7.4; R(sx - 2.6, 6, 0.8, sb - 6, '#8A8A8A', { s: 0, l: 0.2, lw: 0.12 }); F(sx - 2.4, 6.6, 0.4, sb - 7, lit ? '#F28A2A' : '#C85A2A'); if (lit) glow(sx - 2.2, 9.5, 2.4, '#F28A2A', 0.3); L(sx, 5.6, sx, sb + 0.6, '#C8C8C8', 0.25);
  cel(() => { X.moveTo(sx - 1.2, 6.6); X.lineTo(sx + 1.2, 6.6); X.quadraticCurveTo(sx + 1.6, 9, sx + 0.8, sb); X.lineTo(sx - 0.8, sb); X.quadraticCurveTo(sx - 1.6, 9, sx - 1.2, 6.6); X.closePath(); }, '#B8663A', { box: [sx - 1.6, 6.6, 3.2, sb - 6.6], s: 0.3, sx: 0.55, l: 0.25, lx: 0.35, lw: 0.15 }); for (let y = 7.2; y < sb; y += 0.7) L(sx - 1, y, sx + 1, y + 0.3, '#8A4020', 0.1);
  const y = counter(0.6, w * 0.98, h, '#C8D0D8', '#F4F4F4'); F(0.6, y + 1.6, w * 0.98, 0.5, '#E5791F');
  R(w * 0.45, y - 2, w * 0.3, 2, '#DDEEF4', { s: 0, l: 0, lw: 0.12, a: 0.8 }); each(w * 0.46, w * 0.74, 1.4, (x, i) => F(x, y - 1.2, 1.2, 1.1, ['#7AC84A', '#E8402A', '#F6F0E0', '#8A3A9A', '#F2D24A'][i % 5]));
  for (const [x, c] of [[w * 0.12, '#E8402A'], [w * 0.17, '#F6F0E0'], [w * 0.22, '#F2D24A']]) bottle(x, y, 2, c, { label: null, cap: '#2A2A2A', lw: 0.08 });
  R(w - 5, 5.6, 4.4, h - 13.6, lit ? '#E8F8FF' : '#B8D0DC', { s: 0, l: 0, lw: 0.2 });
  return w * 0.55; };
D.sushi = (w, h, lit, r) => { room(w, h, '#F4E9E4', '#2F2F33');
  // comptoir à tapis roulant, assiettes de sushis, poissons dans la vitrine du chef, lanternes, chat porte-bonheur, estampe
  F(0, 1.2, w, 0.6, '#2A1A14'); each(2, w - 2, 6, (x, i) => { L(x + 1, 1.8, x + 1, 2.6, '#2A1A14', 0.12); cel(() => X.ellipse(x + 1, 4, 1.3, 1.6, 0, 0, 7), lit ? '#FF6A6A' : '#E2294B', { box: [x - 0.3, 2.4, 2.6, 3.2], s: 0.25, l: 0.2, lw: 0.15 }); L(x - 0.2, 3.2, x + 2.2, 3.2, '#2A1A14', 0.1); L(x - 0.2, 4.8, x + 2.2, 4.8, '#2A1A14', 0.1); if (lit) glow(x + 1, 4, 2.6, '#FF7A7A', 0.25); });
  R(w * 0.7, 6.4, 4, 5.4, '#F6F0E0', { s: 0, l: 0, lw: 0.15 }); E(w * 0.7 + 2, 8.2, 1.6, 0.8, '#E2294B', { s: 0, l: 0, lw: 0 }); E(w * 0.7 + 2, 8.2, 1.1, 0.55, '#F6F0E0', { s: 0, l: 0, lw: 0 }); L(w * 0.7 + 0.8, 9.8, w * 0.7 + 3.2, 10.4, '#3A3A3A', 0.12);
  // chat porte-bonheur
  const nx = w * 0.12, ny = 10; E(nx, ny, 1.2, 1.4, '#FFFFFF', { s: 0.2, l: 0, lw: 0.15 }); E(nx, ny - 1.7, 1, 0.9, '#FFFFFF', { s: 0.15, l: 0, lw: 0.15 }); P([[nx - 0.9, ny - 2.2], [nx - 0.6, ny - 3], [nx - 0.2, ny - 2.5]], '#FFFFFF', { s: 0, l: 0, lw: 0.1 }); P([[nx + 0.2, ny - 2.5], [nx + 0.6, ny - 3], [nx + 0.9, ny - 2.2]], '#FFFFFF', { s: 0, l: 0, lw: 0.1 }); E(nx + 1.3, ny - 2, 0.35, 0.8, '#FFFFFF', { s: 0, l: 0, lw: 0.12 }); dot(nx, ny - 0.4, 0.35, '#F2C83A'); F(nx - 0.9, ny - 1, 1.8, 0.25, '#E2294B');
  const y = counter(0.6, w * 0.98, h, '#C8A070', '#3A2A20'); F(0.6, y - 0.5, w * 0.98, 0.5, '#9AA0A8'); // tapis
  each(1, w - 2, 2.6, (x, i) => { E(x + 1.1, y - 0.7, 1.1, 0.3, ['#3A8AE8', '#E8402A', '#F2C83A', '#FFFFFF'][i % 4], { s: 0, l: 0, lw: 0.1 }); if (i % 2) { R(x + 0.4, y - 1.5, 1.4, 0.7, '#FFFFFF', { s: 0, l: 0, lw: 0.08 }); F(x + 0.4, y - 1.6, 1.4, 0.4, '#F28A5A'); X.strokeStyle = '#FFFFFF'; X.lineWidth = 0.08; X.beginPath(); X.moveTo(x + 0.6, y - 1.5); X.lineTo(x + 0.9, y - 1.2); X.moveTo(x + 1.1, y - 1.5); X.lineTo(x + 1.4, y - 1.2); X.stroke(); } else { dot(x + 1.1, y - 1.2, 0.55, '#1A2A1A'); dot(x + 1.1, y - 1.2, 0.38, '#FFFFFF'); dot(x + 1.1, y - 1.2, 0.18, '#F28A5A'); } });
  return w * 0.45; };
D.tearoom = (w, h, lit, r) => { room(w, h, '#EBDDF0', '#C8B0D2', { paper: true, wainscot: '#8F5FA8' });
  // vaisselier de théières, présentoir à étages, petites tables rondes, nappes en dentelle
  R(w * 0.58, 1.6, w * 0.38, 7, '#FFFFFF', { s: 0.15, l: 0, lw: 0.2 }); for (const yy of [4.6, 8]) { shelf(w * 0.6, yy, w * 0.34, '#C8B0D2'); each(w * 0.61, w * 0.93, 2.8, (x, i) => { const c = ['#F28CB4', '#7AC8E8', '#F6E07A', '#B89AE8'][(i + yy | 0) % 4]; E(x + 1.2, yy - 1, 1, 0.9, c, { s: 0.25, l: 0.2, lw: 0.12 }); L(x + 2.2, yy - 1.2, x + 2.8, yy - 1.8, c, 0.3); X.strokeStyle = INK; X.lineWidth = 0.12; X.beginPath(); X.arc(x + 0.1, yy - 1, 0.45, 1.6, 4.7); X.stroke(); dot(x + 1.2, yy - 2, 0.2, c); }); }
  const px = w * 0.2; L(px, 3, px, 10.6, '#C8A040', 0.25); for (const [yy, rr] of [[5, 1.8], [7.8, 2.4], [10.6, 3]]) { E(px, yy, rr, 0.35, '#FFFFFF', { s: 0, l: 0, lw: 0.12 }); for (let k = -rr + 0.6; k < rr - 0.2; k += 1) cake(px + k + 0.1, yy - 0.2, 0.8, 0.7, ['#F6E0B0', '#8A4A2A', '#F28CB4'][(k * 2 + yy | 0) % 3 < 0 ? 0 : (k * 2 + yy | 0) % 3], '#FFFFFF', '#D8243A'); }
  for (const cx of [w * 0.3, w * 0.68]) { const b = h - 2.2; E(cx, b - 3.8, 2.2, 0.4, '#FFFFFF', { s: 0, l: 0, lw: 0.15 }); P([[cx - 2.2, b - 3.6], [cx + 2.2, b - 3.6], [cx + 1.8, b - 2.2], [cx - 1.8, b - 2.2]], '#FFFFFF', { s: 0.1, l: 0, lw: 0.12 }); X.fillStyle = '#FFFFFF'; for (let k = -1.8; k < 1.8; k += 0.6) { X.beginPath(); X.arc(cx + k + 0.3, b - 2.2, 0.3, 0, Math.PI); X.fill(); } F(cx - 0.15, b - 2, 0.3, 2, '#5A3A20'); E(cx - 0.6, b - 4.4, 0.6, 0.4, '#F28CB4', { s: 0.2, l: 0, lw: 0.1 }); E(cx + 0.9, b - 4.2, 0.4, 0.2, '#FFFFFF', { s: 0, l: 0, lw: 0.08 }); }
  return w * 0.75; };
// Nuit
D.arcade = (w, h, lit, r) => { room(w, h, '#2A2570', '#4B3F9A');
  if (lit) { X.fillStyle = 'rgba(61,242,224,0.12)'; for (let x = 0; x < w; x += 2) X.fillRect(x, 0, 1, 1.2); }
  // bornes d'arcade avec écrans pixel, flipper, pince à peluches
  each(0.6, w * 0.66, 4.4, (x, i) => { const b = h - 2.2; P([[x, b], [x + 4, b], [x + 4, b - 13], [x + 3.4, b - 13.6], [x + 0.6, b - 13.6], [x, b - 13]], ['#E8402A', '#3A8AE8', '#F2C83A', '#B84AE8'][i % 4], { s: 0.25, sx: 0.75, l: 0.15, lw: 0.2 }); R(x + 0.4, b - 13.2, 3.2, 1.4, '#1A1A22', { s: 0, l: 0, lw: 0.1 }); if (lit) F(x + 0.6, b - 13, 2.8, 1, ['#3DF2E0', '#FF4FD8', '#FFE45C'][i % 3]);
    screen(x + 0.5, b - 11.4, 3, 3.4, lit, i); P([[x + 0.2, b - 7.6], [x + 3.8, b - 7.6], [x + 4.2, b - 6.2], [x - 0.2, b - 6.2]], '#1A1A22', { s: 0, l: 0, lw: 0.12 }); dot(x + 1, b - 6.9, 0.3, '#E8402A'); dot(x + 2.4, b - 6.9, 0.22, '#F2C83A'); dot(x + 3, b - 6.9, 0.22, '#3AE8E8'); L(x + 1, b - 6.9, x + 1, b - 7.6, '#1A1A1A', 0.15); if (lit) glow(x + 2, b - 9.7, 3, ['#3DF2E0', '#FF4FD8', '#FFE45C'][i % 3], 0.2); });
  // pince à peluches
  const cx = w * 0.84, b = h - 2.2; R(cx - 2.8, b - 14, 5.6, 14, '#FF4FD8', { s: 0.25, l: 0.2, lw: 0.2 }); R(cx - 2.2, b - 12.6, 4.4, 6.8, lit ? '#DDF4FF' : '#8AA8C8', { s: 0, l: 0, lw: 0.12, a: 0.85 }); L(cx, b - 12.6, cx, b - 10.4, '#C8C8C8', 0.12); P([[cx - 0.7, b - 10], [cx, b - 10.5], [cx + 0.7, b - 10], [cx + 0.4, b - 9.4], [cx - 0.4, b - 9.4]], '#C8C8C8', { s: 0, l: 0, lw: 0.1 });
  for (let k = 0; k < 5; k++) { const c = ['#F2C83A', '#7AC8E8', '#F28CB4', '#8AD06A', '#F28A2A'][k]; dot(cx - 1.6 + k * 0.8, b - 6.4 - (k % 2) * 0.6, 0.6, c); }
  return w * 0.7; };
D.bar = (w, h, lit, r) => { room(w, h, '#4A3350', '#2C2030');
  // étagères rétroéclairées de bouteilles, miroir, pompes à bière, tabourets, suspensions
  R(w * 0.06, 1.4, w * 0.88, 6.8, lit ? '#8A6A4A' : '#3A2A2A', { s: 0, l: 0, lw: 0.2 }); if (lit) { F(w * 0.06, 1.4, w * 0.88, 6.8, '#FFB347', 0.18); }
  for (const yy of [4.4, 8]) { shelf(w * 0.06, yy, w * 0.88, '#C8A040'); each(w * 0.08, w * 0.92, 1, (x, i) => bottle(x + 0.45, yy, 2.4 + (i * 7 % 3) * 0.5, ['#C88A3A', '#2E4A2A', '#E8E8D8', '#6A1A2A', '#3A7A8A', '#E8C060'][(i + yy | 0) % 6], { label: (i % 3) ? '#F4EAD0' : null, cap: '#2A2A2A', lw: 0.08 })); }
  if (lit) for (const x of [w * 0.25, w * 0.5, w * 0.75]) pendant(x, 9, '#FFB347', true);
  const y = counter(0.6, w * 0.98, h, '#C8A040', '#5A3A2A', { panels: true });
  each(w * 0.4, w * 0.6, 1.4, (x, i) => { F(x + 0.4, y - 3, 0.5, 3, '#C8C8C8'); E(x + 0.65, y - 3.3, 0.45, 0.45, '#2A2A2A', { s: 0, l: 0, lw: 0.08 }); R(x + 0.2, y - 4.6, 0.9, 1.4, ['#F2C83A', '#3A8AE8', '#E8402A'][i % 3], { s: 0, l: 0, lw: 0.08 }); });
  for (const x of [w * 0.15, w * 0.78]) { cel(() => { X.moveTo(x - 0.5, y - 1.8); X.lineTo(x + 0.5, y - 1.8); X.lineTo(x + 0.4, y); X.lineTo(x - 0.4, y); X.closePath(); }, '#F2C83A', { s: 0, l: 0, lw: 0.1, a: 0.9 }); F(x - 0.5, y - 2, 1, 0.4, '#FFFFFF'); }
  return w * 0.5; };
D.nightclub = (w, h, lit, r) => { room(w, h, '#2A1250', '#1B0E38');
  // piste lumineuse, cabine de DJ avec platines, boule à facettes, faisceaux, foule en silhouettes
  const b = h - 2.2; for (let x = 0; x < w; x += 2) for (let k = 0; k < 2; k++) F(x + k, b + k * 1.1 - 0.1, 2, 1.1, lit ? ['#FF4FD8', '#3DF2E0', '#FFE45C', '#7A4AE8'][((x / 2 | 0) + k * 3) % 4] : '#2A1A4A');
  const dx = w * 0.5; L(dx, 0, dx, 1.4, '#8A8A8A', 0.12); E(dx, 2.6, 1.3, 1.3, '#C8D0D8', { s: 0.3, l: 0.25, lw: 0.15 }); X.strokeStyle = 'rgba(80,80,100,0.6)'; X.lineWidth = 0.06; for (let k = -1; k <= 1; k += 0.5) { X.beginPath(); X.moveTo(dx - 1.3, 2.6 + k); X.lineTo(dx + 1.3, 2.6 + k); X.stroke(); X.beginPath(); X.moveTo(dx + k, 1.3); X.lineTo(dx + k, 3.9); X.stroke(); }
  if (lit) { for (const [ang, c] of [[-0.5, '#FF4FD8'], [0.3, '#3DF2E0'], [0.9, '#FFE45C']]) { X.fillStyle = rgba(hx(c), 0.18); X.beginPath(); X.moveTo(dx, 2.6); X.lineTo(dx + Math.sin(ang) * 30 - 2, 2.6 + Math.cos(ang) * 30); X.lineTo(dx + Math.sin(ang) * 30 + 2, 2.6 + Math.cos(ang) * 30); X.fill(); } for (let k = 0; k < 14; k++) dot(r() * w, r() * (h - 4), 0.18, '#FFFFFF', 0.8); }
  // cabine de DJ
  const bx = w * 0.62; R(bx, b - 5, w * 0.34, 5, '#3A2A6A', { s: 0.2, l: 0.15, lw: 0.2 }); F(bx, b - 3.6, w * 0.34, 0.5, lit ? '#FF4FD8' : '#5A3A8A'); E(bx + 1.6, b - 5.2, 1.2, 0.25, '#16141A', { s: 0, l: 0, lw: 0.1 }); E(bx + w * 0.34 - 1.6, b - 5.2, 1.2, 0.25, '#16141A', { s: 0, l: 0, lw: 0.1 });
  // foule
  each(0.8, bx - 1, 2.4, (x, i) => { X.save(); X.globalAlpha = 0.9; person(x + 1.2, b, 1 + (i % 2) * 0.1, ['#FF4FD8', '#3DF2E0', '#FFE45C', '#7A4AE8'][i % 4], '#2A1A3A', '#1A0A2A'); if (i % 2) L(x + 0.4, b - 2.2, x - 0.2, b - 4.2, '#2A1A3A', 0.35); X.restore(); });
  return w * 0.75; };

function draw(ctx, type, x, y, w, h, lit, seed = 1) {
  if (!D[type]) return; X = ctx; ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip(); ctx.translate(x, y);
  const out = D[type](w, h, lit, rng(seed * 7919 + type.length)); ctx.restore(); return out;
}
return { draw, types: Object.keys(D) };
})();
