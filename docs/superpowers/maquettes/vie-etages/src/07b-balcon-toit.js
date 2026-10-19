// ───────────── balcons (avec leurs occupants), toits, cheminées, lucarnes, vie des toits, rue ─────────────
function paintBalcony(ctx, f, bx, by, bw, lv, filant, sc) {
  const wallC = hex(f.wall);
  const rh = filant ? 5.5 : 4;
  const night = isNight();
  const litWins = f.windows.filter((w) => w.level === lv && w.x >= bx - 1 && w.x + w.w <= bx + bw + 1).filter((w) => { const hm = homeOf(f, w), st = stateOf(f, sc, hm); return hm && st && night && st.lit[hm.rooms[hm.bays.indexOf(w.bay)]]; });
  // occupants du balcon : debout sur la dalle, derrière le garde-corps
  if (filant) for (const hm of f.homes) {
    if (hm.level !== lv) continue;
    const st = stateOf(f, sc, hm); if (!st) continue;
    for (const a of st.actors) {
      if (a.where !== 'balcony' || a.culled) continue;
      const win = f.windows.find((w) => w.level === lv && w.bay === hm.bays[hm.rooms.indexOf(a.room)]); if (!win) continue;
      const ax = win.x + win.w / 2 + a.dx * win.w, hh = lv.h * 0.66 * a.member.size;
      const litBehind = st.lit[a.room] && night;
      const sty = night ? { silhouette: litBehind ? SILH : rgba(amb(hex('#3A2E3C'))) } : { mem: a.member, amb: true };
      const J = drawFigure(ctx, ax, by - 0.4, hh, a.P, a.facing, sty);
      paintHandProps(ctx, a, J, ax, by - 0.4, night);
      if (a.choreo === 'water' && a.props[0] && a.props[0].pour) { /* le pot arrosé brille un peu */ rawRect(ctx, 'rgba(150,200,255,0.25)', ax + 3, by - rh - 1.2, 2.4, 1.4); }
    }
  }
  ctx.fillStyle = INK;
  ctx.fillRect(bx, by - rh, bw, 0.7);
  for (let k = bx + 0.8; k < bx + bw; k += 1.5) ctx.fillRect(k, by - rh, 0.45, rh);
  if (filant) { ctx.strokeStyle = INK; ctx.lineWidth = 0.5; ctx.beginPath(); for (let i = 0; i < f.nBays; i++) { const cx = f.bayX(i); if (cx - 3 < bx || cx + 3 > bx + bw) continue; ctx.moveTo(cx - 2.5, by - 1.2); ctx.arc(cx - 1.2, by - rh * 0.55, 1.3, Math.PI * 0.7, Math.PI * 2.3); ctx.moveTo(cx + 2.5, by - 1.2); ctx.arc(cx + 1.2, by - rh * 0.55, 1.3, Math.PI * 0.7, Math.PI * 2.3, true); } ctx.stroke(); }
  fillRect(ctx, light(wallC, 0.5), bx - 0.8, by - 0.4, bw + 1.6, 1.4);
  fillRect(ctx, shade(wallC, 0.45), bx - 0.8, by + 1, bw + 1.6, filant ? 2 : 1.4);
  inkRect(ctx, bx - 0.8, by - 0.4, bw + 1.6, filant ? 3.4 : 2.8, 0.6);
  for (const w of litWins) { rawRect(ctx, 'rgba(255,214,130,0.3)', w.x - 1.5, by - 0.4, w.w + 3, 1.4); rawRect(ctx, 'rgba(255,214,130,0.22)', w.x - 1, by - rh, w.w + 2, rh); }
  // pots de fleurs du balcon (saison) : un par travée sur le filant du retraité, sinon un seul
  if (filant && f.kind === 'haussmann') {
    const m = sc.D.month, hm = f.homes.find((h) => h.level === lv && h.hh && h.hh.type === 'retraite');
    const n = hm ? 3 : 1;
    for (let k = 0; k < n; k++) { const px = bx + 3.5 + k * (bw / 4); fillRect(ctx, '#A04A2E', px - 1.2, by - rh - 0.2, 2.4, 1.4); if (m >= 11 || m <= 2) disc(ctx, '#5A6A48', px, by - rh - 0.6, 1.1); else { disc(ctx, '#3F8A3A', px, by - rh - 0.6, 1.5); disc(ctx, m <= 4 ? '#F6C62E' : m <= 9 ? '#E8456B' : '#D88A2E', px - 0.5, by - rh - 1.2, 0.5); disc(ctx, m <= 4 ? '#FFFFFF' : m <= 9 ? '#FFFFFF' : '#E8C060', px + 0.6, by - rh - 0.9, 0.45); } }
  }
}
function paintRoof(ctx, f, sc) {
  const { x, w, top, eave, roof } = f;
  if (roof.kind === 'mansard') {
    const zc = hex(roof.zinc), bt = top + roof.terrasson;
    poly(ctx, zc, [[x - 1.5, eave], [x + 2.5, bt], [x + w - 2.5, bt], [x + w + 1.5, eave]]);
    poly(ctx, shade(zc, 0.3), [[x + w * 0.74, eave], [x + w * 0.74, bt], [x + w - 2.5, bt], [x + w + 1.5, eave]]);
    poly(ctx, light(zc, 0.35), [[x - 1.5, eave], [x + 2.5, bt], [x + w * 0.4, bt], [x + w * 0.4, eave]]);
    ctx.strokeStyle = rgba(amb(shade(zc, 0.5)), 0.8); ctx.lineWidth = 0.4; ctx.beginPath();
    for (let i = 0; i < f.nBays * 2 + 1; i++) { const t = (i + 0.5) / (f.nBays * 2 + 1); ctx.moveTo(x - 1.5 + (w + 3) * t, eave); ctx.lineTo(x + 2.5 + (w - 5) * t, bt); } ctx.stroke();
    poly(ctx, light(zc, 0.5), [[x + 2.5, bt], [x + 5, top + 0.5], [x + w - 5, top + 0.5], [x + w - 2.5, bt]]);
    poly(ctx, shade(zc, 0.2), [[x + w * 0.74, bt], [x + w * 0.74, top + 0.5], [x + w - 5, top + 0.5], [x + w - 2.5, bt]]);
    inkLine(ctx, [[x - 1.5, eave], [x + 2.5, bt], [x + 5, top + 0.5], [x + w - 5, top + 0.5], [x + w - 2.5, bt], [x + w + 1.5, eave]], 0.9);
    inkLine(ctx, [[x + 2.5, bt], [x + w - 2.5, bt]], 0.6);
    for (const cx of f.chimneys) paintChimney(ctx, cx, bt, top, 7);
    for (const d of f.dormers) paintDormer(ctx, f, d);
    f.roofWalk = { y: top + 0.6, x0: x + 6, x1: x + w - 6, chimneyTop: top - 1 };
  } else {
    const rc = roof.kind === 'zinc' ? hex(roof.zinc) : hex(roof.tile);
    const rx = x + w * 0.42;
    poly(ctx, rc, [[x - 2, eave], [rx, top + 0.5], [x + w + 2, eave]]);
    poly(ctx, light(rc, 0.35), [[x - 2, eave], [rx, top + 0.5], [rx, eave]]);
    poly(ctx, shade(rc, 0.32), [[rx, top + 0.5], [x + w + 2, eave], [rx, eave]]);
    ctx.strokeStyle = rgba(amb(shade(rc, 0.5)), 0.8); ctx.lineWidth = 0.45; ctx.beginPath();
    for (let yy = top + 3; yy < eave; yy += roof.kind === 'tile' ? 2.4 : 3.2) { const t = (yy - top) / (eave - top); ctx.moveTo(rx - (rx - x + 2) * t, yy); ctx.lineTo(rx + (x + w + 2 - rx) * t, yy); } ctx.stroke();
    fillRect(ctx, light(rc, 0.5), rx - 1, top + 0.3, 2, 0.8);
    inkLine(ctx, [[x - 2, eave], [rx, top + 0.5], [x + w + 2, eave]], 0.9);
    const ridgeAt = (cx) => top + 0.5 + (eave - top - 0.5) * (cx < rx ? (rx - cx) / (rx - x + 2) : (cx - rx) / (x + w + 2 - rx));
    for (const cx of f.chimneys) paintChimney(ctx, cx, ridgeAt(cx + 2), top - 2, 6);
    for (const d of f.dormers) paintDormer(ctx, f, d, ridgeAt);
    f.roofWalk = null;
  }
}
function paintChimney(ctx, cx, baseY, topY, hMax) {
  const ch = Math.min(hMax, baseY - topY);
  const bc = hex(BRICK);
  fillRect(ctx, bc, cx, baseY - ch, 4, ch); fillRect(ctx, shade(bc, 0.35), cx + 2.6, baseY - ch, 1.4, ch); fillRect(ctx, light(bc, 0.4), cx, baseY - ch, 0.9, ch);
  fillRect(ctx, '#6E3A2A', cx - 0.6, baseY - ch, 5.2, 1.2);
  for (let p = 0; p < 3; p++) fillRect(ctx, '#9E6A4A', cx + 0.3 + p * 1.4, baseY - ch - 2.2, 1, 2.3);
  inkRect(ctx, cx, baseY - ch, 4, ch, 0.6);
}
function paintDormer(ctx, f, d, ridgeAt) {
  const zc = f.roof.kind === 'mansard' ? hex(f.roof.zinc) : f.roof.kind === 'zinc' ? hex(f.roof.zinc) : hex(f.roof.tile);
  const night = isNight();
  const r = mulberry32(Math.round(d.cx * 11));
  const lit = night && r() < ENV.litFrac * 0.9;
  const glass = (gx, gy, gw, gh) => { if (lit) { ctx.fillStyle = r() < 0.3 ? LIT.cream : LIT.warm; ctx.fillRect(gx, gy, gw, gh); rawRect(ctx, 'rgba(255,255,255,0.25)', gx, gy, gw, gh * 0.3); rawRect(ctx, 'rgba(255,214,130,0.22)', gx - 1, gy + gh, gw + 2, 2.2); } else { fillRect(ctx, night ? GLASS_NIGHT : GLASS_DAY, gx, gy, gw, gh); ctx.fillStyle = night ? 'rgba(150,170,230,0.22)' : 'rgba(255,255,255,0.7)'; ctx.beginPath(); ctx.moveTo(gx, gy + gh * 0.5); ctx.lineTo(gx + gw * 0.6, gy); ctx.lineTo(gx + gw, gy); ctx.lineTo(gx, gy + gh); ctx.fill(); } ctx.strokeStyle = INK; ctx.lineWidth = 0.5; ctx.strokeRect(gx, gy, gw, gh); ctx.beginPath(); ctx.moveTo(gx + gw / 2, gy); ctx.lineTo(gx + gw / 2, gy + gh); ctx.stroke(); };
  const stone = light(hex(f.wall), 0.3);
  if (d.type === 'fronton-tri' || d.type === 'fronton-cintre') {
    const w = d.w, x = d.cx - w / 2, y = d.y, h = d.h;
    fillRect(ctx, shade(zc, 0.45), x + w - 0.5, y - 1, 2.2, h + 1);
    fillRect(ctx, stone, x - 1.2, y, w + 2.4, h);
    fillRect(ctx, shade(hex(f.wall), 0.3), x + w * 0.74, y, w * 0.26 + 1.2, h);
    if (d.type === 'fronton-tri') { poly(ctx, light(stone, 0.4), [[x - 2.2, y], [d.cx, y - 3.6], [x + w + 2.2, y]]); inkLine(ctx, [[x - 2.2, y], [d.cx, y - 3.6], [x + w + 2.2, y]], 0.7, true); }
    else { ctx.fillStyle = col(light(stone, 0.4)); ctx.beginPath(); ctx.moveTo(x - 2, y); ctx.arc(d.cx, y, w / 2 + 2, Math.PI, 0); ctx.closePath(); ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 0.7; ctx.beginPath(); ctx.arc(d.cx, y, w / 2 + 2, Math.PI, 0); ctx.closePath(); ctx.stroke(); }
    glass(x, y + 1, w, h - 2);
    inkRect(ctx, x - 1.2, y, w + 2.4, h, 0.6);
  } else if (d.type === 'oeil') {
    const R = 2.6;
    disc(ctx, stone, d.cx, d.y, R + 1); disc(ctx, shade(zc, 0.4), d.cx + 0.6, d.y + 0.6, R + 0.6); disc(ctx, stone, d.cx, d.y, R + 0.6);
    if (lit) { disc(ctx, LIT.warm, d.cx, d.y, R, true); rawRect(ctx, 'rgba(255,214,130,0.2)', d.cx - R - 1, d.y + R, 2 * R + 2, 2); } else { disc(ctx, night ? GLASS_NIGHT : GLASS_DAY, d.cx, d.y, R); ctx.fillStyle = night ? 'rgba(150,170,230,0.25)' : 'rgba(255,255,255,0.7)'; ctx.beginPath(); ctx.arc(d.cx - 0.6, d.y - 0.6, R * 0.55, 0, TAU); ctx.fill(); }
    ctx.strokeStyle = INK; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.arc(d.cx, d.y, R, 0, TAU); ctx.moveTo(d.cx - R, d.y); ctx.lineTo(d.cx + R, d.y); ctx.moveTo(d.cx, d.y - R); ctx.lineTo(d.cx, d.y + R); ctx.stroke();
    ctx.lineWidth = 0.5; ctx.beginPath(); ctx.arc(d.cx, d.y, R + 0.9, 0, TAU); ctx.stroke();
  } else if (d.type === 'capucine') {
    const w = d.w, x = d.cx - w / 2, y = Math.max(d.y, (ridgeAt ? ridgeAt(d.cx) : d.y) - 1), h = Math.max(5, Math.min(d.h, f.eave - y - 1));
    fillRect(ctx, light(hex(f.wall), 0.2), x - 1, y, w + 2, h);
    fillRect(ctx, shade(hex(f.wall), 0.3), x + w * 0.7, y, w * 0.3 + 1, h);
    poly(ctx, light(zc, 0.4), [[x - 2.5, y], [x - 0.5, y - 2.8], [x + w + 0.5, y - 2.8], [x + w + 2.5, y]]);
    poly(ctx, shade(zc, 0.3), [[x + w * 0.7, y], [x + w * 0.7, y - 2.8], [x + w + 0.5, y - 2.8], [x + w + 2.5, y]]);
    inkLine(ctx, [[x - 2.5, y], [x - 0.5, y - 2.8], [x + w + 0.5, y - 2.8], [x + w + 2.5, y]], 0.7, true);
    glass(x, y + 1, w, h - 2);
    inkRect(ctx, x - 1, y, w + 2, h, 0.6);
  } else if (d.type === 'tabatiere') {
    const w = 5, h = 2.6, x = d.cx - w / 2, y = d.y;
    poly(ctx, shade(zc, 0.5), [[x, y], [x + w, y], [x + w + 1.2, y + h], [x + 1.2, y + h]]);
    poly(ctx, lit ? LIT.warm : night ? hex('#3A4A7A') : hex('#BBD8F0'), [[x + 0.5, y + 0.4], [x + w - 0.5, y + 0.4], [x + w + 0.5, y + h - 0.4], [x + 1.5, y + h - 0.4]], lit);
    if (!night) poly(ctx, 'rgba(255,255,255,0.75)', [[x + 0.5, y + 0.4], [x + w * 0.5, y + 0.4], [x + 1.5, y + h - 0.4]], true);
    inkLine(ctx, [[x, y], [x + w, y], [x + w + 1.2, y + h], [x + 1.2, y + h]], 0.5, true);
  }
}

// ───────────── vie des toits : chat, pigeons, fumées, couvreur ─────────────
// Chat (immeuble héros) : sort par la tabatière, longe le terrasson, s'assoit contre la souche, repart. Trois sorties par jour.
const CAT_TRIPS = [[10.78, 11.7], [16.1, 16.9], [23.05, 23.75]];
function catState(f, T) {
  if (!f.roofWalk || !f.cat) return null;
  const tab = f.dormers.find((d) => d.type === 'tabatiere'); if (!tab) return null;
  const x0 = tab.cx + 2.5, x1 = f.chimneys[0] + 5.6, y = f.roofWalk.y;
  for (const [a, b] of CAT_TRIPS) {
    if (T < a || T > b) continue;
    const em = 20 * SEC, walk = 50 * SEC;
    if (T < a + em) return { x: x0, y, mode: 'emerge', p: (T - a) / em, dir: 1 };
    if (T < a + em + walk) return { x: lerp(x0, x1, (T - a - em) / walk), y, mode: 'walk', ph: (T - a) / SEC, dir: x1 > x0 ? 1 : -1 };
    if (T < b - em - walk) return { x: x1, y, mode: 'sit', dir: x1 > x0 ? -1 : 1, ph: (T - a) / SEC };
    if (T < b - em) return { x: lerp(x1, x0, (T - (b - em - walk)) / walk), y, mode: 'walk', ph: (T - a) / SEC, dir: x1 > x0 ? -1 : 1 };
    return { x: x0, y, mode: 'emerge', p: 1 - (T - (b - em)) / em, dir: -1 };
  }
  return null;
}
function paintCat(ctx, c, tabY) {
  const night = isNight();
  const body = night ? rgba(amb(hex('#4A3E48'))) : col('#8A6A4A'), ink = INK;
  ctx.save();
  if (c.mode === 'emerge') { ctx.beginPath(); ctx.rect(c.x - 5, tabY - 8, 10, 8 + 1.2); ctx.clip(); ctx.translate(0, (1 - smooth(sat(c.p))) * 3.2); }
  const x = c.x, y = c.y, d = c.dir;
  ctx.lineCap = 'round';
  if (c.mode === 'sit') {
    // assis : corps ovale haut, tête, oreilles, queue enroulée
    ctx.fillStyle = ink; ctx.beginPath(); ctx.ellipse(x, y - 1.6, 1.6, 2.0, 0, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.arc(x + d * 0.4, y - 3.9, 1.25, 0, TAU); ctx.fill();
    ctx.fillStyle = body; ctx.beginPath(); ctx.ellipse(x, y - 1.6, 1.25, 1.7, 0, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.arc(x + d * 0.4, y - 3.9, 0.95, 0, TAU); ctx.fill();
    poly(ctx, ink, [[x + d * 0.4 - 1.0, y - 4.4], [x + d * 0.4 - 0.9, y - 5.6], [x + d * 0.4 - 0.1, y - 4.7]], true); poly(ctx, ink, [[x + d * 0.4 + 1.0, y - 4.4], [x + d * 0.4 + 0.9, y - 5.6], [x + d * 0.4 + 0.1, y - 4.7]], true);
    ctx.strokeStyle = ink; ctx.lineWidth = 0.7; ctx.beginPath(); ctx.moveTo(x - d * 1.2, y - 0.3); ctx.quadraticCurveTo(x - d * 3.4, y - 0.4 + Math.sin(c.ph / 2) * 0.4, x - d * 3.2, y - 1.6); ctx.stroke();
    if (night) { ctx.fillStyle = '#C8FF8A'; ctx.fillRect(x + d * 0.4 - 0.7, y - 4.1, 0.4, 0.4); ctx.fillRect(x + d * 0.4 + 0.3, y - 4.1, 0.4, 0.4); }
  } else {
    // marche : corps allongé, pattes en ciseaux, queue levée
    const ph = (c.ph || 0) * 4, s = Math.sin(ph) * 0.9;
    ctx.strokeStyle = ink; ctx.lineWidth = 0.7;
    [[-1.2, s], [-0.6, -s], [0.9, -s], [1.5, s]].forEach(([ox, sx]) => { ctx.beginPath(); ctx.moveTo(x + ox * d, y - 1.4); ctx.lineTo(x + ox * d + sx * d * 0.6, y); ctx.stroke(); });
    ctx.fillStyle = ink; ctx.beginPath(); ctx.ellipse(x, y - 1.6, 2.3, 1.05, 0, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.arc(x + d * 2.4, y - 2.3, 1.1, 0, TAU); ctx.fill();
    ctx.fillStyle = body; ctx.beginPath(); ctx.ellipse(x, y - 1.6, 1.95, 0.75, 0, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.arc(x + d * 2.4, y - 2.3, 0.8, 0, TAU); ctx.fill();
    poly(ctx, ink, [[x + d * 1.9, y - 2.9], [x + d * 1.8, y - 3.9], [x + d * 2.5, y - 3.1]], true); poly(ctx, ink, [[x + d * 3.1, y - 2.8], [x + d * 3.1, y - 3.8], [x + d * 2.5, y - 3.1]], true);
    ctx.strokeStyle = ink; ctx.lineWidth = 0.7; ctx.beginPath(); ctx.moveTo(x - d * 2.2, y - 1.8); ctx.quadraticCurveTo(x - d * 3.4, y - 2.6, x - d * 3.2 + Math.sin(ph / 3) * 0.4, y - 4.2); ctx.stroke();
  }
  ctx.restore();
}
// Pigeons : vol = { perched: [x..], cycle 14 min : posés 10,5 min, envol 25 s, absents, retour 25 s }.
function flockState(fl, T) {
  const P = 14 * MIN, c = ((T - fl.phase) % P + P) % P;
  const to = 10.5 * MIN, tf = 25 * SEC, back = P - 25 * SEC;
  if (c < to) return { mode: 'perched' };
  if (c < to + tf) return { mode: 'takeoff', p: (c - to) / tf };
  if (c >= back) return { mode: 'land', p: (c - back) / (25 * SEC) };
  return { mode: 'away' };
}
function flockPaint(ctx, fl, T, flying) {
  const st = flockState(fl, T), s = T / SEC;
  fl.birds.forEach((b, i) => {
    const px = fl.x + b.ox, py = fl.y;
    if (st.mode === 'perched' && !flying) { paintPigeon(ctx, px, py, 0, s + i, false, b.dir); return; }
    if (st.mode === 'away' || st.mode === 'perched') return;
    if (!flying) return;
    const p = st.mode === 'takeoff' ? st.p : 1 - st.p, q = sat(p + i * 0.04), far = st.mode === 'takeoff' ? [px + 110 + i * 10, py - 150] : [px - 120 - i * 10, py - 140];
    const cx = st.mode === 'takeoff' ? px + 30 : px - 40, cy = py - 60;
    const x = (1 - q) * (1 - q) * px + 2 * (1 - q) * q * cx + q * q * far[0], y = (1 - q) * (1 - q) * py + 2 * (1 - q) * q * cy + q * q * far[1];
    paintPigeon(ctx, x, y, 1, s * 9 + i, true, st.mode === 'takeoff' ? 1 : -1);
  });
}
function paintPigeon(ctx, x, y, fly, ph, flying, dir) {
  const c = col('#8A8FA0');
  ctx.fillStyle = INK;
  if (!flying) { ctx.beginPath(); ctx.ellipse(x, y - 1.1, 1.3, 0.95, 0, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.arc(x + dir * 1.1, y - 1.9, 0.6, 0, TAU); ctx.fill(); ctx.fillStyle = c; ctx.beginPath(); ctx.ellipse(x, y - 1.1, 1.0, 0.7, 0, 0, TAU); ctx.fill(); ctx.fillStyle = INK; ctx.fillRect(x - dir * 2.0, y - 1.2, 1.0, 0.45); if (Math.sin(ph) > 0.8) { ctx.fillRect(x + dir * 1.5, y - 1.95, 0.5, 0.3); } }
  else { const f = Math.sin(ph) * 2.2; ctx.strokeStyle = INK; ctx.lineWidth = 0.8; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x - 2.4, y - f); ctx.quadraticCurveTo(x - 1.2, y - f * 0.3, x, y); ctx.quadraticCurveTo(x + 1.2, y - f * 0.3, x + 2.4, y - f); ctx.stroke(); ctx.fillStyle = INK; ctx.beginPath(); ctx.ellipse(x, y, 1.1, 0.6, 0, 0, TAU); ctx.fill(); }
}
// Fumée de cheminée (hiver, foyer allumé) : bouffées qui montent et dérivent, fonction pure de T.
function paintSmoke(ctx, cx, topY, T) {
  const s = T / SEC;
  for (let i = 0; i < 6; i++) { const age = ((s + i * 2.3) % 14); const a = 0.5 * (1 - age / 14); ctx.fillStyle = isNight() ? `rgba(200,205,225,${a})` : `rgba(235,235,242,${a})`; ctx.beginPath(); ctx.arc(cx + 2 + age * 0.5 + Math.sin(age + i) * 0.6, topY - 2 - age * 0.9, 0.9 + age * 0.22, 0, TAU); ctx.fill(); }
}
// Couvreur (mardi / jeudi 9 h – 16 h 30) : échelle sur le brisis, à genoux sur le terrasson, martèle le zinc ; seau d'outils.
function paintRoofer(ctx, f, T) {
  if (!f.roofWalk || !f.roofer) return; if (T < 9 || T > 16.5 || (T > 12.3 && T < 13.4)) return;
  const x = f.x + f.w * 0.62, y = f.roofWalk.y, s = T / SEC;
  // échelle contre le brisis
  ctx.strokeStyle = '#8A5A2E'; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(x + 10, f.eave + 1); ctx.lineTo(x + 7, y); ctx.moveTo(x + 13, f.eave + 1); ctx.lineTo(x + 10, y); for (let k = 0; k < 5; k++) { const t = k / 4.5; ctx.moveTo(lerp(x + 10, x + 7, t), lerp(f.eave + 1, y, t)); ctx.lineTo(lerp(x + 13, x + 10, t), lerp(f.eave + 1, y, t)); } ctx.stroke();
  const hit = Math.max(0, Math.sin(s * 5)), P = { ...POSE.kneel, aR: [80 - hit * 50, -60 + hit * 30] };
  const J = drawFigure(ctx, x, y, 11, P, 1, { mem: { shirt: '#F6C62E', pants: '#2E3A4A', skin: '#D9A070' }, amb: true, hair: '#E8E8E8' });
  // casque, marteau, seau
  ctx.fillStyle = '#F6C62E'; ctx.beginPath(); ctx.arc(x + J.head[0], y + J.head[1] - 0.3, 1.1, Math.PI, 0); ctx.fill();
  inkLine(ctx, [[x + J.hR[0], y + J.hR[1]], [x + J.hR[0] + 1.6, y + J.hR[1] - 1.4 + hit]], 0.7);
  fillRect(ctx, '#5A5A74', x - 4.5, y - 2.2, 2.6, 2.2); inkRect(ctx, x - 4.5, y - 2.2, 2.6, 2.2, 0.4);
}
function paintRoofLife(ctx, f, sc) {
  const T = sc.T;
  if (f.roofWalk) {
    const c = catState(f, T); if (c) { const tab = f.dormers.find((d) => d.type === 'tabatiere'); paintCat(ctx, c, tab ? tab.y + 0.5 : f.top); }
    paintRoofer(ctx, f, T);
  }
  if (sc.D.winter) { const anyLit = sc.states.some((st) => st && Object.values(st.lit).some(Boolean)); const r = mulberry32(Math.round(f.x)); f.chimneys.forEach((cx, i) => { if ((anyLit || T < 9) && r() < 0.7) paintSmoke(ctx, cx, f.roofWalk ? f.top - 1 : f.top - 3, T + i); }); }
  for (const fl of f.flocks || []) flockPaint(ctx, fl, T, false);
}
