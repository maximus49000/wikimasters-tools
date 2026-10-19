// ───────────── pluie sur la vitre (vue pièce) : gouttes posées, gouttes qui dévalent, traces, buée ─────────────
// La vitre couvre un rectangle (pane) ; derrière, le rendu de rue (offscreen) sert à « éclairer » les gouttes la nuit.
class GlassRain {
  constructor(pane, seed = 3) {
    this.p = pane; this.r = mulberry32(seed); this.t = 0;
    this.statics = []; this.runners = []; this.trails = []; this.spawnAcc = 0;
    // masque de buée : 1 = buée présente ; les coulures l'effacent, elle revient lentement (½ résolution)
    this.mask = document.createElement('canvas'); this.mask.width = Math.ceil(pane.w / 2); this.mask.height = Math.ceil(pane.h / 2);
    const m = this.mask.getContext('2d'); m.fillStyle = '#fff'; m.fillRect(0, 0, this.mask.width, this.mask.height);
    this.fogCv = document.createElement('canvas'); this.fogCv.width = pane.w; this.fogCv.height = pane.h;
    this.sampleCv = document.createElement('canvas'); this.sampleCv.width = Math.ceil(SCENE_W / 8); this.sampleCv.height = Math.ceil(SCENE_H / 8); this.sample = null; this.sampleAge = 1;
    // traces anciennes figées en bas (marques de pluie séchée) : lignes fines verticales, plus nombreuses en bas
    this.oldMarks = []; for (let i = 0; i < 26; i++) this.oldMarks.push({ x: this.r() * pane.w, y0: pane.h * (0.45 + this.r() * 0.4), y1: pane.h, a: 0.05 + this.r() * 0.07 });
  }
  newStatic(r) { const p = this.p; return { x: this.r() * p.w, y: this.r() * p.h, r: r ?? 0.9 + Math.pow(this.r(), 1.8) * 2.6, ph: this.r() * TAU }; }
  // échantillon de couleur de la scène derrière la vitre (basse résolution, rafraîchi 4×/s)
  refreshSample(street) { const c = this.sampleCv.getContext('2d'); c.drawImage(street, 0, 0, this.sampleCv.width, this.sampleCv.height); this.sample = c.getImageData(0, 0, this.sampleCv.width, this.sampleCv.height).data; }
  colorAt(x, y) {                                                   // x,y en coordonnées de scène
    if (!this.sample) return hex('#8FA3B8');
    const sx = clamp(Math.floor(x / 8), 0, this.sampleCv.width - 1), sy = clamp(Math.floor(y / 8), 0, this.sampleCv.height - 1);
    const i = (sy * this.sampleCv.width + sx) * 4; return [this.sample[i], this.sample[i + 1], this.sample[i + 2]];
  }
  step(dt, street) {
    this.t += dt; const P = ENV.precip, W = ENV.wind, p = this.p;
    this.sampleAge += dt; if (this.sampleAge > 0.25 && street) { this.sampleAge = 0; this.refreshSample(street); }
    // gouttes posées : 90 + 220·precip (elles apparaissent une à une, pas toutes d'un coup)
    const target = Math.round(90 + 220 * P);
    if (this.statics.length < target && this.r() < dt * 40) this.statics.push(this.newStatic());
    if (this.statics.length > target + 40) this.statics.splice(0, 1);
    // elles grossissent très lentement (0,05 px/s) jusqu'à 3,2 px ; au-delà, elles se décrochent et deviennent une coulure
    for (const s of this.statics) { s.r += dt * 0.08 * P; }
    const detach = this.statics.filter((s) => s.r > 4);
    for (const s of detach) { this.statics.splice(this.statics.indexOf(s), 1); this.runners.push(this.newRunner(s.x, s.y, s.r)); }
    // coulures : taux de naissance 0,08/s (bruine) → 0,55/s (averse)
    this.spawnAcc += dt * lerp(0.08, 0.55, P * P);
    while (this.spawnAcc >= 1) { this.spawnAcc -= 1; this.runners.push(this.newRunner(this.r() * p.w, this.r() * p.h * 0.35, 1.6 + this.r() * 1.4)); }
    const lean = W * gust(this.t) * 0.35;                                                     // le vent penche les traînées
    for (const R of this.runners) {
      // marche-arrêt : une goutte dévale par à-coups (0,1-0,6 s d'arrêt, puis accélération ∝ taille)
      R.wait -= dt;
      if (R.wait > 0) { R.vy = Math.max(0, R.vy - 400 * dt); }
      else { R.vy = Math.min(R.vy + (30 + R.r * 55) * dt * 4, 25 + R.r * R.r * 9); if (this.r() < dt * (1.6 - Math.min(1.2, R.r * 0.25))) R.wait = 0.1 + this.r() * 0.5; }
      // dérive : un peu de vent + marche aléatoire (chaque coulure zigzague à sa façon)
      R.vxw = (R.vxw || 0) * (1 - 1.5 * dt) + (this.r() - 0.5) * 220 * dt;
      const vx = (R.vy * lean * 0.35 + R.vxw * Math.min(1, R.vy / 20)) * (R.vy > 2 ? 1 : 0);
      R.x += vx * dt; R.y += R.vy * dt;
      if (R.vy > 2) { // trace : point tous les 2 px, absorbe les gouttes posées sur le passage (la coulure grossit), sème des perles derrière elle
        if (!R.last || Math.hypot(R.x - R.last[0], R.y - R.last[1]) > 2) { R.trail.push({ x: R.x, y: R.y, r: R.r, age: 0 }); R.last = [R.x, R.y]; if (R.trail.length > 200) R.trail.shift(); }
        for (let i = this.statics.length - 1; i >= 0; i--) { const s = this.statics[i]; if (Math.abs(s.x - R.x) < R.r + s.r && Math.abs(s.y - R.y) < R.r + s.r) { R.r = Math.min(5.2, Math.sqrt(R.r * R.r + s.r * s.r * 0.7)); this.statics.splice(i, 1); } }
        R.bead -= R.vy * dt; if (R.bead <= 0) { R.bead = 10 + Math.pow(this.r(), 0.5) * 50; if (this.statics.length < target + 60) this.statics.push({ x: R.x + (this.r() - 0.5) * R.r * 1.5, y: R.y - R.r, r: 0.6 + this.r() * 1.1, ph: 0 }); R.r = Math.max(1.2, R.r - 0.12); }
        // fusion de deux coulures qui se touchent
        for (const O of this.runners) if (O !== R && !O.dead && O.y > R.y - 2 && Math.abs(O.x - R.x) < R.r + O.r && Math.abs(O.y - R.y) < R.r + O.r + 4) { R.r = Math.min(5.5, Math.sqrt(R.r * R.r + O.r * O.r)); O.dead = true; R.vy = Math.max(R.vy, O.vy); }
      }
      if (R.y > p.h + 4) R.dead = true;
    }
    for (const R of this.runners) if (R.dead && R.trail.length) this.trails.push(R.trail);
    this.runners = this.runners.filter((R) => !R.dead);
    // traces : vieillissent 12 s
    for (const R of this.runners) for (const q of R.trail) q.age += dt;
    for (const tr of this.trails) for (const q of tr) q.age += dt;
    this.trails = this.trails.filter((tr) => tr[tr.length - 1].age < 8);
    // buée : repousse lentement (1 % / s), effacée par les coulures (2 r de large)
    const m = this.mask.getContext('2d'); m.globalCompositeOperation = 'source-over'; m.fillStyle = `rgba(255,255,255,${Math.min(1, dt * 0.03)})`; m.fillRect(0, 0, this.mask.width, this.mask.height);
    m.globalCompositeOperation = 'destination-out'; m.lineCap = 'round'; m.strokeStyle = '#000';
    for (const R of this.runners) { if (R.trail.length < 2) continue; m.lineWidth = R.r * 0.5; m.beginPath(); const q0 = R.trail[Math.max(0, R.trail.length - 3)]; m.moveTo(q0.x / 2, q0.y / 2); for (let i = Math.max(0, R.trail.length - 2); i < R.trail.length; i++) m.lineTo(R.trail[i].x / 2, R.trail[i].y / 2); m.stroke(); }
    m.globalCompositeOperation = 'source-over';
  }
  newRunner(x, y, r) { return { x, y, r, vy: 0, wait: 0.2 + this.r() * 0.5, ph: this.r() * TAU, trail: [], bead: 8 + this.r() * 10, last: null }; }
  // ── dessin ──
  // goutte cellulo : corps clair teinté par ce qu'il y a derrière (inversé : la lumière du bas paraît en haut), ombre encrée au bord bas-droit,
  // reflet blanc en haut-gauche ; la nuit, une goutte devant une lumière rayonne.
  drawDrop(ctx, x, y, r, night, stretch = 1) {
    const sx = this.p.x + x, sy = this.p.y + y;
    const below = this.colorAt(sx, sy + r * 6), above = this.colorAt(sx, sy - r * 6), here = this.colorAt(sx, sy);
    const lit = lum(below) > lum(above) ? below : above;
    const body = mix(mix(here, lit, 0.5), WHITE, night ? 0.18 : 0.3);
    const L = lum(lit);
    if (night && L > 0.4 && r > 0.9) { ctx.fillStyle = radial(ctx, x, y, r * 3.2, lit, 0.7 * (L - 0.25), 0); ctx.fillRect(x - r * 3.2, y - r * 3.2, r * 6.4, r * 6.4); }
    ctx.fillStyle = rgba(body, night ? 0.68 : 0.6); ctx.beginPath(); ctx.ellipse(x, y, r, r * 1.15 * stretch, 0, 0, TAU); ctx.fill();
    // haut légèrement assombri (réfraction : le sol sombre paraît en haut), bas lumineux (ciel / lumière inversés)
    if (!night) { ctx.fillStyle = rgba(INKC, 0.14); ctx.beginPath(); ctx.ellipse(x, y - r * 0.35 * stretch, r * 0.7, r * 0.45 * stretch, 0, 0, TAU); ctx.fill(); }
    ctx.fillStyle = rgba(mix(lit, WHITE, 0.4), night ? 0.35 + 0.5 * L : 0.4); ctx.beginPath(); ctx.ellipse(x, y + r * 0.38 * stretch, r * 0.62, r * 0.5 * stretch, 0, 0, TAU); ctx.fill();
    // bord encré (ombre nette) bas-droit
    if (r > 0.8) { ctx.strokeStyle = rgba(INKC, 0.5); ctx.lineWidth = Math.min(1, r * 0.3); ctx.beginPath(); ctx.ellipse(x, y, r * 0.9, r * 1.05 * stretch, 0, -0.3, 1.9); ctx.stroke(); }
    // reflet
    ctx.fillStyle = rgba(WHITE, 0.85); ctx.beginPath(); ctx.ellipse(x - r * 0.38, y - r * 0.45 * stretch, r * 0.26, r * 0.18, -0.6, 0, TAU); ctx.fill();
  }
  paint(ctx, street) {
    const p = this.p, P = ENV.precip, night = ENV.daylight < 0.5;
    ctx.save(); ctx.translate(p.x, p.y); ctx.beginPath(); ctx.rect(0, 0, p.w, p.h); ctx.clip();
    // buée : voile clair/froid, plus dense en bas (0 à 55 % de la hauteur → max en bas), masqué par les coulures
    const f = this.fogCv.getContext('2d'); f.clearRect(0, 0, p.w, p.h);
    const fogC = night ? hex('#C4CEE0') : hex('#EEF2F6'); const fogA = (0.1 + 0.14 * P) * (night ? 0.7 : 1);
    const g = f.createLinearGradient(0, p.h * 0.45, 0, p.h); g.addColorStop(0, rgba(fogC, 0)); g.addColorStop(0.7, rgba(fogC, fogA * 0.6)); g.addColorStop(1, rgba(fogC, fogA));
    f.globalCompositeOperation = 'source-over'; f.fillStyle = g; f.fillRect(0, 0, p.w, p.h);
    // vieilles marques (traces séchées) : fines rayures dans la buée
    f.strokeStyle = 'rgba(255,255,255,0.08)'; f.lineWidth = 1.2; f.beginPath(); for (const o of this.oldMarks) { f.moveTo(o.x, o.y0); f.lineTo(o.x + 2, o.y1); } f.stroke();
    f.globalCompositeOperation = 'destination-in'; f.drawImage(this.mask, 0, 0, p.w, p.h);
    ctx.drawImage(this.fogCv, 0, 0);
    // traces des coulures : filet clair (eau) + bord encré léger, s'estompent en 12 s ; perles le long
    const drawTrail = (tr, alive) => {
      if (tr.length < 2) return;
      for (let i = 1; i < tr.length; i++) {
        const q = tr[i], a = Math.max(0, 1 - q.age / 8);
        if (a <= 0) continue;
        ctx.strokeStyle = rgba(night ? hex('#C8D4EC') : WHITE, (night ? 0.26 : 0.3) * a); ctx.lineWidth = Math.max(0.6, q.r * 0.7 * (0.4 + 0.6 * a));
        ctx.beginPath(); ctx.moveTo(tr[i - 1].x, tr[i - 1].y); ctx.lineTo(q.x, q.y); ctx.stroke();
        ctx.strokeStyle = rgba(INKC, 0.14 * a); ctx.lineWidth = 0.5; ctx.beginPath(); ctx.moveTo(tr[i - 1].x + q.r * 0.5, tr[i - 1].y); ctx.lineTo(q.x + q.r * 0.5, q.y); ctx.stroke();
      }
    };
    for (const tr of this.trails) drawTrail(tr, false);
    for (const R of this.runners) drawTrail(R.trail, true);
    // gouttes posées
    for (const s of this.statics) this.drawDrop(ctx, s.x, s.y, s.r, night);
    // coulures : goutte étirée vers le haut quand elle court (queue), ronde quand elle attend
    for (const R of this.runners) {
      const run = Math.min(1, R.vy / 40);
      if (run > 0.1) { const tail = R.r * (1.5 + 2.5 * run); ctx.fillStyle = rgba(mix(this.colorAt(p.x + R.x, p.y + R.y), WHITE, 0.3), 0.45); ctx.beginPath(); ctx.moveTo(R.x - R.r * 0.6, R.y); ctx.lineTo(R.x, R.y - tail); ctx.lineTo(R.x + R.r * 0.6, R.y); ctx.closePath(); ctx.fill(); }
      this.drawDrop(ctx, R.x, R.y, R.r, night, 1 + 0.25 * run);
    }
    ctx.restore();
  }
}
