// ───────────── composition, caches, étalonnage de nuit, galerie, mode animé ─────────────
// Ordre des calques (le même que proposé pour l'appli, notes.md §3) :
//   ciel → fond statique (colline, échappée, maisons, repères) → vie de la colline (découpe : au-dessus du mur du fond et du
//   premier plan) → mur du fond statique → vie du mur (découpe : au-dessus du premier plan) → premier plan (vrai peintre, bundle
//   RUE) → étalonnage de nuit (feColorMatrix de grade.ts sur tout) → lumières (hors étalonnage, mêmes découpes).
const CACHE = new Map();
function cached(key, w, h, paint) {
  if (!CACHE.has(key)) { const c = document.createElement('canvas'); c.width = w; c.height = h; paint(c.getContext('2d')); CACHE.set(key, c); if (CACHE.size > 40) CACHE.delete(CACHE.keys().next().value); }
  return CACHE.get(key);
}
const bucket10 = (T) => Math.floor(T * 6) / 6;
// Premier plan (vrai paintCityTile, fond transparent) + ombres D3 corrigées : une fois par graine et par échelle.
const fgCanvas = (F, scale) => cached(`fg|${F.seed}|${scale}`, W * scale, H * scale, (ctx) => { ctx.scale(scale, scale); for (let t = 0; t < tileCount(W); t++) { ctx.save(); ctx.beginPath(); ctx.rect(t * 360, 0, 360, H); ctx.clip(); paintCityTile(ctx, F.plan, t); ctx.restore(); } paintNearShadows(ctx, F); });
// Verdure de la rue (par-dessus le premier plan) : une fois par graine, échelle, saison et neige.
const rueCanvas = (F, env, scale) => { F.rue ||= streetVerdure(F); return cached(`rue|${F.seed}|${scale}|${env.D.season}|${env.D.meteo.snow ? 'n' : ''}`, W * scale, H * scale, (ctx) => { ctx.scale(scale, scale); paintRueVerdure(ctx, F, env); }); };
// Décor actuel (bundle AVANT) : captures « avant ».
const avantCanvas = (seed, scale) => cached(`avant|${seed}|${scale}`, W * scale, H * scale, (ctx) => { ctx.scale(scale, scale); const plan = AVANT.cityPaintPlan(W, H, seed); for (let t = 0; t < AVANT.tileCount(W); t++) { ctx.save(); ctx.beginPath(); ctx.rect(t * 360, 0, 360, H); ctx.clip(); AVANT.paintCityTile(ctx, plan, t); ctx.restore(); } });
// Fond statique (poses lentes : tranche de 10 min, date, météo).
const fondCanvas = (F, env, scale) => cached(`fond|${F.seed}|${scale}|${env.D.date}|${env.D.meteo === METEO.soleil ? 's' : env.D.meteo.snow ? 'n' : env.D.meteo.precip > 0 ? 'p' : env.D.meteo.fog > 0.4 ? 'b' : 'c'}|${bucket10(env.T)}`, W * scale, H * scale, (ctx) => { ctx.scale(scale, scale); paintFondStatic(ctx, F, { ...env, T: bucket10(env.T) }); });
const murCanvas = (F, env, scale) => cached(`mur|${F.seed}|${scale}|${env.D.date}|${env.D.meteo.precip > 0 ? 'p' : env.D.meteo.snow ? 'n' : 'c'}|${bucket10(env.T)}`, W * scale, H * scale, (ctx) => { ctx.scale(scale, scale); paintFarStatic(ctx, F, { ...env, T: bucket10(env.T) }); });

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
const newCounter = () => ({ vehicules: 0, fumees: 0, oiseaux: 0, fenetres: 0, drapeaux: 0, brume: 0, grue: 0, arbres: 0 });

// Rend la scène corrigée (après) à l'instant T. view = { x0, y0, w, h, scale }. `avant` : décor actuel à la place (même ciel, même nuit).
function renderScene(ctx, seed, T, D, view, avant = false) {
  const F = fondPlanOf(seed), env = envAt(T, D), S = view.scale, counter = newCounter();
  const base = layer('base', W * S, H * S), b = base.getContext('2d');
  b.setTransform(1, 0, 0, 1, 0, 0); b.clearRect(0, 0, base.width, base.height); b.scale(S, S);
  paintSky(b, env);
  if (avant) b.drawImage(avantCanvas(seed, S), 0, 0, W, H);
  else {
    b.drawImage(fondCanvas(F, env, S), 0, 0, W, H);
    paintVieColline(b, F, env, counter);
    b.drawImage(murCanvas(F, env, S), 0, 0, W, H);
    paintVieMur(b, F, env, counter);
    b.drawImage(fgCanvas(F, S), 0, 0, W, H);
    b.drawImage(rueCanvas(F, env, S), 0, 0, W, H);
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
const escapeView = (F, k = 0, scale = 3) => { const e = F.escapes[k]; return { x0: Math.max(0, Math.round(e.x - 60)), y0: 30, w: 260, h: 140, scale }; };
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
const pitView = (F, scale = 3) => { F.rue ||= streetVerdure(F); const p = F.rue.find((v) => v.kind === 'pit' && !v.empty && v.flowers && v.x > 80) || F.rue.find((v) => v.kind === 'pit'); return { x0: Math.max(0, Math.round(p.x - 80)), y0: F.ground - 85, w: 160, h: 120, scale }; };
const bedView = (F, scale = 3) => { F.rue ||= streetVerdure(F); const p = F.rue.find((v) => v.kind === 'parterre' && v.x0 > 80) || F.rue.find((v) => v.kind === 'bac'); return { x0: Math.max(0, Math.round(p.x0 + p.w / 2 - 80)), y0: F.ground - 85, w: 160, h: 120, scale }; };
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
  for (const seed of [1, 7, 42]) {
    for (const [tag, avant] of [['avant', true], ['apres', false]]) {
      const id = `${tag}-graine${seed}`; renderScene(canvasFor(id, W * 2, H * 2, `${id} — ${avant ? 'décor actuel' : 'fond corrigé (D1 à D6) et vie du fond'}, 7 juillet 15 h`), seed, 15 + 0.3 * MIN, D15, fullView(2), avant); ids.push(id);
    }
  }
  for (const [tag, avant] of [['avant', true], ['apres', false]]) { const id = `${tag}-graine7-nuit`; renderScene(canvasFor(id, W * 2, H * 2, `${id} — 27 octobre 23 h`), 7, 23 + 0.2 * MIN, D23, fullView(2), avant); ids.push(id); }
  // Moments (graine 7).
  for (const m of MOMENTS) { const D = dayOf(m.date, m.meteo); renderScene(canvasFor(m.id, W * 2, H * 2, `${m.id} — ${m.note}`), 7, m.T, D, fullView(2)); ids.push(m.id); }
  // Rue (graine 7) : saisons et nuit, vue de la rue seule (toits du premier plan → chaussée).
  const RUE_VIEW = { x0: 0, y0: 70, w: W, h: H - 70, scale: 2 };
  const RUES = [
    { id: 'rue-printemps-11h', T: 11 + 0.2 * MIN, date: '2027-04-20', meteo: 'soleil', note: 'mardi 20 avril, 11 h — tulipes aux pieds d’arbres, bacs et parterres, glycine en fleurs, arbres en jeunes feuilles' },
    { id: 'rue-ete-15h', T: 15 + 0.3 * MIN, date: ETE, meteo: 'soleil', note: '7 juillet, 15 h — platanes, tilleuls et marronniers en feuilles, géraniums et lavande' },
    { id: 'rue-automne-15h', T: 15 + 0.3 * MIN, date: AUT, meteo: 'soleil', note: '27 octobre, 15 h — feuillages roux, feuilles mortes sur le trottoir, chrysanthèmes, vigne vierge rouge' },
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
  [0, 2, 5, 9].forEach((s, i) => { const id = `fumee-seq-${i + 1}`; renderScene(canvasFor(id, sv.w * 4, sv.h * 4, `${id} — la fumée naît au conduit : 8 h 30 + ${s} s, 10 février (×4)`), 7, 8.5 + s * SEC, DH, sv); ids.push(id); });
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
  const ctx = canvasFor('anim', view.w * view.scale, view.h * view.scale, `${D.date} · graine ${seed} · ${q.get('meteo') || 'soleil'} — espace : pause · ← → : ±10 min · + − : vitesse (minutes de scène par seconde)`);
  let paused = false, last = performance.now(), spd = spd0;
  addEventListener('keydown', (e) => { if (e.key === ' ') paused = !paused; else if (e.key === 'ArrowLeft') T -= 10 * MIN; else if (e.key === 'ArrowRight') T += 10 * MIN; else if (e.key === '+') spd *= 1.5; else if (e.key === '-') spd /= 1.5; });
  const frame = (now) => {
    const dt = (now - last) / 1000; last = now; if (!paused) T = ((T + dt * spd * MIN) % 24 + 24) % 24;
    const r = renderScene(ctx, seed, T, D, view);
    if (q.get('hud') !== '0') { const c = r.counter; ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, 0, 560, 16); ctx.fillStyle = '#fff'; ctx.font = '11px sans-serif'; ctx.fillText(`${fmtT(T)} · ×${spd.toFixed(1)} · animés en vue : véhicules ${c.vehicules}, fumées ${c.fumees}, oiseaux ${c.oiseaux}, arbres ${c.arbres}, drapeaux ${c.drapeaux}, brume ${c.brume}, grue ${c.grue} · fenêtres allumées ${c.fenetres}`, 4, 12); ctx.restore(); }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
const Q = new URLSearchParams(location.search);
if (Q.has('T')) { // débogage : ?T=18.5&seed=7&date=2026-10-27&meteo=soleil&view=x0,y0,w,h,scale&avant=1
  const seed = Number(Q.get('seed') || 7), D = dayOf(Q.get('date') || AUT, Q.get('meteo') || 'soleil');
  const v = (Q.get('view') || `0,0,${W},${H},2`).split(',').map(Number); const view = { x0: v[0], y0: v[1], w: v[2], h: v[3], scale: v[4] };
  renderScene(canvasFor('dbg', view.w * view.scale, view.h * view.scale, 'dbg ' + fmtT(+Q.get('T'))), seed, +Q.get('T'), D, view, Q.has('avant')); window.__ids = ['dbg']; window.__done = true;
} else if (Q.has('h')) runAnimated(Q); else renderCaptures();
