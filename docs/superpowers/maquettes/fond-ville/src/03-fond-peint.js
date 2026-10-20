// ───────────── fond peint corrigé (statique : à peindre dans les tranches, clé = graine + saison + tranche de 10 min) ─────────────
// Port de hill-painter.ts (colline, maisons, repères, mur du fond) avec les corrections D1 à D6 et les poses « lentes » de la
// vie : volets (B), linge (H), parasols (O), saison des arbres (G). Tout ce qui bouge à la seconde est dans 04-vie-fond.js.

// ── États lents (fonctions pures de T, D, objet) ──
// Volets du mur du fond : fraction fermée (0 ouvert … 1 fermé). Fermés la nuit à une heure propre à la fenêtre (21 h 20 – 23 h 40),
// rouverts le matin (7 h – 9 h 10) ; une fenêtre sur trois exposée au soleil se ferme l'après-midi d'été ; 8 % de logements vides.
function shutterK(T, D, wn) {
  if (wn.vac) return 1;
  const night = T >= wn.closeAt ? ramp(T, wn.closeAt, 0.5 * MIN) : 1 - ramp(T, wn.openAt, 0.5 * MIN);
  const summer = wn.sun && D.season === 'summer' && D.meteo.cloud < 0.5 ? Math.min(ramp(T, 14 + wn.u * 1.5, 0.5 * MIN), 1 - ramp(T, 18.4 + wn.u, 0.5 * MIN)) : 0;
  return Math.max(night, summer);
}
// Linge aux fenêtres du fond : jours secs et peu venteux seulement, un immeuble sur quatre (tirage du jour), pendu vers 9 h 30
// pièce par pièce (1 min), rentré vers 17 h 30 ; rentré d'avance s'il pleut (la météo de la scène décide : pas de linge sous la pluie).
function laundryK(T, D, b, seed) {
  if (b.laundryFloor === null || D.meteo.precip > 0 || D.meteo.wind > 0.7) return 0;
  const r = rngOf(seed, `linge-${b.id}`, D.date); if (r() > 0.25) return 0;
  const t0 = 9.2 + r() * 1.2, t1 = 16.8 + r() * 1.6;
  return Math.min(ramp(T, t0, 1 * MIN), 1 - ramp(T, t1, 1 * MIN));
}
// Parasol d'une terrasse : ouvert les après-midis d'été ensoleillés (12 h – 19 h, heure propre), replié sinon et sous la pluie.
function parasolK(T, D, tr) {
  if (D.season !== 'summer' || D.meteo.cloud >= 0.5 || D.meteo.precip > 0) return 0;
  const o = 12 + (tr.x % 7) / 7 * 1.5;
  return Math.min(ramp(T, o, 20 * SEC), 1 - ramp(T, 19 + (tr.x % 5) / 5, 20 * SEC));
}

// ── Colline ──
function paintGround(ctx, F, D) {
  const crest = F.crest, g = F.ground;
  const doy = D.doy, dry = sat((doy - 250) / 60) * (1 - sat((doy - 340) / 25)), cold = Math.max(sat((doy - 320) / 30), 1 - sat((doy - 60) / 40)), season = D.meteo.snow ? hexRgb('#E8ECF0') : mixRgb(mixRgb(light(GRASS, 0.2 * (1 - sat((doy - 100) / 60))), hexRgb('#B89040'), dry * 0.35), hexRgb('#9A9A80'), cold * 0.45);
  ctx.fillStyle = rgba(haze(season, 0.35), 1); ctx.beginPath(); ctx.moveTo(-4, g);
  for (let x = -4; x <= W + 4; x += 4) ctx.lineTo(x, crest(x)); ctx.lineTo(W + 4, g); ctx.closePath(); ctx.fill();
  ctx.fillStyle = rgba(haze(light(season, 0.4), 0.3), 1); ctx.beginPath();
  for (let x = -4; x <= W + 4; x += 4) ctx.lineTo(x, crest(x)); for (let x = W + 4; x >= -4; x -= 4) ctx.lineTo(x, crest(x) + 3); ctx.closePath(); ctx.fill();
}
// Route en lacets de l'échappée (D) : ruban clair, bord d'ombre, réverbères (K : mâts ; la lampe est allumée par la vie).
function paintRoad(ctx, e) {
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.strokeStyle = rgba(haze(shade(ROAD, 0.45), 0.2), 1); ctx.lineWidth = 4.6; ctx.beginPath(); e.road.forEach(([x, y], i) => (i ? ctx.lineTo(x, y + 0.9) : ctx.moveTo(x, y + 0.9))); ctx.stroke();
  ctx.strokeStyle = rgba(haze(ROAD, 0.2), 1); ctx.lineWidth = 3.6; ctx.beginPath(); e.road.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
  ctx.strokeStyle = rgba(haze(light(ROAD, 0.5), 0.2), 1); ctx.lineWidth = 0.7; ctx.beginPath(); e.road.forEach(([x, y], i) => (i ? ctx.lineTo(x, y - 1.3) : ctx.moveTo(x, y - 1.3))); ctx.stroke();
  for (const v of e.verdure) paintVerdure(ctx, v, 0.2);
  for (const l of e.lamps) { const p = roadPoint(e, l.d); ctx.strokeStyle = ink(0.7); ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x, p.y - 4); ctx.lineTo(p.x + 1, p.y - 4); ctx.stroke(); }
  // Voie du funiculaire (J) : bande de pierre, deux rails, gares en haut et en bas (petites halles au toit rouge).
  const f = e.funi;
  ctx.strokeStyle = rgba(haze(STONE, 0.25), 1); ctx.lineWidth = 8; ctx.lineCap = 'butt'; ctx.beginPath(); ctx.moveTo(f.x0, f.y0); ctx.lineTo(f.x1, f.y1); ctx.stroke();
  ctx.strokeStyle = ink(0.5); ctx.lineWidth = 0.45; ctx.beginPath(); for (const o of [-FUNI_GAP - 1, -FUNI_GAP + 1, FUNI_GAP - 1, FUNI_GAP + 1]) { ctx.moveTo(f.x0 + o, f.y0); ctx.lineTo(f.x1 + o, f.y1); } ctx.stroke();
  // Gares : la halle est au-delà du bout de voie (au-dessus en haut, en dessous en bas) et un quai de pierre borde l'arrêt des
  // cabines, qui restent visibles à quai.
  for (const [sx, sy, hz, up] of [[f.x0, f.y0 + 8, 0.14, false], [f.x1, f.y1 - 8, 0.3, true]]) {
    const c = haze(STONE, hz);
    poly(ctx, shade(c, 0.25), up ? [[sx - 10, sy + 9], [sx - 7, sy], [sx + 7, sy], [sx + 10, sy + 9]] : [[sx - 9, sy - 8], [sx + 9, sy - 8], [sx + 7, sy - 5], [sx - 7, sy - 5]]);
    fillRect(ctx, c, sx - 6, sy - 6, 12, 6); fillRect(ctx, shade(c, 0.3), sx + 2, sy - 6, 4, 6);
    poly(ctx, haze(hexRgb('#C25E44'), hz), [[sx - 7, sy - 6], [sx, sy - 9.5], [sx + 7, sy - 6]]); inkPath(ctx, [[sx - 7, sy - 6], [sx, sy - 9.5], [sx + 7, sy - 6]], 0.6, 0.8, true);
    fillRect(ctx, ink(0.7), sx - 2, sy - 4.5, 4, 3.2); inkPath(ctx, [[sx - 6, sy - 6], [sx + 6, sy - 6], [sx + 6, sy], [sx - 6, sy]], 0.6, 0.8, true);
  }
}
function roadPoint(e, d) {
  for (const s of e.segs) if (d <= s.s0 + s.l) { const t = (d - s.s0) / s.l; return { x: s.ax + (s.bx - s.ax) * t, y: s.ay + (s.by - s.ay) * t, dir: Math.sign(s.bx - s.ax) || 1 }; }
  const s = e.segs[e.segs.length - 1]; return { x: s.bx, y: s.by, dir: Math.sign(s.bx - s.ax) || 1 };
}
// Bouquet d'arbres (le même dessin que ceux des maisons, hill-painter.ts), saison comprise.
function paintBouquet(ctx, tx, ty, tr, s, hz, D = CUR_D, key = `${Math.round(tx)}-${Math.round(ty)}`) {
  const f = foliageOf(D, 'b' + key, 'bouquet'), bare = f.d <= 0.1, k = bare ? 0.75 : 0.6 + 0.4 * f.d, tones = f.tones;
  ctx.strokeStyle = ink(0.85 - hz); ctx.lineWidth = 1.1; ctx.beginPath();
  if (f.d < 0.6) { ctx.moveTo(tx, ty + tr); ctx.lineTo(tx, ty - tr * 0.4); ctx.moveTo(tx, ty + tr * 0.2); ctx.lineTo(tx - tr * 0.7, ty - tr * 0.5); ctx.moveTo(tx, ty); ctx.lineTo(tx + tr * 0.8, ty - tr * 0.6); ctx.stroke(); ctx.beginPath(); }
  ctx.arc(tx, ty, tr * k, 0, TAU); ctx.moveTo(tx + tr * 0.8 + tr * 0.8 * k, ty + tr * 0.3); ctx.arc(tx + tr * 0.8, ty + tr * 0.3, tr * 0.8 * k, 0, TAU); ctx.stroke();
  for (let t = 0; t < 3; t++) {
    ctx.fillStyle = rgba(haze(tones[t], hz + (bare ? 0.25 : 0)), bare ? 0.55 : 0.6 + 0.4 * f.d); ctx.beginPath();
    ctx.arc(tx - t * tr * 0.25, ty - t * tr * 0.28, tr * (1 - t * 0.3) * k, 0, TAU);
    ctx.moveTo(tx + tr * 0.8 - t * tr * 0.25 + tr * 0.8 * (1 - t * 0.3) * k, ty + tr * 0.3 - t * tr * 0.28); ctx.arc(tx + tr * 0.8 - t * tr * 0.25, ty + tr * 0.3 - t * tr * 0.28, tr * 0.8 * (1 - t * 0.3) * k, 0, TAU); ctx.fill();
  }
  if (D.meteo.snow) { ctx.fillStyle = rgba(haze(hexRgb('#F0F4F8'), hz), 0.9); ctx.beginPath(); ctx.arc(tx - tr * 0.5, ty - tr * 0.56, tr * 0.42 * k, Math.PI, 0); ctx.arc(tx + tr * 0.3, ty - tr * 0.26, tr * 0.34 * k, Math.PI, 0); ctx.fill(); }
}
let CUR_D = null;
// ── Verdure (G) : même langage que les bouquets (masses sombre / moyen / clair, rehaut en haut à gauche, trait encré), brume
// selon le rang, saison : vert vif au printemps et l'été, roux et or en automne, nus (feuillus) ou sombres (persistants) l'hiver.
function paintVerdure(ctx, v, hz0 = 0, D = CUR_D) {
  const hz = v.hz ?? hz0, s = v.s || 0.6, key = `${v.kind}-${Math.round(v.x ?? v.pts?.[0]?.[0] ?? 0)}-${Math.round(v.y ?? 0)}`;
  const f = foliageOf(D, key, v.kind === 'cypress' || v.kind === 'hedge' ? 'cypress' : v.kind === 'vineyard' ? 'vigne' : v.kind); let bare = f.d <= 0.1, tones = f.tones; const season = D.season;
  const fill = (c, a = 1) => rgba(haze(c, hz), a);
  if (v.kind === 'bouquet') return paintBouquet(ctx, v.x, v.y, v.r, s, hz, D, key);
  if (v.kind === 'chestnut' || v.kind === 'cerisier') {
    const h = v.h, r = h * (v.kind === 'cerisier' ? 0.36 : 0.42), cx = v.x, cy = v.y - h * 0.55, masses = [[0, 0, 1], [-0.62, 0.28, 0.7], [0.62, 0.3, 0.68], [0.05, -0.5, 0.62]];
    // Cerisier en fleurs (20 mars → 15 avril) : masses roses avant les feuilles.
    const blc = v.kind === 'cerisier' ? bloomOf(D, 'cerisier') : 0; if (blc > 0) { tones = ['#D88AA8', '#F0B0C8', '#FCDCE8'].map(hexRgb); bare = false; f.d = Math.max(f.d, 0.5 + 0.5 * blc); }
    ctx.strokeStyle = ink(0.85 - hz); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(cx, v.y); ctx.lineTo(cx, cy + r * 0.4); ctx.stroke();
    if (bare) { ctx.lineWidth = 0.7; ctx.beginPath(); for (const [mx, my] of masses) { ctx.moveTo(cx, cy + r * 0.4); ctx.lineTo(cx + mx * r * 1.1, cy + my * r - r * 0.4); } ctx.stroke(); }
    ctx.lineWidth = 1.1; ctx.beginPath(); for (const [mx, my, k] of masses) { ctx.moveTo(cx + mx * r + r * k, cy + my * r); ctx.arc(cx + mx * r, cy + my * r, r * k, 0, TAU); } ctx.stroke();
    const kd = bare ? 0.7 : 0.6 + 0.4 * f.d;
    for (let t = 0; t < 3; t++) { ctx.fillStyle = fill(tones[t], bare ? 0.5 : 1); ctx.beginPath(); for (const [mx, my, k] of masses) { const rr = r * k * (1 - t * 0.28) * kd, x = cx + mx * r - t * r * 0.2, y = cy + my * r - t * r * 0.22; ctx.moveTo(x + rr, y); ctx.arc(x, y, rr, 0, TAU); } ctx.fill(); }
    const bl = bloomOf(D, v.kind === 'chestnut' ? 'marronnier' : 'cerisier');
    if (bl > 0 && v.kind === 'chestnut') { ctx.fillStyle = fill(hexRgb('#FFF4F0'), bl); for (const [mx, my, k] of masses) for (let i = -1; i <= 1; i++) ctx.fillRect(cx + mx * r + i * r * k * 0.5 - 0.3, cy + my * r - r * k * 0.9, 0.6, 1.6); }
    if (D.meteo.snow) { ctx.fillStyle = fill(hexRgb('#F0F4F8'), 0.9); ctx.beginPath(); for (const [mx, my, k] of masses) ctx.arc(cx + mx * r, cy + my * r - r * k * 0.1, r * k * kd * 0.8, Math.PI, 0); ctx.fill(); }
    return;
  }
  if (v.kind === 'poplar' || v.kind === 'cypress') {
    const h = v.h, cyp = v.kind === 'cypress', rx = h * (cyp ? 0.14 : 0.2), cy = v.y - h * 0.5, tn = cyp ? EVERGREEN : tones; if (cyp) { /* persistant */ }
    ctx.strokeStyle = ink(0.85 - hz); ctx.lineWidth = 0.9; ctx.beginPath(); ctx.moveTo(v.x, v.y); ctx.lineTo(v.x, v.y - h * (bare && !cyp ? 0.95 : 0.2)); ctx.stroke();
    if (bare && !cyp) { ctx.lineWidth = 0.6; ctx.beginPath(); for (let k = 0; k < 5; k++) { const y = v.y - h * (0.25 + k * 0.14); ctx.moveTo(v.x, y); ctx.lineTo(v.x + (k % 2 ? 1 : -1) * rx * 0.9, y - h * 0.12); } ctx.stroke(); }
    ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(v.x, cy, rx, h * 0.5, 0, 0, TAU); ctx.stroke();
    const kd = cyp ? 1 : bare ? 0.6 : 0.6 + 0.4 * f.d;
    for (let t = 0; t < 3; t++) { ctx.fillStyle = fill(tn[t], bare && !cyp ? 0.45 : 1); ctx.beginPath(); ctx.ellipse(v.x - t * rx * 0.25, cy - t * h * 0.06, rx * (1 - t * 0.3) * kd, h * 0.5 * (1 - t * 0.22) * kd, 0, 0, TAU); ctx.fill(); }
    if (D.meteo.snow) { ctx.fillStyle = fill(hexRgb('#F0F4F8'), 0.9); ctx.beginPath(); ctx.ellipse(v.x - rx * 0.2, cy - h * 0.3, rx * 0.5, h * 0.12, 0, Math.PI, 0); ctx.fill(); }
    return;
  }
  if (v.kind === 'hedge') {
    const tn = D.season === 'winter' ? ['#3A5A40', '#4A6E50', '#5E8460'].map(hexRgb) : EVERGREEN, r = 1.5 * s;
    ctx.strokeStyle = ink(0.8 - hz); ctx.lineWidth = 0.9; ctx.beginPath(); v.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
    for (let t = 0; t < 3; t++) { ctx.fillStyle = fill(tn[t]); ctx.beginPath(); for (let i = 0; i < v.pts.length; i++) { const [x, y] = v.pts[i], rr = r * (1 - t * 0.3); ctx.moveTo(x - t * 0.4 + rr, y - t * 0.4); ctx.arc(x - t * 0.4, y - t * 0.4, rr, 0, TAU); } ctx.fill(); }
    return;
  }
  if (v.kind === 'lawn') {
    const g = season === 'winter' ? mixRgb(GRASS, hexRgb('#9A9A80'), 0.4) : light(hexRgb(TONES.summer[1]), 0.25), pts = [[v.x + 2, v.y], [v.x + v.w, v.y + 1], [v.x + v.w - 2, v.y + v.h], [v.x, v.y + v.h - 1]];
    poly(ctx, fill(g), pts); inkPath(ctx, pts, 0.5, 0.6 - hz, true);
    ctx.strokeStyle = fill(haze(ROAD, 0.1)); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(v.x + v.w * 0.5, v.y); ctx.quadraticCurveTo(v.x + v.w * 0.3, v.y + v.h * 0.6, v.x + v.w * 0.55, v.y + v.h); ctx.stroke();
    paintBouquet(ctx, v.x + v.w * 0.75, v.y + v.h * 0.45, 1.4, 0.5, hz, D, key + 'sq');
    return;
  }
  if (v.kind === 'vineyard') {
    const soil = fill(mixRgb(hexRgb('#B89A6A'), GRASS, 0.45)), leaf = f.d > 0.15 ? [mixRgb(tones[0], hexRgb('#3A7A38'), 0.3), mixRgb(tones[1], hexRgb('#62A848'), 0.3)] : null;
    poly(ctx, soil, [[v.x, v.y], [v.x + v.w, v.y - v.slant * 4], [v.x + v.w, v.y + v.h - v.slant * 4], [v.x, v.y + v.h]]);
    for (let r = 2; r < v.h - 1; r += 3.2) {
      const y = v.y + r; ctx.strokeStyle = ink(0.45 - hz); ctx.lineWidth = 0.4; ctx.beginPath(); ctx.moveTo(v.x + 1, y); ctx.lineTo(v.x + v.w - 1, y - v.slant * 4); ctx.stroke();
      for (let x = v.x + 2; x < v.x + v.w - 1; x += 2.8) { const yy = y - v.slant * 4 * ((x - v.x) / v.w); if (leaf) { disc(ctx, fill(leaf[0]), x, yy - 0.5, 0.85 * (0.6 + 0.4 * f.d)); disc(ctx, fill(leaf[1]), x - 0.3, yy - 0.8, 0.5); } else fillRect(ctx, ink(0.7 - hz), x - 0.25, yy - 1.6, 0.5, 1.6); }
    }
    inkPath(ctx, [[v.x, v.y], [v.x + v.w, v.y - v.slant * 4], [v.x + v.w, v.y + v.h - v.slant * 4], [v.x, v.y + v.h]], 0.5, 0.5 - hz, true);
    return;
  }
  if (v.kind === 'garden') {
    // Potager derrière la maison : rangs de terre, légumes verts (vides l'hiver), clôture de piquets.
    const w = v.w, y = v.y, soil = fill(hexRgb('#A8865E'));
    fillRect(ctx, fill(mixRgb(GRASS, hexRgb('#A8865E'), 0.35)), v.x, y - 6 * s, w, 6 * s);
    for (let k = 0; k < 3; k++) { const yy = y - 5 * s + k * 1.8 * s; fillRect(ctx, soil, v.x + 1, yy, w - 2, 0.7 * s); if (D.doy >= 120 && D.doy < 320 && k < 2) for (let x = v.x + 2; x < v.x + w - 1.5; x += 1.8 * s) disc(ctx, fill(hexRgb(TONES.summer[k === 0 ? 1 : 2])), x, yy - 0.2, 0.55 * s); }
    ctx.strokeStyle = ink(0.7 - hz); ctx.lineWidth = 0.4; ctx.beginPath(); for (let x = v.x; x <= v.x + w; x += 1.6 * s) { ctx.moveTo(x, y); ctx.lineTo(x, y - 1.6 * s); } ctx.moveTo(v.x, y - 1 * s); ctx.lineTo(v.x + w, y - 1 * s); ctx.stroke();
    return;
  }
}
// Maison de la colline (port de paintHillHouse) + saison des arbres (G), terrasse (O).
function paintHouse(ctx, h, env) {
  const { x, w, s, haze: hz, base, top, rh } = h, D = env.D;
  const wall = haze(h.wall, hz), rc = haze(h.roof, hz), o = 1.5 * s;
  fillRect(ctx, wall, x, top + rh, w, h.h - rh + 2); fillRect(ctx, shade(wall, 0.3), x + w * 0.7, top + rh, w * 0.3, h.h - rh + 2);
  const pts = h.kind === 'gable' ? [[x - o, top + rh], [x + w / 2, top], [x + w + o, top + rh]] : h.kind === 'hip' ? [[x - o, top + rh], [x + w * 0.25, top], [x + w * 0.75, top], [x + w + o, top + rh]] : [[x - o, top + rh], [x + o, top + 1], [x + w - o, top + 1], [x + w + o, top + rh]];
  poly(ctx, rc, pts); ctx.save(); ctx.beginPath(); pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py))); ctx.closePath(); ctx.clip();
  fillRect(ctx, light(rc, 0.35), x - o, top, w * 0.5 + o, rh); fillRect(ctx, shade(rc, 0.35), x + w * 0.72, top, w * 0.28 + o, rh);
  if (D.meteo.snow) fillRect(ctx, '#F0F4F8', x - o, top, w + 2 * o, rh * 0.5);
  ctx.restore();
  inkPath(ctx, pts, 0.8, 0.95 - hz, true);
  ctx.strokeStyle = rgba(light(rc, 0.55), 0.9); ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(pts[0][0] + 0.4, pts[0][1] - 0.4); ctx.lineTo(pts[1][0], pts[1][1] + 0.5); if (pts.length === 4) ctx.lineTo(pts[2][0], pts[2][1] + 0.5); ctx.stroke();
  fillRect(ctx, shade(wall, 0.42), x, top + rh, w, 2 * s);
  if (h.dormers) for (let dx = x + 4 * s; dx < x + w - 5 * s; dx += 8 * s) { fillRect(ctx, light(rc, 0.5), dx, top + rh * 0.45, 3 * s, rh * 0.5); fillRect(ctx, shade(wall, 0.5), dx + 0.6 * s, top + rh * 0.55, 1.8 * s, rh * 0.38); }
  if (h.chimney !== null) { const cx = x + w * h.chimney, cy = top - 4 * s + rh * 0.4, brick = haze(shade(BRICK, 0.12), hz); fillRect(ctx, brick, cx, cy, 3 * s, 6 * s); fillRect(ctx, shade(brick, 0.38), cx + 2 * s, cy, s, 6 * s); ctx.strokeStyle = ink(0.9 - hz); ctx.lineWidth = 0.6; ctx.strokeRect(cx, cy, 3 * s, 6 * s); fillRect(ctx, ink(0.7 - hz), cx - 0.4, cy, 3.8 * s, 0.8); }
  ctx.fillStyle = rgba(haze(GLASS_FAR, hz + 0.2), 1); for (const wn of h.wins) ctx.fillRect(wn.x, wn.y, wn.w, wn.h);
  ctx.strokeStyle = ink(0.8 - hz); ctx.lineWidth = 0.6; ctx.strokeRect(x, top + rh, w, h.h - rh + 2);
  // Terrasse (O) : pots toujours, parasol ouvert / replié selon l'heure, la saison et la météo.
  if (h.terrace) {
    const ty = h.kind === 'hip' ? top : top + 1, tx = h.terrace.x, k = parasolK(env.T, D, h.terrace);
    disc(ctx, haze(hexRgb('#3F8A3A'), hz), tx - 2.5 * s, ty - 0.6 * s, 1.1 * s); disc(ctx, haze(hexRgb('#56A844'), hz), tx + 3 * s, ty - 0.6 * s, 0.9 * s);
    fillRect(ctx, ink(0.8 - hz), tx - 0.3, ty - 5 * s, 0.6, 5 * s);
    const pc = haze(h.terrace.color, hz), r = lerp(0.9, 3.6, smooth(k)) * s;
    ctx.fillStyle = rgba(pc, 1); ctx.beginPath(); ctx.moveTo(tx - r, ty - 4.2 * s); ctx.quadraticCurveTo(tx, ty - 4.2 * s - r * 0.9 - 0.4 * s, tx + r, ty - 4.2 * s); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = ink(0.8 - hz); ctx.lineWidth = 0.5; ctx.stroke();
  }
  if (h.trees) paintBouquet(ctx, h.trees.x, base - 6 * s, h.trees.r, s, hz, D, h.key);
}
// Repères (port de paintLandmark) : la tour sans ses aiguilles (E : peintes par la vie), mât de drapeau (N).
function paintLandmarkC(ctx, l, hz) {
  const { x, s, base } = l;
  if (l.kind === 'tower') {
    const w = 14 * s, h = 70 * s, c = haze(STONE, hz);
    fillRect(ctx, c, x, base - h, w, h); fillRect(ctx, shade(c, 0.3), x + w * 0.65, base - h, w * 0.35, h);
    poly(ctx, haze(SPIRE, hz), [[x - 2 * s, base - h], [x + w / 2, base - h - 22 * s], [x + w + 2 * s, base - h]]);
    disc(ctx, haze(hexRgb('#D0583A'), hz), x + w / 2, base - h - 22 * s, 3 * s);
    // Beffroi ouvert sous la flèche (les pigeons y nichent, L) : deux baies sombres.
    fillRect(ctx, shade(c, 0.55), x + w * 0.22, base - h + 2 * s, w * 0.2, 6 * s); fillRect(ctx, shade(c, 0.55), x + w * 0.58, base - h + 2 * s, w * 0.2, 6 * s);
    disc(ctx, '#FFF8E0', x + w / 2, base - h + 12 * s, 4.5 * s); ctx.strokeStyle = ink(0.9); ctx.lineWidth = 0.6; ctx.beginPath(); ctx.arc(x + w / 2, base - h + 12 * s, 4.5 * s, 0, TAU); ctx.stroke();
    for (let k = 0; k < 3; k++) { fillRect(ctx, shade(c, 0.5), x + w * 0.3, base - h + 24 * s + k * 12 * s, w * 0.18, 5 * s); fillRect(ctx, shade(c, 0.5), x + w * 0.6, base - h + 24 * s + k * 12 * s, w * 0.18, 5 * s); }
    ctx.strokeStyle = ink(0.8 - hz); ctx.lineWidth = 0.7; ctx.strokeRect(x, base - h, w, h);
    fillRect(ctx, ink(0.8), x + w + 1.5 * s, base - h - 2 * s, 0.6, 10 * s); // mât de drapeau
    return;
  }
  const c = haze(STONE, hz), dc = haze(DOME_C, hz);
  fillRect(ctx, c, x, base - 26 * s, 26 * s, 26 * s); fillRect(ctx, shade(c, 0.3), x + 17 * s, base - 26 * s, 9 * s, 26 * s);
  ctx.fillStyle = rgba(dc, 1); ctx.beginPath(); ctx.arc(x + 13 * s, base - 26 * s, 13 * s, Math.PI, 0); ctx.fill();
  ctx.fillStyle = rgba(light(dc, 0.4), 1); ctx.beginPath(); ctx.arc(x + 13 * s, base - 26 * s, 13 * s, Math.PI * 1.05, Math.PI * 1.45); ctx.lineTo(x + 13 * s, base - 26 * s); ctx.fill();
  fillRect(ctx, c, x + 12 * s, base - 44 * s, 2 * s, 6 * s);
  ctx.strokeStyle = ink(0.8 - hz); ctx.lineWidth = 0.6; ctx.beginPath(); ctx.arc(x + 13 * s, base - 26 * s, 13 * s, Math.PI, 0); ctx.stroke(); ctx.strokeRect(x, base - 26 * s, 26 * s, 26 * s);
}

// ── Mur du fond corrigé (D1 à D6) ──
function paintFarC(ctx, F, b, left, env, seed) {
  const hz = FAR_HAZE, { x, w, top, eave } = b, D = env.D, T = env.T;
  const bottom = F.ruelleY, h = bottom - eave;
  const wall = haze(b.look.wall, hz), rc = haze(b.look.roof, hz);
  fillRect(ctx, wall, x, eave, w, h);
  ctx.save(); ctx.beginPath(); ctx.rect(x, eave, w, h); ctx.clip();
  fillRect(ctx, shade(wall, 0.28), x + w * 0.72, eave, w * 0.28, h);
  // D3 : ombre portée d'un voisin MITOYEN plus haut seulement, limitée à un étage sous l'égout, bord net.
  if (left && left.x + left.w >= x - 2 && left.top < top) {
    const y1 = Math.min(bottom, eave + FLOOR), k = 0.55, wa = Math.min(w * 0.45, k * (eave - left.top)), wb = Math.min(w * 0.45, k * (y1 - left.top));
    poly(ctx, shade(wall, 0.28), [[x, eave], [x + wa, eave], [x + wb, y1], [x, y1]]);
  }
  fillRect(ctx, light(wall, 0.4), x, eave, 1.2, h);
  // D6 : bandeaux d'étage (ligne claire + ombre nette sous chaque plancher).
  for (let f = 1; f <= b.nFloors; f++) { const by = eave + f * FLOOR + 0.5; if (by < bottom - 1) { fillRect(ctx, light(wall, 0.5), x, by - 0.8, w, 0.8); fillRect(ctx, shade(wall, 0.38), x, by, w, 0.6); } }
  // D1 : fenêtres sous l'égout (eave + 3), par travée ; linteau clair, vitre, volets (B) ouverts (battants de chaque côté) ou tirés.
  const glass = haze(GLASS_FAR, 0.3), sh = b.shutter ? haze(b.shutter, hz) : null;
  for (const wn of b.wins) {
    fillRect(ctx, light(wall, 0.5), wn.x - 0.6, wn.y - 0.7, wn.w + 1.2, 0.7);
    fillRect(ctx, glass, wn.x, wn.y, wn.w, wn.h);
    if (sh) {
      const k = shutterK(T, D, wn);
      if (k <= 0) { fillRect(ctx, sh, wn.x - 0.8, wn.y, 0.7, wn.h); fillRect(ctx, shade(sh, 0.3), wn.x + wn.w + 0.1, wn.y, 0.7, wn.h); }
      else { const half = (wn.w / 2) * k; fillRect(ctx, sh, wn.x - 1 + (1 - k), wn.y, 0.9 + half, wn.h); fillRect(ctx, shade(sh, 0.3), wn.x + wn.w - half, wn.y, half + 0.9 - (1 - k) * 0.9, wn.h); if (k >= 1) fillRect(ctx, ink(0.5), wn.x + wn.w / 2 - 0.2, wn.y, 0.4, wn.h); }
    }
  }
  // H : linge tendu entre deux fenêtres d'un étage (jours secs), pièces pendues une à une.
  const lk = laundryK(T, D, b, seed);
  if (lk > 0 && b.laundryFloor !== null) {
    const a = b.wins.find((v) => v.floor === b.laundryFloor && v.col === b.laundryCol), c2 = b.wins.find((v) => v.floor === b.laundryFloor && v.col === b.laundryCol + 1);
    if (a && c2) { const ly = a.y + 2.2; inkPath(ctx, [[a.x + a.w, ly], [c2.x, ly + 0.4]], 0.4, 0.7); const n = Math.round(lk * 3); const r = rngOf(seed, `linge-pieces-${b.id}`); for (let i = 0; i < n; i++) fillRect(ctx, haze(pick(CLOTH, r), hz), a.x + a.w + 0.8 + i * 1.6, ly + 0.2, 1.2, 1.6 + r() * 0.8); }
  }
  ctx.restore();
  // D4 : sous le haut du rez-de-chaussée, ruelle ou cour en retrait (ton d'ombre, sans fenêtres) : porche sombre, sol de cour.
  const ru = shade(wall, 0.5);
  fillRect(ctx, ru, x, bottom, w, F.ground - bottom); fillRect(ctx, shade(ru, 0.3), x + w * 0.72, bottom, w * 0.28, F.ground - bottom);
  fillRect(ctx, shade(wall, 0.2), x, F.ground - 3, w, 3); fillRect(ctx, light(wall, 0.5), x, bottom - 0.8, w, 0.8); fillRect(ctx, ink(0.75), x, bottom, w, 0.9);
  // Porches et portes de service tous les 14 px environ (une fente en montre toujours un), pavés de la cour.
  for (let px = x + 5 + ((b.id * 7) % 9); px + 5 < x + w - 2; px += 14) { const arch = Math.floor(px) % 2 === 0; fillRect(ctx, ink(0.7), px, F.ground - (arch ? 10 : 8), arch ? 5 : 3.5, arch ? 7 : 5); if (arch) { ctx.fillStyle = ink(0.7); ctx.beginPath(); ctx.arc(px + 2.5, F.ground - 10, 2.5, Math.PI, 0); ctx.fill(); } }
  ctx.strokeStyle = rgba(shade(wall, 0.4), 0.8); ctx.lineWidth = 0.4; ctx.beginPath(); for (let px = x + 2; px < x + w; px += 4) { ctx.moveTo(px, F.ground - 3); ctx.lineTo(px - 1, F.ground); } ctx.stroke();
  fillRect(ctx, shade(ru, 0.25), x, bottom + 3, w, 0.6);
  // Toit (sans débord, même ligne que roofLineY), rehaut, ombre, trait ; corniche sous l'égout.
  const pts = b.roofKind === 'gable' ? [[x, eave], [x + w / 2, top], [x + w, eave]] : [[x, eave], [x + 1.5, top + 1], [x + w - 1.5, top + 1], [x + w, eave]];
  poly(ctx, rc, pts); ctx.save(); ctx.beginPath(); pts.forEach(([px2, py], i) => (i ? ctx.lineTo(px2, py) : ctx.moveTo(px2, py))); ctx.closePath(); ctx.clip();
  fillRect(ctx, light(rc, 0.35), x, top, w * 0.5, FAR_ROOF_H); fillRect(ctx, shade(rc, 0.35), x + w * 0.72, top, w * 0.28, FAR_ROOF_H);
  if (D.meteo.snow) fillRect(ctx, '#F0F4F8', x, top, w, FAR_ROOF_H * 0.5);
  ctx.restore(); inkPath(ctx, pts, 0.6, 0.85 - hz, true);
  fillRect(ctx, shade(wall, 0.42), x, eave, w, 2); fillRect(ctx, light(wall, 0.55), x, eave + 2, w, 0.6);
  if (b.chimney) { const cx = b.chimney.x - 1.5; fillRect(ctx, haze(BRICK, hz), cx, top + 1, 3, FAR_ROOF_H * 0.6); fillRect(ctx, ink(0.7), cx - 0.4, top + 1, 3.8, 0.8); }
  ctx.strokeStyle = ink(0.8 - hz); ctx.lineWidth = 0.6; ctx.strokeRect(x, eave, w, h);
}
// D3 sur le premier plan : même ombre corrigée, repeinte par-dessus la façade (dans l'appli : facade-painter.ts l. 50).
function paintNearShadows(ctx, F) {
  for (const b of F.near) {
    const left = leftOf(F.plan, b); if (!left || left.x + left.w < b.x - 2 || left.top >= b.top) continue;
    const eave = b.top + b.look.roofH, y1 = Math.min(F.ground - GROUND_FLOOR, eave + 14), k = 0.55, wa = Math.min(b.w * 0.45, k * (eave - left.top)), wb = Math.min(b.w * 0.45, k * (y1 - left.top));
    ctx.fillStyle = 'rgba(90,74,156,0.22)'; ctx.beginPath(); ctx.moveTo(b.x + 0.5, eave); ctx.lineTo(b.x + wa, eave); ctx.lineTo(b.x + wb, y1); ctx.lineTo(b.x + 0.5, y1); ctx.closePath(); ctx.fill();
  }
}

// Fond statique complet (colline, échappée, maisons, repères, mur du fond, ruelles) à l'instant T (poses lentes).
function paintFondStatic(ctx, F, env) {
  CUR_D = env.D;
  paintGround(ctx, F, env.D);
  for (const v of F.crestVerdure) paintVerdure(ctx, v);
  for (const e of F.escapes) paintRoad(ctx, e);
  for (let row = 0; row < 3; row++) {
    // Massifs qui dépassent derrière les maisons du rang précédent, puis verdure des creux du rang, puis les maisons.
    for (const v of F.rowVerdure[row]) if (!v.behind) paintVerdure(ctx, v);
    for (const v of F.rowVerdure[row]) if (v.behind) paintVerdure(ctx, v);
    for (const h of F.houses) if (h.row === row) paintHouse(ctx, h, env);
    for (const l of F.landmarks) if (Math.abs(l.base - H * HILL_ROWS[row].y) < 1e-6) paintLandmarkC(ctx, l, HILL_ROWS[row].haze);
  }
}
function paintFarStatic(ctx, F, env) {
  let prev = null;
  for (const b of F.far) { const left = prev && prev.x < b.x ? prev : null; paintFarC(ctx, F, b, left, env, F.seed); prev = b; }
}
