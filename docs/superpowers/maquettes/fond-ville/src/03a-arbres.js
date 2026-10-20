// ───────────── modèle d'arbre unique (rue et colline) : squelette FIXE + feuilles posées sur les rameaux ─────────────
// Un arbre = un squelette (fût, charpentières, branches, rameaux) tiré UNE fois de (clé, essence, taille) : il ne dépend ni de
// la date, ni de la densité du feuillage, ni de la météo. Le feuillage est une liste de touffes attachées aux rameaux (position
// fixe elle aussi), que la saison habille : chaque touffe a un rang (0 près du tronc → 1 au bout des branches) ; elle est
// présente si rang < densité du jour, grossit au débourrement, jaunit (les bouts d'abord) et se détache en automne (trous dans
// la masse, rameaux dénudés du bout vers l'intérieur). Au vent, fût et charpentières ne bougent pas : les touffes (par grappe,
// déphasées) et un peu les rameaux fins.
const PORTS = {
  platane: { n: [3, 5], ang: 0.7, len: 0.56, kink: 0.4, w: 1.1, crown: [1.05, 0.8] },     // étalé, noueux
  tilleul: { n: [3, 4], ang: 0.42, len: 0.5, kink: 0.15, w: 0.85, crown: [0.72, 1.05] },  // ovale, dense en rameaux
  marronnier: { n: [3, 4], ang: 0.58, len: 0.52, kink: 0.22, w: 1.0, crown: [0.9, 0.9] },  // arrondi
  poplar: { n: [3, 5], ang: 0.2, len: 0.62, kink: 0.1, w: 0.7, crown: [0.38, 1.25] },      // fuseau
  cerisier: { n: [4, 6], ang: 0.5, len: 0.6, kink: 0.25, w: 0.75, crown: [0.95, 0.75] },  // en coupe
  chene: { n: [3, 4], ang: 0.78, len: 0.5, kink: 0.5, w: 1.15, crown: [1.0, 0.85] },        // tortueux
  bouquet: { n: [2, 4], ang: 0.6, len: 0.55, kink: 0.3, w: 0.8, crown: [0.95, 0.85] },
};
PORTS.chestnut = PORTS.marronnier;
// Modèle : `foot` = pied (x, y), `trunkH` = hauteur du fût, `crownH` = hauteur de la ramure au-dessus du fût, `depth` = niveaux
// de ramification, `tuftR` = rayon d'une touffe, `maxTufts` = plafond de touffes. Tout est déterministe : même clé → même arbre.
function treeModel(key, species, foot, trunkH, crownH, depth, tuftR, maxTufts, trunkW) {
  const P = PORTS[species] || PORTS.bouquet, rng = mulberry32(hashString('squelette-' + key)), segs = [];
  const w0 = trunkW ?? Math.max(0.5, crownH * 0.07 * P.w), rootY = foot.y - trunkH;
  const rec = (px, py, ang, len, w, lv, mass) => {
    if (lv > depth) return;
    const n = P.n[0] + Math.floor(rng() * (P.n[1] - P.n[0] + 1));
    for (let i = 0; i < n; i++) {
      const a = ang + (i - (n - 1) / 2) * P.ang * (0.75 + rng() * 0.5) + (rng() - 0.5) * P.kink;
      const l = len * (0.75 + rng() * 0.5), ex = px + Math.cos(a) * l, ey = py + Math.sin(a) * l, mid = lv === 1 ? i : mass;
      segs.push({ x0: px, y0: py, x1: ex, y1: ey, w, lv, mass: mid });
      rec(ex, ey, a + (rng() - 0.5) * P.kink * 0.6, l * (P.len / 0.56) * 0.62, w * 0.62, lv + 1, mid);
    }
  };
  rec(foot.x, rootY, -Math.PI / 2, crownH * 0.5, w0 * 0.75, 1, 0);
  // Enveloppe réelle du squelette (envergure et hauteur : fixes).
  let minX = foot.x, maxX = foot.x, minY = rootY; for (const s of segs) { minX = Math.min(minX, s.x1); maxX = Math.max(maxX, s.x1); minY = Math.min(minY, s.y1); }
  const cx = (minX + maxX) / 2, cy = (minY + rootY) / 2, rx = (maxX - minX) / 2 + tuftR, ry = (rootY - minY) / 2 + tuftR;
  // Touffes : sur les rameaux (niveaux ≥ 2, ou ≥ 1 si peu de niveaux), échantillonnées sans dépasser `maxTufts`.
  const twigs = segs.filter((s) => s.lv >= Math.min(2, depth)), rt = mulberry32(hashString('touffes-' + key)), tufts = [];
  const step = Math.max(1, Math.floor(twigs.length / maxTufts));
  for (let i = Math.floor(rt() * step); i < twigs.length && tufts.length < maxTufts; i += step) {
    const s = twigs[i], t = 0.45 + rt() * 0.55, x = s.x0 + (s.x1 - s.x0) * t + (rt() - 0.5) * tuftR * 0.8, y = Math.max(minY, s.y0 + (s.y1 - s.y0) * t + (rt() - 0.5) * tuftR * 0.8); // jamais au-dessus du plus haut rameau : la silhouette ne saute pas quand une touffe naît
    const dist = Math.hypot((x - cx) / rx, (y - cy) / ry), rank = sat(dist * 0.7 + rt() * 0.4 - 0.05);
    tufts.push({ x, y, rr: tuftR * (0.8 + rt() * 0.5), rank, tone: Math.floor(rt() * 3), phase: rt() * TAU, yel: rt(), cluster: Math.min(5, s.mass), mass: s.mass, outer: dist > 0.7 });
  }
  return { key, species, foot, trunkH, rootY, w0, segs, tufts, nMasses: segs.filter((sg) => sg.lv === 1).length, cx, cy, rx, ry, top: minY - tuftR, trunkBox: { x: foot.x - w0, y: rootY, w: 2 * w0, h: trunkH }, span: [minX, maxX] };
}
const MODELS = new Map();
const treeModelOf = (key, species, foot, trunkH, crownH, depth, tuftR, maxTufts, trunkW) => { const k = `${key}|${species}|${foot.x.toFixed(2)}|${foot.y.toFixed(2)}|${trunkH.toFixed(2)}|${crownH.toFixed(2)}|${depth}|${tuftR.toFixed(2)}|${maxTufts}`; if (!MODELS.has(k)) MODELS.set(k, treeModel(key, species, foot, trunkH, crownH, depth, tuftR, maxTufts, trunkW)); return MODELS.get(k); };

// Fût : polygone fixe du pied à la racine des charpentières ; écorce ; mouillé = plus sombre.
function paintTrunk(ctx, m, bark0, hz = 0, wet = 0, young = false) {
  const bark = wet ? mixRgb(bark0, hexRgb('#2A2420'), 0.35 * wet) : bark0, { foot, rootY, w0 } = m, tb = w0 * 1.25, tt = w0 * 0.8;
  ctx.beginPath(); ctx.moveTo(foot.x - tb, foot.y); ctx.lineTo(foot.x - tt, rootY); ctx.lineTo(foot.x + tt, rootY); ctx.lineTo(foot.x + tb, foot.y); ctx.closePath(); ctx.fillStyle = rgba(haze(bark, hz), 1); ctx.fill();
  ctx.save(); ctx.clip(); fillRect(ctx, haze(shade(bark, 0.4), hz), foot.x + tt * 0.2, rootY, tb, m.trunkH); if (m.species === 'platane' && !young && m.trunkH > 12) { ctx.fillStyle = rgba(light(bark, 0.5), 1); const r = mulberry32(hashString('ecorce' + m.key)); for (let i = 0; i < 6; i++) ctx.fillRect(foot.x - tb * 0.8 + r() * tb * 1.2, rootY + 2 + r() * (m.trunkH - 6), 1, 1.6 + r()); } ctx.restore();
  ctx.strokeStyle = ink(0.95 - hz); ctx.lineWidth = m.trunkH > 12 ? 0.7 : 0.5; ctx.stroke();
}
// Branches : `part` = 'coarse' (charpentières, niveau 1), 'fine' (rameaux, niveaux ≥ 2) ou 'all' ; voile des rameaux ∝ (1 − d).
function paintBranches(ctx, m, part = 'all', opts = {}) {
  const hz = opts.hz || 0, bark = rgba(haze(hexRgb('#4A3A30'), hz), opts.alpha ?? 1), levels = part === 'coarse' ? [1] : part === 'fine' ? [2, 3, 4, 5] : [1, 2, 3, 4, 5];
  if (part !== 'coarse' && opts.veil > 0) { ctx.fillStyle = rgba(haze(hexRgb('#8A7A70'), hz), opts.veil); ctx.beginPath(); ctx.ellipse(m.cx, m.cy, m.rx * 0.9, m.ry * 0.9, 0, 0, TAU); ctx.fill(); }
  ctx.lineCap = 'round'; ctx.strokeStyle = bark;
  for (const lv of levels) { const ss = m.segs.filter((s) => s.lv === lv); if (!ss.length) continue; ctx.lineWidth = Math.max(0.3, ss[0].w); ctx.beginPath(); for (const s of ss) { ctx.moveTo(s.x0, s.y0); ctx.lineTo(s.x1, s.y1); } ctx.stroke(); }
  if (opts.snow) { ctx.strokeStyle = `rgba(242,246,250,0.92)`; for (const s of m.segs) { if (!levels.includes(s.lv)) continue; const dx = Math.abs(s.x1 - s.x0), dy = Math.abs(s.y1 - s.y0); if (dy > dx * 1.3) continue; ctx.lineWidth = Math.max(0.5, s.w * 0.7); ctx.beginPath(); ctx.moveTo(s.x0, s.y0 - s.w * 0.5 - 0.3); ctx.lineTo(s.x1, s.y1 - s.w * 0.5 - 0.3); ctx.stroke(); } }
  if (opts.mistletoe) { const r = mulberry32(hashString('gui' + m.key)), mids = m.segs.filter((s) => s.lv === 2); for (let i = 0; i < opts.mistletoe && mids.length; i++) { const s = mids[Math.floor(r() * mids.length)], rr = Math.max(1, m.ry * 0.16); disc(ctx, rgba(haze(hexRgb('#3E6A3A'), hz), 1), (s.x0 + s.x1) / 2, (s.y0 + s.y1) / 2, rr); disc(ctx, rgba(haze(hexRgb('#6A9A5A'), hz), 1), (s.x0 + s.x1) / 2 - rr * 0.3, (s.y0 + s.y1) / 2 - rr * 0.3, rr * 0.5); } }
}
// État d'une touffe à la date D (f = foliageOf) : taille 0..1 (0 = absente), couleur (jaunissement par touffe : les bouts d'abord).
function tuftState(tf, f, D, species) {
  const bl = species === 'cerisier' ? bloomOf(D, 'cerisier') : 0;
  let size = sat((f.d - tf.rank) / 0.36);                                     // apparaît / disparaît sur 0,36 de densité (≈ 11-13 jours : ≤ 1 px par jour)
  if (f.tender > 0) size = Math.min(size, 0.35 + 0.65 * sat((f.d - tf.rank) / 0.3) + (1 - f.tender)); // bourgeon → feuille, plafond qui se lève en continu
  if (bl > 0) size = Math.max(size, Math.min(1, bl * 2.5) * (0.6 + 0.4 * bl)); // la floraison du cerisier monte en douceur (≤ 1 px par jour)
  const yel = f.yel !== undefined ? sat(f.yel * 1.5 - tf.rank * 0.5 + tf.yel * 0.2 - 0.1) : 0;
  let tones = f.yel !== undefined && yel > 0 ? mixTones(f.base, f.autumn, yel) : f.tones;
  if (bl > 0) tones = ['#D88AA8', '#F0B0C8', '#FCDCE8'].map(hexRgb).map((c, i) => mixRgb(c, tones[i], 1 - bl));
  return { size, tones, loose: f.drop > 0 && f.drop < 1 && f.d - tf.rank > -0.06 && f.d - tf.rank < 0.1, bloom: bl };
}
// Blob de feuillage à bord lobé et dentelé (pas un cercle) : 18 sommets, lobes (3 et 5 par tour) et dentelure fine alternée.
function leafBlob(ctx, x, y, r, ph) {
  ctx.moveTo(x + r * (1 + 0.16 * Math.sin(ph)), y);
  for (let i = 1; i <= 18; i++) { const a = (i / 18) * TAU, k = 1 + 0.16 * Math.sin(3 * a + ph) + 0.1 * Math.sin(5 * a + 2 * ph) + (i % 2 ? 0.07 : -0.05); ctx.lineTo(x + Math.cos(a) * r * k, y + Math.sin(a) * r * k * 0.92); }
  ctx.closePath();
}
// Feuilles : `which` = filtre de masse (0-5) ou null ; `shiftX/Y` = décalage (vent) ; `wet` = pluie ; `hz` = brume ; `part` =
// 'leaves' (masses continues : ombre, ton moyen, rehauts en touches, trait léger sur la silhouette seule), 'shadow', 'hi'.
// Une masse = l'union des blobs de ses touffes présentes : les blobs se recouvrent (pas de contour individuel), le trait
// n'apparaît que sur le bord extérieur (tracé AVANT les aplats, donc couvert à l'intérieur), les trouées viennent des touffes
// absentes (automne, printemps) et des creux entre masses.
function paintLeaves(ctx, m, f, D, opts = {}) {
  const hz = opts.hz || 0, wet = opts.wet || 0, part = opts.part || 'leaves', sx = opts.shiftX || 0, sy = opts.shiftY || 0;
  const blm = m.species === 'marronnier' ? bloomOf(D, 'marronnier') : 0, blt = m.species === 'tilleul' ? bloomOf(D, 'tilleul') : 0;
  const items = [];
  for (const tf of m.tufts) {
    if (opts.which !== undefined && opts.which !== null && tf.cluster !== opts.which) continue;
    const st = tuftState(tf, f, D, m.species); if (st.size <= 0) continue;
    if (opts.loose !== undefined && st.loose !== opts.loose) continue;
    const rr = tf.rr * st.size /* le rayon suit la taille jusqu'à 0 : aucune touffe ne disparaît d'un coup */, x = tf.x + sx * (0.5 + tf.rank) + Math.sin(tf.phase) * 0.2 * sx, y = tf.y + sy * (0.5 + tf.rank);
    items.push({ tf, st, rr, x, y });
  }
  if (!items.length) return;
  if (part === 'shadow') { ctx.fillStyle = 'rgba(70,50,130,0.16)'; ctx.beginPath(); for (const it of items) leafBlob(ctx, it.x + 4, it.y + 5, it.rr * 1.05, it.tf.phase); ctx.fill(); return; }
  const tone = (it, i) => { const c = wet ? mixRgb(it.st.tones[i], hexRgb('#1A2A3A'), 0.28 * wet) : it.st.tones[i]; return rgba(haze(c, hz), 1); };
  if (part === 'hi') { ctx.fillStyle = tone(items[0], 2); if (opts.pale) ctx.fillStyle = rgba(haze(light(items[0].st.tones[2], 0.5), hz), 1); ctx.beginPath(); for (const it of items) { if (it.rr < 1.2) continue; const r = mulberry32(hashString('hi' + it.tf.phase)); for (let k = 0; k < 3; k++) { const a = -2.4 + r() * 1.4, d = it.rr * (0.3 + r() * 0.45); ctx.moveTo(it.x + Math.cos(a) * d + 0.6, it.y + Math.sin(a) * d); ctx.ellipse(it.x + Math.cos(a) * d, it.y + Math.sin(a) * d, 0.75, 0.45, a, 0, TAU); } } ctx.fill(); return; }
  // 1. Trait encré sur la silhouette extérieure seulement (léger, interrompu), tracé sous les aplats.
  ctx.save(); ctx.setLineDash([2.2, 1.1]); ctx.lineDashOffset = items[0].tf.phase; ctx.strokeStyle = ink(0.55 - hz); ctx.lineWidth = 0.9; ctx.beginPath(); for (const it of items) leafBlob(ctx, it.x, it.y, it.rr, it.tf.phase); ctx.stroke(); ctx.restore();
  // 2. Ombre (dessous et côté opposé au soleil) : tous les blobs, ton sombre.
  ctx.beginPath(); for (const it of items) leafBlob(ctx, it.x, it.y, it.rr, it.tf.phase); ctx.fillStyle = tone(items[0], 0);
  // Les touffes d'un arbre partagent un ton par état : on groupe par ton pour garder des aplats (pas un dégradé par touffe).
  const groups = new Map(); for (const it of items) { const k = it.st.tones[0].join(','); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(it); }
  for (const [, g] of groups) { ctx.fillStyle = tone(g[0], 0); ctx.beginPath(); for (const it of g) leafBlob(ctx, it.x, it.y, it.rr, it.tf.phase); ctx.fill(); }
  // 3. Ton moyen : blobs décalés vers le haut-gauche et un peu réduits (l'ombre reste visible en bas à droite).
  for (const [, g] of groups) { ctx.fillStyle = tone(g[0], 1); ctx.beginPath(); for (const it of g) leafBlob(ctx, it.x - it.rr * 0.22, it.y - it.rr * 0.28, it.rr * 0.8, it.tf.phase + 1); ctx.fill(); }
  // 4. Rehaut clair en haut à gauche : petites touches de feuilles (ellipses) sur le haut des blobs, pas un troisième aplat.
  for (const [, g] of groups) { ctx.fillStyle = tone(g[0], 2); ctx.beginPath(); for (const it of g) { if (it.rr < 1.1) continue; const r = mulberry32(hashString('hi' + it.tf.phase)); const n = it.rr > 2.5 ? 4 : 2; for (let k = 0; k < n; k++) { const a = -2.5 + r() * 1.5, d = it.rr * (0.25 + r() * 0.5), ex = it.x + Math.cos(a) * d, ey = it.y + Math.sin(a) * d, ea = a + 0.6; ctx.moveTo(ex + 0.8, ey); ctx.ellipse(ex, ey, Math.min(1.1, it.rr * 0.35), Math.min(0.6, it.rr * 0.18), ea, 0, TAU); } } ctx.fill(); }
  if (wet) { ctx.strokeStyle = `rgba(230,240,255,${0.35 * wet})`; ctx.lineWidth = 0.7; ctx.beginPath(); for (const it of items) ctx.arc(it.x, it.y, it.rr * 0.8, Math.PI * 1.1, Math.PI * 1.5); ctx.stroke(); }
  if (blm > 0) { ctx.fillStyle = `rgba(255,244,236,${blm})`; for (const it of items) if (it.tf.outer || it.tf.y < m.cy) ctx.fillRect(it.x - 0.3, it.y - it.rr - 1.4, 0.6, 2); }
  if (blt > 0) { ctx.fillStyle = `rgba(250,236,170,${blt})`; for (const it of items) if (it.tf.yel < 0.5) ctx.fillRect(it.x + it.rr * 0.3, it.y - it.rr * 0.2, 0.8, 0.8); }
  if (D.meteo.snow) { ctx.fillStyle = 'rgba(240,244,248,0.92)'; ctx.beginPath(); for (const it of items) { ctx.moveTo(it.x + it.rr * 0.95, it.y - it.rr * 0.15); ctx.ellipse(it.x, it.y - it.rr * 0.15, it.rr * 0.95, it.rr * 0.45, 0, Math.PI, 0); } ctx.fill(); }
}
// Feuilles sèches accrochées (chênes) : de la chute à la mi-janvier, en s'éclaircissant.
const dryLeavesOf = (D, species) => (species === 'chene' ? (D.doy >= 320 ? 1 - (D.doy - 320) / 60 : D.doy < 15 ? 0.3 - D.doy / 50 : 0) : 0);
function paintDryLeaves(ctx, m, D, hz = 0) { const k = dryLeavesOf(D, m.species); if (k <= 0) return; ctx.fillStyle = rgba(haze(hexRgb('#9A6A3A'), hz), 0.9 * k); const r = mulberry32(hashString('sec' + m.key)); for (const tf of m.tufts) if (tf.rank > 0.5 && r() < 0.55) ctx.fillRect(tf.x - 0.5, tf.y - 0.3, 1.1, 0.9); }

// ── Arbre complet, sans vent (galerie, colline) : fût → charpentières → rameaux (+ voile, neige, gui) → feuilles. ──
function paintTreeStatic(ctx, m, f, D, opts = {}) {
  const hz = opts.hz || 0, wet = D.meteo.wet || 0; if (opts.veil === undefined) opts.veil = 0.14;
  if (opts.shadow) paintLeaves(ctx, m, f, D, { part: 'shadow' });
  paintTrunk(ctx, m, opts.bark || hexRgb('#6A5A50'), hz, wet, opts.young);
  paintBranches(ctx, m, 'coarse', { hz, snow: D.meteo.snow });
  paintBranches(ctx, m, 'fine', { hz, veil: (opts.veil ?? 0.22) * (1 - f.d), snow: D.meteo.snow, mistletoe: opts.mistletoe || 0, alpha: 0.06 + 0.94 * (1 - f.d) });
  paintDryLeaves(ctx, m, D, hz);
  paintLeaves(ctx, m, f, D, { hz, wet });
}
