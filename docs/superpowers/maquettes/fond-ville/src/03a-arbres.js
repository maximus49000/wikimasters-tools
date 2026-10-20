// ───────────── arbres d'hiver : squelette ramifié (tronc → charpentières → branches → rameaux), tiré par graine ─────────────
// Port propre à l'essence ; la masse des rameaux fins est un voile gris-brun léger DANS la silhouette (jamais un cercle cerné).
// Sert aux arbres de la rue (grands) et de la colline (petits, moins de niveaux). La silhouette apparaît aussi au travers
// des masses qui s'éclaircissent (chute de novembre, débourrement de mars-avril). Peint dans les tranches : aucun nœud animé.
const PORTS = {
  platane: { n: [3, 5], ang: 0.7, len: 0.56, depth: 4, kink: 0.4, w: 1.1, crown: [1.05, 0.8], trunk: 0.3 },     // étalé, noueux
  tilleul: { n: [3, 4], ang: 0.42, len: 0.5, depth: 5, kink: 0.15, w: 0.85, crown: [0.72, 1.05], trunk: 0.25 },  // ovale, dense en rameaux
  marronnier: { n: [3, 4], ang: 0.58, len: 0.52, depth: 4, kink: 0.22, w: 1.0, crown: [0.9, 0.9], trunk: 0.28 },  // arrondi
  poplar: { n: [3, 5], ang: 0.2, len: 0.62, depth: 4, kink: 0.1, w: 0.7, crown: [0.38, 1.25], trunk: 0.12 },      // fuseau
  cerisier: { n: [4, 6], ang: 0.5, len: 0.6, depth: 3, kink: 0.25, w: 0.75, crown: [0.95, 0.75], trunk: 0.22 },  // en coupe
  chene: { n: [3, 4], ang: 0.78, len: 0.5, depth: 4, kink: 0.5, w: 1.15, crown: [1.0, 0.85], trunk: 0.3 },        // tortueux
  bouquet: { n: [2, 4], ang: 0.6, len: 0.55, depth: 3, kink: 0.3, w: 0.8, crown: [0.95, 0.85], trunk: 0.3 },
};
PORTS.chestnut = PORTS.marronnier;
// Squelette : segments {x0,y0,x1,y1,w,lv} ; `h` hauteur totale (sol → haut des rameaux), `depth` max de niveaux (colline : 2-3).
function treeSkeleton(key, species, x, y, h, depthMax = 5) {
  const P = PORTS[species] || PORTS.bouquet, rng = mulberry32(hashString('squelette-' + key)), segs = [], depth = Math.min(P.depth, depthMax);
  const T = h * P.trunk, w0 = Math.max(0.5, h * 0.045 * P.w);
  segs.push({ x0: x, y0: y, x1: x, y1: y - T, w: w0, lv: 0 });
  const rec = (px, py, ang, len, w, lv) => {
    if (lv > depth) return;
    const n = P.n[0] + Math.floor(rng() * (P.n[1] - P.n[0] + 1));
    for (let i = 0; i < n; i++) {
      const a = ang + (i - (n - 1) / 2) * P.ang * (0.75 + rng() * 0.5) + (rng() - 0.5) * P.kink;
      const l = len * (0.75 + rng() * 0.5), ex = px + Math.cos(a) * l, ey = py + Math.sin(a) * l;
      segs.push({ x0: px, y0: py, x1: ex, y1: ey, w, lv });
      rec(ex, ey, a + (rng() - 0.5) * P.kink * 0.6, l * P.len / 0.56 * 0.62, w * 0.62, lv + 1);
    }
  };
  rec(x, y - T, -Math.PI / 2, (h - T) * 0.5, w0 * 0.75, 1);
  return { segs, cx: x, cy: y - T - (h - T) * 0.55, rx: (h - T) * P.crown[0] * 0.55, ry: (h - T) * P.crown[1] * 0.5, T, tips: segs.filter((s) => s.lv === depth) };
}
// Rendu : voile des rameaux, branches (plus fines à chaque niveau), feuilles sèches des chênes en début d'hiver, gui, neige.
function paintSkeleton(ctx, sk, opts = {}) {
  const hz = opts.hz || 0, alpha = opts.alpha ?? 1, bark = haze(hexRgb('#4A3A30'), hz);
  if (opts.veil !== false) { ctx.fillStyle = rgba(haze(hexRgb('#8A7A70'), hz), (opts.veilAlpha ?? 0.22) * alpha); ctx.beginPath(); ctx.ellipse(sk.cx, sk.cy, sk.rx, sk.ry, 0, 0, TAU); ctx.fill(); }
  ctx.lineCap = 'round'; ctx.strokeStyle = rgba(bark, alpha);
  for (let lv = 0; lv <= 5; lv++) { let any = false; ctx.beginPath(); for (const s of sk.segs) if (s.lv === lv) { any = true; ctx.lineWidth = s.w; ctx.moveTo(s.x0, s.y0); ctx.lineTo(s.x1, s.y1); } if (any) { ctx.lineWidth = sk.segs.find((s) => s.lv === lv).w; ctx.stroke(); } }
  if (opts.dryLeaves > 0) { ctx.fillStyle = rgba(haze(hexRgb('#9A6A3A'), hz), 0.9 * opts.dryLeaves * alpha); const r = mulberry32(hashString('sec' + sk.cx)); for (const t of sk.tips) if (r() < 0.55) ctx.fillRect(t.x1 - 0.5, t.y1 - 0.3, 1.1, 0.9); }
  if (opts.mistletoe) { const r = mulberry32(hashString('gui' + sk.cx)); const mids = sk.segs.filter((s) => s.lv === 2); for (let i = 0; i < opts.mistletoe && mids.length; i++) { const s = mids[Math.floor(r() * mids.length)], rr = Math.max(1, sk.ry * 0.16); disc(ctx, rgba(haze(hexRgb('#3E6A3A'), hz), alpha), (s.x0 + s.x1) / 2, (s.y0 + s.y1) / 2, rr); disc(ctx, rgba(haze(hexRgb('#6A9A5A'), hz), alpha), (s.x0 + s.x1) / 2 - rr * 0.3, (s.y0 + s.y1) / 2 - rr * 0.3, rr * 0.5); } }
  if (opts.snow) { ctx.strokeStyle = `rgba(242,246,250,${0.92 * alpha})`; ctx.lineCap = 'round'; for (const s of sk.segs) { const dx = Math.abs(s.x1 - s.x0), dy = Math.abs(s.y1 - s.y0); if (dy > dx * 1.3 && s.lv > 0) continue; ctx.lineWidth = Math.max(0.5, s.w * 0.7); ctx.beginPath(); ctx.moveTo(s.x0, s.y0 - s.w * 0.5 - 0.3); ctx.lineTo(s.x1, s.y1 - s.w * 0.5 - 0.3); ctx.stroke(); } }
}
// Feuilles sèches accrochées (chênes) : de la chute à la mi-janvier, en s'éclaircissant.
const dryLeavesOf = (D, species) => (species === 'chene' ? (D.doy >= 320 ? 1 - (D.doy - 320) / 60 : D.doy < 15 ? 0.3 - D.doy / 50 : 0) : 0);
