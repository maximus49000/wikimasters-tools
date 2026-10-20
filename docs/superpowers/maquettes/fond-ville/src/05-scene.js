// ───────────── composition, caches, étalonnage de nuit, galerie, mode animé ─────────────
// Ordre des calques (le même que proposé pour l'appli, notes.md §3) :
//   ciel → fond statique (colline, échappée, maisons, repères) → vie de la colline (découpe : au-dessus du mur du fond et du
//   premier plan) → mur du fond statique → vie du mur (découpe : au-dessus du premier plan) → premier plan (vrai peintre, bundle
//   RUE) → étalonnage de nuit (feColorMatrix de grade.ts sur tout) → lumières (hors étalonnage, mêmes découpes).
// Réglages d'URL lus avant tout (le plan et la météo en dépendent) : vent forcé, direction, mouvement réduit, colline garnie.
{ const q = new URLSearchParams(location.search); if (q.has('vent')) PARAMS.vent = Math.max(0, Math.min(3, Number(q.get('vent')))); if (q.get('dir') === '-1') PARAMS.dir = -1; if (q.get('motion') === '0' || (matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches)) PARAMS.motion = 0; if (q.get('garni') === '0') PARAMS.garni = 0; if (q.get('dense') === '0') PARAMS.dense = 0; }
const CACHE = new Map();
function cached(key, w, h, paint) {
  if (!CACHE.has(key)) { const c = document.createElement('canvas'); c.width = w; c.height = h; paint(c.getContext('2d')); CACHE.set(key, c); if (CACHE.size > 40) CACHE.delete(CACHE.keys().next().value); }
  return CACHE.get(key);
}
const bucket10 = (T) => Math.floor(T * 6) / 6;
// Premier plan (vrai paintCityTile, fond transparent) + ombres D3 corrigées : une fois par graine et par échelle.
const fgCanvas = (F, scale) => cached(`fg|${F.seed}|${scale}`, W * scale, H * scale, (ctx) => { ctx.scale(scale, scale); for (let t = 0; t < tileCount(W); t++) { ctx.save(); ctx.beginPath(); ctx.rect(t * 360, 0, 360, H); ctx.clip(); paintCityTile(ctx, F.plan, t); ctx.restore(); } paintNearShadows(ctx, F); });
// Verdure de la rue (par-dessus le premier plan) : une fois par graine, échelle, saison et neige.
const rueCanvas = (F, env, scale) => { F.rue ||= streetVerdure(F); return cached(`rue|${F.seed}|${scale}|${env.D.date}|${env.T >= 7.5 ? 'b' : 'a'}|${meteoKey(env.D)}`, W * scale, H * scale, (ctx) => { ctx.scale(scale, scale); paintRueVerdure(ctx, F, env); }); };
// Décor actuel (bundle AVANT) : captures « avant ».
const avantCanvas = (seed, scale) => cached(`avant|${seed}|${scale}`, W * scale, H * scale, (ctx) => { ctx.scale(scale, scale); const plan = AVANT.cityPaintPlan(W, H, seed); for (let t = 0; t < AVANT.tileCount(W); t++) { ctx.save(); ctx.beginPath(); ctx.rect(t * 360, 0, 360, H); ctx.clip(); AVANT.paintCityTile(ctx, plan, t); ctx.restore(); } });
// Fond statique (poses lentes : tranche de 10 min, date, météo).
const meteoKey = (D) => `${D.meteo.snow ? 'n' : ''}${D.meteo.precip > 0 ? 'p' : ''}${D.meteo.wet ? 'w' : ''}${D.meteo.fog > 0.4 ? 'b' : ''}${D.meteo.thaw ? 't' : ''}`;
const fondLayer = (F, env, scale, layer) => cached(`fond|${layer}|${F.seed}|${PARAMS.garni}${PARAMS.dense}|${W}|${scale}|${env.D.date}|${meteoKey(env.D)}|${bucket10(env.T)}`, W * scale, H * scale, (ctx) => { ctx.scale(scale, scale); paintFondStatic(ctx, F, { ...env, T: bucket10(env.T) }, layer); });
const murCanvas = (F, env, scale) => cached(`mur|${F.seed}|${scale}|${env.D.date}|${meteoKey(env.D)}|${bucket10(env.T)}`, W * scale, H * scale, (ctx) => { ctx.scale(scale, scale); paintFarStatic(ctx, F, { ...env, T: bucket10(env.T) }); });

// Étalonnage : feColorMatrix de grade.ts (gradeFor), appliqué par le filtre du canvas (url(#grade)).
const SVG_NS = 'http://www.w3.org/2000/svg';
function gradeFilter(env) {
  let svg = document.getElementById('grade-svg');
  if (!svg) { svg = document.createElementNS(SVG_NS, 'svg'); svg.id = 'grade-svg'; svg.setAttribute('width', 0); svg.setAttribute('height', 0); svg.style.position = 'absolute'; svg.innerHTML = '<filter id="grade" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 1 0"/></filter>'; document.body.appendChild(svg); }
  svg.querySelector('feColorMatrix').setAttribute('values', gradeFor(env.daylight, env.twilight, env.D.meteo.gloom).map((v) => Number(v.toFixed(3))).join(' '));
  return 'url(#grade)';
}
const LAYERS = {};
const layer = (name, w, h) => { let c = LAYERS[name]; if (!c) { c = LAYERS[name] = document.createElement('canvas'); } if (c.width !== w || c.height !== h) { c.width = w; c.height = h; } return c; };
const newCounter = () => ({ vehicules: 0, fumees: 0, oiseaux: 0, fenetres: 0, drapeaux: 0, brume: 0, grue: 0, arbres: 0, pietons: 0, fontaine: 0, arbresVent: 0, tranchesVent: 0, particules: 0 });

// Rend la scène corrigée (après) à l'instant T. view = { x0, y0, w, h, scale }. `avant` : décor actuel à la place (même ciel, même nuit).
// Passe de comblement (`dense`) : la colline visible est rendue une fois à l'échelle 1 (été, sans vent) ; chaque fenêtre de
// 12 × 8 px d'herbe nue d'un seul tenant reçoit un bouquet, un petit arbre, une haie ou des rochers (tirage par position),
// ajouté au plan dans le calque de son rang ; puis les calques sont repeints. Déterministe (même graine → mêmes comblements).
function ensureFillers(F) {
  if (F.fillersDone || !PARAMS.dense) return; F.fillersDone = true;
  const D = dayOf(ETE, 'soleil'), env = envAt(15, D), v0 = PARAMS.vent; PARAMS.vent = 0;
  const c = document.createElement('canvas'); c.width = W; c.height = H; const ctx = c.getContext('2d');
  for (const l of FOND_LAYERS) ctx.drawImage(fondLayer(F, env, 1, l), 0, 0, W, H);
  PARAMS.vent = v0;
  const refs = [haze(GRASS, 0.35), haze(light(GRASS, 0.4), 0.3)], img = ctx.getImageData(0, 0, W, H).data, mask = new Uint8Array(W * H);
  for (let y = 0; y < Math.floor(F.ground); y++) for (let x = 0; x < W; x++) { if (y < F.crest(x) - 1 || y >= F.hillTop[x]) continue; const i = (y * W + x) * 4; if (refs.some((rc) => Math.abs(img[i] - rc[0]) <= 7 && Math.abs(img[i + 1] - rc[1]) <= 7 && Math.abs(img[i + 2] - rc[2]) <= 7)) mask[y * W + x] = 1; }
  const S2 = new Int32Array((W + 1) * (H + 1)); for (let y = 1; y <= H; y++) for (let x = 1; x <= W; x++) S2[y * (W + 1) + x] = mask[(y - 1) * W + x - 1] + S2[(y - 1) * (W + 1) + x] + S2[y * (W + 1) + x - 1] - S2[(y - 1) * (W + 1) + x - 1];
  const sum = (x, y, w, h) => S2[(y + h) * (W + 1) + x + w] - S2[y * (W + 1) + x + w] - S2[(y + h) * (W + 1) + x] + S2[y * (W + 1) + x];
  const rng = rngOf(F.seed, 'comblement'), y0 = H * HILL_ROWS[0].y, y1 = H * HILL_ROWS[1].y; let n = 0;
  for (let y = 0; y + 6 <= H; y += 2) for (let x = 0; x + 8 <= W; x += 2) {
    if (sum(x, y, 8, 6) < 48) continue;
    const cx = x + 4.5, cy = y + 6, row = cy < y0 + 2 ? -1 : cy < y1 + 2 ? 0 : 1, s = row < 0 ? 0.5 : HILL_ROWS[row + 1].s, hz = row < 0 ? 0.36 : HILL_ROWS[row + 1].haze, u = rng();
    const item = u < 0.5 ? { kind: 'bouquet', x: cx - 1.5 * s, y: cy - 2.2 * s, r: (3.2 + rng() * 2) * s, s, hz } : u < 0.7 ? { kind: pick(['chestnut', 'cerisier', 'chene', 'poplar'], rng), x: cx, y: cy + 1, h: (9 + rng() * 5) * s * 1.4, s, hz } : u < 0.85 ? { kind: 'hedge', pts: Array.from({ length: 5 }, (_, k) => [x + 0.5 + k * 2.1, cy - 0.5 + Math.sin(k) * 0.4]), s, hz } : { kind: 'rocks', x: cx, y: cy, n: 2 + Math.floor(rng() * 2), seed: rng() * 100, s, hz };
    (row < 0 ? F.crestVerdure : F.rowVerdure[row]).push(item); n++;
    // La zone est comblée : on l'efface du masque (et des sommes) pour ne pas y revenir.
    for (let yy = y; yy < y + 7; yy++) for (let xx = x - 4; xx < x + 13; xx++) if (xx >= 0 && xx < W) mask[yy * W + xx] = 0;
    for (let yy = y + 1; yy <= Math.min(H, y + 8); yy++) for (let xx = 1; xx <= W; xx++) S2[yy * (W + 1) + xx] = mask[(yy - 1) * W + xx - 1] + S2[(yy - 1) * (W + 1) + xx] + S2[yy * (W + 1) + xx - 1] - S2[(yy - 1) * (W + 1) + xx - 1];
    x += 8;
  }
  F.fillerCount = n;
  for (const k of [...CACHE.keys()]) if (k.startsWith('fond|')) CACHE.delete(k);
}
function renderScene(ctx, seed, T, D, view, avant = false) {
  const F = fondPlanOf(seed), env = envAt(T, D), S = view.scale, counter = newCounter(); F.animTrees = true; ensureFillers(F);
  const base = layer('base', W * S, H * S), b = base.getContext('2d');
  b.setTransform(1, 0, 0, 1, 0, 0); b.clearRect(0, 0, base.width, base.height); b.scale(S, S);
  paintSky(b, env);
  if (avant) b.drawImage(avantCanvas(seed, S), 0, 0, W, H);
  else {
    // Fond par calques : sol, puis pour chaque rang ses arbres (tranches cisaillées par le vent) et ses maisons.
    b.drawImage(fondLayer(F, env, S, 'sol'), 0, 0, W, H);
    const rows = [['T0k', 'T0c', H * 0.24, 0.9], ['Hc'], ['H0'], ['T1k', 'T1c', H * HILL_ROWS[1].y, 1], ['H1'], ['T2k', 'T2c', H * HILL_ROWS[2].y, 1.1], ['H2']];
    for (const [lk, lc, baseY, factor] of rows) { b.drawImage(fondLayer(F, env, S, lk), 0, 0, W, H); if (lc) { drawHillCanopy(b, fondLayer(F, env, S, lc), env, S, baseY, factor, counter); b.setTransform(S, 0, 0, S, 0, 0); } }
    b.save(); b.clip(F.clipHill); for (const e of F.escapes) if (e.mill) paintMillSails(b, e.mill, env); b.restore();
    paintVieColline(b, F, env, counter);
    b.drawImage(murCanvas(F, env, S), 0, 0, W, H);
    paintVieMur(b, F, env, counter);
    b.drawImage(fgCanvas(F, S), 0, 0, W, H);
    b.drawImage(rueCanvas(F, env, S), 0, 0, W, H);
    paintArbresRue(b, F, env, S, counter); b.setTransform(S, 0, 0, S, 0, 0);
  }
  // Lumières (hors étalonnage) dans un calque à part, avec les découpes.
  const lights = layer('lights', W * S, H * S), l = lights.getContext('2d');
  l.setTransform(1, 0, 0, 1, 0, 0); l.clearRect(0, 0, lights.width, lights.height); l.scale(S, S);
  if (avant) {
    // Avant : fenêtres du fond de `farWindows` (celles que le calque SVG allume, défaut 1 : posées sur les toits).
    const day = { weekday: D.weekday, kind: D.kind };
    for (const f of AVANT.cityFacades(W, H, seed)) for (const wn of f.farWindows) if (windowLit(wn.u, env.minutes, day, env.daylight, D.meteo.gloom)) { l.fillStyle = wn.blue ? LIT_BLUE : LIT_WARM; l.globalAlpha = 0.5; l.fillRect(wn.x, wn.y, FAR_WINDOW.w, FAR_WINDOW.h); }
    l.globalAlpha = 1;
  } else {
    l.save(); l.clip(F.clipHill); paintLightsHill(l, F, env, counter); l.restore();
    l.save(); l.clip(F.clipWall); paintLightsWall(l, F, env, counter); l.restore();
    paintLightsRue(l, F, env);
  }
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.filter = gradeFilter(env);
  ctx.drawImage(base, view.x0 * S, view.y0 * S, view.w * S, view.h * S, 0, 0, view.w * S, view.h * S);
  ctx.filter = 'none';
  ctx.drawImage(lights, view.x0 * S, view.y0 * S, view.w * S, view.h * S, 0, 0, view.w * S, view.h * S);
  ctx.restore();
  return { counter, env, F };
}

// ───────────── vues ─────────────
const fullView = (scale = 2) => ({ x0: 0, y0: 0, w: W, h: H, scale });
const escapeView = (F, k = 0, scale = 3) => { const e = F.escapes[k]; return { x0: Math.max(0, Math.round(e.x - 50)), y0: 30, w: 330, h: 140, scale }; };
const funiView = (F, k = 0, scale = 3) => { const f = F.escapes[k].funi; return { x0: Math.max(0, Math.round((f.x0 + f.x1) / 2 - 70)), y0: Math.round(f.y1 - 24), w: 150, h: 110, scale }; };
const towerView = (F, scale = 3) => { const t = F.landmarks.find((l) => l.kind === 'tower'); return { x0: Math.max(0, Math.round(t.x - 60)), y0: Math.max(0, Math.round(t.top - 14)), w: 150, h: 110, scale }; };
// Une ruelle : la plus large fente entre deux immeubles du premier plan (≥ 6 px), vue du toit du fond jusqu'au trottoir.
function alleyView(F, scale = 3) {
  const near = F.near.slice().sort((a, b) => a.x - b.x); let best = null;
  for (let i = 1; i < near.length; i++) { const g = near[i].x - (near[i - 1].x + near[i - 1].w), gx = near[i - 1].x + near[i - 1].w; if (gx > 100 && gx < W - 150 && g >= 6 && (!best || g > best.g)) best = { g, x: gx }; }
  const x = best ? best.x + best.g / 2 : 300; return { x0: Math.round(x - 70), y0: F.ground - 130, w: 150, h: 150, scale };
}
// Vue sur une cheminée de la colline qui fume à l'instant T (visible au-dessus du mur du fond).
function smokeView(F, T, D, scale = 4) {
  const env = envAt(T, D), ch = F.houses.map((h) => h.chimney).filter((c) => c && smokeK(T, D, c, F.seed) > 0 && F.hillTop[Math.round(c.x)] > c.y + 2)[0] || F.houses.find((h) => h.chimney).chimney;
  return { x0: Math.max(0, Math.round(ch.x - 70)), y0: Math.max(0, Math.round(ch.y - 45)), w: 150, h: 90, scale };
}
// Vues de la rue : un pied d'arbre fleuri, un parterre.
const pitView = (F, scale = 3) => { F.rue ||= streetVerdure(F); const p = F.rue.find((v) => v.kind === 'pit' && !v.empty && !v.young && v.flowers && v.r > 13 && v.x > 80 && v.x < W - 100) || F.rue.find((v) => v.kind === 'pit' && !v.empty && !v.young) || F.rue.find((v) => v.kind === 'pit'); return { x0: Math.max(0, Math.round(p.x - 80)), y0: F.ground - 85, w: 160, h: 120, scale }; };
const bedView = (F, scale = 3) => { F.rue ||= streetVerdure(F); const p = F.rue.find((v) => v.kind === 'parterre' && v.x0 > 80) || F.rue.find((v) => v.kind === 'bac'); return { x0: Math.max(0, Math.round(p.x0 + p.w / 2 - 80)), y0: F.ground - 85, w: 160, h: 120, scale }; };
const cherryView = (F, scale = 3) => { F.rue ||= streetVerdure(F); const p = F.rue.find((v) => v.kind === 'pit' && !v.empty && !v.young && v.species === 'cerisier' && v.x > 80 && v.x < W - 100); return p ? { x0: Math.max(0, Math.round(p.x - 80)), y0: F.ground - 85, w: 160, h: 120, scale } : pitView(F, scale); };
const wallView = (F, scale = 3) => { const b = F.far.reduce((m, b) => (b.nFloors > m.nFloors ? b : m), F.far[0]); return { x0: Math.max(0, Math.round(b.x - 60)), y0: Math.max(0, Math.round(b.top - 20)), w: 180, h: 130, scale }; };

// ───────────── galerie ─────────────
function canvasFor(id, w, h, label) {
  const g = document.getElementById('gallery'); const h2 = document.createElement('h2'); h2.textContent = label || id; g.appendChild(h2);
  const c = document.createElement('canvas'); c.id = id; c.width = w; c.height = h; g.appendChild(c); return c.getContext('2d');
}
const ETE = '2026-07-07', AUT = '2026-10-27', HIV = '2027-02-10', FETE = '2026-07-14';
const MOMENTS = [
  { id: 'ete-15h', T: 15 + 0.3 * MIN, date: ETE, meteo: 'soleil', note: 'mardi 7 juillet, 15 h, soleil — linge aux fenêtres du fond, parasols des terrasses, trafic de l’après-midi, funiculaire' },
  { id: 'automne-18h30', T: 18.5 + 0.9 * MIN, date: AUT, meteo: 'soleil', note: 'mardi 27 octobre, 18 h 30 — crépuscule : fenêtres et réverbères qui s’allument en vague, nuée d’étourneaux, pointe du soir' },
  { id: 'nuit-23h', T: 23 + 0.2 * MIN, date: AUT, meteo: 'soleil', note: '23 h — fenêtres qui s’éteignent une à une, volets tirés, monuments illuminés, cadran éclairé, cabines allumées' },
  { id: 'hiver-8h', T: 8 + 0.4 * MIN, date: HIV, meteo: 'nuages', note: 'mercredi 10 février, 8 h — matin d’hiver : fumées des cheminées, brume au creux de la colline, lève-tôt, arbres nus' },
  { id: '14juillet-14h', T: 14 + 0.1 * MIN, date: FETE, meteo: 'soleil', note: 'mardi 14 juillet, 14 h — drapeaux sur la tour et le dôme, parasols, pigeons posés' },
  { id: 'pluie-11h', T: 11 + 0.5 * MIN, date: '2026-07-08', meteo: 'pluie', note: 'mercredi 8 juillet, 11 h, pluie — linge rentré, parasols repliés, ciel bas, pas de vols' },
];
function renderCaptures() {
  const ids = [];
  const D15 = dayOf(ETE, 'soleil'), D23 = dayOf(AUT, 'soleil');
  // Audit : avant / après sur les graines 1, 7 et 42 (jour), puis la nuit sur la graine 7 (défaut 1 : fenêtres allumées sur les toits).
  for (const [tag, avant] of [['avant', true], ['apres', false]]) { const id = `${tag}-graine7-nuit`; renderScene(canvasFor(id, W * 2, H * 2, `${id} — 27 octobre 23 h`), 7, 23 + 0.2 * MIN, D23, fullView(2), avant); ids.push(id); }
  // Moments (graine 7).
  for (const m of MOMENTS) { const D = dayOf(m.date, m.meteo); renderScene(canvasFor(m.id, W * 2, H * 2, `${m.id} — ${m.note}`), 7, m.T, D, fullView(2)); ids.push(m.id); }
  // Rue (graine 7) : saisons et nuit, vue de la rue seule (toits du premier plan → chaussée).
  const RUE_VIEW = { x0: 0, y0: 70, w: W, h: H - 70, scale: 2 };
  const RUES = [
    { id: 'rue-printemps-11h', T: 11 + 0.2 * MIN, date: '2027-04-28', meteo: 'soleil', note: 'mercredi 28 avril, 11 h — tulipes, glycine en grappes, chandelles des marronniers, feuillage tendre' },
    { id: 'rue-cerisiers-11h', T: 11 + 0.2 * MIN, date: '2027-04-02', meteo: 'soleil', note: 'vendredi 2 avril, 11 h — cerisiers en fleurs, premières feuilles, parterres replantés (pousses)' },
    { id: 'rue-ete-15h', T: 15 + 0.3 * MIN, date: ETE, meteo: 'soleil', note: '7 juillet, 15 h — platanes, tilleuls et marronniers en feuilles, géraniums et lavande' },
    { id: 'rue-automne-15h', T: 15 + 0.3 * MIN, date: AUT, meteo: 'soleil', note: '27 octobre, 15 h — jaunissement (platanes avant les autres), feuilles mortes accumulées, chrysanthèmes, vigne vierge rouge' },
    { id: 'rue-novembre-15h', T: 15 + 0.3 * MIN, date: '2026-11-14', meteo: 'nuages', note: '14 novembre, 15 h — chute en cours, arbres à moitié nus, tapis de feuilles avant balayage' },
    { id: 'rue-neige-11h', T: 11 + 0.2 * MIN, date: '2027-01-20', meteo: 'neige', note: '20 janvier, 11 h, neige — neige sur les branches et les parterres' },
    { id: 'rue-hiver-11h', T: 11 + 0.2 * MIN, date: HIV, meteo: 'nuages', note: '10 février, 11 h — arbres nus, sol paillé et bruyères, grimpantes en bois' },
    { id: 'rue-nuit-22h', T: 22 + 0.2 * MIN, date: AUT, meteo: 'soleil', note: '27 octobre, 22 h — houppiers éclairés par les lampadaires' },
  ];
  for (const m of RUES) { const D = dayOf(m.date, m.meteo); renderScene(canvasFor(m.id, W * 2, (H - 70) * 2, `${m.id} — ${m.note}`), 7, m.T, D, RUE_VIEW); ids.push(m.id); }
  // Zooms ×3 (graine 7).
  const F = fondPlanOf(7);
  const zooms = [
    { id: 'zoom-colline-ete', view: escapeView(F), T: 15 + 0.3 * MIN, D: D15, note: 'l’échappée de la colline : route en lacets, réverbères, funiculaire, terrasses, grue (×3)' },
    { id: 'zoom-colline-hiver', view: escapeView(F), T: 8 + 0.4 * MIN, D: dayOf(HIV, 'nuages'), note: 'la même échappée un matin d’hiver : fumées, brume, arbres nus (×3)' },
    { id: 'zoom-funiculaire', view: funiView(F), T: 18.5 + 55 * SEC, D: D23, note: 'funiculaire : les deux cabines se croisent à mi-pente, 18 h 30 et 55 s (×3)' },
    { id: 'zoom-funiculaire-nuit', view: funiView(F), T: 23 + 55 * SEC, D: D23, note: 'funiculaire la nuit : cabines et gares éclairées (×3)' },
    { id: 'zoom-tour', view: towerView(F), T: 15 + 12 * SEC, D: D15, note: 'la tour à 15 h 00 min 12 s : la cloche a fait s’envoler les pigeons, aiguilles à l’heure (×3)' },
    { id: 'zoom-tour-14juillet', view: towerView(F), T: 14 + 5 * MIN, D: dayOf(FETE, 'soleil'), note: 'la tour le 14 juillet : drapeau au mât, pigeons posés sur le beffroi (×3)' },
    { id: 'zoom-tour-nuit', view: towerView(F), T: 23 + 0.2 * MIN, D: D23, note: 'la tour illuminée, cadran éclairé (×3)' },
    { id: 'zoom-ruelle', view: alleyView(F), T: 15 + 0.3 * MIN, D: D15, note: 'une fente du premier plan : mur du fond à étages, fenêtres sous l’égout, ruelle en retrait sous le haut du rez-de-chaussée (×3)' },
    { id: 'zoom-pied-arbre', view: pitView(F), T: 15 + 0.3 * MIN, D: D15, note: 'pied d’arbre : fosse à grille en fonte, pied fleuri, tronc planté avec ombre au sol, houppier devant la façade avec son ombre (×3)' },
    { id: 'zoom-pied-arbre-printemps', view: pitView(F), T: 11 + 0.2 * MIN, D: dayOf('2027-04-20', 'soleil'), note: 'le même pied d’arbre au printemps : tulipes (×3)' },
    { id: 'zoom-parterre', view: bedView(F), T: 15 + 0.3 * MIN, D: D15, note: 'parterre au pied d’un immeuble, bacs de trottoir, pots devant une porte (×3)' },
    { id: 'zoom-parterre-automne', view: bedView(F), T: 15 + 0.3 * MIN, D: D23, note: 'le même parterre à l’automne : chrysanthèmes, feuilles mortes (×3)' },
    { id: 'zoom-mur', view: wallView(F), T: 15 + 0.3 * MIN, D: D15, note: 'mur du fond : bandeaux, corniche, travées, volets, linge (×3)' },
    { id: 'zoom-mur-nuit', view: wallView(F), T: 22 + 10 * MIN, D: D23, note: 'mur du fond à 22 h 10 : volets qui se ferment, fenêtres allumées sous l’égout (×3)' },
  ];
  for (const z of zooms) { renderScene(canvasFor(z.id, z.view.w * z.view.scale, z.view.h * z.view.scale, `${z.id} — ${z.note}`), 7, z.T, z.D, z.view); ids.push(z.id); }
  // Séquence : la fumée naît au conduit (matin d'hiver, 6 h 40 + 0 / 2 / 5 / 9 s).
  const DH = dayOf(HIV, 'soleil'), sv = smokeView(F, 8.5, DH, 4);
  [0, 2, 5, 9].forEach((s, i) => { const id = `seq-fumee-${i + 1}`; renderScene(canvasFor(id, sv.w * 4, sv.h * 4, `${id} — la fumée naît au conduit : 8 h 30 + ${s} s, 10 février (×4)`), 7, 8.5 + s * SEC, DH, sv); ids.push(id); });
  // Planche « une année » : même coin de rue et même coin de colline, une vignette par mois (le 15, 14 h, soleil ; janvier avec neige).
  {
    const id = 'annee-planche', vw = 300, vhR = 120, vhC = 90, vhM = 60, S = 2, cols = 4, cw = vw * S + 12, chh = (vhR + vhC + vhM) * S + 38;
    const ctx = canvasFor(id, cols * cw, 3 * chh, `${id} — une année : la rue (haut), l’échappée de la colline (milieu), les toits du mur du fond (bas), le 15 de chaque mois à 14 h (dimanche 15 août pour la fanfare)`);
    ctx.fillStyle = '#1c1a22'; ctx.fillRect(0, 0, cols * cw, 3 * chh);
    const pv = pitView(F, S), rueV = { x0: pv.x0, y0: F.ground - 95, w: vw, h: vhR, scale: S }, colV = { ...escapeView(F, 0, S), w: vw, h: vhC, y0: 40 }, murB = F.far.find((b) => b.roof.terrace && b.x > 100 && b.x < W - 320) || F.far[3], murV = { x0: Math.max(0, Math.round(murB.x - 60)), y0: Math.max(0, Math.round(murB.top - 22)), w: vw, h: vhM, scale: S };
    const NOMS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
    for (let m = 0; m < 12; m++) {
      const D = dayOf(`2027-${String(m + 1).padStart(2, '0')}-15`, m === 0 ? 'neige' : 'soleil'), ox = (m % cols) * cw, oy = Math.floor(m / cols) * chh;
      ctx.fillStyle = '#e8e0cc'; ctx.font = 'bold 15px sans-serif'; ctx.fillText(`15 ${NOMS[m]}${m === 0 ? ' (neige)' : ''}`, ox + 4, oy + 18);
      for (const [v, dy] of [[rueV, 24], [colV, 24 + vhR * S + 4], [murV, 24 + (vhR + vhC) * S + 8]]) { const c = document.createElement('canvas'); c.width = v.w * S; c.height = v.h * S; renderScene(c.getContext('2d'), 7, 14 + 0.2 * MIN, D, v); ctx.drawImage(c, ox, oy + dy); }
    }
    ids.push(id);
  }
  // Avant / après de la colline garnie (même cadrage : l'échappée élargie), 7 juillet 15 h.
  { const view = escapeView(F, 0, 3); PARAMS.garni = 0; const F0 = fondPlanOf(7); renderScene(canvasFor('colline-avant', view.w * 3, view.h * 3, 'colline-avant — l’échappée avant ce retour (×3)'), 7, 15 + 0.3 * MIN, D15, view); ids.push('colline-avant'); PARAMS.garni = 1; renderScene(canvasFor('colline-apres', view.w * 3, view.h * 3, 'colline-apres — marché et lavoir, verger clos, ruisseau et bassin, sentiers, moulin, cabane, ruches, poulailler, pétanque, rochers (×3)'), 7, 15 + 0.3 * MIN, D15, view); ids.push('colline-apres'); void F0; }
  // Côté gauche avant / après ce retour (x 0 → 500, échelle 1, rendu ×2), 7 juillet 15 h.
  { const view = { x0: 0, y0: 0, w: 500, h: H, scale: 2 }; PARAMS.dense = 0; renderScene(canvasFor('gauche-avant', 1000, H * 2, 'gauche-avant — côté gauche avant ce retour'), 7, 15 + 0.3 * MIN, D15, view); ids.push('gauche-avant'); PARAMS.dense = 1; renderScene(canvasFor('gauche-apres', 1000, H * 2, 'gauche-apres — maisons étagées jusqu’à la crête, façades et jardins le long de la route et de la voie, bosquets serrés'), 7, 15 + 0.3 * MIN, D15, view); ids.push('gauche-apres'); }
  // Chute des feuilles (1er octobre → 30 novembre) et débourrement (15 mars → 15 mai), une image tous les 6 jours, même arbre,
  // même cadrage ; le contour du fût (boîte fixe du squelette) est tracé en pointillé sur chaque image : il ne bouge pas.
  { const pv = pitView(F, 3); F.rue ||= streetVerdure(F); const tree = F.rue.find((v) => v.kind === 'pit' && !v.empty && !v.young && v.x > pv.x0 && v.x < pv.x0 + pv.w), m = rueModel(tree);
    for (const [name, from, n] of [['seq-chute-feuilles', '2026-10-01', 11], ['seq-debourrement', '2027-03-15', 11]]) {
      const frames = [];
      for (let i = 0; i < n; i++) { const t = new Date(Date.UTC(+from.slice(0, 4), +from.slice(5, 7) - 1, +from.slice(8, 10) + i * 6)), ds = t.toISOString().slice(0, 10), id = `${name}-${i + 1}`, ctx = canvasFor(id, pv.w * 3, pv.h * 3, `${id} — ${ds}`);
        renderScene(ctx, 7, 14 + 0.2 * MIN, dayOf(ds, 'soleil'), pv); ctx.save(); ctx.setTransform(3, 0, 0, 3, -pv.x0 * 3, -pv.y0 * 3); ctx.setLineDash([1.2, 1.2]); ctx.strokeStyle = '#FF2060'; ctx.lineWidth = 0.6; ctx.strokeRect(m.trunkBox.x - 0.8, m.trunkBox.y, m.trunkBox.w + 1.6, m.trunkBox.h); ctx.beginPath(); ctx.moveTo(m.span[0], m.top - 2); ctx.lineTo(m.span[1], m.top - 2); ctx.stroke(); ctx.restore();
        ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(0, 0, 150, 16); ctx.fillStyle = '#fff'; ctx.font = '11px sans-serif'; ctx.fillText(ds, 4, 12); ids.push(id); frames.push(ctx.canvas); }
      // Planche : les n images côte à côte (deux lignes).
      const cols = 6, cw = pv.w * 3, chh = pv.h * 3, pl = canvasFor(name + '-planche', cols * cw, 2 * chh, `${name}-planche — même squelette, le feuillage seul change (fût en pointillé rose)`);
      frames.forEach((c, i) => pl.drawImage(c, (i % cols) * cw, Math.floor(i / cols) * chh)); ids.push(name + '-planche');
    }
  }
  // Séquences au vent (4-6 images à 0,4 s d'écart ; `seq-*` → GIF par capture.mjs) : pied d'arbre ×3 et échappée ×3.
  const SEQS = [
    { id: 'seq-vent-faible-ete', date: ETE, meteo: 'soleil', vent: 1, T: 15 + 0.3 * MIN, n: 5, note: 'vent faible d’été : frémissement des rehauts, rafale qui passe' },
    { id: 'seq-rafales-automne', date: '2026-11-04', meteo: 'nuages', vent: 2, T: 15 + 0.3 * MIN, n: 6, note: 'rafales d’automne : feuilles arrachées qui s’envolent et retombent' },
    { id: 'seq-pluie-vent', date: ETE, meteo: 'pluie', vent: 2, T: 15 + 0.3 * MIN, n: 5, note: 'pluie et vent : feuillage assombri et luisant, troncs mouillés, flaques, gouttes, branches qui ploient' },
    { id: 'seq-orage', date: '2026-08-12', meteo: 'orage', vent: 3, T: 16 + 0.3 * MIN, n: 6, note: 'orage : arbres qui se tordent, feuilles retournées (face claire)' },
    { id: 'seq-neige-redoux', date: '2027-01-25', meteo: 'redoux', vent: 1, T: 11 + 0.3 * MIN, n: 5, note: 'redoux : la neige glisse des branches' },
    { id: 'seq-petales-avril', date: '2027-04-04', meteo: 'soleil', vent: 1, T: 11 + 0.3 * MIN, n: 5, note: 'avril : pétales de cerisier emportés par le vent' },
    { id: 'seq-colline-vent', date: '2026-11-04', meteo: 'nuages', vent: 2, T: 15 + 0.3 * MIN, n: 5, hill: true, note: 'échappée par rafales d’automne : tranches d’arbres cisaillées, moulin, feuilles' },
  ];
  for (const sq of SEQS) {
    PARAMS.vent = sq.vent; const D = dayOf(sq.date, sq.meteo); const view = sq.hill ? escapeView(F, 0, 3) : (sq.id === 'seq-petales-avril' ? cherryView(F, 3) : pitView(F, 3));
    for (let i = 0; i < sq.n; i++) { const id = `${sq.id}-${i + 1}`; renderScene(canvasFor(id, view.w * 3, view.h * 3, `${id} — ${sq.note} (+${(i * 0.4).toFixed(1)} s, vent ${sq.vent})`), 7, sq.T + i * 0.4 * SEC, D, view); ids.push(id); }
    PARAMS.vent = null;
  }
  // Comparatifs avant / après empilés (graines 1, 7, 42, jour).
  for (const seed of [1, 7, 42]) {
    const id = `comparatif-graine${seed}`, ctx = canvasFor(id, W * 2, H * 4 + 60, `${id} — en haut le décor actuel, en bas le fond corrigé (D1 à D6) avec la vie du fond, 7 juillet 15 h`);
    ctx.fillStyle = '#1c1a22'; ctx.fillRect(0, 0, W * 2, H * 4 + 60);
    for (const [k, avant] of [[0, true], [1, false]]) {
      const c = document.createElement('canvas'); c.width = W * 2; c.height = H * 2; renderScene(c.getContext('2d'), seed, 15 + 0.3 * MIN, D15, fullView(2), avant);
      ctx.drawImage(c, 0, 30 + k * (H * 2 + 30)); ctx.fillStyle = '#e8e0cc'; ctx.font = 'bold 20px sans-serif'; ctx.fillText(avant ? `AVANT — graine ${seed} (décor actuel)` : `APRÈS — graine ${seed} (fond corrigé, vie du fond)`, 8, 22 + k * (H * 2 + 30));
    }
    ids.push(id);
  }
  window.__ids = ids; window.__done = true;
}

// ───────────── mode animé ─────────────
function runAnimated(q) {
  let T = parseFloat(q.get('h')); const seed = Number(q.get('seed') || 7), spd0 = parseFloat(q.get('speed') || '1');
  const D = dayOf(q.get('date') || AUT, q.get('meteo') || 'soleil'), F = fondPlanOf(seed), S = Number(q.get('scale') || 2);
  const z = q.get('zoom'), view = z === 'colline' ? escapeView(F, 0, S) : z === 'funi' ? funiView(F, 0, S) : z === 'tour' ? towerView(F, S) : z === 'ruelle' ? alleyView(F, S) : z === 'mur' ? wallView(F, S) : fullView(S);
  const ctx = canvasFor('anim', view.w * view.scale, view.h * view.scale, `${D.date} · graine ${seed} · ${q.get('meteo') || 'soleil'} · vent ${PARAMS.vent === null ? 'météo' : PARAMS.vent}${PARAMS.motion ? '' : ' · mouvement réduit'} — espace : pause · ← → : ±10 min · + − : vitesse (minutes de scène par seconde)`);
  let paused = false, last = performance.now(), spd = spd0;
  addEventListener('keydown', (e) => { if (e.key === ' ') paused = !paused; else if (e.key === 'ArrowLeft') T -= 10 * MIN; else if (e.key === 'ArrowRight') T += 10 * MIN; else if (e.key === '+') spd *= 1.5; else if (e.key === '-') spd /= 1.5; });
  const frame = (now) => {
    const dt = (now - last) / 1000; last = now; if (!paused) T = ((T + dt * spd * MIN) % 24 + 24) % 24;
    const t0 = performance.now(); const r = renderScene(ctx, seed, T, D, view); r.ms = performance.now() - t0;
    if (q.get('hud') !== '0') { const c = r.counter; ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, 0, 900, 16); ctx.fillStyle = '#fff'; ctx.font = '11px sans-serif'; ctx.fillText(`${fmtT(T)} · ×${spd.toFixed(1)} · animés en vue : véhicules ${c.vehicules}, piétons ${c.pietons}, fumées ${c.fumees}, oiseaux ${c.oiseaux}, arbres ${c.arbres}, drapeaux ${c.drapeaux}, brume ${c.brume}, grue ${c.grue}, fontaine ${c.fontaine}, arbres au vent ${c.arbresVent} + ${c.tranchesVent} tranches, particules ${c.particules} · fenêtres ${c.fenetres} · ${r.ms.toFixed(1)} ms`, 4, 12); ctx.restore(); }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
// ───────────── contrôles automatiques ─────────────
// `?audit=vert&seed=7&w=1440` : part d'herbe nue visible (pixels de la couleur de l'herbe, au-dessus de tout ce qui est peint devant)
// et fenêtres de 12 × 8 px entièrement nues (objectif : 0 fenêtre, < 10 %), été et hiver, échelle 1.
function auditVert(seed) {
  const out = {};
  for (const [tag, date, meteo] of [['ete', ETE, 'soleil'], ['hiver', HIV, 'nuages']]) {
    const D = dayOf(date, meteo), env = envAt(15, D), F = fondPlanOf(seed), c = document.createElement('canvas'); c.width = W; c.height = H; const ctx = c.getContext('2d');
    PARAMS.vent = 0; renderScene(ctx, seed, 15, D, fullView(1)); PARAMS.vent = null;
    // Couleurs de l'herbe nue : aplat et rehaut de crête (paintGround), étalonnées comme la scène (jour : identité).
    const doy = D.doy, dry = sat((doy - 250) / 60) * (1 - sat((doy - 340) / 25)), cold = Math.max(sat((doy - 320) / 30), 1 - sat((doy - 60) / 40));
    const g0 = mixRgb(mixRgb(light(GRASS, 0.2 * (1 - sat((doy - 100) / 60))), hexRgb('#B89040'), dry * 0.35), hexRgb('#9A9A80'), cold * 0.45);
    const refs = [haze(g0, 0.35), haze(light(g0, 0.4), 0.3)], img = ctx.getImageData(0, 0, W, H).data, mask = new Uint8Array(W * H);
    let bare = 0, vis = 0;
    for (let y = 0; y < Math.floor(F.ground); y++) for (let x = 0; x < W; x++) {
      if (y < F.crest(x) - 1 || y >= F.hillTop[x]) continue; vis++;
      const i = (y * W + x) * 4, p = [img[i], img[i + 1], img[i + 2]];
      if (refs.some((rc) => Math.abs(p[0] - rc[0]) <= 7 && Math.abs(p[1] - rc[1]) <= 7 && Math.abs(p[2] - rc[2]) <= 7)) { mask[y * W + x] = 1; bare++; }
    }
    // Table des sommes pour compter les fenêtres 12 × 8 entièrement nues, et plus grand composant (BFS 4-connexe).
    const S2 = new Int32Array((W + 1) * (H + 1)); for (let y = 1; y <= H; y++) for (let x = 1; x <= W; x++) S2[y * (W + 1) + x] = mask[(y - 1) * W + x - 1] + S2[(y - 1) * (W + 1) + x] + S2[y * (W + 1) + x - 1] - S2[(y - 1) * (W + 1) + x - 1];
    let windows = 0, worst = null; const WW = 12, HH = 8;
    for (let y = 0; y + HH <= H; y++) for (let x = 0; x + WW <= W; x++) { const n = S2[(y + HH) * (W + 1) + x + WW] - S2[y * (W + 1) + x + WW] - S2[(y + HH) * (W + 1) + x] + S2[y * (W + 1) + x]; if (n === WW * HH) { windows++; if (!worst) worst = [x, y]; } }
    const seen = new Uint8Array(W * H); let big = { n: 0 };
    for (let i0 = 0; i0 < W * H; i0++) { if (!mask[i0] || seen[i0]) continue; const st = [i0]; seen[i0] = 1; let n = 0, x0 = W, x1 = 0, y0 = H, y1 = 0; while (st.length) { const i = st.pop(), x = i % W, y = (i - x) / W; n++; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); for (const j of [i - 1, i + 1, i - W, i + W]) if (j >= 0 && j < W * H && mask[j] && !seen[j] && Math.abs((j % W) - x) <= 1) { seen[j] = 1; st.push(j); } } if (n > big.n) big = { n, box: `${x1 - x0 + 1}×${y1 - y0 + 1} à (${x0},${y0})` }; }
    out[tag] = { seed, w: W, comblements: F.fillerCount, herbeNue: (100 * bare / Math.max(1, vis)).toFixed(1) + ' %', fenetres12x8: windows, premiere: worst, plusGrandeZone: big.box, pixels: big.n };
  }
  return out;
}
// `?audit=squelette&seed=7` : pour chaque arbre (rue et colline), sur 365 jours, boîte du fût et envergure identiques, et écart de
// hauteur totale de la silhouette (fût + branches + touffes présentes) ≤ 1 px entre deux jours consécutifs.
function auditSquelette(seed) {
  const F = fondPlanOf(seed); F.rue ||= streetVerdure(F);
  const trees = [];
  for (const v of F.rue) if (v.kind === 'pit' && !v.empty) trees.push({ name: `rue@${Math.round(v.x)}`, m: rueModel(v), key: 'rue' + Math.round(v.x), sp: v.species });
  for (const v of [...F.crestVerdure, ...F.rowVerdure.flat(), ...F.escapes.flatMap((e) => e.verdure)]) if (isTree(v) && v.kind !== 'cypress' && v.kind !== 'orchard') { const key = `${v.kind}-${Math.round(v.x ?? 0)}-${Math.round(v.y ?? 0)}`; if (v.kind === 'bouquet') trees.push({ name: `colline-bouquet@${Math.round(v.x)}`, m: treeModelOf('b' + key, 'bouquet', { x: v.x, y: v.y + v.r * 0.9 }, v.r * 0.55, v.r * 1.7, v.r > 3 ? 3 : 2, v.r * 0.34, 22), key: 'b' + key, sp: 'bouquet' }); else { const sp = v.species || (v.kind === 'chestnut' ? 'marronnier' : v.kind), h = v.h, pop = v.kind === 'poplar'; trees.push({ name: `colline-${v.kind}@${Math.round(v.x)}`, m: treeModelOf(key, sp, { x: v.x, y: v.y }, h * (pop ? 0.18 : 0.3), h * (pop ? 0.82 : 0.7), 3, h * (pop ? 0.075 : 0.11), 26), key, sp }); } }
  let maxJump = 0, worst = '', boxesOk = true;
  for (const tr of trees) {
    let prev = null; const box0 = JSON.stringify(tr.m.trunkBox), span0 = JSON.stringify(tr.m.span);
    for (let doy = 0; doy < 365; doy++) {
      const t = new Date(Date.UTC(2027, 0, 1 + doy)), D = dayOf(t.toISOString().slice(0, 10), 'soleil'), f = foliageOf(D, tr.key, tr.sp);
      let top = tr.m.top + tr.m.rx * 0; top = Math.min(...tr.m.segs.map((sg) => sg.y1)); for (const tf of tr.m.tufts) { const st = tuftState(tf, f, D, tr.sp); if (st.size > 0) top = Math.min(top, tf.y - tf.rr * st.size); }
      const hgt = tr.m.foot.y - top; if (prev !== null && Math.abs(hgt - prev) > maxJump) { maxJump = Math.abs(hgt - prev); worst = `${tr.name} jour ${doy}`; } prev = hgt;
      if (JSON.stringify(tr.m.trunkBox) !== box0 || JSON.stringify(tr.m.span) !== span0) boxesOk = false;
    }
  }
  return { arbres: trees.length, boitesIdentiques: boxesOk, sautMaxPx: Number(maxJump.toFixed(2)), pire: worst };
}
const Q = new URLSearchParams(location.search);
if (Q.has('w')) W = Number(Q.get('w'));
if (Q.get('audit') === 'vert') { window.__audit = auditVert(Number(Q.get('seed') || 7)); window.__ids = []; window.__done = true; }
else if (Q.get('audit') === 'squelette') { window.__audit = auditSquelette(Number(Q.get('seed') || 7)); window.__ids = []; window.__done = true; }
else if (Q.has('T')) { // débogage : ?T=18.5&seed=7&date=2026-10-27&meteo=soleil&view=x0,y0,w,h,scale&avant=1
  const seed = Number(Q.get('seed') || 7), D = dayOf(Q.get('date') || AUT, Q.get('meteo') || 'soleil');
  const v = (Q.get('view') || `0,0,${W},${H},2`).split(',').map(Number); const view = { x0: v[0], y0: v[1], w: v[2], h: v[3], scale: v[4] };
  renderScene(canvasFor('dbg', view.w * view.scale, view.h * view.scale, 'dbg ' + fmtT(+Q.get('T'))), seed, +Q.get('T'), D, view, Q.has('avant')); window.__ids = ['dbg']; window.__done = true;
} else if (Q.has('h')) runAnimated(Q); else renderCaptures();
