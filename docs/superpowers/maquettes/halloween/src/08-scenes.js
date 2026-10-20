// ───────────── rue, scène, captures, animation, planche ─────────────
const W = 900, H = 400, GROUND = 300, SEED = 20261018;
function streetLots(seed) {
  const rng = mulberry32(seed ^ hashString('lots'));
  const out = []; let x = 8;
  const plan = [[96, 200], [58, 150], [110, 215], [66, 128], [84, 190], [46, 108], [100, 205], [72, 160], [90, 182]];
  for (const [w, h] of plan) { const jw = w + (rng() - 0.5) * 8, jh = h + (rng() - 0.5) * 16; out.push({ x, w: jw, h: jh }); x += jw + (rng() < 0.5 ? 0 : 6 + rng() * 12); }
  return out;
}
function farRow(seed) {
  const rng = mulberry32(seed ^ hashString('far')); const out = []; let x = -10;
  while (x < W + 20) { const w = 36 + rng() * 34, h = 150 + rng() * 90; out.push({ x, w, h, wall: pick(['#D8CCB8', '#D0C4B4', '#CCBFAE', '#DCD0BE'], rng), roof: pick(['#8A94A4', '#B8705A', '#7A8898'], rng) }); x += w - 3; }
  return out;
}
function paintFar(ctx, far) {
  const haze = isNight() ? 0.35 : 0.3;
  for (const b of far) {
    const wc = mix(hex(b.wall), hex('#9AAFD0'), haze), top = GROUND - b.h;
    fillRect(ctx, wc, b.x, top + 6, b.w, b.h - 6); fillRect(ctx, shade(wc, 0.2), b.x + b.w * 0.72, top + 6, b.w * 0.28, b.h - 6);
    fillRect(ctx, mix(hex(b.roof), hex('#9AAFD0'), haze), b.x - 1, top, b.w + 2, 6); inkRect(ctx, b.x - 1, top, b.w + 2, 6, 0.5);
    const r = mulberry32(Math.round(b.x * 13)); const cols = Math.max(1, Math.floor((b.w - 6) / 9));
    for (let k = 0; k < 8; k++) { const c = Math.floor(r() * cols), row = Math.floor(r() * 4); const wx = b.x + 4 + c * 9, wy = top + 11 + row * 12; const lit = isNight() && r() < ENV.litFrac * 0.8; ctx.fillStyle = lit ? (r() < 0.3 ? LIT.tv : LIT.warm) : col(mix(hex(isNight() ? GLASS_NIGHT : '#6A90C0'), hex('#9AAFD0'), haze)); ctx.fillRect(wx, wy, 3.5, 5); }
    inkRect(ctx, b.x, top + 6, b.w, b.h - 6, 0.5);
  }
}
function paintStreet(ctx) {
  const night = isNight();
  fillRect(ctx, '#E6D4AE', 0, GROUND, W, 22); fillRect(ctx, shade(hex('#E6D4AE'), 0.2), 0, GROUND + 20, W, 2);
  fillRect(ctx, '#B49E7A', 0, GROUND + 22, W, H - GROUND - 22);
  inkLine(ctx, [[0, GROUND + 22], [W, GROUND + 22]], 0.8);
  for (let lx = 110; lx < W; lx += 260) {
    if (night) { ctx.fillStyle = 'rgba(255,222,150,0.22)'; ctx.beginPath(); ctx.moveTo(lx - 5, GROUND - 34); ctx.lineTo(lx + 5, GROUND - 34); ctx.lineTo(lx + 30, GROUND + 22); ctx.lineTo(lx - 30, GROUND + 22); ctx.closePath(); ctx.fill(); ctx.fillStyle = 'rgba(255,222,150,0.25)'; ctx.beginPath(); ctx.ellipse(lx, GROUND + 20, 32, 5, 0, 0, TAU); ctx.fill(); }
    fillRect(ctx, '#2E3A3A', lx - 0.9, GROUND - 32, 1.8, 52); fillRect(ctx, '#2E3A3A', lx - 3, GROUND - 38, 6, 6); fillRect(ctx, night ? '#FFF0B0' : '#D8E8F0', lx - 2.2, GROUND - 37, 4.4, 4.4); inkRect(ctx, lx - 3, GROUND - 38, 6, 6, 0.6);
  }
}
// Marcheurs de la rue (pantins couleur, 13 px) ; celui qui entre est coupé par l'arche de la porte et s'enfonce dans le hall.
function paintWalkers(ctx, f, sc) {
  const night = isNight();
  for (const wk of sc.street.walkers) {
    const h = 13 * wk.mem.size, y = GROUND + 5;
    if (wk.entering > 0) {
      const d = f.door; ctx.save(); ctx.beginPath(); ctx.moveTo(d.x - d.w / 2, GROUND + 6); ctx.lineTo(d.x - d.w / 2, GROUND - d.h + d.w / 2); ctx.arc(d.x, GROUND - d.h + d.w / 2, d.w / 2, Math.PI, 0); ctx.lineTo(d.x + d.w / 2, GROUND + 6); ctx.closePath(); ctx.clip();
      const k = 1 - wk.entering * 0.2; ctx.globalAlpha = 1 - wk.entering * 0.6;
      drawFigure(ctx, d.x - d.w * 0.2, lerp(y, GROUND - 1, wk.entering), h * k, walkPose(wk.ph), wk.facing, { mem: wk.mem, amb: true });
      ctx.restore(); continue;
    }
    drawFigure(ctx, wk.x, y, h, walkPose(wk.ph), wk.facing, { mem: wk.mem, amb: true });
  }
}
// Silhouette dans la cage : monte (ou descend) palier après palier, visible dans chaque petite fenêtre de la cage.
function paintStairFigure(ctx, f, sc) {
  const sf = sc.street.stairFig; if (!sf || !isNight() || !sc.street.stairLit) return;
  const wins = f.windows.filter((w) => w.kind === 'stair');
  const lv = f.levels.find((l) => l.idx === sf.floor); if (!lv) return;
  const y0 = GROUND - GF - f.entresol, y1 = lv.y + lv.h, frac = sf.up ? sf.frac : 1 - sf.frac;
  const fy = lerp(y0, y1, frac) + 1.2, h = lv.h * 0.5;
  const flights = Math.max(1, sf.floor + 1), ph = frac * flights * 2, dir = Math.floor(ph) % 2 ? -1 : 1;
  const cx = f.bayX(f.stairBay) + (ph % 1 - 0.5) * 4 * dir;
  for (const w of wins) { if (fy - h > w.y + w.h || fy < w.y) continue; ctx.save(); ctx.beginPath(); ctx.rect(w.x, w.y, w.w, w.h); ctx.clip(); drawFigure(ctx, cx, fy, h, { ...walkPose(sc.T / SEC / 0.9), torso: 12 }, dir, { silhouette: SILH }); ctx.restore(); }
}
function paintTruck(ctx, x, sc) {
  const T = sc.T; if (T < 9.0 || T > 12.3) return;
  const y = GROUND + 22;
  fillRect(ctx, '#F2F0E8', x, y - 20, 44, 18); fillRect(ctx, '#2E4A6E', x, y - 9, 44, 3); fillRect(ctx, '#E8E4D8', x + 44, y - 13, 12, 11); fillRect(ctx, '#BBD8F0', x + 46, y - 12, 8, 5);
  inkRect(ctx, x, y - 20, 44, 18, 0.8); inkRect(ctx, x + 44, y - 13, 12, 11, 0.8); disc(ctx, '#2A2A2A', x + 8, y - 1, 3); disc(ctx, '#2A2A2A', x + 48, y - 1, 3);
  ctx.fillStyle = INK; ctx.font = 'bold 3px sans-serif'; ctx.fillText('DÉMÉNAGEMENT', x + 4, y - 14);
  // rampe + un déménageur qui fait la navette carton → porte (cycle 50 s)
  inkLine(ctx, [[x, y - 3], [x - 10, y]], 1);
  const s = T / SEC, cyc = (s % 50) / 50, toDoor = cyc < 0.5, p = toDoor ? cyc / 0.5 : (cyc - 0.5) / 0.5;
  const mx = toDoor ? lerp(x - 10, sc.doorX + 2, p) : lerp(sc.doorX + 2, x - 10, p);
  const P = toDoor ? { ...walkPose(s / 0.9), aL: [70, -20], aR: [70, -20], torso: -4 } : walkPose(s / 0.9);
  const J = drawFigure(ctx, mx, GROUND + 5, 13, P, toDoor ? (sc.doorX > x ? 1 : -1) : (sc.doorX > x ? -1 : 1), { mem: { shirt: '#2E4A6E', pants: '#2E3A4A', skin: '#D9A070' }, amb: true });
  if (toDoor) { fillRect(ctx, '#C8A070', mx + J.hR[0] - 2.2, GROUND + 5 + J.hR[1] - 3.2, 4.4, 3.4); inkRect(ctx, mx + J.hR[0] - 2.2, GROUND + 5 + J.hR[1] - 3.2, 4.4, 3.4, 0.5); }
}

// ───────────── construction de la rue pour un jour donné ─────────────
const STREETS = new Map();
function buildStreet(D) {
  const key = D.date + '|' + D.event;
  if (STREETS.has(key)) return STREETS.get(key);
  const lots = streetLots(SEED), far = farRow(SEED);
  const facades = lots.map((b, i) => facadeLayout(b, GROUND, SEED, i === 4 ? { kind: 'haussmann', stair: true, tabatiere: true } : {}));
  const hero = facades[4];
  // immeuble héros : foyers imposés par étage pour que chaque capture montre ce qu'elle doit
  const rng = mulberry32(77);
  const byLevel = (lvl) => hero.homes.filter((h) => h.hh && h.level.level === lvl);
  const nobles = byLevel('noble'), tops = byLevel('top'), stds = hero.homes.filter((h) => h.hh && h.level.level === 'std');
  const forced = new Map();
  if (nobles[0]) { nobles[0].hh = makeHousehold('retraite', rng); forced.set(nobles[0], { water: 10.95, rug: 11.0 }); }
  if (stds[0]) { stds[0].hh = makeHousehold('couple', rng); stds[0].hh.smoker = true; forced.set(stds[0], { jitter: 0.117, jitter2: 0.45 }); }
  if (stds[1]) { stds[1].hh = makeHousehold('famille', rng); forced.set(stds[1], { jitter: 0.1, jitter2: 0.3 }); }
  if (stds[2]) stds[2].hh = makeHousehold('solo', rng);
  if (tops[0]) { tops[0].hh = makeHousehold('etudiant', rng); tops[0].hh.late = false; forced.set(tops[0], { jitter2: 0.02 }); }
  // ailleurs : un étudiant qui rentre à 0 h 26, un retraité qui secoue son tapis à 11 h, une coloc au balcon
  let lateDone = false, rugDone = false, colocDone = false;
  for (const f of facades) { if (f === hero) continue; for (const hm of f.homes) { if (!hm.hh) continue;
    if (!lateDone && hm.hh.type === 'etudiant') { forced.set(hm, { lateReturn: true }); lateDone = true; }
    else if (!rugDone && hm.hh.type === 'retraite') { forced.set(hm, { rug: 11.0, water: 10.9 }); rugDone = true; }
    else if (!colocDone && hm.balcony && hm.level.level === 'noble') { hm.hh = makeHousehold('coloc', rng); forced.set(hm, { jitter2: 0.1 }); colocDone = true; } } }
  for (const f of facades) for (const hm of f.homes) if (hm.hh) buildSchedule(hm, D, forced.get(hm) || {});
  hero.cat = true;
  hero.flocks = [{ x: hero.x + 8, y: hero.eave - 0.8, phase: 11.005 - 5 * MIN, birds: [{ ox: 0, dir: 1 }, { ox: 4, dir: -1 }, { ox: 9, dir: 1 }] }];
  const right = facades[5]; right.flocks = [{ x: right.x + 6, y: right.eave - 0.8, phase: 11.005 - 10.5 * MIN - 10 * SEC, birds: [{ ox: 0, dir: 1 }, { ox: 3.5, dir: 1 }, { ox: 8, dir: -1 }, { ox: 12, dir: 1 }] }];
  facades[6].roofer = D.couvreur;
  const out = { lots, far, facades, hero };
  hwPlan(out);
  STREETS.set(key, out);
  return out;
}
// Rend la rue à l'instant T. view = { x0, y0, w, h, scale }.
function renderScene(ctx, T, D, view) {
  const street = buildStreet(D);
  setEnvAt(T, D);
  ctx.save(); ctx.scale(view.scale, view.scale); ctx.translate(-view.x0, -view.y0);
  paintSky(ctx, W, GROUND, T); paintFireworks(ctx, W, T, D);
  paintFar(ctx, street.far);
  const states = street.facades.map((f) => f.homes.map((hm) => (hm.hh ? homeState(hm, T) : null)));
  const cull = cullAnimated(street.facades, states, W);
  let prev = null;
  const scs = street.facades.map((f, i) => ({ T, D, W, states: states[i], street: n31StreetEvents(f, T, D, hwStreetEvents(f, T, D, streetEvents(f, T, W))), doorX: f.bayX(f.doorBay) }));
  street.facades.forEach((f, i) => { paintFacade(ctx, f, scs[i], { leftTouch: prev && prev.x + prev.w >= f.x - 0.5 ? Math.max(prev.top, f.top) + 10 : null }); paintStairFigure(ctx, f, scs[i]); prev = f; });
  for (const f of street.facades) for (const fl of f.flocks || []) flockPaint(ctx, fl, T, true);
  paintStreet(ctx);
  if (D.event === 'demenagement') paintTruck(ctx, street.hero.x + street.hero.w + 14, scs[4]);
  paintHwLamps(ctx, T, D);
  street.facades.forEach((f, i) => paintWalkers(ctx, f, scs[i]));
  street.facades.forEach((f, i) => paintHwStreet(ctx, f, scs[i]));
  paintN31(ctx, street, T, D);                                    // nuit du 31 : déguisés, porte-à-porte, farces, pluie
  ctx.restore();
  return { cull, street };
}
const heroView = (D, scale = 4) => { const h = buildStreet(D).hero; return { x0: Math.round(h.x + h.w / 2 - 150), y0: 40, w: 300, h: 260, scale }; };
const fullView = (scale = 2) => ({ x0: 0, y0: 0, w: W, h: H, scale });

// ───────────── planche des poses : silhouette de nuit dans sa fenêtre / pantin de jour ─────────────
function renderPlanche() {
  const CW = 150, CH = 92, LB = 13, cells = [
    ['Ouvrir les volets', () => ({ P: { ...POSE.armsUp, aL: [128, -18], aR: [128, -18] }, facing: 0 })],
    ['Ouvrir la fenêtre', () => ({ P: POSE.reach, facing: 0 })],
    ['Penché à la fenêtre', () => ({ P: POSE.lean, facing: 0, lean: true })],
    ['Arroser (balcon)', () => ({ P: POSE.water, facing: 1, props: [{ type: 'can', pour: true }] })],
    ['Secouer le tapis', () => ({ P: POSE.shake, facing: 0, lean: true, props: [{ type: 'rug', ph: 1.2 }] })],
    ['Fumer au balcon', () => ({ P: POSE.smokeUp, facing: 0, props: [{ type: 'ember', puff: 0.3 }] })],
    ['Tirer les rideaux', () => ({ P: POSE.curtain, facing: 0, curt: 0.5 })],
    ['Dîner à table', () => ({ P: POSE.sitTable, facing: 1, dx: -0.24, props: [{ type: 'table', n: 2 }], second: { P: POSE.sitTable, facing: -1, dx: 0.24 } })],
    ['Télé', () => ({ P: POSE.sitTv, facing: -1, dx: 0.22, props: [{ type: 'tv', dx: -0.34 }], tv: true })],
    ['Cuisiner', () => ({ P: POSE.cook, facing: 1, dx: -0.22, props: [{ type: 'stove' }] })],
    ['Danser (fête)', () => ({ P: dancePose(0.2), facing: 0, dx: -0.3, second: { P: dancePose(0.7), facing: 0, dx: 0.3 }, tone: 'orange' })],
    ['Enfant à la fenêtre', () => ({ P: POSE.lean, facing: 0, lean: true, size: 0.62 })],
    ['Regarder la rue (balcon)', () => ({ P: POSE.leanRail, facing: 0 })],
    ['Monter l’escalier', () => ({ P: { ...walkPose(0.3), torso: 12 }, facing: 1, stair: true })],
    ['Chat : marche / assis', () => ({ cat: true })],
    ['Pigeons : posé / envol', () => ({ pigeon: true })],
  ];
  const cols = 4, rows = Math.ceil(cells.length / cols), S = 3;
  const ctx = canvasFor('planche-poses', CW * cols * S, (CH + LB) * rows * S, 'planche-poses (×3) — nuit en contre-jour / jour en couleur');
  ctx.scale(S, S);
  const D = dayContext('2026-10-13');
  cells.forEach(([label, fn], i) => {
    const ox = (i % cols) * CW, oy = Math.floor(i / cols) * (CH + LB);
    ctx.fillStyle = '#F2EDE2'; ctx.fillRect(ox, oy, CW, LB); ctx.fillStyle = INK; ctx.font = 'bold 6px sans-serif'; ctx.fillText(label, ox + 3, oy + 8.5);
    const spec = fn();
    [[22, 0.62, 'nuit'], [10, 1, 'jour']].forEach(([T, dark, lab], k) => {
      ctx.save(); ctx.translate(ox + k * (CW / 2), oy + LB); ctx.beginPath(); ctx.rect(0, 0, CW / 2, CH); ctx.clip();
      setEnvAt(T, D); paintSky(ctx, CW / 2, CH, T);
      const night = k === 0, wallC = hex(STONES[0]);
      fillRect(ctx, STONES[0], 0, 0, CW / 2, CH);
      ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(0, CH - 7, 18, 7); ctx.fillStyle = '#fff'; ctx.font = '4px sans-serif'; ctx.fillText(lab, 2, CH - 2);
      ctx.translate(CW / 4, CH * 0.5); ctx.scale(3.2, 3.2);
      if (spec.cat) { fillRect(ctx, ZINCS[0], -14, 0, 28, 6); inkLine(ctx, [[-14, 0], [14, 0]], 0.5); paintChimney(ctx, 6, 0, -8, 7); paintCat(ctx, { x: -6, y: 0, mode: 'walk', ph: 1.3, dir: 1 }, 0); paintCat(ctx, { x: 4, y: 0, mode: 'sit', dir: -1, ph: 0 }, 0); ctx.restore(); return; }
      if (spec.pigeon) { fillRect(ctx, light(wallC, 0.5), -14, 0, 28, 2); inkLine(ctx, [[-14, 0], [14, 0]], 0.5); paintPigeon(ctx, -8, 0, 0, 1, false, 1); paintPigeon(ctx, -4, 0, 0, 2.5, false, -1); paintPigeon(ctx, 4, -6, 1, 1.2, true, 1); paintPigeon(ctx, 9, -10, 1, 2.6, true, 1); ctx.restore(); return; }
      // fenêtre 8 × 12 (×3,2) avec plancher à +0,5
      const w = 8, h = 12, x = -w / 2, y = -h + 0.5, fl = 0.5, figH = 11.5 * (spec.size || 1);
      const tone = LIT[spec.tone || (spec.tv ? 'tv' : 'warm')];
      fillRect(ctx, light(wallC, 0.5), x - 1.2, y - 1.2, w + 2.4, 1.2);
      ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
      if (spec.stair) { ctx.fillStyle = night ? LIT.stair : col(GLASS_DAY); ctx.fillRect(x, y, w, h); }
      else if (night) { ctx.fillStyle = tone; ctx.fillRect(x, y, w, h); }
      else { fillRect(ctx, spec.lean ? GLASS_DAY : ROOM_DAY, x, y, w, h); if (!spec.lean) fillRect(ctx, GLASS_DAY, x + w / 2, y, w / 2, h); }
      const draw = (sp) => { const ax = (sp.dx || 0) * w; for (const p of sp.props || []) if (p.type !== 'ember' && p.type !== 'can' && p.type !== 'rug') paintInteriorProp(ctx, p, ax, fl, figH, w, sp, night, night); const J = drawFigure(ctx, ax, fl, figH, sp.P, sp.facing, night ? { silhouette: SILH } : { mem: { shirt: '#C85A3A', pants: '#2E3A4A', skin: '#F2C9A0' }, amb: true }); paintHandProps(ctx, { props: sp.props || [] }, J, ax, fl, night); };
      if (!spec.lean) { draw(spec); if (spec.second) draw(spec.second); }
      if (spec.curt != null) { const cw = lerp(1.6, w / 2, spec.curt); ctx.fillStyle = night ? rgba(mix(hex(CURTAINS[1]), hex(tone), 0.45)) : col(CURTAINS[1]); ctx.fillRect(x, y, cw, h); ctx.fillRect(x + w - cw, y, cw, h); }
      if (!night && !spec.lean) { ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.beginPath(); ctx.moveTo(x, y + h * 0.55); ctx.lineTo(x + w * 0.5, y); ctx.lineTo(x + w * 0.7, y); ctx.lineTo(x, y + h * 0.95); ctx.fill(); }
      ctx.restore();
      ctx.strokeStyle = INK; ctx.lineWidth = 0.55; ctx.strokeRect(x, y, w, h); inkLine(ctx, [[0, y], [0, y + h]], 0.5);
      if (!spec.lean && !spec.stair) paintSash(ctx, x, y, w, h, 0.8, night, tone, night);
      ctx.fillStyle = col(light(wallC, 0.55)); ctx.fillRect(x - 1.2, y + h, w + 2.4, 1); fillRect(ctx, shade(wallC, 0.4), x - 1.2, y + h + 1, w + 2.4, 0.9);
      if (spec.lean) { ctx.save(); ctx.beginPath(); ctx.rect(x - 3, y - 6, w + 6, h + 6.5); ctx.clip(); const hh = figH * 1.08; const J = drawFigure(ctx, 0, y + h + hh * 0.5, hh, spec.P, 0, night ? { silhouette: SILH } : { mem: { shirt: '#5A7AA8', pants: '#2E3A4A', skin: '#F2C9A0' }, amb: true }); paintHandProps(ctx, { props: spec.props || [] }, J, 0, y + h + hh * 0.5, night); ctx.restore(); }
      ctx.restore();
    });
  });
}
// ───────────── mode animé : ?h=7&speed=60&date=2026-10-13&event=&zoom=1&hud=1 ─────────────
function runAnimated(q) {
  let T = parseFloat(q.get('h')); const speed = parseFloat(q.get('speed') || '60'); // minutes de scène par seconde réelle
  const D = dayContext(q.get('date') || '2026-10-24', q.get('event') || undefined);
  const zoom = q.get('zoom') === '1', view = zoom ? heroView(D, 4) : fullView(2);
  const ctx = canvasFor('anim', view.w * view.scale, view.h * view.scale, `${D.date}${D.event ? ' · ' + D.event : ''} — espace : pause · ← → : ±10 min · + − : vitesse`);
  let paused = false, last = performance.now(), spd = speed;
  addEventListener('keydown', (e) => { if (e.key === ' ') paused = !paused; else if (e.key === 'ArrowLeft') T -= 10 * MIN; else if (e.key === 'ArrowRight') T += 10 * MIN; else if (e.key === '+') spd *= 1.5; else if (e.key === '-') spd /= 1.5; });
  const frame = (now) => { const dt = (now - last) / 1000; last = now; if (!paused) T = (T + dt * spd * MIN) % 24; const r = renderScene(ctx, T, D, view); if (q.get('hud') !== '0') { ctx.save(); ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, 0, 230, 16); ctx.fillStyle = '#fff'; ctx.font = '11px sans-serif'; ctx.fillText(`${fmtT(T)} · ×${spd.toFixed(0)} · animées ${r.cull.shown}/${r.cull.animated} (max ${MAX_ANIM})`, 4, 12); ctx.restore(); } requestAnimationFrame(frame); };
  requestAnimationFrame(frame);
}
