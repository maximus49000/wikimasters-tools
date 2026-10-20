// ───────────── arbres au vent et à la météo (rue et colline), particules, moulin ─────────────
// Rendu proposé pour l'appli (notes.md §3 c) : houppier cuit en 5 couches par arbre de rue (charpentières, rameaux + voile,
// masses basses, masses hautes, rehauts), chaque couche un nœud à transformation de cisaillement autour du pied ; arbres de la
// colline regroupés par tranches de 96 px et par rang (un cisaillement par tranche) ; particules plafonnées. La maquette fait
// exactement cela avec des canvas cuits (`treeSprites`) et `ctx.transform`. prefers-reduced-motion (`?motion=0`) : tout immobile.

// ── Champ de vent : fonction pure de (x, t), tirée de la météo (force, direction). Base turbulente (ondes progressives de périodes
// incommensurables, déphasées par la position) + rafales : paquets gaussiens tirés par graine qui traversent la scène dans le
// sens du vent (jamais un balancement sinusoïdal synchrone). Retourne un vent signé ≈ −2…2 (0 = calme).
function gustsAt(t, env) {
  const w = env.D.meteo.wind, dir = env.D.meteo.dir || 1, P = 9 - 5 * w, speed = 50 + 60 * w, out = [];
  for (let k = Math.floor(t / P) - 5; k <= Math.floor(t / P) + 1; k++) { const rk = mulberry32((k * 7919 + 13) >>> 0); out.push({ k, tk: k * P + rk() * P * 0.8, A: 0.6 + rk() * 0.9, L: 120 + rk() * 120, speed, dir, x0: dir > 0 ? -300 : W + 300 }); }
  return out;
}
const gustX = (g, t) => g.x0 + g.dir * g.speed * (t - g.tk);
function windAt(x, t, env) {
  if (!PARAMS.motion) return 0;
  const w = env.D.meteo.wind, dir = env.D.meteo.dir || 1; if (w <= 0.02) return 0;
  let v = 0.35 + 0.25 * Math.sin(t * 0.9 - dir * x * 0.012) + 0.18 * Math.sin(t * 1.7 - dir * x * 0.031 + 1.3) + 0.12 * Math.sin(t * 3.1 - dir * x * 0.07 + 2.1);
  for (const g of gustsAt(t, env)) { const d = (x - gustX(g, t)) / g.L; v += g.A * Math.exp(-d * d) * (0.7 + 0.3 * Math.sin(t * 4 + g.k)); }
  return dir * w * v;
}
// Raideur par essence (peuplier très mobile, platane lourd, jeune arbre nerveux) ; pluie : les branches ploient davantage.
const STIFF = { poplar: 1.6, tilleul: 1.0, platane: 0.7, marronnier: 0.8, cerisier: 1.1, chene: 0.75, bouquet: 1.0, cypress: 0.5 };
const bendOf = (v, wind, env) => Math.max(-0.55, Math.min(0.55, wind * (v.young ? 1.8 : STIFF[v.species] || 1) * (1 + 0.25 * (env.D.meteo.wet || 0)) * (env.D.meteo.storm ? 1.3 : 1) * 0.09));

// ── Sprites cuits des arbres de la rue : une fois par (arbre, date, pluie, neige), 5 couches en coordonnées du monde.
const LAYERS_RUE = ['skel', 'twigs', 'low', 'high', 'hi'];
function treeSprites(F, v, env, S) {
  const D = env.D, key = `sprite|${F.seed}|${S}|${Math.round(v.x)}|${D.date}|${D.meteo.wet || 0}|${D.meteo.snow ? 1 : 0}`;
  if (CACHE.has(key)) return CACHE.get(key);
  const r = v.r, box = { x: v.x - r * 2.2, y: v.y - v.h - r * 2.3, w: r * 4.4, h: v.h + r * 2.3 + 3 };
  const f = foliageOf(D, 'rue' + Math.round(v.x), v.species), cy = v.y - v.h - r * 0.8, k = 'rue' + Math.round(v.x), wet = D.meteo.wet || 0;
  const layers = {};
  for (const layer of ['trunk', ...LAYERS_RUE, 'hiPale']) {
    const c = document.createElement('canvas'); c.width = Math.ceil(box.w * S); c.height = Math.ceil(box.h * S); const ctx = c.getContext('2d'); ctx.scale(S, S); ctx.translate(-box.x, -box.y);
    if (layer === 'trunk') paintRueTrunk(ctx, v, wet);
    else paintCrown(ctx, v.x + v.lean, cy, r, v.species, f, D, k, v.y - v.h, { layer: layer === 'hiPale' ? 'hi' : layer, wet, pale: layer === 'hiPale' });
    layers[layer] = c;
  }
  const out = { box, layers, f, cy };
  CACHE.set(key, out); if (CACHE.size > 120) CACHE.delete(CACHE.keys().next().value);
  return out;
}
// Dessine un calque cisaillé autour du pied (x' = x + (footY − y) · s).
function drawSheared(ctx, canvas, box, footY, s, S, alpha = 1) {
  ctx.save(); ctx.setTransform(S, 0, 0, S, 0, 0); ctx.transform(1, 0, s, 1, -s * footY, 0); ctx.globalAlpha = alpha; ctx.drawImage(canvas, box.x, box.y, box.w, box.h); ctx.restore();
}
function paintArbresRue(ctx, F, env, S, counter) {
  const t = env.seconds, D = env.D, wet = D.meteo.wet || 0;
  for (const v of F.rue) {
    if (v.kind !== 'pit' || v.empty) continue;
    const sp = treeSprites(F, v, env, S), wind = windAt(v.x, t, env), b = bendOf(v, wind, env), foot = v.y;
    if (Math.abs(wind) > 0.03) counter.arbresVent++;
    // Le tronc fléchit peu, les charpentières un peu, les rameaux et masses basses plus, les masses hautes le plus.
    drawSheared(ctx, sp.layers.trunk, sp.box, foot, b * 0.18, S);
    drawSheared(ctx, sp.layers.skel, sp.box, foot, b * 0.35, S);
    drawSheared(ctx, sp.layers.twigs, sp.box, foot, b * 0.8 + 0.03 * Math.sin(t * 7 + v.x) * Math.min(1, Math.abs(wind)), S);
    drawSheared(ctx, sp.layers.low, sp.box, foot, b * 0.7, S);
    drawSheared(ctx, sp.layers.high, sp.box, foot, b * 1.0, S);
    // Frémissement des rehauts par vent faible (scintillement, déphasé par arbre) ; face claire des feuilles retournées sous vent fort.
    if (Math.abs(wind) > 0.04 && sp.f.d > 0.15) { const fl = 0.5 + 0.5 * Math.sin(t * (5 + (v.x % 7)) + v.x * 0.3) * Math.sin(t * 2.3 + v.x); drawSheared(ctx, sp.layers.hi, sp.box, foot, b * 1.0, S, 0.6 * fl * Math.min(1, Math.abs(wind) * 2)); }
    if (Math.abs(wind) > 0.9 && sp.f.d > 0.15) drawSheared(ctx, sp.layers.hiPale, sp.box, foot, b * 1.05, S, Math.min(0.7, (Math.abs(wind) - 0.9) * 0.8) * (0.6 + 0.4 * Math.sin(t * 9 + v.x)));
    paintParticlesArbre(ctx, F, v, sp, env, counter);
    paintBirdsArbre(ctx, F, v, sp, env, counter);
  }
}

// ── Particules (plafonnées, jamais créées sur place : elles naissent au houppier, retombent au sol ou sortent par un bord) ──
const PARTICLE_CAP = { feuilles: 40, petales: 30, gouttes: 24, neige: 16, graines: 20 };
function paintParticlesArbre(ctx, F, v, sp, env, counter) {
  if (!PARAMS.motion) return;
  const t = env.seconds, D = env.D, r = v.r, cx = v.x + v.lean, cy = sp.cy, ground = v.y - 0.5, dir = D.meteo.dir || 1, w = D.meteo.wind;
  const drop = sp.f.drop, petals = v.species === 'cerisier' ? bloomOf(D, 'cerisier') : 0;
  // Feuilles arrachées par les rafales (automne) et pétales (avril) : chaque rafale qui passe l'arbre en détache quelques-unes.
  if (w >= 0.05 && ((drop > 0 && drop < 1 && sp.f.d > 0.1) || petals > 0.3)) {
    for (const g of gustsAt(t, env)) {
      const tp = g.tk + (v.x - g.x0) / (g.dir * g.speed); if (tp > t || t - tp > 45) continue;
      const rk = mulberry32((hashString(`part-${Math.round(v.x)}-${g.k}`)) >>> 0), n = Math.min(5, Math.floor(g.A * 3 * (petals > 0.3 ? petals : drop)));
      for (let j = 0; j < n; j++) {
        if (counter.particules >= (petals ? PARTICLE_CAP.petales : PARTICLE_CAP.feuilles)) break;
        const born = tp + j * 0.18 + rk() * 0.3, a = t - born; if (a < 0) continue;
        const x0 = cx + (rk() - 0.5) * r * 1.6, y0 = cy + (rk() - 0.5) * r * 1.2, vx = dir * (14 + 22 * w) * (0.7 + rk() * 0.6), fallV = petals ? 2.2 : 3.6, flut = 1.5 + rk() * 2;
        const land = (ground - y0) / fallV, aa = Math.min(a, land), x = x0 + vx * aa * (1 - 0.3 * Math.min(1, aa / 4)) + Math.sin(aa * 3 + j) * flut, y = aa >= land ? ground : y0 + fallV * aa - 2.5 * Math.sin(Math.min(aa, 1.2) * 2.6);
        if (a - land > 50 || x < -5 || x > W + 5) continue;
        counter.particules++;
        ctx.save(); ctx.translate(x, y); ctx.rotate(aa * 4 + j); ctx.fillStyle = petals ? '#F6C0D4' : rgba(sp.f.tones[1], 1); ctx.fillRect(-0.9, -0.5, 1.8, 1); ctx.restore();
      }
    }
  }
  // Gouttes après l'averse / sous la pluie : tombent des masses basses, éclaboussent au sol.
  if (D.meteo.wet && sp.f.d > 0.1) { for (let j = 0; j < 3; j++) { const per = 1.1 + j * 0.37, k = Math.floor(t / per), rk = mulberry32((hashString(`goutte-${Math.round(v.x)}-${j}-${k}`)) >>> 0), x = cx + (rk() - 0.5) * r * 1.5, y0 = cy + r * 0.5, a = t - k * per, y = y0 + 40 * a; if (y < ground && counter.particules < 200) { counter.particules++; fillRect(ctx, 'rgba(210,230,255,0.9)', x - 0.25, y - 1.2, 0.5, 1.4); } else if (y >= ground && y < ground + 8) { ctx.strokeStyle = 'rgba(210,230,255,0.6)'; ctx.lineWidth = 0.4; ctx.beginPath(); ctx.arc(x, ground + 0.8, (y - ground) * 0.25, Math.PI, 0); ctx.stroke(); } } }
  // Neige qui glisse des branches (redoux ou rafale) : paquets blancs qui tombent.
  if (D.meteo.snow && (D.meteo.thaw || Math.abs(windAt(v.x, t, env)) > 1)) { for (let j = 0; j < 2; j++) { const per = 2.4 + j * 0.9, k = Math.floor(t / per), rk = mulberry32((hashString(`neige-${Math.round(v.x)}-${j}-${k}`)) >>> 0); if (rk() < 0.5) continue; const x = cx + (rk() - 0.5) * r * 1.6, y0 = cy - r * 0.3 + rk() * r, a = t - k * per, y = y0 + 18 * a * a; if (y < ground) { counter.particules++; disc(ctx, 'rgba(242,246,250,0.95)', x, y, 0.9 - a * 0.1); } } }
  // Graines et chatons en suspension (mai – juin, peupliers et tilleuls) : flocons pâles qui dérivent sous le vent.
  if (D.doy >= 125 && D.doy < 175 && (v.species === 'tilleul' || v.species === 'platane') && w > 0.05) { for (let j = 0; j < 3; j++) { const per = 0.9 + j * 0.5, k = Math.floor(t / per), rk = mulberry32((hashString(`graine-${Math.round(v.x)}-${j}-${k}`)) >>> 0), a = t - k * per, x = cx + (rk() - 0.5) * r + dir * (10 + 15 * w) * a, y = cy - r * 0.2 + 1.5 * a + Math.sin(a * 2 + j) * 1.5; if (a < 8 && y < ground && counter.particules < 200) { counter.particules++; disc(ctx, 'rgba(255,250,235,0.85)', x, y, 0.45); } } }
}
// Oiseaux qui se posent dans un arbre : toutes les ~110 s par bande, un oiseau arrive en vol par un bord, se perche 20-40 s,
// repart par l'autre bord (entrées et sorties en vol). Jamais la nuit ni sous forte pluie.
function paintBirdsArbre(ctx, F, v, sp, env, counter) {
  if (!PARAMS.motion || env.dark || env.D.meteo.precip > 0.4 || sp.f.d < 0.3) return;
  const t = env.seconds, band = Math.floor(v.x / 480), k = Math.floor(t / 110), rk = mulberry32((hashString(`oiseau-${band}-${k}`)) >>> 0);
  const trees = F.rue.filter((p) => p.kind === 'pit' && !p.empty && !p.young && Math.floor(p.x / 480) === band); if (!trees.length || trees[Math.floor(rk() * trees.length)] !== v) return;
  const t0 = k * 110 + rk() * 40, perch = 20 + rk() * 20, a = t - t0, fromLeft = rk() < 0.5, px = v.x + v.lean + (rk() - 0.5) * v.r, py = sp.cy - v.r * 0.3;
  let x, y, flying = true;
  if (a < 0 || a > 6 + perch + 6) return;
  if (a < 6) { const q = smooth(a / 6); x = (fromLeft ? -20 : W + 20) + (px - (fromLeft ? -20 : W + 20)) * q; y = py - 30 * (1 - q) + Math.sin(a * 5) * 1.5; }
  else if (a < 6 + perch) { x = px; y = py; flying = false; }
  else { const q = smooth((a - 6 - perch) / 6); x = px + ((fromLeft ? W + 20 : -20) - px) * q; y = py - 30 * q + Math.sin(a * 5) * 1.5; }
  counter.oiseaux++;
  if (flying) { const flap = Math.sin(a * 14) * 0.8; ctx.strokeStyle = ink(0.85); ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(x - 1.3, y - flap); ctx.lineTo(x, y + 0.3); ctx.lineTo(x + 1.3, y - flap); ctx.stroke(); }
  else { fillRect(ctx, ink(0.85), x - 0.7, y - 1.1, 1.4, 1.1); disc(ctx, ink(0.85), x + (fromLeft ? 0.6 : -0.6), y - 1.3, 0.45); }
}

// ── Colline : calques d'arbres cisaillés par tranches de 96 px autour de la base du rang ; les rameaux d'hiver bougent avec.
const SLICE = 96;
function drawHillTrees(ctx, canvas, env, S, baseY, factor, counter) {
  const t = env.seconds;
  for (let x = 0; x < W; x += SLICE) {
    const wind = windAt(x + SLICE / 2, t, env), s = Math.max(-0.12, Math.min(0.12, wind * factor * 0.05));
    if (Math.abs(s) > 0.002) counter.tranchesVent++;
    ctx.save(); ctx.setTransform(S, 0, 0, S, 0, 0); ctx.beginPath(); ctx.rect(x - 6, 0, SLICE + 12, H); ctx.clip(); ctx.transform(1, 0, s, 1, -s * baseY, 0); ctx.drawImage(canvas, 0, 0, W, H); ctx.restore();
  }
}
// Moulin : les ailes tournent avec le vent local (vitesse ∝ force, à-coups des rafales), figées par calme plat.
function paintMillSails(ctx, m, env) {
  const t = env.seconds, w = env.D.meteo.wind, local = PARAMS.motion ? Math.abs(windAt(m.x, t, env)) : 0, hub = { x: m.x - 0.5 * m.s, y: m.y - 13 * m.s }, s = m.s, hz = 0.34;
  const ang = m.phase + (PARAMS.motion ? t * (0.15 + 1.1 * w) + 0.35 * Math.sin(t * 0.37) + local * 0.2 : 0);
  ctx.strokeStyle = ink(0.8 - hz); ctx.lineCap = 'butt';
  for (let k = 0; k < 4; k++) { const a = ang + (k * Math.PI) / 2, ex = hub.x + Math.cos(a) * 9 * s, ey = hub.y + Math.sin(a) * 9 * s; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(hub.x, hub.y); ctx.lineTo(ex, ey); ctx.stroke(); ctx.fillStyle = rgba(haze(hexRgb('#F0E8D0'), hz), 0.85); ctx.beginPath(); ctx.moveTo(hub.x + Math.cos(a) * 2 * s, hub.y + Math.sin(a) * 2 * s); ctx.lineTo(ex, ey); ctx.lineTo(ex + Math.cos(a + Math.PI / 2) * 2.2 * s, ey + Math.sin(a + Math.PI / 2) * 2.2 * s); ctx.lineTo(hub.x + Math.cos(a) * 2 * s + Math.cos(a + Math.PI / 2) * 2.2 * s, hub.y + Math.sin(a) * 2 * s + Math.sin(a + Math.PI / 2) * 2.2 * s); ctx.closePath(); ctx.fill(); ctx.lineWidth = 0.35; ctx.stroke(); }
  disc(ctx, ink(0.85 - hz), hub.x, hub.y, 0.8 * s);
}
