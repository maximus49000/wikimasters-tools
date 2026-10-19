// ───────────── pluie vue de dehors : gouttes à 3 profondeurs, éclaboussures, anneaux, gouttes des bords, caniveau, halos ─────────────
// Tout est piloté par precip (0-1) et wind (0-1) : aucune densité réglée à part.
const LAYERS = [
  // part : part de la population ; v : vitesse px/s ; len : longueur (exposition) ; w : épaisseur ; a : alpha ; blur : halo flou (proche)
  { name: 'loin', part: 0.42, v: [170, 260], len: [5, 9], w: 0.6, a: 0.22, blur: 0, sway: 0.2, splash: 0 },
  { name: 'moyen', part: 0.36, v: [300, 420], len: [9, 16], w: 0.9, a: 0.36, blur: 0, sway: 0.5, splash: 0.25 },
  { name: 'proche', part: 0.22, v: [520, 720], len: [16, 34], w: 1.6, a: 0.46, blur: 2.6, sway: 1.1, splash: 1 },
];
const dropCount = (precip) => Math.round(Math.pow(precip, 1.25) * 900);          // bruine 0,15 → ~85 ; averse 1 → 900

class RainOutside {
  constructor(seed = 1, soft = false) {
    this.r = mulberry32(seed); this.soft = soft;                                 // soft : vue derrière la vitre (moins de proche, plus doux)
    this.t = 0; this.drops = []; this.splashes = []; this.ripples = []; this.drips = []; this.flash = 0; this.bolt = null; this.nextBolt = 2 + this.r() * 3;
    this.dripTimers = DRIP_POINTS.map(() => ({ phase: this.r(), period: 1 }));
  }
  spawn(layerIdx, fromTop) {
    const L = LAYERS[layerIdx]; const r = this.r;
    const ground = GROUND.sidewalkY + Math.pow(r(), 0.8) * (SCENE_H - GROUND.sidewalkY);     // où elle touche le sol
    return { L: layerIdx, x: r() * (SCENE_W + 200) - 100, y: fromTop ? -r() * 60 - 10 : r() * ground, v: lerp(L.v[0], L.v[1], r()), len: lerp(L.len[0], L.len[1], r()) * (0.6 + r() * 0.9), a: L.a * (0.55 + r() * 0.7), w: L.w * (0.8 + r() * 0.5), ph: r() * TAU, ground, big: r() < 0.06, tilt: (r() - 0.5) * 0.12 };
  }
  step(dt) {
    this.t += dt; const t = this.t; const P = ENV.precip, W = ENV.wind;
    // population visée (derrière la vitre : 70 %, et la couche proche réduite de moitié)
    const target = Math.round(dropCount(P) * (this.soft ? 0.7 : 1));
    while (this.drops.length < target) { const u = this.r(); const li = u < LAYERS[0].part ? 0 : u < LAYERS[0].part + LAYERS[1].part ? 1 : 2; this.drops.push(this.spawn(this.soft && li === 2 && this.r() < 0.5 ? 1 : li, this.drops.length > 40)); }
    if (this.drops.length > target) this.drops.length = target;
    const g = gust(t); const lean = W * g;                                                   // dérive horizontale = fraction de la vitesse
    for (const d of this.drops) {
      const L = LAYERS[d.L];
      const vx = d.v * (0.08 + lean * 0.55) + Math.sin(t * 3.1 + d.ph) * L.sway * 18;           // dérive + léger balancement (proche)
      d.y += d.v * dt; d.x += vx * dt;
      if (d.x > SCENE_W + 60) d.x -= SCENE_W + 160; if (d.x < -100) d.x += SCENE_W + 160;
      if (d.y >= d.ground) {
        if (L.splash > 0 && this.r() < L.splash * (this.soft ? 0.4 : 1) && this.splashes.length < 160) this.addSplash(d.x, d.ground, d.big ? 1.6 : 1);
        const n = this.spawn(d.L, true); Object.assign(d, n);
      }
    }
    // éclaboussures (gerbe de 3-5 gouttelettes + couronne) : vie 0,28 s
    for (const s of this.splashes) { s.age += dt; for (const p of s.parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 900 * dt; } }
    this.splashes = this.splashes.filter((s) => s.age < 0.3);
    // anneaux dans les flaques : taux ∝ precip × surface
    for (const p of PUDDLES) if (this.r() < P * P * dt * p.rx * 0.11 && this.ripples.length < 90) { const u = (this.r() * 2 - 1); this.ripples.push({ x: p.x + u * p.rx * 0.85, y: p.y + (this.r() * 2 - 1) * p.rx * 0.12, age: 0, life: 0.7 + this.r() * 0.5, R: 5 + this.r() * 7 }); }
    for (const rp of this.ripples) rp.age += dt; this.ripples = this.ripples.filter((rp) => rp.age < rp.life);
    // gouttes des bords (auvent, corniche, toit, gouttière) : période 3 s (bruine) → 0,45 s (averse) ; la gouttière coule en filet au-delà de 0,55
    DRIP_POINTS.forEach((pt, i) => {
      const tm = this.dripTimers[i]; const period = lerp(3.2, 0.45, P) * (pt.kind === 'gouttiere' ? 0.6 : pt.kind === 'toit' ? 1.6 : 1) * (0.7 + 0.6 * ((i * 0.37) % 1));
      tm.phase += dt / period;
      if (tm.phase >= 1) { tm.phase -= 1; this.drips.push({ x: pt.x, y: pt.y, vy: 20, r: 1.3 + this.r() * 0.9, ground: pt.kind === 'auvent' ? GROUND.sidewalkY + 8 + this.r() * 30 : GROUND.sidewalkY + this.r() * 40 }); }
    });
    for (const d of this.drips) { d.vy += 900 * dt; d.y += d.vy * dt; d.x += W * g * 14 * dt; if (d.y >= d.ground) { d.dead = true; if (this.splashes.length < 160) this.addSplash(d.x, d.ground, 1.3); } }
    this.drips = this.drips.filter((d) => !d.dead);
    // orage : éclair toutes les 4-9 s (flash 0,35 s, 2 pointes)
    if (ENV.storm) { this.nextBolt -= dt; if (this.nextBolt <= 0) { this.nextBolt = 4 + this.r() * 5; this.flash = 1; this.bolt = this.makeBolt(); } }
    if (this.flash > 0) { this.flash -= dt / 0.35; if (this.flash < 0.55 && this.flash > 0.5) this.flash = 0.9; if (this.flash <= 0) { this.flash = 0; this.bolt = null; } }
  }
  addSplash(x, y, k) {
    const parts = []; const n = 3 + Math.floor(this.r() * 3);
    for (let i = 0; i < n; i++) { const a = -Math.PI / 2 + (this.r() - 0.5) * 1.6; const v = (60 + this.r() * 90) * k; parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v }); }
    this.splashes.push({ x, y, age: 0, k, parts });
  }
  makeBolt() {
    const pts = []; let x = 120 + this.r() * 760, y = 0; pts.push([x, y]);
    while (y < 150 + this.r() * 60) { y += 10 + this.r() * 16; x += (this.r() - 0.5) * 26; pts.push([x, y]); }
    // une ramification à mi-hauteur
    const k = Math.floor(pts.length * 0.4); const br = [pts[k]]; let bx = pts[k][0], by = pts[k][1]; const dir = this.r() < 0.5 ? -1 : 1;
    for (let i = 0; i < 4; i++) { by += 8 + this.r() * 10; bx += dir * (6 + this.r() * 10); br.push([bx, by]); }
    pts.branch = br; return pts;
  }
  // couleur/alpha d'une goutte selon la lumière locale (nuit : visible seulement dans les cônes et près des vitrines)
  alphaAt(x, y, a) { const d = ENV.daylight; if (d > 0.95) return a; const f = lightAt(x, y); return a * lerp(0.3 + 0.9 * Math.min(1.2, f), 1, d); }
  paint(ctx) {
    const t = this.t, P = ENV.precip, night = 1 - ENV.daylight;
    const lean = ENV.wind * gust(t);
    const dirx = 0.08 + lean * 0.55; const nrm = 1 / Math.hypot(dirx, 1);        // direction du trait = direction de la vitesse
    const base = mix(RAIN, RAIN_NIGHT, night);
    ctx.lineCap = 'round';
    // éclair : le flash est posé sous la pluie pour que les gouttes ressortent dessus
    if (this.flash > 0) { ctx.fillStyle = rgba(hex('#E8F0FF'), 0.3 * this.flash); ctx.fillRect(0, 0, SCENE_W, SCENE_H); }
    // halos de pluie autour des lampadaires (nuit) : volume éclairé, plus large et plus dense avec l'averse
    if (night > 0.05 && P > 0.02) for (const l of LAMPS) { const R = 40 + 56 * P; ctx.fillStyle = radial(ctx, l.x, l.y - 4, R, hex(LIT.warm), night * (0.14 + 0.26 * P)); ctx.fillRect(l.x - R, l.y - 4 - R, R * 2, R * 2); }
    // gouttes, par couche (loin → proche)
    for (let li = 0; li < 3; li++) {
      const L = LAYERS[li];
      for (const d of this.drops) {
        if (d.L !== li) continue;
        const len = d.len * (1 + lean * 0.3), dx = (dirx + d.tilt) * len * nrm, dy = len * nrm;
        const a = this.alphaAt(d.x, d.y, d.a) * (this.soft ? 0.85 : 1);
        if (a < 0.015) continue;
        if (L.blur > 0) { ctx.strokeStyle = rgba(base, a * 0.22); ctx.lineWidth = d.w + L.blur; ctx.beginPath(); ctx.moveTo(d.x - dx, d.y - dy); ctx.lineTo(d.x, d.y); ctx.stroke(); }
        // trait qui s'estompe vers la queue (tête de goutte en bas) : couches proche et moyenne
        if (li > 0) { const g = ctx.createLinearGradient(d.x - dx, d.y - dy, d.x, d.y); g.addColorStop(0, rgba(base, 0)); g.addColorStop(0.7, rgba(base, a)); g.addColorStop(1, rgba(base, a)); ctx.strokeStyle = g; } else ctx.strokeStyle = rgba(base, a);
        ctx.lineWidth = d.w; ctx.beginPath(); ctx.moveTo(d.x - dx, d.y - dy); ctx.lineTo(d.x, d.y); ctx.stroke();
        if (d.big && li === 2) { ctx.fillStyle = rgba(base, a * 0.9); ctx.beginPath(); ctx.ellipse(d.x, d.y, d.w * 0.9, d.w * 1.4, 0, 0, TAU); ctx.fill(); }
      }
    }
    // gouttes qui tombent des bords : perle qui pend puis goutte allongée
    for (const d of this.drips) { const a = this.alphaAt(d.x, d.y, 0.8); ctx.fillStyle = rgba(base, a); ctx.beginPath(); ctx.ellipse(d.x, d.y, d.r * 0.8, d.r * (1 + d.vy / 250), 0, 0, TAU); ctx.fill(); }
    DRIP_POINTS.forEach((pt, i) => {
      const tm = this.dripTimers[i]; const r = 0.6 + tm.phase * 1.6; const a = this.alphaAt(pt.x, pt.y, 0.75);
      ctx.fillStyle = rgba(base, a); ctx.beginPath(); ctx.ellipse(pt.x, pt.y + r * 0.6, r * 0.8, r, 0, 0, TAU); ctx.fill();
      if (pt.kind === 'gouttiere' && P > 0.55) { ctx.strokeStyle = rgba(base, a * 0.6 * (P - 0.55) / 0.45); ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(pt.x, pt.y); for (let y = pt.y; y < GROUND.sidewalkY; y += 6) ctx.lineTo(pt.x + Math.sin(y * 0.4 + t * 9) * 1.2, y + 6); ctx.stroke(); }
    });
    // éclaboussures : couronne (anneau qui s'ouvre) + gouttelettes
    for (const s of this.splashes) {
      const u = s.age / 0.3; const a = this.alphaAt(s.x, s.y, 0.7) * (1 - u);
      ctx.strokeStyle = rgba(base, a * 0.8); ctx.lineWidth = 0.8; ctx.beginPath(); ctx.ellipse(s.x, s.y, (1 + u * 7) * s.k, (0.4 + u * 2) * s.k, 0, 0, TAU); ctx.stroke();
      ctx.fillStyle = rgba(base, a); for (const p of s.parts) { ctx.beginPath(); ctx.arc(p.x, p.y, 0.9 * s.k, 0, TAU); ctx.fill(); }
    }
    // anneaux dans les flaques
    for (const rp of this.ripples) { const u = rp.age / rp.life; const a = this.alphaAt(rp.x, rp.y, 0.55) * (1 - u) * ENV.precip; ctx.strokeStyle = rgba(mix(base, WHITE, 0.3), a); ctx.lineWidth = 0.9; ctx.beginPath(); ctx.ellipse(rp.x, rp.y, rp.R * u + 1, (rp.R * u + 1) * 0.26, 0, 0, TAU); ctx.stroke(); }
    // ruissellement du caniveau : lame d'eau le long de la bordure, largeur ∝ precip, filets clairs qui courent vers la grille
    if (P > 0.08) {
      const h = 1.5 + 6 * P; const water = mix(WATER_DAY, WATER_NIGHT, night);
      ctx.fillStyle = rgba(water, 0.55 + 0.3 * P); ctx.fillRect(0, GROUND.curbY, SCENE_W, h);
      ctx.strokeStyle = rgba(mix(base, WHITE, 0.2), this.alphaAt(500, GROUND.curbY, 0.55)); ctx.lineWidth = 0.9; ctx.beginPath();
      const speed = 60 + 120 * P;
      for (let k = 0; k < 40 * P + 6; k++) { const x0 = ((k * 97.3 + t * speed * (0.8 + (k % 3) * 0.2)) % (SCENE_W + 40)) - 20; const y = GROUND.curbY + 1 + ((k * 0.61) % 1) * (h - 1); ctx.moveTo(x0, y); ctx.lineTo(x0 + 6 + 8 * P, y + Math.sin(k) * 0.6); }
      ctx.stroke();
      // bouillon à la grille
      ctx.fillStyle = rgba(mix(base, WHITE, 0.4), 0.35 * P); for (let k = 0; k < 6; k++) { const ph = (t * 3 + k * 1.1) % 1; ctx.beginPath(); ctx.arc(702 + k * 4 + Math.sin(k) * 2, GROUND.curbY + 2 + ph * 3, 1 + ph, 0, TAU); ctx.fill(); }
    }
    // brume de pluie : voile clair qui s'épaissit avec l'averse (jour) ; de nuit, voile bleuté léger
    ctx.fillStyle = rgba(mix(hex('#DCE4EC'), hex('#2A3450'), night), P * (0.1 + 0.06 * night)); ctx.fillRect(0, 0, SCENE_W, SCENE_H);
    // éclair
    if (this.flash > 0) {
      if (this.bolt) { const path = () => { ctx.beginPath(); this.bolt.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); this.bolt.branch.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); }; path(); ctx.strokeStyle = rgba(hex('#B8D0FF'), 0.35 * this.flash); ctx.lineWidth = 7; ctx.stroke(); ctx.strokeStyle = rgba(hex('#F4F8FF'), 0.9 * this.flash); ctx.lineWidth = 2.2; ctx.stroke(); }
    }
  }
}
