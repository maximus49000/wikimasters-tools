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

// ── Sprites cuits des arbres de la rue : par (arbre, date, pluie, neige) : ombre, fût, charpentières, rameaux (+ voile, neige,
// feuilles sèches), puis 4 grappes de touffes (basses / hautes × intérieures / bout des branches). Le fût et les charpentières
// sont dessinés tels quels (jamais transformés) ; les rameaux fléchissent à peine ; les grappes se déplacent (vent) ; les
// touffes « lâches » (sur le point de tomber) sont dessinées une à une et frémissent plus.
function treeSprites(F, v, env, S) {
  const D = env.D, key = `sprite|${F.seed}|${S}|${Math.round(v.x)}|${D.date}|${D.meteo.wet || 0}|${D.meteo.snow ? 1 : 0}`;
  if (CACHE.has(key)) return CACHE.get(key);
  const m = rueModel(v), f = foliageOf(D, 'rue' + Math.round(v.x), v.species), wet = D.meteo.wet || 0, pad = v.r * 0.6;
  const box = { x: m.span[0] - pad - 6, y: m.top - pad - 4, w: m.span[1] - m.span[0] + 2 * pad + 12, h: v.y - m.top + 2 * pad + 6 };
  const layers = {}, mk = () => { const c = document.createElement('canvas'); c.width = Math.ceil(box.w * S); c.height = Math.ceil(box.h * S); const ctx = c.getContext('2d'); ctx.scale(S, S); ctx.translate(-box.x, -box.y); return [c, ctx]; };
  let [c, ctx] = mk(); paintLeaves(ctx, m, f, D, { part: 'shadow' }); layers.shadow = c;
  [c, ctx] = mk(); paintTrunk(ctx, m, rueBark(v), 0, wet, v.young); paintTuteur(ctx, v); paintBranches(ctx, m, 'coarse'); layers.trunk = c;
  [c, ctx] = mk(); paintBranches(ctx, m, 'fine', { veil: 0.12 * (1 - f.d), snow: D.meteo.snow }); paintDryLeaves(ctx, m, D); layers.twigs = c;
  for (let k = 0; k < 4; k++) { [c, ctx] = mk(); paintLeaves(ctx, m, f, D, { which: k, wet, loose: false }); layers['c' + k] = c; }
  const out = { box, layers, f, m };
  CACHE.set(key, out); if (CACHE.size > 160) CACHE.delete(CACHE.keys().next().value);
  return out;
}
const CLUSTER_AMP = [0.7, 1.6, 0.95, 2.1]; // basses-intérieures, basses-bout, hautes-intérieures, hautes-bout (px par unité de vent)
function paintArbresRue(ctx, F, env, S, counter) {
  const t = env.seconds, D = env.D, wet = D.meteo.wet || 0;
  for (const v of F.rue) {
    if (v.kind !== 'pit' || v.empty) continue;
    const sp = treeSprites(F, v, env, S), m = sp.m, wind = windAt(v.x, t, env), stiff = (v.young ? 1.8 : STIFF[v.species] || 1) * (1 + 0.25 * wet) * (D.meteo.storm ? 1.3 : 1), b = wind * stiff;
    if (Math.abs(wind) > 0.03) counter.arbresVent++;
    ctx.setTransform(S, 0, 0, S, 0, 0);
    ctx.drawImage(sp.layers.shadow, sp.box.x, sp.box.y, sp.box.w, sp.box.h);
    ctx.drawImage(sp.layers.trunk, sp.box.x, sp.box.y, sp.box.w, sp.box.h);                       // fût et charpentières : jamais déplacés
    // Rameaux fins : léger fléchissement (cisaillement de 3 % de b autour de la racine des charpentières).
    ctx.save(); ctx.transform(1, 0, 0.03 * b, 1, -0.03 * b * m.rootY, 0); ctx.drawImage(sp.layers.twigs, sp.box.x, sp.box.y, sp.box.w, sp.box.h); ctx.restore();
    // Grappes de feuilles : translation propre (amplitude par grappe, déphasage par arbre et par grappe, rafales), plus forte au bout et en haut.
    for (let k = 0; k < 4; k++) {
      const ph = v.x * 0.37 + k * 1.9, osc = 0.7 + 0.3 * Math.sin(t * (2.6 + k * 0.7) + ph) + 0.15 * Math.sin(t * 7.3 + ph * 2), dx = b * CLUSTER_AMP[k] * osc, dy = -Math.abs(b) * 0.25 * (k >= 2 ? 1 : 0.5) * (0.5 + 0.5 * Math.sin(t * 3.1 + ph));
      ctx.drawImage(sp.layers['c' + k], sp.box.x + dx, sp.box.y + dy, sp.box.w, sp.box.h);
    }
    ctx.setTransform(S, 0, 0, S, 0, 0);
    // Touffes lâches (automne : sur le point de tomber), frémissement des rehauts par vent faible, face claire sous vent fort.
    paintLeaves(ctx, m, sp.f, D, { loose: true, wet, shiftX: b * 2.6 * (0.6 + 0.4 * Math.sin(t * 9 + v.x)), shiftY: -Math.abs(b) * 0.5 });
    if (Math.abs(wind) > 0.04 && sp.f.d > 0.1) { ctx.globalAlpha = 0.5 * Math.min(1, Math.abs(wind) * 2) * (0.5 + 0.5 * Math.sin(t * (5 + (v.x % 7)) + v.x * 0.3) * Math.sin(t * 2.3 + v.x)); paintLeaves(ctx, m, sp.f, D, { part: 'hi', wet, shiftX: b * 1.4 }); ctx.globalAlpha = 1; }
    if (Math.abs(wind) > 0.9 && sp.f.d > 0.1) { ctx.globalAlpha = Math.min(0.7, (Math.abs(wind) - 0.9) * 0.8) * (0.6 + 0.4 * Math.sin(t * 9 + v.x)); paintLeaves(ctx, m, sp.f, D, { part: 'hi', pale: true, shiftX: b * 1.6 }); ctx.globalAlpha = 1; }
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
  // Feuilles qui quittent l'arbre (automne) ou pétales (avril) : à chaque rafale qui passe, quelques touffes LÂCHES lâchent des
  // feuilles de leur couleur, depuis leur position ; elles dérivent, tournoient, retombent au sol et y restent.
  if (w >= 0.05 && ((drop > 0 && drop < 1) || petals > 0.3)) {
    const loose = sp.m.tufts.map((tf) => ({ tf, st: tuftState(tf, sp.f, D, v.species) })).filter((o) => petals > 0.3 ? o.st.size > 0 && o.tf.rank > 0.5 : o.st.loose && o.st.size > 0);
    if (loose.length) for (const g of gustsAt(t, env)) {
      const tp = g.tk + (v.x - g.x0) / (g.dir * g.speed); if (tp > t || t - tp > 60) continue;
      const rk = mulberry32((hashString(`part-${Math.round(v.x)}-${g.k}`)) >>> 0), n = Math.min(6, 1 + Math.floor(g.A * 3));
      for (let j = 0; j < n; j++) {
        if (counter.particules >= (petals ? PARTICLE_CAP.petales : PARTICLE_CAP.feuilles)) break;
        const o = loose[Math.floor(rk() * loose.length)], born = tp + j * 0.2 + rk() * 0.3, a = t - born; if (a < 0) continue;
        const x0 = o.tf.x + (rk() - 0.5) * o.tf.rr, y0 = o.tf.y + (rk() - 0.5) * o.tf.rr, vx = dir * (14 + 22 * w) * (0.7 + rk() * 0.6), fallV = petals ? 2.2 : 3.6, flut = 1.5 + rk() * 2;
        const land = (ground - y0) / fallV, aa = Math.min(a, land), x = x0 + vx * aa * (1 - 0.3 * Math.min(1, aa / 4)) + Math.sin(aa * 3 + j) * flut, y = aa >= land ? ground : y0 + fallV * aa - 2.5 * Math.sin(Math.min(aa, 1.2) * 2.6);
        if (a - land > 50 || x < -5 || x > W + 5) continue;
        counter.particules++;
        ctx.save(); ctx.translate(x, y); ctx.rotate(aa * 4 + j); ctx.fillStyle = petals ? '#F6C0D4' : rgba(o.st.tones[1], 1); ctx.fillRect(-0.9, -0.5, 1.8, 1); ctx.restore();
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
  const t0 = k * 110 + rk() * 40, perch = 20 + rk() * 20, a = t - t0, fromLeft = rk() < 0.5, px = sp.m.cx + (rk() - 0.5) * v.r, py = sp.m.cy - v.r * 0.3;
  let x, y, flying = true;
  if (a < 0 || a > 6 + perch + 6) return;
  if (a < 6) { const q = smooth(a / 6); x = (fromLeft ? -20 : W + 20) + (px - (fromLeft ? -20 : W + 20)) * q; y = py - 30 * (1 - q) + Math.sin(a * 5) * 1.5; }
  else if (a < 6 + perch) { x = px; y = py; flying = false; }
  else { const q = smooth((a - 6 - perch) / 6); x = px + ((fromLeft ? W + 20 : -20) - px) * q; y = py - 30 * q + Math.sin(a * 5) * 1.5; }
  counter.oiseaux++;
  if (flying) { const flap = Math.sin(a * 14) * 0.8; ctx.strokeStyle = ink(0.85); ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(x - 1.3, y - flap); ctx.lineTo(x, y + 0.3); ctx.lineTo(x + 1.3, y - flap); ctx.stroke(); }
  else { fillRect(ctx, ink(0.85), x - 0.7, y - 1.1, 1.4, 1.1); disc(ctx, ink(0.85), x + (fromLeft ? 0.6 : -0.6), y - 1.3, 0.45); }
}

// ── Colline : seuls les calques de FEUILLAGE (`T*c`) ondulent, par tranches de 96 px : translation horizontale ∝ vent local
// (déphasée par tranche) et cisaillement de 1,5 % autour de la base du rang ; les fûts et branches (`T*k`) restent plantés.
const SLICE = 96;
function drawHillCanopy(ctx, canvas, env, S, baseY, factor, counter) {
  const t = env.seconds;
  for (let x = 0; x < W; x += SLICE) {
    const wind = windAt(x + SLICE / 2, t, env), osc = 0.75 + 0.25 * Math.sin(t * 2.9 + x * 0.05), dx = Math.max(-2, Math.min(2, wind * factor * 1.1 * osc)), s = Math.max(-0.03, Math.min(0.03, wind * factor * 0.015));
    if (Math.abs(dx) > 0.02) counter.tranchesVent++;
    ctx.save(); ctx.setTransform(S, 0, 0, S, 0, 0); ctx.beginPath(); ctx.rect(x - 6, 0, SLICE + 12, H); ctx.clip(); ctx.transform(1, 0, s, 1, -s * baseY + dx, 0); ctx.drawImage(canvas, 0, 0, W, H); ctx.restore();
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
