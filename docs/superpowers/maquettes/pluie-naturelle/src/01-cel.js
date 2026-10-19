// ───────────── outils cellulo (copie de paint/cel.ts, comme les chantiers précédents) ─────────────
const TAU = Math.PI * 2;
const hex = (s) => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
const rgba = (c, a = 1) => `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${a})`;
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const SUN = hex('#FFF6D0'), COOL = hex('#5A4A9C'), INK = '#2A1A18', INKC = hex('#2A1A18'), WHITE = [255, 255, 255];
const NIGHT = hex('#1E2A5A');
const lum = (c) => (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) / 255;
function mulberry32(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t, sat = (v) => (v < 0 ? 0 : v > 1 ? 1 : v), smooth = (t) => t * t * (3 - 2 * t);
const smoothstep = (a, b, v) => smooth(sat((v - a) / (b - a)));

// Environnement de la scène : dark = 1 - daylight ; amb() applique la teinte de nuit comme dans les chantiers Ghibli.
let ENV = { daylight: 1, dark: 0, precip: 0.5, wind: 0.3, storm: false };
const amb = (c) => mix(c, NIGHT, ENV.dark * 0.78);
const col = (c, a = 1) => rgba(amb(typeof c === 'string' ? hex(c) : c), a);
function fillRect(ctx, c, x, y, w, h) { ctx.fillStyle = col(c); ctx.fillRect(x, y, w, h); }
function rawRect(ctx, css, x, y, w, h) { ctx.fillStyle = css; ctx.fillRect(x, y, w, h); }
function poly(ctx, c, pts, raw = false) { ctx.fillStyle = raw ? c : col(c); ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); ctx.fill(); }
function disc(ctx, c, x, y, r, raw = false) { ctx.fillStyle = raw ? c : col(c); ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); }
function ellipse(ctx, css, x, y, rx, ry) { ctx.fillStyle = css; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, TAU); ctx.fill(); }
function inkRect(ctx, x, y, w, h, lw = 0.8) { ctx.strokeStyle = INK; ctx.lineWidth = lw; ctx.strokeRect(x, y, w, h); }
function inkLine(ctx, pts, lw = 0.7, close = false) { ctx.strokeStyle = INK; ctx.lineWidth = lw; ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); if (close) ctx.closePath(); ctx.stroke(); }
function radial(ctx, x, y, r, c, a0, a1 = 0) { const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, rgba(c, a0)); g.addColorStop(1, rgba(c, a1)); return g; }

// Palette (chantier 1 + habitants)
const STONES = ['#EDE2C8', '#E8DCC0', '#F0E6D0', '#E4D6BA', '#EAD5B0', '#F2E8D4'];
const PLASTERS = ['#F6E2B4', '#EEC79A', '#CFE0B8', '#E0C8A0', '#F4D89C', '#E6BCD0'];
const ZINCS = ['#8290A2', '#98A4B4', '#7A8AA0'];
const GLASS_DAY = '#7FB4E0', GLASS_NIGHT = '#232D52';
const LIT = { warm: '#FFD86A', cream: '#FFF0C0', orange: '#FFB048', tv: '#9CC4FF', cool: '#C8DCFF', neon: '#FFB7C5' };
// Pluie : gouttes et eau (toujours « raw », jamais teintées par amb : c'est de la lumière)
const RAIN = hex('#E6EDF7'), RAIN_NIGHT = hex('#C9D6EA'), WATER_DAY = hex('#9FB4C8'), WATER_NIGHT = hex('#1C2440');
const SCENE_W = 1000, SCENE_H = 460;
// Vent : rafales = somme de sinus lentes (déterministe) → facteur 0,45..1,55 appliqué à l'inclinaison et à la dérive.
const gust = (t) => 1 + 0.32 * Math.sin(t * 0.61) * Math.sin(t * 0.23 + 1.3) + 0.22 * Math.sin(t * 1.7 + 0.4) * Math.max(0, Math.sin(t * 0.13));
