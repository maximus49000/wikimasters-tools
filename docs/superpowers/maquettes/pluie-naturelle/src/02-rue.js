// ───────────── décor de rue (cellulo, simplifié : ce n'est pas l'objet de la maquette) ─────────────
// Géométrie partagée avec la pluie : sol, lampadaires, vitrines, bords qui gouttent, flaques.
const GROUND = { sidewalkY: 300, curbY: 346, roadY: 352, bottom: SCENE_H };
const LAMPS = [{ x: 170, y: 212 }, { x: 500, y: 212 }, { x: 830, y: 212 }];
const CORNICE_Y = 244;                                                  // balcon filant / corniche
const AWNING = { x0: 382, x1: 522, yTop: 246, yEdge: 262 };            // auvent du café
const BUILDINGS = (() => {
  const r = mulberry32(77);
  const out = []; let x = -30; let i = 0;
  while (x < SCENE_W + 40) {
    const w = 110 + Math.floor(r() * 70);
    const top = 70 + Math.floor(r() * 70);
    const fill = i % 3 === 1 ? PLASTERS[Math.floor(r() * PLASTERS.length)] : STONES[Math.floor(r() * STONES.length)];
    const cols = Math.max(3, Math.floor((w - 24) / 24));
    const rows = Math.floor((CORNICE_Y - top - 26) / 30);
    const wins = [];
    for (let c = 0; c < cols; c++) for (let f = 0; f < rows; f++) {
      const lit = r() < 0.24 ? [LIT.warm, LIT.cream, LIT.orange, LIT.tv, LIT.cool][Math.floor(r() * 5)] : null;
      wins.push({ x: x + 14 + c * ((w - 28) / cols), y: top + 26 + f * 30, lit, curtain: r() < 0.3 });
    }
    const shop = { x0: x + 10, x1: x + w - 34, lit: [LIT.cream, LIT.cool, LIT.neon, LIT.warm][i % 4], tone: ['#2F5D50', '#2E4A6E', '#5A3A2E', '#8A5A8E'][i % 4] };
    out.push({ x, w, top, fill, zinc: ZINCS[i % 3], wins, shop });
    x += w; i++;
  }
  return out;
})();
const SHOPS = BUILDINGS.map((b) => b.shop);
// Points qui gouttent : bord de l'auvent (tous les 16 px), coins de corniche, descente de gouttière.
const DRIP_POINTS = (() => {
  const pts = [];
  for (let x = AWNING.x0 + 9; x < AWNING.x1; x += 16) pts.push({ x, y: AWNING.yEdge + 1, kind: 'auvent' });
  for (const b of BUILDINGS) { if (b.x > 0 && b.x < SCENE_W) { pts.push({ x: b.x + 3, y: CORNICE_Y + 2, kind: 'corniche' }); pts.push({ x: b.x + b.w * 0.5, y: b.top + 1, kind: 'toit' }); } }
  pts.push({ x: 690, y: CORNICE_Y + 2, kind: 'gouttiere' });
  return pts;
})();
const PUDDLES = [
  { x: 120, y: 330, rx: 34 }, { x: 640, y: 338, rx: 48 }, { x: 940, y: 326, rx: 26 },
  { x: 260, y: 395, rx: 70 }, { x: 540, y: 430, rx: 90 }, { x: 820, y: 385, rx: 55 }, { x: 60, y: 440, rx: 60 },
];
// Sources de lumière pour les reflets au sol et pour éclairer les gouttes la nuit.
function lightSources() {
  const s = [];
  for (const l of LAMPS) s.push({ x: l.x, y: l.y, w: 10, c: hex(LIT.warm), k: 1 });
  for (const sh of SHOPS) if (sh.x1 > 0 && sh.x0 < SCENE_W) s.push({ x: (sh.x0 + sh.x1) / 2, y: 296, w: (sh.x1 - sh.x0) / 2, c: hex(sh.lit), k: 0.7 });
  return s;
}
const LIGHTS = lightSources();
// Éclairement d'un point par les lampadaires et vitrines (0..~1,5) : sert à moduler l'alpha des gouttes la nuit.
function lightAt(x, y) {
  let f = 0;
  for (const l of LAMPS) {
    const dy = y - l.y;
    if (dy > -8) { const hw = 12 + dy * 0.6; const d = Math.abs(x - l.x); if (d < hw) f += (1 - d / hw) * clamp(1 - dy / 300, 0.25, 1); }
    const r = Math.hypot(x - l.x, y - l.y); if (r < 80) f += (1 - r / 80) * 0.9;
  }
  if (y > 236 && y < 330) for (const sh of SHOPS) if (x > sh.x0 - 14 && x < sh.x1 + 14) f += y < 300 ? 0.6 : 0.35 * (1 - (y - 300) / 30);
  return f;
}

function paintSky(ctx) {
  const d = ENV.daylight, rain = ENV.precip;
  const top = mix(mix(hex('#141A33'), hex('#8FA3B8'), d), hex('#5E6878'), d * rain * 0.6);
  const bot = mix(mix(hex('#232D52'), hex('#C9D3DA'), d), hex('#8A94A0'), d * rain * 0.5);
  const g = ctx.createLinearGradient(0, 0, 0, 300); g.addColorStop(0, rgba(top)); g.addColorStop(1, rgba(bot));
  ctx.fillStyle = g; ctx.fillRect(0, 0, SCENE_W, SCENE_H);
  // nuages plats (bande claire en haut, aplat dessous) ; de nuit à peine visibles
  const cc = mix(mix(hex('#1A2240'), hex('#AAB4C0'), d), mix(hex('#262E4A'), hex('#6A7280'), d), rain * 0.7);
  for (const [cx, cy, w] of [[120, 40, 190], [420, 22, 260], [760, 50, 220], [980, 30, 170]]) {
    ctx.fillStyle = rgba(cc, 0.35 + 0.65 * d); ctx.beginPath();
    ctx.ellipse(cx, cy, w / 2, 20, 0, 0, TAU); ctx.ellipse(cx - w * 0.22, cy + 6, w * 0.3, 16, 0, 0, TAU); ctx.ellipse(cx + w * 0.25, cy + 4, w * 0.28, 15, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = rgba(mix(cc, WHITE, 0.14), 0.35 + 0.65 * d); ctx.beginPath(); ctx.ellipse(cx - w * 0.05, cy - 8, w * 0.32, 8, 0, 0, TAU); ctx.fill();
  }
  // lointain
  const far = mix(hex('#1E2642'), hex('#8894A8'), d);
  const r = mulberry32(5);
  for (let x = -20; x < SCENE_W; x += 64 + r() * 40) {
    const h = 120 + r() * 120, w = 60 + r() * 50; ctx.fillStyle = rgba(far); ctx.fillRect(x, 300 - h, w, h);
    if (d < 0.5) for (let k = 0; k < 6; k++) if (r() < 0.5) { ctx.fillStyle = rgba(hex(LIT.cream), 0.5 * (1 - d * 2)); ctx.fillRect(x + 8 + r() * (w - 16), 300 - h + 10 + r() * (h - 40), 4, 5); }
  }
}

function paintFacades(ctx) {
  const d = ENV.daylight;
  const glassDay = mix(hex(GLASS_DAY), hex('#8A98A8'), 0.55 * ENV.precip);
  for (const b of BUILDINGS) {
    fillRect(ctx, b.fill, b.x, b.top, b.w, GROUND.sidewalkY - b.top);
    // toit zinc
    fillRect(ctx, b.zinc, b.x, b.top - 14, b.w, 16); inkRect(ctx, b.x, b.top - 14, b.w, 16);
    // fenêtres
    for (const w of b.wins) {
      if (w.lit && d < 0.6) { ctx.fillStyle = rgba(hex(w.lit), 0.95 * (1 - d / 0.6)); ctx.fillRect(w.x, w.y, 14, 22); ctx.fillStyle = col(w.curtain ? mix(hex(w.lit), hex('#F4E6D0'), 0.5) : GLASS_NIGHT, w.curtain ? 0.6 : 0.2); ctx.fillRect(w.x, w.y, 14, 22); }
      else { ctx.fillStyle = col(mix(glassDay, hex(GLASS_NIGHT), ENV.dark)); ctx.fillRect(w.x, w.y, 14, 22); }
      inkRect(ctx, w.x, w.y, 14, 22, 0.8); inkLine(ctx, [[w.x + 7, w.y], [w.x + 7, w.y + 22]], 0.6);
      fillRect(ctx, '#B8B0A0', w.x - 2, w.y + 22, 18, 2);
    }
    // corniche + balcon filant
    fillRect(ctx, '#D8CCB0', b.x, CORNICE_Y - 4, b.w, 5); inkLine(ctx, [[b.x, CORNICE_Y + 1], [b.x + b.w, CORNICE_Y + 1]], 0.8);
    ctx.strokeStyle = INK; ctx.lineWidth = 0.6; ctx.beginPath(); for (let x = b.x + 4; x < b.x + b.w; x += 5) { ctx.moveTo(x, CORNICE_Y - 4); ctx.lineTo(x, CORNICE_Y - 12); } ctx.moveTo(b.x, CORNICE_Y - 12); ctx.lineTo(b.x + b.w, CORNICE_Y - 12); ctx.stroke();
    // rez-de-chaussée : vitrine + porte
    const sh = b.shop;
    fillRect(ctx, sh.tone, b.x, CORNICE_Y + 2, b.w, GROUND.sidewalkY - CORNICE_Y - 2);
    const litA = d < 0.7 ? 1 - d / 0.7 : 0;
    ctx.fillStyle = rgba(mix(amb(hex('#3A4458')), hex(sh.lit), litA)); ctx.fillRect(sh.x0, 254, sh.x1 - sh.x0, 42);
    if (litA > 0) { ctx.fillStyle = rgba(mix(hex(sh.lit), WHITE, 0.3), 0.5 * litA); ctx.fillRect(sh.x0 + 6, 258, (sh.x1 - sh.x0) * 0.4, 10); ctx.fillStyle = rgba(INKC, 0.35 * litA); ctx.fillRect(sh.x0 + 8, 282, (sh.x1 - sh.x0) - 16, 10); }
    inkRect(ctx, sh.x0, 254, sh.x1 - sh.x0, 42, 1);
    fillRect(ctx, '#2E3A4A', sh.x1 + 6, 262, 16, 34); inkRect(ctx, sh.x1 + 6, 262, 16, 34, 0.8);
    inkLine(ctx, [[b.x, b.top], [b.x, GROUND.sidewalkY]], 0.8);
  }
  // auvent rayé
  const A = AWNING; const stripes = 8; const sw = (A.x1 - A.x0) / stripes;
  for (let i = 0; i < stripes; i++) poly(ctx, i % 2 ? '#F4F0E0' : '#C85A3A', [[A.x0 + i * sw, A.yTop], [A.x0 + (i + 1) * sw, A.yTop], [A.x0 + (i + 1) * sw - 6, A.yEdge], [A.x0 + i * sw - 6, A.yEdge]]);
  ctx.strokeStyle = INK; ctx.lineWidth = 0.9; ctx.beginPath(); ctx.moveTo(A.x0 - 6, A.yEdge); for (let x = A.x0 - 6; x < A.x1 - 6; x += 10) ctx.arc(x + 5, A.yEdge, 5, Math.PI, 0, true); ctx.stroke();
  inkLine(ctx, [[A.x0, A.yTop], [A.x1, A.yTop]], 0.9);
  // gouttière (descente)
  fillRect(ctx, '#8290A2', 688, 90, 4, CORNICE_Y - 90); inkRect(ctx, 688, 90, 4, CORNICE_Y - 90, 0.6);
}

function paintGround(ctx, wet) {
  const d = ENV.daylight;
  const dark = wet * 0.45;
  const side = mix(amb(hex('#B4B0AA')), amb(hex('#3C3E4A')), dark), road = mix(amb(hex('#78767E')), amb(hex('#2E3040')), dark);
  rawRect(ctx, rgba(side), 0, GROUND.sidewalkY, SCENE_W, GROUND.curbY - GROUND.sidewalkY);
  rawRect(ctx, rgba(road), 0, GROUND.roadY, SCENE_W, SCENE_H - GROUND.roadY);
  // dalles
  ctx.strokeStyle = rgba(INKC, 0.35); ctx.lineWidth = 0.6; ctx.beginPath(); for (let x = 0; x < SCENE_W; x += 40) { ctx.moveTo(x, GROUND.sidewalkY); ctx.lineTo(x - 10, GROUND.curbY); } ctx.stroke();
  // bordure + caniveau
  rawRect(ctx, rgba(mix(side, WHITE, 0.12)), 0, GROUND.curbY - 4, SCENE_W, 4); inkLine(ctx, [[0, GROUND.curbY], [SCENE_W, GROUND.curbY]], 1);
  rawRect(ctx, rgba(mix(road, INKC, 0.25)), 0, GROUND.curbY, SCENE_W, GROUND.roadY - GROUND.curbY);
  // grille d'égout
  fillRect(ctx, '#3A3A44', 700, GROUND.curbY, 26, 7); ctx.strokeStyle = INK; ctx.lineWidth = 0.7; ctx.beginPath(); for (let x = 703; x < 726; x += 4) { ctx.moveTo(x, GROUND.curbY + 1); ctx.lineTo(x, GROUND.curbY + 6); } ctx.stroke();
  // marquage
  rawRect(ctx, rgba(mix(hex('#E8E4D8'), road, 0.45 + dark * 0.3)), 0, 428, SCENE_W, 3);
  if (wet <= 0) return;
  // reflets des lumières sur le sol mouillé : traînée verticale sous chaque source, rompue par des rides (rangées inégales), courte et discrète
  const nightK = 1 - d;
  const rr = mulberry32(11);
  for (const L of LIGHTS) {
    const lamp = L.w <= 10;
    const strength = wet * L.k * (lamp ? 0.14 + 0.5 * nightK : 0.05 + 0.16 * nightK);
    if (strength < 0.02) continue;
    const y0 = Math.max(L.y + 2, GROUND.sidewalkY), len = lamp ? 150 : 70;
    const ww0 = lamp ? 5 : L.w * 0.55;
    for (let y = y0; y < Math.min(SCENE_H, y0 + len); y += 2 + rr() * 3) {
      const u = (y - y0) / len; if (rr() < 0.3) continue;
      const ww = ww0 * (0.55 + 0.6 * rr()) * (1 + u * 0.6); ctx.fillStyle = rgba(L.c, strength * (1 - u) * (1 - u) * (0.5 + rr()));
      ctx.fillRect(L.x - ww + (rr() - 0.5) * 3, y, ww * 2, 1.6);
    }
  }
  // flaques : reflet du ciel (jour) / noir bleuté avec les lumières dedans (nuit)
  for (const p of PUDDLES) {
    const sky = mix(WATER_NIGHT, mix(hex('#9FB4C8'), hex('#B6C0C8'), 0.5), d);
    ctx.save(); ctx.beginPath(); ctx.ellipse(p.x, p.y, p.rx, p.rx * 0.18, 0, 0, TAU); ctx.clip();
    ctx.fillStyle = rgba(sky, 0.85 * wet); ctx.fillRect(p.x - p.rx, p.y - p.rx, p.rx * 2, p.rx * 2);
    for (const L of LIGHTS) if (Math.abs(L.x - p.x) < p.rx + L.w) { const lamp = L.w <= 10; const a = wet * (lamp ? 0.35 + 0.5 * nightK : 0.1 + 0.2 * nightK) * L.k; const ww = lamp ? 4 : L.w * 0.5; for (let y = p.y - 14; y < p.y + 14; y += 3) ctx.fillRect(L.x - ww * (0.6 + 0.5 * Math.abs(Math.sin(y * 1.3))), y, ww * 2 * (0.6 + 0.5 * Math.abs(Math.sin(y * 1.3))), 1.6), ctx.fillStyle = rgba(L.c, a); }
    ctx.restore();
    ctx.strokeStyle = rgba(INKC, 0.5 * wet); ctx.lineWidth = 0.7; ctx.beginPath(); ctx.ellipse(p.x, p.y, p.rx, p.rx * 0.18, 0, 0, TAU); ctx.stroke();
  }
}

function paintLamps(ctx) {
  const night = 1 - ENV.daylight;
  for (const l of LAMPS) {
    if (night > 0.05) {
      const a = night * 0.12; ctx.fillStyle = rgba(hex(LIT.warm), a);
      ctx.beginPath(); ctx.moveTo(l.x - 10, l.y); ctx.lineTo(l.x + 10, l.y); ctx.lineTo(l.x + 75, GROUND.curbY + 8); ctx.lineTo(l.x - 75, GROUND.curbY + 8); ctx.closePath(); ctx.fill();
      ellipse(ctx, rgba(hex(LIT.warm), night * 0.3), l.x, GROUND.curbY - 2, 70, 11);
    }
    fillRect(ctx, '#2A3040', l.x - 2, l.y, 4, GROUND.curbY - 2 - l.y); inkRect(ctx, l.x - 2, l.y, 4, GROUND.curbY - 2 - l.y, 0.7);
    fillRect(ctx, '#2A3040', l.x - 7, l.y - 14, 14, 16); inkRect(ctx, l.x - 7, l.y - 14, 14, 16, 0.9);
    if (night > 0.05) { ctx.fillStyle = rgba(hex(LIT.cream), 0.95 * night); ctx.fillRect(l.x - 5, l.y - 12, 10, 12); }
  }
}

// Décor complet sans pluie (peint dans un calque mis en cache : ne change qu'avec jour/nuit et « mouillé »).
function paintStreet(ctx, wet) { paintSky(ctx); paintFacades(ctx); paintGround(ctx, wet); paintLamps(ctx); }
