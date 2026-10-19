// ───────────── composition des deux vues, réglages, galerie, captures ─────────────
const PANE = { x: 170, y: 40, w: 660, h: 362 };                 // vitre de la pièce (coordonnées de scène)
const PRESETS = {
  'piece-jour-bruine': { view: 'piece', precip: 0.2, wind: 0.25, daylight: 1, storm: 0 },
  'piece-nuit-averse': { view: 'piece', precip: 0.85, wind: 0.45, daylight: 0, storm: 0 },
  'rue-nuit-averse': { view: 'rue', precip: 0.85, wind: 0.4, daylight: 0, storm: 0 },
  'rue-jour-bruine': { view: 'rue', precip: 0.18, wind: 0.2, daylight: 1, storm: 0 },
  'rue-nuit-orage': { view: 'rue', precip: 1, wind: 0.85, daylight: 0, storm: 1 },
};

class Scene {
  constructor(opts) {
    Object.assign(this, { view: 'rue', precip: 0.6, wind: 0.3, daylight: 1, storm: false, seed: 1 }, opts);
    this.decor = document.createElement('canvas'); this.decor.width = SCENE_W; this.decor.height = SCENE_H; this.decorKey = '';
    this.street = document.createElement('canvas'); this.street.width = SCENE_W; this.street.height = SCENE_H;
    this.rainOut = new RainOutside(this.seed, false); this.rainSoft = new RainOutside(this.seed + 7, true); this.glass = new GlassRain(PANE, this.seed + 11);
    this.wet = 0;
  }
  applyEnv() { ENV = { daylight: this.daylight, dark: 1 - this.daylight, precip: this.precip, wind: this.wind, storm: !!this.storm }; }
  step(dt) {
    this.applyEnv();
    // sol mouillé : monte vite sous la pluie, sèche lentement (comme WET_ON/OFF dans l'app)
    this.wet = this.precip > 0.08 ? Math.min(1, this.wet + dt * 0.5) : Math.max(0, this.wet - dt * 0.05);
    (this.view === 'rue' ? this.rainOut : this.rainSoft).step(dt);
    if (this.view === 'piece') { this.renderStreet(); this.glass.step(dt, this.street); }
  }
  renderStreet() {
    const key = `${this.daylight.toFixed(2)}|${this.wet.toFixed(2)}|${this.precip.toFixed(2)}`;
    if (key !== this.decorKey) { this.decorKey = key; paintStreet(this.decor.getContext('2d'), this.wet); }
    const c = this.street.getContext('2d'); c.clearRect(0, 0, SCENE_W, SCENE_H); c.drawImage(this.decor, 0, 0);
    (this.view === 'rue' ? this.rainOut : this.rainSoft).paint(c);
  }
  paint(ctx) {
    this.applyEnv(); this.renderStreet();
    if (this.view === 'rue') { ctx.drawImage(this.street, 0, 0); return; }
    // ── vue pièce : mur, vitre (scène adoucie derrière), gouttes sur le verre, châssis, rideaux, appui ──
    const night = 1 - this.daylight;
    const wall = mix(hex('#D8C4A4'), hex('#4A3C44'), night * 0.8);
    rawRect(ctx, rgba(wall), 0, 0, SCENE_W, SCENE_H);
    // lumière de la fenêtre sur le mur (jour) / lampe intérieure chaude (nuit)
    ctx.fillStyle = radial(ctx, 500, 220, 520, night > 0.5 ? hex(LIT.warm) : WHITE, night > 0.5 ? 0.1 : 0.18, 0); ctx.fillRect(0, 0, SCENE_W, SCENE_H);
    // scène derrière la vitre, adoucie : léger flou + voile de verre
    ctx.save(); ctx.beginPath(); ctx.rect(PANE.x, PANE.y, PANE.w, PANE.h); ctx.clip();
    ctx.filter = 'blur(0.7px)'; ctx.drawImage(this.street, 0, 0); ctx.filter = 'none';
    ctx.fillStyle = rgba(night > 0.5 ? hex('#1A2238') : hex('#C8D8E8'), 0.14 + 0.08 * this.precip); ctx.fillRect(PANE.x, PANE.y, PANE.w, PANE.h);
    // reflet de la pièce dans la vitre, la nuit (lueur chaude discrète en bas à gauche)
    if (night > 0.5) { ctx.fillStyle = radial(ctx, PANE.x + 120, PANE.y + PANE.h - 40, 260, hex(LIT.warm), 0.07, 0); ctx.fillRect(PANE.x, PANE.y, PANE.w, PANE.h); }
    ctx.restore();
    this.glass.paint(ctx, this.street);
    // châssis : 4 carreaux, bois peint, ombre nette
    const frameC = mix(hex('#F0EAE0'), hex('#5A5260'), night * 0.7);
    const bar = (x, y, w, h) => { rawRect(ctx, rgba(frameC), x, y, w, h); rawRect(ctx, rgba(mix(frameC, INKC, 0.35)), x + w - 3, y, 3, h); rawRect(ctx, rgba(mix(frameC, INKC, 0.35)), x, y + h - 3, w, 3); inkRect(ctx, x, y, w, h, 1.1); };
    bar(PANE.x + PANE.w / 2 - 6, PANE.y, 12, PANE.h); bar(PANE.x, PANE.y + PANE.h * 0.5 - 5, PANE.w, 10);
    bar(PANE.x - 18, PANE.y - 18, PANE.w + 36, 18); bar(PANE.x - 18, PANE.y, 18, PANE.h); bar(PANE.x + PANE.w, PANE.y, 18, PANE.h);
    // appui
    rawRect(ctx, rgba(mix(frameC, WHITE, 0.2)), PANE.x - 30, PANE.y + PANE.h, PANE.w + 60, 16); rawRect(ctx, rgba(mix(frameC, INKC, 0.4)), PANE.x - 30, PANE.y + PANE.h + 16, PANE.w + 60, 5); inkRect(ctx, PANE.x - 30, PANE.y + PANE.h, PANE.w + 60, 16, 1.1);
    // rideaux (plis en bandes, aplat + ombre)
    const cur = mix(hex('#8A5A8E'), hex('#2A2030'), night * 0.7);
    for (const [x0, dir] of [[PANE.x - 70, 1], [PANE.x + PANE.w + 70, -1]]) {
      for (let i = 0; i < 5; i++) { const x = x0 + dir * i * 13; rawRect(ctx, rgba(i % 2 ? cur : mix(cur, INKC, 0.3)), Math.min(x, x + dir * 13), 0, 13, PANE.y + PANE.h + 40); }
      inkRect(ctx, Math.min(x0, x0 + dir * 65), 0, 65, PANE.y + PANE.h + 40, 1);
    }
    disc(ctx, '#3F8A3A', PANE.x + 60, PANE.y + PANE.h - 14, 16); disc(ctx, '#5AA04A', PANE.x + 50, PANE.y + PANE.h - 22, 10); fillRect(ctx, '#C86A40', PANE.x + 50, PANE.y + PANE.h - 8, 20, 10); inkRect(ctx, PANE.x + 50, PANE.y + PANE.h - 8, 20, 10, 0.9);
  }
}

// ── page ──
const Q = new URLSearchParams(location.search);
const canvas = document.getElementById('scene'); const DPR = Number(Q.get('scale') || Math.min(2, window.devicePixelRatio || 1));
// zoom=x,y,w,h : loupe de débogage (la zone est étirée à la taille de la scène)
const ZOOM = Q.has('zoom') ? Q.get('zoom').split(',').map(Number) : null; const ZK = ZOOM ? SCENE_W / ZOOM[2] : 1;
canvas.width = SCENE_W * DPR; canvas.height = (ZOOM ? ZOOM[3] * ZK : SCENE_H) * DPR; canvas.style.width = SCENE_W + 'px'; canvas.style.height = (ZOOM ? ZOOM[3] * ZK : SCENE_H) + 'px';
const cx = canvas.getContext('2d');
const presetName = Q.get('preset'); const base = PRESETS[presetName] || {};
const scene = new Scene({ ...base, ...(Q.has('view') ? { view: Q.get('view') } : {}), ...(Q.has('precip') ? { precip: Number(Q.get('precip')) } : {}), ...(Q.has('wind') ? { wind: Number(Q.get('wind')) } : {}), ...(Q.has('daylight') ? { daylight: Number(Q.get('daylight')) } : {}), ...(Q.has('storm') ? { storm: Q.get('storm') === '1' } : {}) });
const ui = { view: document.getElementById('view'), precip: document.getElementById('precip'), wind: document.getElementById('wind'), daylight: document.getElementById('daylight'), storm: document.getElementById('storm'), pause: document.getElementById('pause'), hud: document.getElementById('hud') };
const syncUi = () => { ui.view.value = scene.view; ui.precip.value = scene.precip; ui.wind.value = scene.wind; ui.daylight.value = scene.daylight; ui.storm.checked = !!scene.storm; };
syncUi();
for (const k of ['view', 'precip', 'wind', 'daylight']) ui[k].oninput = () => { scene[k] = k === 'view' ? ui[k].value : Number(ui[k].value); };
ui.storm.onchange = () => { scene.storm = ui.storm.checked; };
let paused = false; ui.pause.onclick = () => { paused = !paused; ui.pause.textContent = paused ? '▶' : '❚❚'; };
document.querySelectorAll('[data-preset]').forEach((b) => (b.onclick = () => { Object.assign(scene, PRESETS[b.dataset.preset]); syncUi(); }));
function draw() { cx.setTransform(DPR * ZK, 0, 0, DPR * ZK, ZOOM ? -ZOOM[0] * DPR * ZK : 0, ZOOM ? -ZOOM[1] * DPR * ZK : 0); scene.paint(cx); }

if (Q.has('t')) {
  // mode capture : simulation déterministe à 60 Hz jusqu'à t, puis une image
  const T = Number(Q.get('t')); for (let s = 0; s < T * 60; s++) scene.step(1 / 60);
  if (Q.get('flash') === '1') { scene.rainOut.flash = 0.95; scene.rainOut.bolt = scene.rainOut.makeBolt(); }
  draw(); window.__ready = true;
} else {
  let last = performance.now(); let frames = 0, acc = 0;
  const loop = (now) => {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (!paused) { const t0 = performance.now(); scene.step(dt); draw(); acc += performance.now() - t0; frames++; }
    if (frames >= 30) { const n = scene.view === 'rue' ? scene.rainOut : scene.rainSoft; ui.hud.textContent = `${(acc / frames).toFixed(1)} ms/img · ${n.drops.length} gouttes · ${n.splashes.length} éclab. · ${n.ripples.length} anneaux · vitre : ${scene.glass.statics.length} posées, ${scene.glass.runners.length} coulures`; frames = 0; acc = 0; }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}
