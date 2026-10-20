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
    const trees = []; for (let i = 0, n = 4 + Math.floor(rng() * 3); i < n; i++) trees.push({ x: rx + 4 + rng() * (rw - 8), y: y0 + 4 + rng() * (yb - y0 - 10), r: 2.2 + rng() * 2, s: 0.55 + rng() * 0.2 });
    const segs = []; let L = 0;
    for (let i = 1; i < road.length; i++) { const [ax, ay] = road[i - 1], [bx, by] = road[i]; const l = Math.hypot(bx - ax, by - ay); segs.push({ ax, ay, bx, by, l, s0: L }); L += l; }
    const lamps = []; for (let d = 18; d < L - 60; d += 22 + rng() * 8) lamps.push({ d, u: 0.4 + rng() * 0.06, off: Math.round(rng() * 30 - 15) });
    const funi = funiOf(c);
    const crane = { x: rx + rw - 10, base: y1 + 1, mast: 26, boom: 22, weeks: new Set(Array.from({ length: 10 }, () => Math.floor(rng() * 52))) };
    return { ...c, road, segs, L, lamps, funi, crane, trees, trafficU: rng() };
  });
  // Réverbères de la crête (chapelet) : un tous les ~55 px sur la ligne de crête, allumés en vague.
  const crestLamps = []; { const rng = rngOf(seed, 'fond-crete'); for (let x = 20 + rng() * 30; x < W; x += 48 + rng() * 16) crestLamps.push({ x, y: crest(x) + 1.5, u: 0.4 + rng() * 0.07, off: Math.round(rng() * 30 - 15) }); }
  const landmarks = plan.hill.landmarks.map((l) => ({ ...l, lit: true }));
  // Découpes (Path2D) : ce qui est visible AU-DESSUS du premier plan (vie du mur), et au-dessus du mur du fond aussi (vie de la colline).
  const pathAbove = (arr) => { const p = new Path2D(); p.moveTo(0, -20); for (let x = 0; x <= W; x++) p.lineTo(x, arr[x]); p.lineTo(W, -20); p.closePath(); return p; };
  return { seed, plan, ground, ruelleY, near, far, houses, landmarks, escapes, crestLamps, nearTop, farTop, hillTop, crest, clipWall: pathAbove(nearTop), clipHill: pathAbove(hillTop) };
}
const PLANS = new Map();
const fondPlanOf = (seed) => { if (!PLANS.has(seed)) PLANS.set(seed, fondPlan(seed)); return PLANS.get(seed); };
