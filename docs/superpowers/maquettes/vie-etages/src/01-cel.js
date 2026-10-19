// ───────────── outils cellulo (copie de paint/cel.ts, comme le chantier 1) ─────────────
const TAU = Math.PI * 2;
const hex = (s) => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
const rgba = (c, a = 1) => `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${a})`;
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const SUN = hex('#FFF6D0'), COOL = hex('#5A4A9C'), INK = '#2A1A18';
const shade = (c, t = 0.3) => mix(c, COOL, t);
const light = (c, t = 0.3) => mix(c, SUN, t);
function mulberry32(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function hashString(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; }
const pick = (l, r) => l[Math.floor(r() * l.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t, sat = (v) => (v < 0 ? 0 : v > 1 ? 1 : v), ramp = (T, t0, d) => sat((T - t0) / d), smooth = (t) => t * t * (3 - 2 * t);
const MIN = 1 / 60, SEC = 1 / 3600;

const NIGHT = hex('#1E2A5A'), DUSK = hex('#6A4A7A');
let ENV = { dark: 0, tint: NIGHT, litFrac: 0, hour: 10, dayness: 1, twilight: 0, T: 10, month: 10 };
const amb = (c) => mix(c, ENV.tint, ENV.dark);
const col = (c) => rgba(amb(typeof c === 'string' ? hex(c) : c));
function fillRect(ctx, c, x, y, w, h) { ctx.fillStyle = typeof c === 'string' && c.startsWith('rgba') ? c : col(c); ctx.fillRect(x, y, w, h); }
function rawRect(ctx, css, x, y, w, h) { ctx.fillStyle = css; ctx.fillRect(x, y, w, h); }
function poly(ctx, c, pts, raw = false) { ctx.fillStyle = raw ? c : col(c); ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); ctx.fill(); }
function disc(ctx, c, x, y, r, raw = false) { ctx.fillStyle = raw ? c : col(c); ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); }
function inkRect(ctx, x, y, w, h, lw = 0.8) { ctx.strokeStyle = INK; ctx.lineWidth = lw; ctx.strokeRect(x, y, w, h); }
function inkLine(ctx, pts, lw = 0.7, close = false) { ctx.strokeStyle = INK; ctx.lineWidth = lw; ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); if (close) ctx.closePath(); ctx.stroke(); }

// ───────────── palette (chantier 1 + habitants) ─────────────
const STONES = ['#EDE2C8', '#E8DCC0', '#F0E6D0', '#E4D6BA', '#EAD5B0', '#F2E8D4'];
const PLASTERS = ['#F6E2B4', '#EEC79A', '#CFE0B8', '#E0C8A0', '#F4D89C', '#E6BCD0'];
const ZINCS = ['#8290A2', '#98A4B4', '#7A8AA0'];
const TILES = ['#C86A40', '#B4523A'];
const BRICK = '#C2724E', WOOD = ['#2F5D50', '#2E4A6E', '#5A3A2E', '#3A4A3A'];
const GLASS_DAY = '#7FB4E0', GLASS_NIGHT = '#232D52', ROOM_DAY = '#4A3C44';
const LIT = { warm: '#FFD86A', cream: '#FFF0C0', orange: '#FFB048', tv: '#9CC4FF', cool: '#C8DCFF', stair: '#F4F0D8' };
const CURTAINS = ['#F4E6D0', '#C85A3A', '#5A7AA8', '#E8C890', '#8A5A8E'];
const PERSIENNES = ['#C4CCC8', '#B8C0B4', '#CCC4AC'];          // persiennes repliables (haussmann)
const SHIRTS = ['#C85A3A', '#2E4A6E', '#8A5A8E', '#3F8A3A', '#E8C060', '#5A7AA8', '#B8705A', '#D86C7A', '#F4F0E0'];
const PANTS = ['#2E3A4A', '#5A3A2E', '#3A4A3A', '#8A7A6A', '#2A2A3A'];
const SKINS = ['#F2C9A0', '#D9A070', '#8A5A3A', '#F6D8B8', '#C8906A'];
const SILH = '#1A1422';                                         // silhouette en contre-jour
const GF = 30, MIN_FLOOR = 10;
