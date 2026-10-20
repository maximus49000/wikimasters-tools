// ───────────── plan du fond : corrections de l'audit + emplacements de la vie (pur : graine seule) ─────────────
// Part du VRAI plan (cityPaintPlan, inchangé : même tirage de la rue, de la colline et du mur du fond) et en dérive :
//  - la silhouette du premier plan (roofLineY / roofSpan de l'appli) ;
//  - le mur du fond corrigé : hauteur relevée au-dessus des voisins du premier plan (D2/D5), plafonnée (D6), étages,
//    travées, fenêtres sous l'égout (D1), ruelle sous le haut du rez-de-chaussée (D4) ;
//  - une « échappée » par bande de 1 080 px : le creux de la colline où l'on voit le mieux la pente (maisons de la colline
//    écartées, mur du fond au minimum permis) : route en lacets, funiculaire, grue, réverbères ;
//  - les fenêtres de la colline et du fond qui peuvent s'allumer, les terrasses, les cheminées, les repères.
const FLOOR = 11;                 // hauteur d'étage du mur du fond (rangées de fenêtres, inchangé)
const BAY = 8;                    // travée (colonnes de fenêtres, inchangé)
const FAR_CAP = 0.2;              // plafond du mur du fond : jamais plus haut que 0,2 × H (la crête est entre 0,163 et 0,237)
const FAR_LIT_MAX = 8;            // FAR_WINDOWS_MAX (facades.ts) : fenêtres allumables par immeuble du fond
const RUELLE_H = GROUND_FLOOR;    // la ruelle / cour occupe le rez-de-chaussée (30 px) sous le mur du fond
const BAND = 1080;                // une échappée (route, funiculaire) et une tour par bande, comme les repères
const COL_W = 170;                // largeur minimale de l'échappée (élargie pour le marché, le verger et le ruisseau)

function nearSilhouette(plan) {
  const near = plan.buildings.filter((b) => !b.far);
  const a = new Float32Array(W + 1).fill(plan.ground);
  for (const b of near) { const s = roofSpan(b); for (let x = Math.max(0, Math.floor(s.x0)); x <= Math.min(W, Math.ceil(s.x1)); x++) a[x] = Math.min(a[x], roofLineY(b, x)); }
  for (const p of plan.podiums) for (let x = Math.max(0, Math.floor(p.x - 1.5)); x <= Math.min(W, Math.ceil(p.x + p.w + 1.5)); x++) a[x] = Math.min(a[x], p.top - 0.8);
  return a;
}
const minOver = (arr, x0, x1) => { let m = Infinity; for (let x = Math.max(0, Math.floor(x0)); x <= Math.min(W, Math.ceil(x1)); x++) m = Math.min(m, arr[x]); return m; };
const meanOver = (arr, x0, x1) => { let s = 0, n = 0; for (let x = Math.max(0, Math.floor(x0)); x <= Math.min(W, Math.ceil(x1)); x++) { s += arr[x]; n++; } return s / n; };

// Ligne de toit d'un immeuble du fond corrigé (pignon à 50 %, mansarde plate à 1,5 px des murs : tracés de paintFarWall).
function farRoofY(b, x) {
  const eave = b.top + FAR_ROOF_H;
  if (x < b.x || x > b.x + b.w) return Infinity;
  if (b.roofKind === 'gable') return eave - FAR_ROOF_H * (1 - Math.abs(x - (b.x + b.w / 2)) / (b.w / 2));
  const k = 1.5; if (x >= b.x + k && x <= b.x + b.w - k) return b.top + 1;
  const t = x < b.x + k ? (b.x + k - x) / k : (x - (b.x + b.w - k)) / k; return b.top + 1 + (FAR_ROOF_H - 1) * t;
}

// Verdure de l'échappée (tirage par graine et position) : bosquets de tailles variées, haies le long de la route, grands arbres
// isolés, square, vigne en rangs, potagers. Rien ne couvre la route (distance ≥ rayon + 2,5), la voie du funiculaire (≥ rayon + 7)
// ni les gares ; la densité est tirée, jamais un motif régulier.
function escapeVerdure(rng, e) {
  const { road, rx, rw, y0, y1, yb, funi } = e, out = []; e.pathLamps = [];
  const dRoad = (x, y) => { let m = Infinity; for (let i = 1; i < road.length; i++) { const [ax, ay] = road[i - 1], [bx, by] = road[i], dx = bx - ax, dy = by - ay, t = sat(((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)); m = Math.min(m, Math.hypot(x - (ax + dx * t), y - (ay + dy * t))); } return m; };
  const dFuni = (x, y) => { const dx = funi.x1 - funi.x0, dy = funi.y1 - funi.y0, t = sat(((x - funi.x0) * dx + (y - funi.y0) * dy) / (dx * dx + dy * dy)); return Math.min(Math.hypot(x - (funi.x0 + dx * t), y - (funi.y0 + dy * t)), Math.hypot(x - funi.x1, y - (funi.y1 - 12)) - 8, Math.hypot(x - funi.x0, y - (funi.y0 + 6)) - 8); };
  const free = (x, y, r) => x > e.c.x + 3 && x < e.c.x1 - 3 && y > y0 - 2 && y < yb - 1 && dRoad(x, y) >= r + 2.5 && dFuni(x, y) >= r + 7 && (!e.hillTop || y + 1 < e.hillTop[Math.max(0, Math.min(W, Math.round(x)))]);
  const taken = [];
  const rects = []; const place = (r) => { for (let k = 0; k < 40; k++) { const x = rx - 10 + rng() * (rw + 20), y = y0 + 2 + rng() * (yb - y0 - 6); if (free(x, y, r) && !taken.some((t) => Math.hypot(t.x - x, t.y - y) < (t.r + r) * 0.7) && !rects.some((q) => x > q.x - r && x < q.x + q.w + r && y > q.y - r * 0.6 && y < q.y + q.h + r * 0.6)) { taken.push({ x, y, r }); return { x, y }; } } return null; };
  // Vigne en rangs (clin d'œil à Montmartre) puis square : des parcelles libres, testées par leurs coins.
  const patch = (w, h) => { for (let k = 0; k < 60; k++) { const x = rx - 6 + rng() * (rw - w + 12), y = y0 + 3 + rng() * (yb - y0 - h - 6); const pts = []; for (let i = 0; i <= 4; i++) for (let j = 0; j <= 2; j++) pts.push([x + (w * i) / 4, y + (h * j) / 2]); if (pts.every(([px, py]) => free(px, py, 1.5)) && !taken.some((t) => t.x > x - t.r && t.x < x + w + t.r && t.y > y - t.r && t.y < y + h + t.r)) { taken.push({ x: x + w / 2, y: y + h / 2, r: Math.max(w, h) / 2 }); return { x, y, w, h }; } } return null; };
  const vine = patch(18 + rng() * 8, 10 + rng() * 4) || patch(14, 8); if (vine) out.push({ kind: 'vineyard', ...vine, slant: 0.35 + rng() * 0.2 });
  const lawn = patch(22 + rng() * 6, 10 + rng() * 3) || patch(16, 8); e.lawn = lawn; if (lawn) { out.push({ kind: 'lawn', ...lawn }); out.push({ kind: 'kiosk', x: lawn.x + lawn.w * 0.68, y: lawn.y + lawn.h * 0.55, s: 1 }); out.push({ kind: 'fountain', x: lawn.x + lawn.w * 0.26, y: lawn.y + lawn.h * 0.6 }); }
  // Murets de pierre et jardins en terrasses : deux lignes de niveau, là où rien ne gêne (route, voie, parcelles).
  for (const yy of [y0 + 9 + rng() * 4, yb - 10 - rng() * 4]) { let run = []; for (let x = rx - 8; x <= rx + rw + 8; x += 2) { const ok = free(x, yy, 1.5) && !taken.some((t) => Math.abs(t.x - x) < t.r + 2 && Math.abs(t.y - yy) < t.r * 0.8 + 2); if (ok) run.push([x, yy + Math.sin(x * 0.15) * 0.4]); else { if (run.length >= 6) out.push({ kind: 'wall', pts: run }); run = []; } } if (run.length >= 6) out.push({ kind: 'wall', pts: run }); }
  let market = null, orchard = null;
  if (PARAMS.garni) { market = patch(20 + rng() * 4, 8 + rng() * 2) || patch(16, 7); if (market) rects.push(market); orchard = patch(16 + rng() * 6, 8 + rng() * 3) || patch(13, 7); if (orchard) rects.push(orchard); }
  if (vine) rects.push(vine); if (lawn) rects.push(lawn);
  // Grands arbres isolés (2-3), bosquets (4-6 groupes de 1-3 bouquets), potager (0-1).
  for (let i = 0, n = 3 + Math.floor(rng() * 3); i < n; i++) { const h = 11 + rng() * 9, p = place(h * 0.3); if (p) out.push({ kind: pick(['chestnut', 'poplar', 'poplar', 'cypress', 'cerisier', 'chene'], rng), ...p, h, s: 0.7 }); }
  for (let i = 0, n = 9 + Math.floor(rng() * 5); i < n; i++) { const r = 2 + rng() * 3.2, p = place(r); if (!p) continue; out.push({ kind: 'bouquet', ...p, r, s: 0.55 + rng() * 0.2 }); for (let j = 0, m = Math.floor(rng() * 3); j < m; j++) { const r2 = r * (0.6 + rng() * 0.5), x = p.x + (rng() - 0.5) * r * 3, y = p.y + (rng() - 0.3) * r * 1.4; if (free(x, y, r2)) out.push({ kind: 'bouquet', x, y, r: r2, s: 0.55 + rng() * 0.2 }); } }
  if (rng() < 0.7) { const p = place(6); if (p) out.push({ kind: 'garden', x: p.x - 6, y: p.y + 3, w: 12, s: 0.7, hz: 0.2 }); }
  // Haies : le long de deux tronçons de route, côté amont (perpendiculaire à la route, décalage 4 px).
  const n = road.length; for (const [f0, f1] of [[0.14, 0.3], [0.5, 0.66], [0.78, 0.9]]) {
    if (rng() < 0.3) continue; const pts = [];
    for (let i = Math.floor(f0 * n); i < Math.floor(f1 * n); i++) { const [ax, ay] = road[i], [bx, by] = road[Math.min(n - 1, i + 1)], l = Math.hypot(bx - ax, by - ay) || 1, nx = -(by - ay) / l, ny = (bx - ax) / l, side = ny < 0 ? 1 : -1, x = ax + nx * 4 * side, y = ay + ny * 4 * side; if (x > e.c.x + 2 && x < e.c.x1 - 2 && dFuni(x, y) >= 7) pts.push([x, y]); }
    if (pts.length >= 3) out.push({ kind: 'hedge', pts, s: 0.6 });
  }
  if (PARAMS.garni) {
    // ── Colline garnie (retour du 20 octobre) : marché et lavoir, verger clos, ruisseau et bassin, sentiers et leurs lampadaires,
    // clôtures, cabane, ruches, poulailler, bancs, rochers, pétanque. Même règle : rien sur la route, la voie, les gares, l'escalier.
    if (market) { out.push({ kind: 'market', ...market, stalls: 3 + Math.floor(rng() * 2) }); out.push({ kind: 'platane', x: market.x + 4, y: market.y + market.h - 1, h: 13 + rng() * 3, s: 0.7 }); out.push({ kind: 'platane', x: market.x + market.w - 4, y: market.y + market.h - 1.5, h: 12 + rng() * 3, s: 0.7 }); out.push({ kind: 'lavoir', x: market.x + market.w * 0.5, y: market.y + 1.5 }); out.push({ kind: 'bench', x: market.x + market.w * 0.3, y: market.y + market.h - 2 }); }
    if (orchard) { out.push({ kind: 'orchard', ...orchard, seed: rng() * 1000 }); out.push({ kind: 'fence', pts: [[orchard.x, orchard.y], [orchard.x + orchard.w, orchard.y], [orchard.x + orchard.w, orchard.y + orchard.h], [orchard.x, orchard.y + orchard.h], [orchard.x, orchard.y]], gate: 0.2 + rng() * 0.6 }); out.push({ kind: 'cabane', x: orchard.x + 2.5, y: orchard.y + orchard.h - 0.5 }); for (let i = 0; i < 3; i++) out.push({ kind: 'ruche', x: orchard.x + orchard.w - 3 - i * 2.2, y: orchard.y + orchard.h - 1 }); }
    // Ruisseau : de la crête au bassin, en évitant la route (segments tirés), bassin au bout.
    const sx = rx + rw * (0.15 + rng() * 0.7); const pts = []; let px = sx, py = y0 - 2;
    for (let k = 0; k < 40 && py < yb - 6; k++) { pts.push([px, py]); px += (rng() - 0.5) * 3 + Math.sin(k * 0.7) * 1.5; py += 1.6 + rng() * 1.2; if (!free(px, py, 0.5) || !free(px + 3, py, 0.5)) break; }
    if (pts.length >= 6) { const end = pts[pts.length - 1]; out.push({ kind: 'stream', pts }); if (free(end[0] + 2, end[1] + 2, 3)) { out.push({ kind: 'pond', x: end[0] + 2, y: end[1] + 2, rx: 4 + rng() * 2, ry: 1.6 + rng() * 0.6 }); taken.push({ x: end[0] + 2, y: end[1] + 2, r: 5 }); } }
    // Sentiers de terre : de la gare du haut vers la route, de l'escalier vers la route, de la place vers la route ; lampadaires de sentier.
    const nearest = (x, y) => { let b = null; for (let d = 0; d < e.road.length; d++) { const [qx, qy] = e.road[d]; const dd = Math.hypot(qx - x, qy - y); if (!b || dd < b.dd) b = { x: qx, y: qy, dd }; } return b; };
    const paths = [], pathLamps = [];
    const link = (x, y) => { const n = nearest(x, y); if (n.dd < 6 || n.dd > 90) return; const mid = [(x + n.x) / 2 + (rng() - 0.5) * 8, (y + n.y) / 2 + (rng() - 0.5) * 4]; paths.push({ kind: 'path', pts: [[x, y], mid, [n.x, n.y]] }); if (rng() < 0.7) pathLamps.push({ x: mid[0] + 1.5, y: mid[1] - 0.5, u: 0.41 + rng() * 0.05, off: Math.round(rng() * 20 - 10) }); };
    link(funi.x1 + 14, funi.y1 - 2); link(funi.x0 + 16, funi.y0 - 10); if (market) link(market.x + market.w / 2, market.y + market.h); if (orchard) link(orchard.x + orchard.w * 0.5, orchard.y + orchard.h); if (lawn) link(lawn.x + lawn.w, lawn.y + lawn.h * 0.5);
    out.push(...paths); e.pathLamps = pathLamps;
    // Poulailler, pétanque, bancs, rochers et talus (2-4), jardin clos avec portail.
    { const p = place(4); if (p) out.push({ kind: 'poulailler', ...p }); }
    { const p = place(5); if (p) { out.push({ kind: 'petanque', x: p.x - 5, y: p.y - 1.5, w: 10, h: 3 }); out.push({ kind: 'bench', x: p.x - 4, y: p.y - 2.2 }); } }
    for (let i = 0, n = 2 + Math.floor(rng() * 3); i < n; i++) { const p = place(2.2); if (p) out.push({ kind: 'rocks', ...p, n: 2 + Math.floor(rng() * 2), seed: rng() * 100 }); }
    { const p = place(6); if (p) { out.push({ kind: 'fence', pts: [[p.x - 6, p.y - 3], [p.x + 6, p.y - 3], [p.x + 6, p.y + 3], [p.x - 6, p.y + 3], [p.x - 6, p.y - 3]], gate: 0.6 }); out.push({ kind: 'garden', x: p.x - 5, y: p.y + 2.5, w: 10, s: 0.7, hz: 0.2 }); out.push({ kind: 'bouquet', x: p.x + 2, y: p.y - 1, r: 2.2, s: 0.6 }); } }
  }
  // Tout sauf les arbres isolés avant la route (la route, la voie et les gares restent visibles) ; tri par y pour le recouvrement.
  return out.sort((a, b) => (a.y + (a.h || 0)) - (b.y + (b.h || 0)));
}
// Lacets arrondis : courbe quadratique par les milieux des segments (points de contrôle = sommets), échantillonnée.
function smoothPolyline(ctrl) {
  const out = [ctrl[0]];
  for (let i = 1; i < ctrl.length - 1; i++) {
    const [ax, ay] = i === 1 ? ctrl[0] : [(ctrl[i - 1][0] + ctrl[i][0]) / 2, (ctrl[i - 1][1] + ctrl[i][1]) / 2], [cx, cy] = ctrl[i];
    const [bx, by] = i === ctrl.length - 2 ? ctrl[i + 1] : [(ctrl[i][0] + ctrl[i + 1][0]) / 2, (ctrl[i][1] + ctrl[i + 1][1]) / 2];
    for (let k = 1; k <= 8; k++) { const t = k / 8, u = 1 - t; out.push([u * u * ax + 2 * u * t * cx + t * t * bx, u * u * ay + 2 * u * t * cy + t * t * by]); }
  }
  return out;
}
function fondPlan(seed) {
  const plan = cityPaintPlan(W, H, seed);
  const { ground } = plan;
  const nearTop = nearSilhouette(plan);
  const ruelleY = ground - RUELLE_H;
  const capY = H * FAR_CAP;
  // ── Échappées : par bande, la fenêtre de COL_W px où le premier plan est le plus bas (loin des bords de bande).
  // L'échappée est alignée sur des immeubles entiers du mur du fond (de COL_W à COL_W + 60 px) : chacun y est abaissé au
  // minimum permis par SES voisins du premier plan, donc la pente se voit au-dessus.
  const cols = [];
  const farRaw = plan.buildings.filter((b) => b.far).sort((a, b) => a.x - b.x);
  for (let k = 0; k * BAND < W; k++) {
    let best = null;
    for (let i = 0; i < farRaw.length; i++) {
      if (farRaw[i].x < k * BAND + 40) continue;
      for (let j = i; j < farRaw.length; j++) {
        const x0 = farRaw[i].x, x1 = farRaw[j].x + farRaw[j].w; if (x1 > Math.min(W, (k + 1) * BAND) - 40) break;
        if (x1 - x0 < COL_W) continue; if (x1 - x0 > COL_W + 120) break;
        const s = meanOver(nearTop, x0, x1); if (!best || s > best.s) best = { x: x0, x1, s };
      }
    }
    if (best) cols.push({ x: best.x, x1: best.x1, band: k });
  }
  const inCol = (x0, x1) => cols.find((c) => x1 > c.x + 1 && x0 < c.x1 - 1) || null;
  // ── Mur du fond corrigé.
  const near = plan.buildings.filter((b) => !b.far);
  const far = plan.buildings.filter((b) => b.far).map((b, i) => {
    const rng = rngOf(seed, `fond-mur-${b.id}`);
    const nearMin = minOver(nearTop, b.x, b.x + b.w);                              // plus haut voisin du premier plan sur sa largeur
    let top = Math.min(b.top, nearMin - FLOOR);                                     // D2 : toujours un étage au-dessus de la rue
    top = Math.max(top, capY + rng() * 0.08 * H);                                    // D6 : plafond (0,20 à 0,28 × H, tiré par immeuble : ligne de toits variée)
    if (inCol(b.x, b.x + b.w)) top = Math.max(capY, Math.min(nearMin - 2, b.top)); // échappée : à peine au-dessus de la silhouette du premier plan (la colline se voit partout où la rue est basse)
    top = Math.round(top * 2) / 2;
    const eave = top + FAR_ROOF_H;
    const nFloors = Math.max(1, Math.floor((ruelleY - eave - 2) / FLOOR));
    const nCols = Math.max(1, Math.floor((b.w - 6) / BAY));
    const shutter = b.look.shutters;                                                // volets tirés par `lookOf` (inchangé)
    const wins = [];
    for (let f = 0; f < nFloors; f++) for (let c = 0; c < nCols; c++) {
      // Tirage par fenêtre : seuil d'allumage, teinte froide, volets (battants ouverts / fermés le jour, fermés la nuit à une heure propre).
      const u = rng(), blue = rng() < 0.3, vac = rng() < 0.08, closeAt = 21.3 + rng() * 2.4, openAt = 7 + rng() * 2.2, sun = rng() < 0.35;
      wins.push({ x: b.x + 4 + c * BAY, y: eave + 3 + f * FLOOR, w: FAR_WINDOW.w, h: FAR_WINDOW.h, floor: f, col: c, u, blue, vac, closeAt, openAt, sun, key: `${b.id}-${f}-${c}` });
    }
    // Fenêtres allumables : au plus FAR_LIT_MAX par immeuble, tirées sans remise (comme farWindows), et jamais cachées par le premier plan.
    const cells = wins.slice(); for (let i = cells.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [cells[i], cells[j]] = [cells[j], cells[i]]; }
    const lit = cells.filter((wn) => minOver(nearTop, wn.x, wn.x + wn.w) > wn.y + wn.h).slice(0, FAR_LIT_MAX);
    const chimney = b.look.chimney !== null ? { x: b.x + b.w * b.look.chimney + 1.5, y: top + 1, s: 1, haze: FAR_HAZE, key: `mur-${b.id}` } : null;
    const laundryFloor = nFloors > 1 && nCols > 1 ? 1 + Math.floor(rng() * (nFloors - 1)) : null;
    // Toit : terrasse végétalisée ou potager (mansardes, 35 %), verrière d'atelier (25 %), antenne râteau (40 %), 1-3 souches.
    const roofKind = b.look.roofKind, rr = rng();
    const roof = { terrace: roofKind === 'mansard' && rr < 0.35 && b.w >= 30 ? { x: b.x + 4 + rng() * (b.w - 22), w: 12 + rng() * 6, potager: rng() < 0.5 } : null, verriere: rr >= 0.35 && rr < 0.6 && b.w >= 26 ? { x: b.x + 3 + rng() * (b.w - 16), w: 7 + rng() * 4 } : null, antenna: rng() < 0.4 ? b.x + 3 + rng() * (b.w - 6) : null, pots: 1 + Math.floor(rng() * 3) };
    const laundryCol = nCols > 1 ? Math.floor(rng() * (nCols - 1)) : 0;
    return { id: b.id, x: b.x, w: b.w, top, rawTop: b.top, eave, nFloors, nCols, wins, lit, look: b.look, roofKind: b.look.roofKind, shutter, chimney, laundryFloor, laundryCol, roof, u: rng() };
  });
  const farTop = new Float32Array(W + 1).fill(ground);
  for (const b of far) for (let x = Math.max(0, Math.floor(b.x)); x <= Math.min(W, Math.ceil(b.x + b.w)); x++) farTop[x] = Math.min(farTop[x], farRoofY(b, x));
  const hillTop = new Float32Array(W + 1); for (let x = 0; x <= W; x++) hillTop[x] = Math.min(farTop[x], nearTop[x]);
  // ── Colline : maisons du plan, moins celles de l'échappée (rangs 1 et 2 : la route ; rang 0 : seulement la voie du funiculaire).
  const crest = (x) => hillCrestY(plan, x);
  const funiOf = (c) => ({ x0: c.x + 14, y0: H * HILL_ROWS[2].y + 1, x1: c.x + 26, y1: crest(c.x + 26) + 1 });
  const houses = plan.hill.houses.filter((h) => {
    const c = inCol(h.x - 2, h.x + h.w + 2); if (!c) return true;
    if (h.row === 0) { const f = funiOf(c); return h.x + h.w + 2 < f.x0 - 8 || h.x - 2 > f.x1 + 54; }
    return false;
  }).map((h, i) => {
    const rng = rngOf(seed, `fond-maison-${h.row}-${Math.round(h.x)}`);
    const rh = h.h * 0.32, s = h.s;
    const wins = [];
    for (let wy = h.top + rh + 4 * s; wy + 5 * s < h.base; wy += 9 * s) for (let wx = h.x + 3 * s; wx + 4 * s < h.x + h.w - 2 * s; wx += 7 * s) wins.push({ x: wx, y: wy, w: 3.2 * s, h: 4.5 * s, u: rng(), blue: rng() < 0.25 });
    // Allumables : 1 à 2 par maison, et seulement si le mur du fond et le premier plan ne les cachent pas.
    const lit = wins.filter((wn) => minOver(hillTop, wn.x, wn.x + wn.w) > wn.y + wn.h).sort(() => rng() - 0.5).slice(0, 1 + Math.floor(rng() * 2));
    const chimney = h.chimney !== null ? { x: h.x + h.w * h.chimney + 1.5 * s, y: h.top - 4 * s + rh * 0.4, s, haze: h.haze, key: `col-${h.row}-${Math.round(h.x)}` } : null;
    const terrace = (h.kind === 'hip' || h.kind === 'mansard') && h.w >= 16 * s && h.row > 0 && rng() < 0.4 ? { x: h.x + h.w * (0.3 + rng() * 0.3), color: pick(CLOTH, rng), side: rng() < 0.5 } : null;
    return { ...h, rh, wins, lit, chimney, terrace, key: `${h.row}-${Math.round(h.x)}` };
  });
  // ── Échappée équipée : route en lacets, réverbères, funiculaire, grue.
  const escapes = cols.map((c, k) => {
    const rng = rngOf(seed, `fond-echappee-${k}`);
    const yb = H * HILL_ROWS[2].y, y1 = H * HILL_ROWS[1].y, y0 = H * HILL_ROWS[0].y;
    // Zone utile : la partie de l'échappée réellement visible au-dessus du mur du fond et du premier plan (au niveau du rang 2).
    let vx0 = Infinity, vx1 = -Infinity; for (let x = Math.ceil(c.x); x <= Math.floor(c.x1); x++) if (hillTop[x] > yb - 4) { vx0 = Math.min(vx0, x); vx1 = Math.max(vx1, x); }
    if (!(vx1 - vx0 >= 60)) { vx0 = c.x + 30; vx1 = c.x1 - 6; }
    const rx = vx0 + 4, rw = vx1 - vx0 - 8;
    // La route entre par la droite derrière une maison du rang 2 (y sous la base du rang) et sort derrière une maison du rang 0.
    const rwr = Math.min(rw, 90); const ctrl = [[c.x1 + 40, yb - 3], [rx + rwr, yb - 3], [rx + 6, y1 + 8], [rx + rwr - 4, y1 - 6], [rx + 10, y0 + 2], [c.x - 40, y0 - 1]];
    const road = smoothPolyline(ctrl);
    // Bouquets d'arbres de la pente (l'échappée n'est pas un pré vide) : 4 à 6, à l'écart de la route.
    const segs = []; let L = 0;
    for (let i = 1; i < road.length; i++) { const [ax, ay] = road[i - 1], [bx, by] = road[i]; const l = Math.hypot(bx - ax, by - ay); segs.push({ ax, ay, bx, by, l, s0: L }); L += l; }
    const lamps = []; for (let d = 18; d < L - 60; d += 22 + rng() * 8) lamps.push({ d, u: 0.4 + rng() * 0.06, off: Math.round(rng() * 30 - 15) });
    const funi = funiOf(c);
    // Escalier (Montmartre) le long de la voie, côté droit : rampes, marches, trois réverbères.
    const stairs = { x0: funi.x0 + 11, y0: funi.y0 - 2, x1: funi.x1 + 11, y1: funi.y1 + 1 };
    const crane = { x: rx + rw - 10, base: y1 + 1, mast: 26, boom: 22, weeks: new Set(Array.from({ length: 10 }, () => Math.floor(rng() * 52))) };
    // Moulin à vent (clin d'œil au Moulin de la Galette) sur la crête, à droite de la gare haute et de l'escalier ; ses ailes tournent avec le vent (04a-vent.js).
    const mill = PARAMS.garni ? { x: funi.x1 + 34 + rng() * 12, y: crest(funi.x1 + 40) + 1.5, s: 0.55 + rng() * 0.1, phase: rng() * TAU } : null;
    const eTmp = { c, road, rx, rw, y0, y1, yb, funi, crane, hillTop }; const verdure = escapeVerdure(rng, eTmp);
    return { ...c, road, segs, L, lamps, funi, stairs, crane, mill, verdure, pathLamps: eTmp.pathLamps || [], lawn: verdure.find((v) => v.kind === 'lawn') || null, trafficU: rng() };
  });
  // Verdure des rangs (entre et derrière les maisons) et de la crête (grands arbres isolés sur le ciel).
  const rowVerdure = [[], [], []];
  for (let row = 0; row < 3; row++) {
    const rng = rngOf(seed, `verdure-rang-${row}`), rowH = houses.filter((h) => h.row === row).sort((a, b) => a.x - b.x), base = H * HILL_ROWS[row].y, s = HILL_ROWS[row].s, hz = HILL_ROWS[row].haze;
    for (let i = 1; i < rowH.length; i++) {
      const a = rowH[i - 1], b = rowH[i], g = b.x - (a.x + a.w); if (g < 3 * s) continue;
      const cx = a.x + a.w + g / 2, u = rng();
      if (a.trees && Math.abs(a.trees.x - cx) < g) continue; // la maison a déjà son bouquet dans ce creux
      if (PARAMS.garni && g >= 14 * s && u < 0.5) {
        // Grand creux : une scène de colline (verger en rangs, petit marché ou bassin), à l'échelle du rang.
        const w = Math.min(g - 2 * s, 20 * s), x0 = cx - w / 2, pickS = rng();
        if (pickS < 0.4) rowVerdure[row].push({ kind: 'orchard', x: x0, y: base - 7 * s, w, h: 7 * s, seed: rng() * 1000, s, hz });
        else if (pickS < 0.7) { rowVerdure[row].push({ kind: 'market', x: x0, y: base - 6 * s, w, h: 6 * s, stalls: 2 + (w > 14 * s ? 1 : 0), s, hz }); rowVerdure[row].push({ kind: 'bouquet', x: x0 + 1.5 * s, y: base - 8 * s, r: 2.4 * s, s, hz }); }
        else { rowVerdure[row].push({ kind: 'pond', x: cx, y: base - 3 * s, rx: Math.min(5 * s, w * 0.35), ry: 1.6 * s, s, hz }); rowVerdure[row].push({ kind: 'bench', x: cx + 5 * s, y: base - 1.5 * s, s, hz }); rowVerdure[row].push({ kind: 'bouquet', x: cx - 5 * s, y: base - 4 * s, r: 2.2 * s, s, hz }); }
      }
      else if (g >= 10 * s && u < 0.3) rowVerdure[row].push({ kind: 'garden', x: cx - Math.min(g, 16 * s) / 2, y: base, w: Math.min(g, 16 * s), s, hz });
      else if (g >= 6 * s && u < 0.55) rowVerdure[row].push({ kind: pick(['poplar', 'poplar', 'cypress', 'chestnut', 'chene'], rng), x: cx, y: base, h: (10 + rng() * 8) * s, s, hz });
      else if (PARAMS.garni && g >= 5 * s && u < 0.72) rowVerdure[row].push({ kind: pick(['cabane', 'poulailler', 'rocks', 'bench', 'fence'], rng), x: cx, y: base, s, hz, n: 2, seed: rng() * 100, pts: [[cx - g * 0.4, base - 1], [cx + g * 0.4, base - 1]], gate: 0.5, small: true });
      else rowVerdure[row].push({ kind: 'bouquet', x: cx - 2 * s, y: base - 2 * s, r: Math.min(g * 0.55, (4 + rng() * 4) * s), s, hz });
    }
    // Derrière chaque maison du rang (au-dessus de son toit, sur l'herbe du rang suivant) : parfois un massif qui dépasse.
    for (const h of rowH) if (rng() < 0.22) rowVerdure[row].push({ kind: 'bouquet', x: h.x + h.w * (0.2 + rng() * 0.5), y: h.top + 1, r: (3 + rng() * 2.5) * s, s, hz: Math.min(0.4, hz + 0.08), behind: true });
  }
  // Bande de la crête (entre le ciel et les toits du rang 0 : la partie la plus visible de la colline) : un élément tous les
  // 22-50 px, varié et tiré par position : arbres isolés, bosquets, haies et murets de terrasses le long de la pente, petits
  // vergers de 3 arbres, cabanes, rochers, bancs, sentiers vers les maisons du rang 0 ; rien de régulier.
  const crestVerdure = []; {
    const rng = rngOf(seed, 'verdure-crete'), topsRow0 = houses.filter((h) => h.row === 0);
    const blocked0 = (x, m = 0) => topsRow0.some((h) => x > h.x - m && x < h.x + h.w + m);
    for (let x = 14 + rng() * 30; x < W; x += (PARAMS.garni ? 13 : 40) + rng() * (PARAMS.garni ? 20 : 75)) {
      const u = rng(), y = crest(x) + 1 + (PARAMS.garni ? rng() * 9 : 0), s = 0.5, hz = 0.38 - (y - crest(x)) * 0.01;
      if (u < 0.3) crestVerdure.push({ kind: pick(['poplar', 'poplar', 'cypress', 'chestnut', 'cerisier', 'chene'], rng), x, y: y + 0.5, h: 8 + rng() * 7, s, hz });
      else if (u < 0.55) crestVerdure.push({ kind: 'bouquet', x, y, r: 2.8 + rng() * 2.4, s, hz });
      else if (!PARAMS.garni) continue;
      else if (u < 0.65) { const pts = []; for (let k = 0, n = 6 + Math.floor(rng() * 6); k < n; k++) pts.push([x + k * 2.2, crest(x + k * 2.2) + 2 + (y - crest(x))]); crestVerdure.push({ kind: rng() < 0.5 ? 'hedge' : 'wall', pts, s, hz }); }
      else if (u < 0.75) crestVerdure.push({ kind: 'orchard', x: x - 5, y: y - 2, w: 10 + rng() * 5, h: 3.5, seed: rng() * 1000, s: 0.45, hz });
      else if (u < 0.82) crestVerdure.push({ kind: 'rocks', x, y: y + 1, n: 2 + Math.floor(rng() * 2), seed: rng() * 100, s, hz });
      else if (u < 0.88) crestVerdure.push({ kind: 'cabane', x, y: y + 2, s, hz });
      else if (u < 0.93) crestVerdure.push({ kind: 'bench', x, y: y + 1, s, hz });
      else if (!blocked0(x, 4)) { const h = topsRow0.reduce((b, hh) => (!b || Math.abs(hh.x + hh.w / 2 - x) < Math.abs(b.x + b.w / 2 - x) ? hh : b), null); if (h) crestVerdure.push({ kind: 'path', pts: [[x, crest(x) + 1], [(x + h.x + h.w / 2) / 2 + (rng() - 0.5) * 6, (crest(x) + h.top) / 2], [h.x + h.w / 2, h.top + 2]], s, hz }); }
    }
  }
  // Chapelle secondaire sur la crête : une par bande, à l'écart de la tour, des dômes et de l'échappée.
  const chapels = [];
  for (let k = 0; k * BAND < W; k++) { const rng = rngOf(seed, `chapelle-${k}`); for (let t = 0; t < 12; t++) { const x = k * BAND + 150 + rng() * (BAND - 300); if (x > W - 40) continue; if (plan.hill.landmarks.some((l) => Math.abs(l.x - x) < 90) || cols.some((c) => x > c.x - 30 && x < c.x1 + 30)) continue; chapels.push({ x, y: crest(x) + 1.5, s: 0.5 + rng() * 0.15, hz: 0.36 }); break; } }
  for (const ch of chapels) for (let i = crestVerdure.length - 1; i >= 0; i--) if (Math.abs(crestVerdure[i].x - ch.x) < 16) crestVerdure.splice(i, 1);
  // Château d'eau sur la crête (une bande sur deux, à l'écart de tout), moulin de l'échappée : dégagés de la verdure de crête.
  const reservoirs = [];
  if (PARAMS.garni) for (let k = 0; k * BAND < W; k++) { const rng = rngOf(seed, `chateau-eau-${k}`); if (rng() < 0.5) continue; for (let t = 0; t < 12; t++) { const x = k * BAND + 120 + rng() * (BAND - 240); if (x > W - 30) continue; if (plan.hill.landmarks.some((l) => Math.abs(l.x - x) < 70) || chapels.some((c) => Math.abs(c.x - x) < 60) || cols.some((c) => x > c.x - 30 && x < c.x1 + 30)) continue; reservoirs.push({ x, y: crest(x) + 1.5, s: 0.5 + rng() * 0.1, hz: 0.36 }); break; } }
  for (const r of reservoirs) for (let i = crestVerdure.length - 1; i >= 0; i--) if (Math.abs(crestVerdure[i].x - r.x) < 12) crestVerdure.splice(i, 1);
  for (const e of escapes) if (e.mill) for (let i = crestVerdure.length - 1; i >= 0; i--) if (Math.abs(crestVerdure[i].x - e.mill.x) < 14) crestVerdure.splice(i, 1);
  // Réverbères de la crête (chapelet) : un tous les ~55 px sur la ligne de crête, allumés en vague.
  const crestLamps = []; { const rng = rngOf(seed, 'fond-crete'); for (let x = 20 + rng() * 30; x < W; x += 48 + rng() * 16) crestLamps.push({ x, y: crest(x) + 1.5, u: 0.4 + rng() * 0.07, off: Math.round(rng() * 30 - 15) }); }
  const landmarks = plan.hill.landmarks.map((l) => ({ ...l, lit: true }));
  // Découpes (Path2D) : ce qui est visible AU-DESSUS du premier plan (vie du mur), et au-dessus du mur du fond aussi (vie de la colline).
  const pathAbove = (arr) => { const p = new Path2D(); p.moveTo(0, -20); for (let x = 0; x <= W; x++) p.lineTo(x, arr[x]); p.lineTo(W, -20); p.closePath(); return p; };
  return { seed, plan, ground, ruelleY, near, far, houses, landmarks, escapes, crestLamps, rowVerdure, crestVerdure, chapels, reservoirs, nearTop, farTop, hillTop, crest, clipWall: pathAbove(nearTop), clipHill: pathAbove(hillTop) };
}
const PLANS = new Map();
const fondPlanOf = (seed) => { const k = `${seed}|${PARAMS.garni}`; if (!PLANS.has(k)) PLANS.set(k, fondPlan(seed)); return PLANS.get(k); };
