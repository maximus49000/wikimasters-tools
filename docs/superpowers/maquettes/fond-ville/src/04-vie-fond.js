// ───────────── vie du fond (animée : fonction pure de (graine, date, heure, météo), rien n'apparaît sur place) ─────────────
// Dans l'appli : calque SVG « vie-fond » entre les tranches peintes et les fenêtres allumées, à nœuds constants (voir notes.md).
// Chaque fonction `*At(T)` rend la pose à l'instant T ; les lumières (allumées la nuit, hors étalonnage) sont dans paintLights.

// C : fumées de cheminée. Par jour froid (nov.–mars, neige), moins d'une cheminée sur trois fume (tirage du jour) le matin (6 h 20 – 9 h 30)
// et le soir (17 h – 22 h 30), chacune à ses heures. Le panache est une file de bouffées nées au conduit toutes les 1,4 s, qui
// montent, dérivent sous le vent, grossissent et pâlissent sur 9 s : jamais coupé net, il se dissipe.
const PUFF_P = 1.4, PUFF_LIFE = 9;
function smokeK(T, D, ch, seed) {
  if (!D.cold) return 0;
  const r = rngOf(seed, `fumee-${ch.key}`, D.date); if (r() > 0.3) return 0;
  const o1 = r() * 1.2, o2 = r() * 1.5;
  return Math.max(Math.min(ramp(T, 6.3 + o1, 3 * MIN), 1 - ramp(T, 8.6 + o1, 3 * MIN)), Math.min(ramp(T, 17 + o2, 3 * MIN), 1 - ramp(T, 21.8 + o2, 3 * MIN)));
}
function paintSmoke(ctx, ch, env, seed, counter) {
  const kNow = smokeK(env.T, env.D, ch, seed); if (kNow <= 0 && smokeK(env.T - PUFF_LIFE * SEC, env.D, ch, seed) <= 0) return;
  counter.fumees++;
  const t = env.seconds, wind = 0.5 + env.D.meteo.wind * 2.2, s = ch.s, tint = haze(hexRgb('#ECE8E4'), ch.haze);
  const i0 = Math.floor(t / PUFF_P);
  for (let i = i0; i > i0 - PUFF_LIFE / PUFF_P; i--) {
    const born = i * PUFF_P, a = t - born; if (a < 0 || a > PUFF_LIFE) continue;
    const kb = smokeK(born * SEC, env.D, ch, seed); if (kb <= 0) continue;
    const q = a / PUFF_LIFE, x = ch.x + a * wind * (0.6 + 0.4 * q) + Math.sin(a * 0.9 + i) * 0.5 * s, y = ch.y - a * (2.2 - 1.2 * q) * s;
    const r = (0.8 + a * 0.42) * s, alpha = kb * Math.min(1, a / 0.7) * (1 - q) * 0.6;
    disc(ctx, rgba(tint, alpha), x, y, r);
    disc(ctx, rgba(light(tint, 0.4), alpha * 0.6), x - r * 0.3, y - r * 0.3, r * 0.55);
  }
}

// D : trafic de la route en lacets. Départs par heure tirés de (graine, date, heure) : pointes 7-9 h et 17-19 h, presque rien la
// nuit ; chaque véhicule entre derrière une maison (bas ou haut de la route) et sort derrière l'autre, à vitesse constante.
const TRAFFIC = (h, D) => { const we = D.kind === 'weekend' || D.kind === 'public-holiday'; if (h >= 7 && h < 9) return we ? 2 : 5; if (h >= 17 && h < 19) return we ? 3 : 5; if (h >= 9 && h < 17) return 3; if (h >= 19 && h < 22) return 2; if (h === 6 || h === 22) return 1; return 0.4; };
function vehiclesAt(e, env, seed) {
  const out = [];
  for (let h = Math.floor(env.T) - 1; h <= Math.floor(env.T); h++) {
    const hh = (h + 24) % 24, r = rngOf(seed, `trafic-${e.band}-${hh}`, env.D.date), rate = TRAFFIC(hh, env.D), n = Math.floor(rate) + (r() < rate % 1 ? 1 : 0);
    for (let k = 0; k < n; k++) {
      const t0 = h + r(), up = r() < 0.5, bus = r() < 0.15, color = pick(CARS, r), speed = bus ? 5.5 : 6.5 + r() * 2;
      const d = (env.T - t0) * 3600 * speed; if (d < 0 || d > e.L) continue;
      const p = roadPoint(e, up ? e.L - d : d); out.push({ ...p, up, bus, color, dir: up ? -p.dir : p.dir });
    }
  }
  return out;
}
function paintVehicle(ctx, v) {
  const w = v.bus ? 6 : 4, h = v.bus ? 2.6 : 2, x = v.x - w / 2, y = v.y - h - 0.4, c = v.bus ? BUS : v.color;
  fillRect(ctx, haze(c, 0.15), x, y, w, h); fillRect(ctx, haze(shade(c, 0.35), 0.15), x + (v.dir > 0 ? w * 0.6 : 0), y, w * 0.4, h);
  fillRect(ctx, haze(light(c, 0.5), 0.15), x + w * 0.25, y - 0.6, w * 0.5, 0.7);
  fillRect(ctx, ink(0.8), x + 0.4, y + h - 0.2, 1, 0.7); fillRect(ctx, ink(0.8), x + w - 1.4, y + h - 0.2, 1, 0.7);
}

// J : funiculaire. Service 6 h – 0 h 45 ; un cycle = montée (110 s) puis attente en gare, toutes les 5 min (10 min après 21 h) ;
// les deux cabines sont solidaires du câble : l'une monte quand l'autre descend, elles se croisent à mi-pente.
function funiAt(e, env) {
  const T = env.T, on = T >= 6 || T < 0.75; if (!on) return { a: 0, b: 1, moving: false };
  const P = T >= 21 || T < 0.75 ? 600 : 300, t = env.seconds % (2 * P), half = t < P ? t : t - P, prog = smooth(Math.min(1, half / 110));
  const a = t < P ? prog : 1 - prog; return { a, b: 1 - a, moving: half < 110 };
}
function paintFuni(ctx, e, env, counter) {
  const f = e.funi, st = funiAt(e, env); if (st.moving) counter.vehicules += 2;
  const at = (p, o) => ({ x: f.x0 + (f.x1 - f.x0) * p + o, y: f.y0 + (f.y1 - f.y0) * p });
  const pa = at(st.a, -FUNI_GAP), pb = at(st.b, FUNI_GAP);
  ctx.strokeStyle = ink(0.5); ctx.lineWidth = 0.4; ctx.beginPath(); ctx.moveTo(pa.x, pa.y - 1); ctx.lineTo(f.x1 - FUNI_GAP, f.y1 - 1); ctx.moveTo(pb.x, pb.y - 1); ctx.lineTo(f.x1 + FUNI_GAP, f.y1 - 1); ctx.stroke();
  for (const p of [pa, pb]) {
    const c = haze(CABIN, 0.18); fillRect(ctx, c, p.x - 3, p.y - 5, 6, 4.4); fillRect(ctx, shade(c, 0.35), p.x + 1, p.y - 5, 2, 4.4);
    fillRect(ctx, light(c, 0.45), p.x - 3.3, p.y - 5.6, 6.6, 0.8); fillRect(ctx, haze(GLASS_FAR, 0.3), p.x - 2.2, p.y - 4.2, 1.6, 1.6); fillRect(ctx, haze(GLASS_FAR, 0.3), p.x + 0.2, p.y - 4.2, 1.6, 1.6);
    ctx.strokeStyle = ink(0.8); ctx.lineWidth = 0.5; ctx.strokeRect(p.x - 3, p.y - 5, 6, 4.4);
  }
  return st;
}

// E : aiguilles de la tour-horloge à l'heure de la scène.
function paintClock(ctx, l, env) {
  const { x, s, base } = l, cx = x + 7 * s, cy = base - 70 * s + 12 * s, T = env.T;
  const ah = ((T % 12) / 12) * TAU - Math.PI / 2, am = ((T % 1) * 1) * TAU - Math.PI / 2;
  ctx.strokeStyle = ink(0.95); ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(ah) * 2.6 * s, cy + Math.sin(ah) * 2.6 * s); ctx.stroke();
  ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(am) * 3.8 * s, cy + Math.sin(am) * 3.8 * s); ctx.stroke();
}
// L : à l'heure pile (8 h – 21 h), la cloche fait s'envoler les six pigeons du beffroi : un tour de la tour en 40 s, puis ils se
// reposent. Le reste du temps, ils sont posés sur la corniche du beffroi (on ne les voit partir que de là).
function paintPigeons(ctx, l, env, counter) {
  const { x, s, base } = l, cx = x + 7 * s, top = base - 70 * s, ledge = top + 8.5 * s, h = Math.floor(env.T), age = (env.T - h) * 3600;
  const flying = h >= 8 && h <= 21 && age < 40;
  if (!flying) { ctx.fillStyle = ink(0.85); for (let i = 0; i < 6; i++) ctx.fillRect(x + 1.5 * s + i * 2 * s, ledge - 0.9, 1.1, 0.9); return; }
  counter.oiseaux += 6;
  const q = age / 40, spread = Math.min(1, age / 5, (40 - age) / 5);
  for (let i = 0; i < 6; i++) {
    const a = -Math.PI / 2 + q * TAU * 1.2 + i * 0.55, rx = (14 + i * 1.2) * s * spread, ry = 7 * s * spread, px = cx + Math.cos(a) * rx, py = ledge - 3 * s - Math.sin(a) * ry - spread * 4 * s, flap = Math.sin(age * 14 + i) * 0.7;
    ctx.strokeStyle = ink(0.85); ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(px - 1.1, py - flap); ctx.lineTo(px, py + 0.3); ctx.lineTo(px + 1.1, py - flap); ctx.stroke();
  }
}
// N : drapeau tricolore sur la tour et le dôme les jours de fête nationale, hissé à 8 h, amené au coucher du soleil ; trois poses
// clés de flottement (le vent de la météo règle la cadence).
function paintFlag(ctx, l, env, counter) {
  if (!env.D.national) return;
  const T = env.T, ss = sunsAt(env.D.month, env.D.day)[1], k = Math.min(ramp(T, 8, 1 * MIN), 1 - ramp(T, ss, 1 * MIN)); if (k <= 0) return;
  counter.drapeaux++;
  const { x, s, base } = l, px = l.kind === 'tower' ? x + 14 * s + 1.8 * s : x + 13 * s, py = l.kind === 'tower' ? base - 70 * s - 2 * s : base - 44 * s - 1, fh = 3 * s, fw = 5 * s;
  if (l.kind === 'dome') fillRect(ctx, ink(0.8), px - 0.3, py - 6 * s, 0.6, 6 * s);
  const top = (l.kind === 'tower' ? py : py - 6 * s) + (1 - k) * 6 * s, pose = Math.floor(env.seconds * (2 + env.D.meteo.wind * 6)) % 3, dy = [-0.5, 0, 0.5][pose], w = fw * [0.92, 1, 0.96][pose];
  const cols = ['#2E4A9A', '#F4F0E8', '#D84040'];
  for (let i = 0; i < 3; i++) poly(ctx, haze(hexRgb(cols[i]), 0.15), [[px + (w / 3) * i, top + (i / 3) * dy * 0.5], [px + (w / 3) * (i + 1), top + ((i + 1) / 3) * dy], [px + (w / 3) * (i + 1), top + fh + ((i + 1) / 3) * dy], [px + (w / 3) * i, top + fh + (i / 3) * dy * 0.5]]);
  inkPath(ctx, [[px, top], [px + w, top + dy], [px + w, top + fh + dy], [px, top + fh]], 0.4, 0.7, true);
}

// F : vols au loin. Automne-hiver : nuées d'étourneaux au crépuscule (3 passages, 75 s chacun) ; été : martinets le soir (4 passages
// de 40 s) ; printemps : deux passages de martinets. Entrée par un bord, sortie par l'autre.
function flightsOf(env, seed) {
  const D = env.D, r = rngOf(seed, 'vols', D.date), ss = sunsAt(D.month, D.day)[1], out = [];
  const starl = D.month >= 10 || D.month <= 2, swift = D.season === 'summer' || D.season === 'spring';
  if (starl) for (let i = 0; i < 3; i++) out.push({ kind: 'starlings', t0: ss - 1.3 + r() * 1.3, dur: 75, dir: r() < 0.5 ? 1 : -1, y0: 16 + r() * 30, n: 36, seed: r() * 1000 });
  if (swift) for (let i = 0; i < (D.season === 'summer' ? 4 : 2); i++) out.push({ kind: 'swifts', t0: ss - 3.2 + r() * 2.8, dur: 40, dir: r() < 0.5 ? 1 : -1, y0: 20 + r() * 40, n: 6, seed: r() * 1000 });
  return out;
}
function paintFlights(ctx, env, seed, counter) {
  if (env.D.meteo.precip > 0.3) return;
  for (const f of flightsOf(env, seed)) {
    const t = (env.T - f.t0) * 3600; if (t < 0 || t > f.dur) continue;
    counter.oiseaux += f.n;
    const x0 = f.dir > 0 ? -60 : W + 60, cx = x0 + f.dir * t * ((W + 120) / f.dur), cy = f.y0 + Math.sin(t * 0.35 + f.seed) * 8;
    ctx.fillStyle = ink(0.7); ctx.strokeStyle = ink(0.75); ctx.lineWidth = 0.5;
    if (f.kind === 'starlings') {
      const sq = 0.7 + 0.3 * Math.sin(t * 0.5 + f.seed);
      for (let j = 0; j < f.n; j++) { const a = j * 2.399 + f.seed, rx = 6 + (j % 7) * 2.6, ry = 2.5 + (j % 5) * 1.1; ctx.fillRect(cx + Math.cos(a + t * 1.1) * rx * sq, cy + Math.sin(a * 1.7 + t * 0.8) * ry / sq, 0.8, 0.6); }
    } else {
      for (let j = 0; j < f.n; j++) { const px = cx + Math.sin(t * 1.7 + j * 1.3) * 18 - j * 7 * f.dir, py = cy + Math.sin(t * 2.3 + j) * 9 + j * 2; ctx.beginPath(); ctx.moveTo(px - 1.2, py - 0.5); ctx.lineTo(px, py + 0.4); ctx.lineTo(px + 1.2, py - 0.5); ctx.stroke(); }
    }
  }
}

// M : brume au creux de la colline, matins frais d'automne-hiver (se lève vers 9 h – 10 h 30) et temps de brouillard : deux
// nappes plates (cellulo) et des écharpes qui dérivent avec le vent.
function mistK(env) { const D = env.D; if (D.meteo.fog > 0.4) return D.meteo.fog; if (D.season === 'autumn' || D.season === 'winter') return 0.75 * (1 - ramp(env.T, 8.8, 1.8)) * ramp(env.T, 5, 1); return 0; }
function paintMist(ctx, env, counter) {
  const k = mistK(env); if (k <= 0) return;
  counter.brume = 1;
  const y0 = H * 0.3, mist = 'rgba(232,238,246,';
  ctx.fillStyle = mist + (0.45 * k).toFixed(3) + ')'; ctx.fillRect(0, y0 + 6, W, H * 0.7 - y0 - 6);
  ctx.fillStyle = mist + (0.3 * k).toFixed(3) + ')'; ctx.fillRect(0, y0 - 2, W, 8);
  ctx.fillStyle = mist + (0.35 * k).toFixed(3) + ')';
  const drift = env.seconds * (0.3 + env.D.meteo.wind * 1.5);
  for (let i = 0; i < 12; i++) { const x = (((i * 173 + drift) % (W + 140)) + W + 140) % (W + 140) - 70, y = y0 - 8 + (i % 3) * 5 + Math.sin(i) * 2; ctx.beginPath(); ctx.roundRect(x, y, 56 + (i % 4) * 14, 5, 2.5); ctx.fill(); }
}

// I : grue de chantier certaines semaines (tirage par bande), montée le lundi 7 h – 9 h, démontée le vendredi 17 h – 19 h ; la flèche
// pivote lentement aux heures ouvrées (lundi–vendredi 8 h – 17 h) et reste figée le reste du temps.
function craneK(e, env) {
  const D = env.D; if (!e.crane.weeks.has(D.week % 52)) return 0;
  const wd = D.weekday, T = env.T;
  if (wd === 0 || wd === 6) return 0;
  if (wd === 1) return ramp(T, 7, 2); if (wd === 5) return 1 - ramp(T, 17, 2); return 1;
}
function paintCrane(ctx, e, env, counter) {
  const k = craneK(e, env); if (k <= 0) return;
  const c = e.crane, D = env.D, T = env.T, work = D.weekday >= 1 && D.weekday <= 5 && T >= 8 && T < 17;
  if (work) counter.grue = 1;
  const tw = T < 8 ? 0 : work ? (T - 8) * 3600 : 9 * 3600, ang = -0.5 + 0.55 * Math.sin(tw / 45), mast = c.mast * smooth(k), boom = c.boom * sat((k - 0.6) / 0.4);
  const col = haze(hexRgb('#F0C030'), 0.2);
  ctx.strokeStyle = rgba(col, 1); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(c.x, c.base); ctx.lineTo(c.x, c.base - mast); ctx.stroke();
  ctx.strokeStyle = ink(0.6); ctx.lineWidth = 0.4; ctx.beginPath(); for (let y = c.base; y > c.base - mast; y -= 3) { ctx.moveTo(c.x - 0.6, y); ctx.lineTo(c.x + 0.6, y - 3); } ctx.stroke();
  if (boom > 0) {
    const ty = c.base - mast, bx = c.x + Math.cos(ang) * boom, by = ty + Math.sin(ang) * boom * 0.25, cbx = c.x - Math.cos(ang) * boom * 0.35, cby = ty - Math.sin(ang) * boom * 0.25 * 0.35;
    ctx.strokeStyle = rgba(col, 1); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(cbx, cby); ctx.lineTo(bx, by); ctx.stroke();
    ctx.strokeStyle = ink(0.6); ctx.lineWidth = 0.4; ctx.beginPath(); ctx.moveTo(c.x, ty - 3); ctx.lineTo(bx, by); ctx.moveTo(c.x, ty - 3); ctx.lineTo(cbx, cby); ctx.stroke();
    fillRect(ctx, ink(0.8), cbx - 1, cby - 0.5, 2, 1.4);
    const hx = c.x + Math.cos(ang) * boom * (0.55 + 0.25 * Math.sin(tw / 70)), hy = ty + Math.sin(ang) * boom * 0.25 * 0.6; ctx.strokeStyle = ink(0.6); ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(hx, hy + 5 + 3 * Math.sin(tw / 30)); ctx.stroke();
  }
}

// G : léger balancement des bouquets d'arbres au vent (décalage d'une fraction de pixel du feuillage clair : repeint par-dessus).
function paintTreeSway(ctx, F, env, counter) {
  const wind = env.D.meteo.wind; if (wind < 0.25) return;
  for (const h of F.houses) if (h.trees) {
    counter.arbres++;
    const { x: tx, r: tr } = h.trees, ty = h.base - 6 * h.s, dx = Math.sin(env.seconds * (0.8 + wind) + tx) * wind * 1.2, tone = LEAF_SEASON[env.D.season][2];
    if (env.D.season === 'winter') continue;
    disc(ctx, haze(hexRgb(tone), h.haze), tx - tr * 0.5 + dx, ty - tr * 0.56, tr * 0.4); disc(ctx, haze(hexRgb(tone), h.haze), tx + tr * 0.3 + dx * 0.8, ty - tr * 0.26, tr * 0.32);
  }
}

// ── Lumières (hors étalonnage de nuit, comme le calque des fenêtres de l'appli) ──
const lampOn = (lamp, env) => env.daylight < lamp.u && lampLit({ x: 0, offJitter: lamp.off }, env.minutes, env.daylight);
function paintLampLight(ctx, x, y, on) { if (!on) return; disc(ctx, 'rgba(255,224,150,0.25)', x, y, 2.6); disc(ctx, '#FFE8B0', x, y, 0.9); }
function paintLightsHill(ctx, F, env, counter) {
  const day = { weekday: env.D.weekday, kind: env.D.kind }, gloom = env.D.meteo.gloom;
  // A : fenêtres allumées des maisons de la colline (atténuées par la brume), seuils par fenêtre : allumages un à un.
  for (const h of [...F.houses, ...F.crestHouses, ...F.escapes.flatMap((e) => e.houses)]) for (const wn of h.lit) if (windowLit(wn.u, env.minutes, day, env.daylight, gloom)) { counter.fenetres++; ctx.fillStyle = wn.blue ? LIT_BLUE : LIT_WARM; ctx.globalAlpha = 0.5 * (1 - h.haze); ctx.fillRect(wn.x, wn.y, wn.w, wn.h); }
  ctx.globalAlpha = 1;
  for (const e of F.escapes) {
    for (const l of e.lamps) { const p = roadPoint(e, l.d); paintLampLight(ctx, p.x + 1, p.y - 4, lampOn(l, env)); }
    const f = e.funi; paintLampLight(ctx, f.x0 - 7.5, f.y0 + 1, lampOn({ u: 0.44, off: 5 }, env)); paintLampLight(ctx, f.x1 + 7.5, f.y1 - 15, lampOn({ u: 0.45, off: 0 }, env));
    const st = e.stairs, sdx = st.x1 - st.x0, sdy = st.y1 - st.y0, sL = Math.hypot(sdx, sdy), snx = -sdy / sL * 3.2, sny = sdx / sL * 3.2; for (const q of [0.2, 0.5, 0.8]) paintLampLight(ctx, st.x0 + sdx * q + snx + 0.8, st.y0 + sdy * q + sny - 4.5, lampOn({ u: 0.42 + q * 0.04, off: 3 }, env));
    // J : fenêtres des cabines éclairées la nuit ; D : phares et feux rouges ; I : feu rouge de la grue.
    if (env.dark) {
      const st = funiAt(e, env), at = (p, o) => ({ x: f.x0 + (f.x1 - f.x0) * p + o, y: f.y0 + (f.y1 - f.y0) * p });
      for (const p of [at(st.a, -FUNI_GAP), at(st.b, FUNI_GAP)]) { ctx.fillStyle = 'rgba(255,223,160,0.85)'; ctx.fillRect(p.x - 2.2, p.y - 4.2, 1.6, 1.6); ctx.fillRect(p.x + 0.2, p.y - 4.2, 1.6, 1.6); }
      for (const v of vehiclesAt(e, env, F.seed)) { const w = v.bus ? 6 : 4; disc(ctx, 'rgba(255,240,200,0.35)', v.x + v.dir * (w / 2 + 1.5), v.y - 1.2, 1.6); fillRect(ctx, '#FFF4D0', v.x + v.dir * (w / 2) - 0.3, v.y - 1.6, 0.7, 0.7); fillRect(ctx, '#FF5040', v.x - v.dir * (w / 2) - 0.3, v.y - 1.6, 0.7, 0.7); }
      if (craneK(e, env) >= 1 && Math.floor(env.seconds) % 2 === 0) disc(ctx, '#FF4030', e.crane.x, e.crane.base - e.crane.mast - 1, 0.7);
    }
  }
  for (const l of F.crestLamps) paintLampLight(ctx, l.x, l.y - 3, lampOn(l, env));
  // N : monuments illuminés du crépuscule à 1 h (lavis chaud sur la pierre) ; E : cadran éclairé la nuit.
  const monu = env.daylight < 0.4 && (env.T >= 12 || env.T < 1) ? Math.min(1, (0.4 - env.daylight) / 0.2) * (env.T < 1 ? 1 - ramp(env.T, 0.9, 0.1) : 1) : 0;
  for (const l of F.landmarks) {
    const { x, s, base } = l;
    if (l.kind === 'tower') {
      if (monu > 0) { ctx.fillStyle = `rgba(255,214,140,${0.28 * monu})`; ctx.fillRect(x, base - 70 * s, 14 * s, 70 * s); ctx.beginPath(); ctx.moveTo(x - 2 * s, base - 70 * s); ctx.lineTo(x + 7 * s, base - 92 * s); ctx.lineTo(x + 16 * s, base - 70 * s); ctx.closePath(); ctx.fill(); }
      if (env.dark) { disc(ctx, `rgba(255,236,190,${0.6 * env.night})`, x + 7 * s, base - 58 * s, 4.2 * s); paintClock(ctx, l, env); }
    } else if (monu > 0) { ctx.fillStyle = `rgba(255,214,140,${0.26 * monu})`; ctx.beginPath(); ctx.arc(x + 13 * s, base - 26 * s, 13 * s, Math.PI, 0); ctx.fill(); ctx.fillRect(x, base - 26 * s, 26 * s, 26 * s); }
  }
}
function paintLightsWall(ctx, F, env, counter) {
  const day = { weekday: env.D.weekday, kind: env.D.kind }, gloom = env.D.meteo.gloom;
  for (const b of F.far) for (const wn of b.lit) if (windowLit(wn.u, env.minutes, day, env.daylight, gloom)) {
    const k = b.shutter ? shutterK(env.T, env.D, wn) : 0; counter.fenetres++;
    ctx.fillStyle = wn.blue ? LIT_BLUE : LIT_WARM; ctx.globalAlpha = 0.5 * (1 - 0.85 * k); ctx.fillRect(wn.x, wn.y, wn.w, wn.h);
  }
  ctx.globalAlpha = 1;
}

// Piétons minuscules (silhouettes 1 × 3 px) sur la route et l'escalier : départs par heure (3/h de 8 h à 20 h, 1/h en soirée, 0 la
// nuit ; en moyenne 0,4 piéton en vue par échappée), 2,3 px/s ; ils entrent et sortent derrière une maison (bouts de la route) ou par une gare (escalier).
const WALK_RATE = (h) => (h >= 8 && h < 20 ? 12 : h >= 20 && h < 23 ? 4 : h === 7 ? 4 : 0);
function walkersAt(e, env, seed) {
  const out = [];
  for (let h = Math.floor(env.T) - 2; h <= Math.floor(env.T); h++) {
    const hh = (h + 24) % 24, r = rngOf(seed, `pietons-${e.band}-${hh}`, env.D.date), rate = WALK_RATE(hh) * (env.D.meteo.precip > 0.3 ? 0.4 : 1), n = Math.floor(rate) + (r() < rate % 1 ? 1 : 0);
    for (let k = 0; k < n; k++) {
      const t0 = h + r(), stairs = r() < 0.4, up = r() < 0.5, speed = 2 + r() * 0.8, d = (env.T - t0) * 3600 * speed;
      if (stairs) { const st = e.stairs, L = Math.hypot(st.x1 - st.x0, st.y1 - st.y0); if (d < 0 || d > L) continue; const q = up ? d / L : 1 - d / L; out.push({ x: st.x0 + (st.x1 - st.x0) * q, y: st.y0 + (st.y1 - st.y0) * q - 2.4, dir: up ? Math.sign(st.x1 - st.x0) : -Math.sign(st.x1 - st.x0), key: `${hh}-${k}` }); }
      else { if (d < 0 || d > e.L) continue; const p = roadPoint(e, up ? e.L - d : d); out.push({ x: p.x + (up ? 2.2 : -2.2), y: p.y - 0.6, dir: up ? -p.dir : p.dir, key: `${hh}-${k}` }); }
    }
  }
  return out;
}
function paintWalker(ctx, w, t) { const step = Math.sin(t * 6 + w.x) * 0.5; fillRect(ctx, ink(0.85), w.x - 0.6, w.y - 3.2, 1.2, 2.6); disc(ctx, ink(0.85), w.x, w.y - 3.6, 0.6); ctx.strokeStyle = ink(0.85); ctx.lineWidth = 0.5; ctx.beginPath(); ctx.moveTo(w.x, w.y - 0.8); ctx.lineTo(w.x - step, w.y); ctx.moveTo(w.x, w.y - 0.8); ctx.lineTo(w.x + step, w.y); ctx.stroke(); }
// Fanfare du kiosque, les dimanches de mai à septembre, 15 h – 18 h : quatre musiciens et six badauds arrivent par la route
// (25 s de marche depuis le point le plus proche), restent, repartent par la route ; jamais sous la pluie.
function kioskAt(e, env, seed) {
  const D = env.D, k = e.verdure.find((v) => v.kind === 'kiosk'); if (!k || D.weekday !== 0 || D.doy < 121 || D.doy >= 274 || D.meteo.precip > 0) return [];
  let best = null; for (let d = 0; d < e.L; d += 4) { const p = roadPoint(e, d); const dd = Math.hypot(p.x - k.x, p.y - k.y); if (!best || dd < best.dd) best = { ...p, dd, d }; }
  const out = [];
  for (let i = 0; i < 10; i++) {
    const r = rngOf(seed, `fanfare-${e.band}-${i}`, D.date), musician = i < 4, tin = 14 + 50 * MIN + i * 2.5 * MIN + r() * MIN, tout = 18 + i * 1.5 * MIN + r() * 2 * MIN;
    const spot = musician ? { x: k.x - 4 + i * 2.6, y: k.y + 2.6 } : { x: k.x - 10 + r() * 20, y: k.y + 4.5 + r() * 3 };
    const T = env.T; if (T < tin - 60 * SEC || T > tout + 60 * SEC) continue;
    const q = T < tin ? (T - (tin - 60 * SEC)) / (60 * SEC) : T > tout ? 1 - (T - tout) / (60 * SEC) : 1, ease = smooth(sat(q));
    const dx = spot.x - best.x, dy = spot.y - best.y, far = Math.hypot(dx, dy);
    out.push({ x: best.x + dx * ease, y: best.y + dy * ease, dir: dx > 0 ? 1 : -1, moving: q < 1, musician, key: `f${i}`, far });
  }
  return out;
}
function paintVieEchappee(ctx, e, env, counter) {
  const t = env.seconds;
  for (const w of walkersAt(e, env, F_SEED)) { counter.pietons++; paintWalker(ctx, w, t); }
  for (const w of kioskAt(e, env, F_SEED)) { if (w.moving) counter.pietons++; paintWalker(ctx, w, w.moving ? t : 0); if (w.musician && !w.moving) { fillRect(ctx, '#E8C040', w.x + 0.4, w.y - 2.6, 1, 0.8); if (Math.floor(t * 2) % 2) fillRect(ctx, 'rgba(255,255,255,0.7)', w.x - 1.5 + (t * 3 % 3), w.y - 5.5, 0.5, 0.5); } }
  // Jet de la fontaine (deux poses clés, 2 Hz), du 15 mars au 15 novembre, hors neige.
  const f = e.verdure.find((v) => v.kind === 'fountain');
  if (f && fountainOn(env.D)) { counter.fontaine = 1; const pose = Math.floor(t * 2) % 2; ctx.strokeStyle = 'rgba(200,230,255,0.9)'; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(f.x, f.y - 3); ctx.quadraticCurveTo(f.x - 1.5, f.y - 7 - pose * 0.6, f.x - 2.2, f.y - 1.2); ctx.moveTo(f.x, f.y - 3); ctx.quadraticCurveTo(f.x + 1.5, f.y - 7 + pose * 0.6, f.x + 2.2, f.y - 1.2); ctx.moveTo(f.x, f.y - 3); ctx.lineTo(f.x, f.y - 8 + pose); ctx.stroke(); disc(ctx, 'rgba(255,255,255,0.8)', f.x, f.y - 8 + pose, 0.5); }
}
// Vie de la colline (sous le mur du fond) et du mur (sous le premier plan), avec les découpes de visibilité.
function paintVieColline(ctx, F, env, counter) {
  ctx.save(); ctx.clip(F.clipHill);
  paintMist(ctx, env, counter);
  for (const e of F.escapes) { for (const v of vehiclesAt(e, env, F.seed)) { counter.vehicules++; paintVehicle(ctx, v); } paintVieEchappee(ctx, e, env, counter); paintFuni(ctx, e, env, counter); paintCrane(ctx, e, env, counter); }
  paintTreeSway(ctx, F, env, counter);
  for (const h of F.houses) if (h.chimney) paintSmoke(ctx, h.chimney, env, F.seed, counter);
  for (const l of F.landmarks) { if (l.kind === 'tower') { if (!env.dark) paintClock(ctx, l, env); paintPigeons(ctx, l, env, counter); } paintFlag(ctx, l, env, counter); }
  paintFlights(ctx, env, F.seed, counter);
  ctx.restore();
}
function paintVieMur(ctx, F, env, counter) {
  ctx.save(); ctx.clip(F.clipWall);
  for (const b of F.far) if (b.chimney) paintSmoke(ctx, b.chimney, env, F.seed, counter);
  ctx.restore();
}
