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
const COL_W = 118;                // largeur de l'échappée

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
  const { road, rx, rw, y0, y1, yb, funi } = e, out = [];
  const dRoad = (x, y) => { let m = Infinity; for (let i = 1; i < road.length; i++) { const [ax, ay] = road[i - 1], [bx, by] = road[i], dx = bx - ax, dy = by - ay, t = sat(((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)); m = Math.min(m, Math.hypot(x - (ax + dx * t), y - (ay + dy * t))); } return m; };
  const dFuni = (x, y) => { const dx = funi.x1 - funi.x0, dy = funi.y1 - funi.y0, t = sat(((x - funi.x0) * dx + (y - funi.y0) * dy) / (dx * dx + dy * dy)); return Math.min(Math.hypot(x - (funi.x0 + dx * t), y - (funi.y0 + dy * t)), Math.hypot(x - funi.x1, y - (funi.y1 - 12)) - 8, Math.hypot(x - funi.x0, y - (funi.y0 + 6)) - 8); };
  const free = (x, y, r) => x > e.c.x + 3 && x < e.c.x1 - 3 && y > y0 - 2 && y < yb - 1 && dRoad(x, y) >= r + 2.5 && dFuni(x, y) >= r + 7;
  const taken = [];
  const place = (r) => { for (let k = 0; k < 24; k++) { const x = rx - 10 + rng() * (rw + 20), y = y0 + 2 + rng() * (yb - y0 - 6); if (free(x, y, r) && !taken.some((t) => Math.hypot(t.x - x, t.y - y) < (t.r + r) * 0.7)) { taken.push({ x, y, r }); return { x, y }; } } return null; };
  // Vigne en rangs (clin d'œil à Montmartre) puis square : des parcelles libres, testées par leurs coins.
  const patch = (w, h) => { for (let k = 0; k < 30; k++) { const x = rx - 6 + rng() * (rw - w + 12), y = y0 + 3 + rng() * (yb - y0 - h - 6); if ([[x, y], [x + w, y], [x, y + h], [x + w, y + h], [x + w / 2, y + h / 2]].every(([px, py]) => free(px, py, 1))) { taken.push({ x: x + w / 2, y: y + h / 2, r: Math.max(w, h) / 2 }); return { x, y, w, h }; } } return null; };
  const vine = patch(22 + rng() * 10, 12 + rng() * 5); if (vine) out.push({ kind: 'vineyard', ...vine, slant: 0.35 + rng() * 0.2 });
  const lawn = patch(16 + rng() * 8, 9 + rng() * 4); if (lawn) out.push({ kind: 'lawn', ...lawn });
  // Grands arbres isolés (2-3), bosquets (4-6 groupes de 1-3 bouquets), potager (0-1).
  for (let i = 0, n = 2 + Math.floor(rng() * 2); i < n; i++) { const h = 11 + rng() * 9, p = place(h * 0.3); if (p) out.push({ kind: pick(['chestnut', 'poplar', 'poplar', 'cypress'], rng), ...p, h, s: 0.7 }); }
  for (let i = 0, n = 6 + Math.floor(rng() * 4); i < n; i++) { const r = 2 + rng() * 3.2, p = place(r); if (!p) continue; out.push({ kind: 'bouquet', ...p, r, s: 0.55 + rng() * 0.2 }); for (let j = 0, m = Math.floor(rng() * 3); j < m; j++) { const r2 = r * (0.6 + rng() * 0.5), x = p.x + (rng() - 0.5) * r * 3, y = p.y + (rng() - 0.3) * r * 1.4; if (free(x, y, r2)) out.push({ kind: 'bouquet', x, y, r: r2, s: 0.55 + rng() * 0.2 }); } }
  if (rng() < 0.7) { const p = place(6); if (p) out.push({ kind: 'garden', x: p.x - 6, y: p.y + 3, w: 12, s: 0.7, hz: 0.2 }); }
  // Haies : le long de deux tronçons de route, côté amont (perpendiculaire à la route, décalage 4 px).
  const n = road.length; for (const [f0, f1] of [[0.14, 0.3], [0.5, 0.66], [0.78, 0.9]]) {
    if (rng() < 0.3) continue; const pts = [];
    for (let i = Math.floor(f0 * n); i < Math.floor(f1 * n); i++) { const [ax, ay] = road[i], [bx, by] = road[Math.min(n - 1, i + 1)], l = Math.hypot(bx - ax, by - ay) || 1, nx = -(by - ay) / l, ny = (bx - ax) / l, side = ny < 0 ? 1 : -1, x = ax + nx * 4 * side, y = ay + ny * 4 * side; if (x > e.c.x + 2 && x < e.c.x1 - 2 && dFuni(x, y) >= 7) pts.push([x, y]); }
    if (pts.length >= 3) out.push({ kind: 'hedge', pts, s: 0.6 });
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
        if (x1 - x0 < COL_W) continue; if (x1 - x0 > COL_W + 60) break;
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
    if (inCol(b.x, b.x + b.w)) top = Math.max(top, Math.min(nearMin - FLOOR, b.top)); // échappée : au minimum permis
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
    const laundryCol = nCols > 1 ? Math.floor(rng() * (nCols - 1)) : 0;
    return { id: b.id, x: b.x, w: b.w, top, rawTop: b.top, eave, nFloors, nCols, wins, lit, look: b.look, roofKind: b.look.roofKind, shutter, chimney, laundryFloor, laundryCol, u: rng() };
  });
  const farTop = new Float32Array(W + 1).fill(ground);
  for (const b of far) for (let x = Math.max(0, Math.floor(b.x)); x <= Math.min(W, Math.ceil(b.x + b.w)); x++) farTop[x] = Math.min(farTop[x], farRoofY(b, x));
  const hillTop = new Float32Array(W + 1); for (let x = 0; x <= W; x++) hillTop[x] = Math.min(farTop[x], nearTop[x]);
  // ── Colline : maisons du plan, moins celles de l'échappée (rangs 1 et 2 : la route ; rang 0 : seulement la voie du funiculaire).
  const crest = (x) => hillCrestY(plan, x);
  const funiOf = (c) => ({ x0: c.x + 14, y0: H * HILL_ROWS[2].y + 1, x1: c.x + 26, y1: crest(c.x + 26) + 1 });
  const houses = plan.hill.houses.filter((h) => {
    const c = inCol(h.x - 2, h.x + h.w + 2); if (!c) return true;
    if (h.row === 0) { const f = funiOf(c); return h.x + h.w + 2 < f.x0 - 8 || h.x - 2 > f.x1 + 10; }
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
    const rx = c.x + 34, rw = c.x1 - c.x - 40;
    // La route entre par la droite derrière une maison du rang 2 (y sous la base du rang) et sort derrière une maison du rang 0.
    const ctrl = [[c.x1 + 40, yb - 3], [rx + rw, yb - 3], [rx + 6, y1 + 8], [rx + rw - 4, y1 - 6], [rx + 10, y0 + 2], [c.x - 40, y0 - 1]];
    const road = smoothPolyline(ctrl);
    // Bouquets d'arbres de la pente (l'échappée n'est pas un pré vide) : 4 à 6, à l'écart de la route.
    const segs = []; let L = 0;
    for (let i = 1; i < road.length; i++) { const [ax, ay] = road[i - 1], [bx, by] = road[i]; const l = Math.hypot(bx - ax, by - ay); segs.push({ ax, ay, bx, by, l, s0: L }); L += l; }
    const lamps = []; for (let d = 18; d < L - 60; d += 22 + rng() * 8) lamps.push({ d, u: 0.4 + rng() * 0.06, off: Math.round(rng() * 30 - 15) });
    const funi = funiOf(c);
    const crane = { x: rx + rw - 10, base: y1 + 1, mast: 26, boom: 22, weeks: new Set(Array.from({ length: 10 }, () => Math.floor(rng() * 52))) };
    const verdure = escapeVerdure(rng, { c, road, rx, rw, y0, y1, yb, funi, crane });
    return { ...c, road, segs, L, lamps, funi, crane, verdure, trafficU: rng() };
  });
  // Verdure des rangs (entre et derrière les maisons) et de la crête (grands arbres isolés sur le ciel).
  const rowVerdure = [[], [], []];
  for (let row = 0; row < 3; row++) {
    const rng = rngOf(seed, `verdure-rang-${row}`), rowH = houses.filter((h) => h.row === row).sort((a, b) => a.x - b.x), base = H * HILL_ROWS[row].y, s = HILL_ROWS[row].s, hz = HILL_ROWS[row].haze;
    for (let i = 1; i < rowH.length; i++) {
      const a = rowH[i - 1], b = rowH[i], g = b.x - (a.x + a.w); if (g < 3 * s) continue;
      const cx = a.x + a.w + g / 2, u = rng();
      if (a.trees && Math.abs(a.trees.x - cx) < g) continue; // la maison a déjà son bouquet dans ce creux
      if (g >= 10 * s && u < 0.3) rowVerdure[row].push({ kind: 'garden', x: cx - Math.min(g, 16 * s) / 2, y: base, w: Math.min(g, 16 * s), s, hz });
      else if (g >= 6 * s && u < 0.55) rowVerdure[row].push({ kind: pick(['poplar', 'poplar', 'cypress', 'chestnut'], rng), x: cx, y: base, h: (10 + rng() * 8) * s, s, hz });
      else rowVerdure[row].push({ kind: 'bouquet', x: cx - 2 * s, y: base - 2 * s, r: Math.min(g * 0.55, (4 + rng() * 4) * s), s, hz });
    }
    // Derrière chaque maison du rang (au-dessus de son toit, sur l'herbe du rang suivant) : parfois un massif qui dépasse.
    for (const h of rowH) if (rng() < 0.22) rowVerdure[row].push({ kind: 'bouquet', x: h.x + h.w * (0.2 + rng() * 0.5), y: h.top + 1, r: (3 + rng() * 2.5) * s, s, hz: Math.min(0.4, hz + 0.08), behind: true });
  }
  const crestVerdure = []; { const rng = rngOf(seed, 'verdure-crete'); for (let x = 20 + rng() * 40; x < W; x += 40 + rng() * 75) { const kind = pick(['poplar', 'poplar', 'cypress', 'chestnut', 'bouquet', 'bouquet'], rng); crestVerdure.push(kind === 'bouquet' ? { kind, x, y: crest(x) + 1, r: 2.8 + rng() * 2.4, s: 0.5, hz: 0.38 } : { kind, x, y: crest(x) + 1.5, h: 7 + rng() * 6, s: 0.5, hz: 0.38 }); } }
  // Réverbères de la crête (chapelet) : un tous les ~55 px sur la ligne de crête, allumés en vague.
  const crestLamps = []; { const rng = rngOf(seed, 'fond-crete'); for (let x = 20 + rng() * 30; x < W; x += 48 + rng() * 16) crestLamps.push({ x, y: crest(x) + 1.5, u: 0.4 + rng() * 0.07, off: Math.round(rng() * 30 - 15) }); }
  const landmarks = plan.hill.landmarks.map((l) => ({ ...l, lit: true }));
  // Découpes (Path2D) : ce qui est visible AU-DESSUS du premier plan (vie du mur), et au-dessus du mur du fond aussi (vie de la colline).
  const pathAbove = (arr) => { const p = new Path2D(); p.moveTo(0, -20); for (let x = 0; x <= W; x++) p.lineTo(x, arr[x]); p.lineTo(W, -20); p.closePath(); return p; };
  return { seed, plan, ground, ruelleY, near, far, houses, landmarks, escapes, crestLamps, rowVerdure, crestVerdure, nearTop, farTop, hillTop, crest, clipWall: pathAbove(nearTop), clipHill: pathAbove(hillTop) };
}
const PLANS = new Map();
const fondPlanOf = (seed) => { if (!PLANS.has(seed)) PLANS.set(seed, fondPlan(seed)); return PLANS.get(seed); };
