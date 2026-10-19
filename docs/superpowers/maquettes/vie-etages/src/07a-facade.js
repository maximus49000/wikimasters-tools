// ───────────── peinture d'une façade (chantier 1 + états vivants) ─────────────
// ctxScene = { T, D, W, states: état par logement (même index que f.homes), street: streetEvents(f) }
function paintFacade(ctx, f, sc, opts = {}) {
  const { x, w, top, eave, ground, wall, levels } = f;
  const h = ground - eave;
  fillRect(ctx, wall, x, eave, w, h);
  fillRect(ctx, shade(hex(wall), 0.28), x + w * 0.74, eave, w * 0.26, h);
  fillRect(ctx, light(hex(wall), 0.45), x, eave, 1.4, h);
  fillRect(ctx, shade(hex(wall), 0.18), x, ground - 3, w, 3);
  if (f.kind === 'haussmann') { ctx.strokeStyle = rgba(amb(shade(hex(wall), 0.22)), 0.9); ctx.lineWidth = 0.4; ctx.beginPath(); for (let yy = eave + 6; yy < ground - GF - 2; yy += 4.5) { ctx.moveTo(x, yy); ctx.lineTo(x + w, yy); } ctx.stroke(); }
  for (const lv of levels) { if (lv.level === 'entresol') continue; const by = lv.y + lv.h; fillRect(ctx, light(hex(wall), 0.5), x, by - 1.2, w, 1.2); fillRect(ctx, shade(hex(wall), 0.38), x, by, w, 0.9); }
  fillRect(ctx, shade(hex(wall), 0.3), x, ground - GF - 1, w, 1);
  paintGroundFloor(ctx, f, sc);
  const leaners = [];
  for (const win of f.windows) paintWindow(ctx, f, win, sc, leaners);
  for (const L of leaners) L();                                   // penchés : devant l'appui, après toutes les fenêtres
  for (const lv of levels) if (lv.balcony === 'filant') paintBalcony(ctx, f, x + 1.5, lv.y + lv.h, w - 3, lv, true, sc);
  for (const win of f.windows) if (win.level.balcony === 'balconnet' && win.kind === 'std') paintBalcony(ctx, f, win.x - 1.2, win.y + win.h, win.w + 2.4, win.level, false, sc);
  fillRect(ctx, light(hex(wall), 0.5), x - 1.5, eave - 0.8, w + 3, 3);
  fillRect(ctx, shade(hex(wall), 0.42), x, eave + 2.2, w, 2.6);
  inkRect(ctx, x - 1.5, eave - 0.8, w + 3, 3, 0.7);
  paintRoof(ctx, f, sc);
  inkRect(ctx, x, eave, w, h, 0.9);
  if (opts.leftTouch) inkLine(ctx, [[x, Math.max(top, opts.leftTouch)], [x, ground]], 1.3);
  paintRoofLife(ctx, f, sc);
}
const homeOf = (f, win) => f.homes.find((hm) => hm.level === win.level && hm.bays.includes(win.bay));
const stateOf = (f, sc, hm) => (hm ? sc.states[f.homes.indexOf(hm)] : null);

function paintGroundFloor(ctx, f, sc) {
  const { x, w, ground, wall } = f;
  const dx = f.bayX(f.doorBay);
  const dw = Math.min(11, f.winW * 1.6), dh = 21;
  const shopL = f.doorBay === 0 ? dx + dw / 2 + 2 : x + 2, shopR = f.doorBay === 0 ? x + w - 2 : dx - dw / 2 - 2;
  const tone = pick(['#C85A3A', '#2F5D50', '#2E4A6E', '#8A5A8E', '#B8702A'], mulberry32(Math.round(x * 3)));
  const sy = ground - GF + 3;
  fillRect(ctx, tone, shopL, sy, shopR - shopL, GF - 3);
  fillRect(ctx, shade(hex(tone), 0.3), shopL + (shopR - shopL) * 0.74, sy, (shopR - shopL) * 0.26, GF - 3);
  const night = ENV.hour >= 20 || ENV.hour < 7;
  const vx = shopL + 2, vw = shopR - shopL - 4, vy = sy + 7, vh = GF - 11;
  if (night) { fillRect(ctx, '#8A8AA0', vx, vy, vw, vh); ctx.strokeStyle = rgba(amb(hex('#5A5A74'))); ctx.lineWidth = 0.4; ctx.beginPath(); for (let yy = vy + 2; yy < vy + vh; yy += 2) { ctx.moveTo(vx, yy); ctx.lineTo(vx + vw, yy); } ctx.stroke(); }
  else { fillRect(ctx, '#E8F2F6', vx, vy, vw, vh); poly(ctx, 'rgba(255,255,255,0.8)', [[vx, vy + vh * 0.7], [vx + vw * 0.45, vy], [vx + vw * 0.6, vy], [vx, vy + vh]], true); fillRect(ctx, shade(hex('#E8F2F6'), 0.35), vx + vw * 0.7, vy, vw * 0.3, vh); }
  inkRect(ctx, vx, vy, vw, vh, 0.6);
  fillRect(ctx, light(hex(tone), 0.5), shopL + 2, sy + 2, vw, 3.5);
  inkRect(ctx, shopL, sy, shopR - shopL, GF - 3, 0.8);
  // Porte cochère : bois foncé, cintrée, imposte ; s'ouvre (vantail gauche pivote) quand quelqu'un passe ; hall éclairé par la minuterie.
  const wood = pick(WOOD, mulberry32(Math.round(x * 5)));
  const open = sc.street.door, hallLit = isNight() && sc.street.stairLit;
  fillRect(ctx, light(hex(wall), 0.35), dx - dw / 2 - 1.5, ground - dh - 1.5, dw + 3, dh + 1.5);
  const arch = () => { ctx.beginPath(); ctx.moveTo(dx - dw / 2, ground); ctx.lineTo(dx - dw / 2, ground - dh + dw / 2); ctx.arc(dx, ground - dh + dw / 2, dw / 2, Math.PI, 0); ctx.lineTo(dx + dw / 2, ground); ctx.closePath(); };
  ctx.fillStyle = col(wood); arch(); ctx.fill();
  if (open > 0.02) {
    // hall visible dans l'ouverture (moitié gauche), vantail rabattu vers l'intérieur
    ctx.save(); arch(); ctx.clip();
    ctx.fillStyle = hallLit ? '#E8DCB0' : col('#5A4A48'); ctx.fillRect(dx - dw / 2, ground - dh + dw / 2 - 1, (dw / 2) * open, dh);
    fillRect(ctx, shade(hex(wood), 0.5), dx - dw / 2 + (dw / 2) * open - 1.2, ground - dh + dw / 2 - 1, 1.2, dh);
    ctx.restore();
  }
  fillRect(ctx, shade(hex(wood), 0.35), dx + 0.4, ground - dh + dw / 2, dw / 2 - 0.4, dh - dw / 2);
  ctx.fillStyle = hallLit ? LIT.stair : col(isNight() ? '#3A4A6A' : '#B8D4E8'); ctx.beginPath(); ctx.arc(dx, ground - dh + dw / 2, dw / 2 - 1.2, Math.PI, 0); ctx.closePath(); ctx.fill();
  if (hallLit) rawRect(ctx, 'rgba(255,236,180,0.28)', dx - dw / 2 - 1, ground - 1, dw + 2, 1);
  ctx.strokeStyle = INK; ctx.lineWidth = 0.7; arch(); ctx.stroke();
  inkLine(ctx, [[dx, ground - dh + dw / 2], [dx, ground]], 0.5);
  inkLine(ctx, [[dx - dw / 2, ground - dh + dw / 2], [dx + dw / 2, ground - dh + dw / 2]], 0.5);
  disc(ctx, '#E8C060', dx - 1.6, ground - dh / 2 + 1, 0.5);
  f.door = { x: dx, w: dw, h: dh };
}

// Une fenêtre avec son état : lumière, intérieur (meubles, silhouettes), rideaux, battant ouvert, volets, appui.
function paintWindow(ctx, f, win, sc, leaners) {
  const wallC = hex(f.wall);
  const home = homeOf(f, win), st = stateOf(f, sc, home);
  const night = isNight();
  const room = home ? home.rooms[home.bays.indexOf(win.bay)] : null;
  let lit = false, tone = null;
  if (win.kind === 'stair') { lit = night && sc.street.stairLit; tone = LIT.stair; }
  else if (st) { lit = night && st.lit[room]; tone = LIT[st.tone[room] || home.tone] || LIT.warm; }
  const shut = st ? st.shut[room] : 1, curt = st ? st.curt[room] : 0, wopen = st ? st.win[room] : 0;
  const { x, y, w, h } = win;
  const fl = win.kind === 'french' ? y + h + 0.5 : win.level.y + win.level.h - 0.5;   // plancher de la pièce
  const figH = win.level.h * 0.66;
  const actors = st ? st.actors.filter((a) => a.room === room && !a.culled) : [];
  const glowK = sat(shut) * (1 - 0.55 * curt);
  if (lit && glowK > 0.1) {
    const d = clamp(h * 0.7, 4, 9), a = 0.22 * glowK;
    const g = (k) => { ctx.fillStyle = `rgba(255,214,130,${a})`; ctx.beginPath(); ctx.moveTo(x - 0.5, y + h); ctx.lineTo(x + w + 0.5, y + h); ctx.lineTo(x + w + 1.5 + 1.5 * k, y + h + d * k * 0.8); ctx.quadraticCurveTo(x + w / 2, y + h + d * k + 2 * k, x - 1.5 - 1.5 * k, y + h + d * k * 0.8); ctx.closePath(); ctx.fill(); };
    g(1); g(0.55);
    rawRect(ctx, `rgba(255,214,130,${0.16 * glowK})`, x - 1.6, y - 1.2, w + 3.2, h + 1.2);
  }
  fillRect(ctx, light(wallC, 0.5), x - 1.2, y - 1.2, w + 2.4, 1.2);
  fillRect(ctx, shade(wallC, 0.5), x - 0.9, y, 0.9, h);
  fillRect(ctx, shade(wallC, 0.5), x + w, y, 0.9, h);
  // ── intérieur ──
  ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  const interiorVisible = lit || wopen > 0.4;
  if (lit) { ctx.fillStyle = tone; ctx.fillRect(x, y, w, h); if (st && st.tone[room] === 'tv') rawRect(ctx, `rgba(255,255,255,${0.25 + 0.12 * Math.sin(sc.T / SEC * 7)})`, x + 0.6, y + h * 0.35, w - 1.2, h * 0.3); }
  else { const glass = night ? hex(GLASS_NIGHT) : hex(GLASS_DAY); ctx.fillStyle = night ? rgba(mix(glass, amb(wallC), 0.25)) : col(glass); ctx.fillRect(x, y, w, h); if (wopen > 0.4) { fillRect(ctx, ROOM_DAY, x, y, w * 0.5, h); } }
  if (home && win.kind !== 'stair') {
    const prop = home.props[home.bays.indexOf(win.bay)];
    const pc = lit ? SILH : night ? 'rgba(20,16,30,0.5)' : 'rgba(60,40,50,0.35)';
    if (prop === 'lamp') { ctx.fillStyle = pc; ctx.beginPath(); ctx.moveTo(x + w * 0.55, y + h * 0.3); ctx.lineTo(x + w * 0.95, y + h * 0.3); ctx.lineTo(x + w * 0.9, y + h * 0.55); ctx.lineTo(x + w * 0.6, y + h * 0.55); ctx.fill(); ctx.fillRect(x + w * 0.73, y + h * 0.55, 0.6, h * 0.45); if (lit) rawRect(ctx, 'rgba(255,255,255,0.55)', x + w * 0.62, y + h * 0.33, w * 0.26, h * 0.1); }
    else if (prop === 'plant') { ctx.fillStyle = lit ? '#1E3A28' : pc; ctx.beginPath(); ctx.arc(x + w * 0.3, y + h * 0.6, w * 0.2, 0, TAU); ctx.arc(x + w * 0.42, y + h * 0.5, w * 0.16, 0, TAU); ctx.fill(); ctx.fillRect(x + w * 0.18, y + h * 0.72, w * 0.26, h * 0.28); }
    else if (prop === 'shelf') { ctx.fillStyle = pc; for (let k = 0; k < 3; k++) ctx.fillRect(x + 0.8, y + 1 + k * (h / 3.2), w * 0.5, 0.6); ctx.fillStyle = lit ? 'rgba(26,20,34,0.45)' : pc; ctx.fillRect(x + 0.8, y + 1, w * 0.5, h - 2); }
    if (st && st.sapin && room === 'salon') paintSapin(ctx, x + w * 0.72, fl, h * 0.78, sc.T, lit);
    // silhouettes / pantins dans la pièce
    const alphaIn = lit ? (curt > 0.6 ? 0.28 : 0.95) : wopen > 0.4 ? 0.9 : night ? 0 : 0.3;
    if (alphaIn > 0) {
      const wcx = x + w / 2;
      for (const a of actors) {
        if (a.where !== 'in') continue;
        const ax = a.cross ? homeSpanX(f, home, a.dx) : wcx + a.dx * w;
        if (Math.abs(ax - wcx) > w * 0.9) continue;
        for (const p of a.props) paintInteriorProp(ctx, p, ax, fl, figH * a.member.size, w, a, lit, night);
        ctx.globalAlpha = alphaIn;
        const sty = lit || night ? { silhouette: SILH } : { mem: a.member, amb: true };
        const J = drawFigure(ctx, ax, fl, figH * a.member.size, a.P, a.facing, sty);
        paintHandProps(ctx, a, J, ax, fl, lit || night);
        ctx.globalAlpha = 1;
      }
    }
    // voilage, rideaux (1 = tirés : couvrent la vitre), reflet
    if (home.curtain && home.curtain.style === 'voile' && curt < 0.5) { rawRect(ctx, lit ? 'rgba(255,248,230,0.45)' : 'rgba(255,248,230,0.3)', x, y, w, h); ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 0.4; ctx.beginPath(); for (let k = 1; k < w; k += 1.6) { ctx.moveTo(x + k, y); ctx.lineTo(x + k - 0.6, y + h); } ctx.stroke(); }
    if (home.curtain || curt > 0) { const base = home.curtain ? home.curtain.color : CURTAINS[0]; const cw = lerp(clamp(w * 0.22, 1, 1.8), w / 2 + 0.2, curt); const cc = lit ? rgba(mix(hex(base), hex(tone), 0.45)) : rgba(amb(hex(base))); ctx.fillStyle = cc; ctx.fillRect(x, y, cw, h); ctx.fillRect(x + w - cw, y, cw, h); rawRect(ctx, 'rgba(0,0,0,0.18)', x + cw - 0.4, y, 0.4, h); rawRect(ctx, 'rgba(0,0,0,0.18)', x + w - cw, y, 0.4, h); if (curt > 0.2) { ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.lineWidth = 0.35; ctx.beginPath(); for (let k = 1; k < cw; k += 1.3) { ctx.moveTo(x + k, y); ctx.lineTo(x + k, y + h); ctx.moveTo(x + w - k, y); ctx.lineTo(x + w - k, y + h); } ctx.stroke(); } }
  }
  if (!lit) { ctx.fillStyle = night ? 'rgba(150,170,230,0.22)' : `rgba(255,255,255,${wopen > 0.4 ? 0.3 : 0.72})`; ctx.beginPath(); ctx.moveTo(x, y + h * 0.55); ctx.lineTo(x + w * 0.5, y); ctx.lineTo(x + w * 0.7, y); ctx.lineTo(x, y + h * 0.95); ctx.closePath(); ctx.fill(); fillRect(ctx, shade(hex(night ? GLASS_NIGHT : GLASS_DAY), 0.45), x, y, w, 1); }
  else { ctx.fillStyle = `rgba(255,255,255,${st && st.tone[room] === 'cream' ? 0.3 : 0.18})`; ctx.fillRect(x, y, w, h * 0.3); }
  ctx.restore();
  // menuiserie
  ctx.strokeStyle = INK; ctx.lineWidth = 0.55; ctx.strokeRect(x, y, w, h);
  ctx.beginPath(); ctx.moveTo(x + w / 2, y); ctx.lineTo(x + w / 2, y + h); if (h >= 8) { ctx.moveTo(x, y + h * 0.33); ctx.lineTo(x + w, y + h * 0.33); } ctx.stroke();
  // battant gauche ouvert (pivote vers l'extérieur, côté gauche)
  if (wopen > 0.02 && win.kind !== 'stair') paintSash(ctx, x, y, w, h, wopen, lit, tone, night);
  // volets : persiennes repliables (haussmann) ou volets battants (faubourg)
  if (win.kind !== 'stair' && win.kind !== 'entresol') paintShutters(ctx, f, win, shut, lit);
  // appui
  if (win.kind !== 'french') {
    ctx.fillStyle = lit && glowK > 0.3 ? '#FFE8B0' : col(light(wallC, 0.55)); ctx.fillRect(x - 1.2, y + h, w + 2.4, 1);
    fillRect(ctx, shade(wallC, 0.4), x - 1.2, y + h + 1, w + 2.4, 0.9);
    const r = mulberry32(Math.round(x * 7 + y * 3));
    if (win.kind === 'std' && r() < 0.35 && f.kind === 'faubourg') paintFlowerBox(ctx, x - 0.4, y + h + 1, w + 0.8, r, lit && glowK > 0.3, sc);
  }
  // penchés à la fenêtre : dessinés après toutes les fenêtres (devant l'appui), coupés sous les hanches
  for (const a of actors) if (a.where === 'lean' && !a.culled) leaners.push(() => paintLeaner(ctx, f, win, a, fl, figH, lit, night, tone));
}
function homeSpanX(f, home, dx) { const x0 = f.bayX(home.bays[0]), x1 = f.bayX(home.bays[home.bays.length - 1]); return lerp(x0 - f.winW, x1 + f.winW, (dx + 1.6) / 3.2); }
function paintLeaner(ctx, f, win, a, fl, figH, lit, night, tone) {
  const { x, y, w, h } = win, sill = y + h;
  const hh = figH * a.member.size * 1.08, ax = x + w / 2 + a.dx * w;
  ctx.save(); ctx.beginPath(); ctx.rect(x - 2.5, y - 6, w + 5, sill - y + 6.5); ctx.clip();
  // le buste penché sort du plan : pieds posés plus bas (cachés), hanches à l'appui
  const sty = night ? (lit ? { silhouette: SILH } : { silhouette: rgba(amb(hex('#3A2E3C'))) }) : { mem: a.member, amb: true };
  const J = drawFigure(ctx, ax, sill + hh * 0.5, hh, a.P, a.facing, sty);
  paintHandProps(ctx, a, J, ax, sill + hh * 0.5, night);
  ctx.restore();
}
function paintSash(ctx, x, y, w, h, o, lit, tone, night) {
  const lw = (w / 2) * o * 0.95, sk = lw * 0.32;
  const pts = [[x, y], [x - lw, y - sk], [x - lw, y + h - sk], [x, y + h]];
  poly(ctx, night ? GLASS_NIGHT : GLASS_DAY, pts);
  if (lit) poly(ctx, rgba(hex(tone), 0.35), pts, true);
  poly(ctx, night ? 'rgba(150,170,230,0.25)' : 'rgba(255,255,255,0.6)', [[x - lw, y - sk], [x - lw * 0.4, y - sk * 0.4], [x - lw * 0.4, y + h * 0.5], [x - lw, y + h * 0.6 - sk]], true);
  inkLine(ctx, pts, 0.55, true); inkLine(ctx, [[x - lw / 2, y - sk / 2], [x - lw / 2, y + h - sk / 2]], 0.4);
}
function paintShutters(ctx, f, win, s, litBehind) {
  const { x, y, w, h } = win;
  if (f.kind === 'faubourg' && f.shutters) {
    if (!(win.kind === 'std' && win.x - 2.6 > f.x + 1 && win.x + w + 2.6 < f.x + f.w - 1)) return;
    const sc = hex(f.shutters);
    const leaf = (lx, lw, c) => { fillRect(ctx, c, lx, y, lw, h); ctx.strokeStyle = INK; ctx.lineWidth = 0.45; ctx.strokeRect(lx, y, lw, h); ctx.fillStyle = litBehind && s < 0.5 ? 'rgba(255,216,106,0.7)' : rgba(amb(shade(sc, 0.5))); for (let k = 1.5; k < h; k += 2) ctx.fillRect(lx + 0.3, y + k, Math.max(0.4, lw - 0.6), 0.4); };
    const lw = lerp(w / 2, 2, s);
    leaf(lerp(x, x - 2.6, s), lw, light(sc, 0.2)); leaf(lerp(x + w / 2, x + w + 0.6, s), lw, shade(sc, 0.3));
  } else if (f.persienne && s < 0.98) {
    // persiennes métalliques repliables dans l'embrasure : deux vantaux qui se replient vers les côtés ; la lumière filtre par les lames
    const pc = hex(f.persienne), half = (w / 2) * (1 - s);
    const leaf = (lx) => { fillRect(ctx, pc, lx, y, half, h); fillRect(ctx, shade(pc, 0.35), lx + half - 0.5, y, 0.5, h); ctx.fillStyle = litBehind ? 'rgba(255,216,106,0.7)' : rgba(amb(shade(pc, 0.55))); for (let k = 1.2; k < h; k += 1.6) ctx.fillRect(lx + 0.3, y + k, Math.max(0.3, half - 0.6), 0.35); inkRect(ctx, lx, y, half, h, 0.4); };
    leaf(x); leaf(x + w - half);
  }
}
// Jardinière : fleurs selon la saison (géraniums l'été, chrysanthèmes à l'automne, terre nue l'hiver, primevères au printemps).
function paintFlowerBox(ctx, bx, by, bw, r, lit, sc) {
  fillRect(ctx, '#8A4A2E', bx, by, bw, 1.6); inkRect(ctx, bx, by, bw, 1.6, 0.4);
  const m = sc.D.month, pal = m >= 11 || m <= 2 ? ['#6A5A48', '#5A6A48'] : m <= 4 ? ['#F6C62E', '#E8A0C8', '#FFFFFF'] : m <= 9 ? ['#E8456B', '#F6C62E', '#FFFFFF', '#E070C0', '#3F8A3A'] : ['#D88A2E', '#B85A3A', '#E8C060', '#8A5A8E'];
  const n = m >= 11 || m <= 2 ? 2 : 6;
  for (let k = 0; k < n; k++) disc(ctx, pick(pal, r), bx + 0.9 + r() * (bw - 1.8), by + 0.4 + r() * 1.0 - (n > 2 ? 0.6 : 0), 0.7);
  if (lit) rawRect(ctx, 'rgba(255,214,130,0.3)', bx, by - 0.8, bw, 1.2);
}
function paintSapin(ctx, cx, fl, H, T, lit) {
  const c = lit ? '#1E3A2A' : '#2F5A3A';
  ctx.fillStyle = lit ? c : col(c);
  for (let k = 0; k < 3; k++) { const yy = fl - H * (0.25 + k * 0.25), ww = H * (0.42 - k * 0.1); ctx.beginPath(); ctx.moveTo(cx - ww / 2, yy); ctx.lineTo(cx, yy - H * 0.3); ctx.lineTo(cx + ww / 2, yy); ctx.closePath(); ctx.fill(); }
  rawRect(ctx, '#5A3A2E', cx - 0.5, fl - H * 0.25, 1, H * 0.25);
  const s = T / SEC, cols = ['#FF6A6A', '#FFD86A', '#8AF0FF', '#C8FF8A', '#FFA0E0'];
  for (let i = 0; i < 7; i++) { const on = ((s * 1.5 + i * 0.7) % 2) < 1.3; if (!on) continue; const yy = fl - H * (0.3 + (i % 4) * 0.17), xx = cx + ((i * 37) % 7 - 3) * (H * 0.06); ctx.fillStyle = cols[i % 5]; ctx.beginPath(); ctx.arc(xx, yy, 0.45, 0, TAU); ctx.fill(); }
  ctx.fillStyle = '#FFE060'; ctx.beginPath(); ctx.arc(cx, fl - H * 1.03, 0.6, 0, TAU); ctx.fill();
}
// Meubles liés aux poses : table (assiettes, bouteille), bureau (écran), télé, plan de cuisson.
function paintInteriorProp(ctx, p, ax, fl, hh, w, a, lit, night) {
  const dark = lit ? SILH : night ? 'rgba(20,16,30,0.5)' : 'rgba(70,50,60,0.6)';
  ctx.fillStyle = dark;
  if (p.type === 'table') { const ty = fl - hh * 0.46, tw = hh * 0.55; ctx.fillRect(ax - tw / 2, ty, tw, hh * 0.05); ctx.fillRect(ax - tw / 2 + 0.6, ty, 0.5, hh * 0.46); ctx.fillRect(ax + tw / 2 - 1.1, ty, 0.5, hh * 0.46); ctx.fillRect(ax - 0.5, ty - hh * 0.14, 1, hh * 0.14); if (lit) { ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fillRect(ax - tw * 0.36, ty - 0.5, tw * 0.22, 0.5); ctx.fillRect(ax + tw * 0.14, ty - 0.5, tw * 0.22, 0.5); } }
  else if (p.type === 'desk') { const ty = fl - hh * 0.46, tw = hh * 0.5; ctx.fillRect(ax - tw * 0.1, ty, tw, hh * 0.05); ctx.fillRect(ax + tw * 0.75, ty, 0.5, hh * 0.46); ctx.fillStyle = lit ? '#DDEBFF' : '#9CC4FF'; ctx.fillRect(ax + tw * 0.35, ty - hh * 0.2, tw * 0.3, hh * 0.19); }
  else if (p.type === 'tv') { const tx = ax + p.dx * w * 2.2, ty = fl - hh * 0.55; ctx.fillRect(tx - 1.6, fl - hh * 0.3, 3.2, hh * 0.3); ctx.fillStyle = lit ? `rgba(255,255,255,${0.75 + 0.2 * Math.sin(ENV.T / SEC * 9)})` : '#9CC4FF'; ctx.fillRect(tx - 1.4, ty, 2.8, hh * 0.22); }
  else if (p.type === 'stove') { const sx = ax + hh * 0.22; ctx.fillRect(sx, fl - hh * 0.46, hh * 0.3, hh * 0.46); ctx.fillStyle = lit ? 'rgba(255,255,255,0.35)' : dark; ctx.fillRect(sx + 0.3, fl - hh * 0.5, hh * 0.2, hh * 0.05); }
}
// Accessoires dans les mains : braise + volute de fumée, arrosoir + filet d'eau, tapis secoué + poussière.
function paintHandProps(ctx, a, J, ax, fy, dark) {
  for (const p of a.props) {
    if (p.type === 'ember') { const hx = ax + J.hR[0], hy = fy + J.hR[1]; ctx.fillStyle = '#FF6A2A'; ctx.beginPath(); ctx.arc(hx, hy - 0.3, 0.45, 0, TAU); ctx.fill(); if (p.puff >= 0) { ctx.fillStyle = `rgba(230,230,245,${0.5 * (1 - p.puff)})`; ctx.beginPath(); ctx.arc(hx + 1.5 + p.puff * 4, fy + J.head[1] - 1 - p.puff * 5, 0.8 + p.puff * 2, 0, TAU); ctx.fill(); } }
    else if (p.type === 'can') { const hx = ax + J.hR[0], hy = fy + J.hR[1]; ctx.fillStyle = dark ? SILH : '#5A8A5A'; ctx.beginPath(); ctx.moveTo(hx - 1.2, hy); ctx.lineTo(hx + 1.4, hy); ctx.lineTo(hx + 1.1, hy + 2.2); ctx.lineTo(hx - 0.9, hy + 2.2); ctx.closePath(); ctx.fill(); inkLine(ctx, [[hx + 1.2, hy + 0.6], [hx + 3, hy + 2.6]], 0.6); if (p.pour) { ctx.strokeStyle = 'rgba(150,200,255,0.9)'; ctx.lineWidth = 0.5; ctx.beginPath(); ctx.moveTo(hx + 3, hy + 2.8); ctx.quadraticCurveTo(hx + 3.6, hy + 4, hx + 3.4, hy + 5.5); ctx.stroke(); } }
    else if (p.type === 'rug') { const lx = ax + J.hL[0], rx = ax + J.hR[0], hy = fy + J.hR[1]; const wv = Math.sin(p.ph) * 0.8; ctx.fillStyle = dark ? SILH : '#B8503A'; ctx.beginPath(); ctx.moveTo(lx, hy); ctx.lineTo(rx, hy); ctx.lineTo(rx + wv, hy + 4.2); ctx.quadraticCurveTo((lx + rx) / 2, hy + 5 + wv, lx - wv, hy + 4.2); ctx.closePath(); ctx.fill(); if (!dark) { ctx.fillStyle = '#E8C060'; ctx.fillRect(lx + 0.6, hy + 1.2, rx - lx - 1.2, 0.5); ctx.fillRect(lx + 0.6, hy + 2.8, rx - lx - 1.2, 0.5); } inkLine(ctx, [[lx, hy], [rx, hy], [rx + wv, hy + 4.2], [lx - wv, hy + 4.2]], 0.4, true); ctx.fillStyle = 'rgba(220,210,190,0.5)'; for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.arc((lx + rx) / 2 + Math.sin(p.ph * 0.7 + k) * 2.5, hy + 5.5 + k * 1.1, 0.5, 0, TAU); ctx.fill(); } }
  }
}
