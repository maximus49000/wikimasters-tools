// ───────────── temps, soleil, ambiance ─────────────
// Lever / coucher à Paris (heure locale, DST comprise), par mois.
const SUNS = [[8.7, 17.3], [8.1, 18.2], [7.2, 19.0], [7.1, 20.7], [6.3, 21.4], [5.8, 21.9], [6.1, 21.8], [6.8, 21.1], [7.5, 20.1], [8.2, 19.0], [8.0, 17.3], [8.6, 16.9]];
function dayness(T, month) { const [sr, ss] = SUNS[month - 1]; const a = sat((T - (sr - 0.7)) / 1.3), b = 1 - sat((T - (ss - 0.5)) / 1.1); return Math.min(a, b); }
// D = contexte du jour : { date, month, weekday (0 dim..6 sam), weekend, event, couvreur }
function dayContext(dateStr, event) {
  const d = new Date(dateStr + 'T12:00:00');
  const month = d.getMonth() + 1, weekday = d.getDay(), md = dateStr.slice(5);
  const ev = event || (md === '07-14' ? 'feux' : md === '12-31' ? 'nouvel-an' : md === '06-21' ? 'musique' : null);
  return { date: dateStr, month, weekday, weekend: weekday === 0 || weekday === 6, event: ev, decembre: month === 12, winter: month <= 3 || month >= 11, couvreur: weekday === 2 || weekday === 4 };
}
function setEnvAt(T, D) {
  const dn = dayness(T, D.month), tw = 4 * dn * (1 - dn);
  ENV = { dark: 0.64 * (1 - dn), tint: mix(NIGHT, DUSK, tw * 0.9), hour: T, T, litFrac: litFraction(T) * (dn < 0.7 ? 1 : 0), dayness: dn, twilight: tw, month: D.month, D };
}
const isNight = () => ENV.dark > 0.2;
const fmtT = (T) => { const h = Math.floor(T) % 24, m = Math.floor((T - Math.floor(T)) * 60); return `${h}h${String(m).padStart(2, '0')}`; };

// Ciel : fondu nuit / jour / crépuscule, étoiles, lune, soleil, feux d'artifice.
const SKY = { night: ['#0A1038', '#1A2A66', '#34488C'], day: ['#3F8BE0', '#8EC3F0', '#DCEFF8'], dusk: ['#5E4E9C', '#D86C7A', '#FFD88C'], dawn: ['#3A4A8C', '#C88AA0', '#FFE0A8'] };
function paintSky(ctx, W, GROUND, T) {
  const dn = ENV.dayness, tw = ENV.twilight, morning = T < 12;
  const g = ctx.createLinearGradient(0, 0, 0, GROUND);
  [0, 0.55, 1].forEach((s, i) => { let c = mix(hex(SKY.night[i]), hex(SKY.day[i]), dn); c = mix(c, hex((morning ? SKY.dawn : SKY.dusk)[i]), tw * 0.85); g.addColorStop(s, rgba(c)); });
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, GROUND);
  if (ENV.dark > 0.45) { const r = mulberry32(9); ctx.fillStyle = `rgba(255,246,208,${(ENV.dark - 0.45) / 0.2})`; for (let i = 0; i < 80; i++) ctx.fillRect(r() * W, r() * 120, 1, 1); }
  if (ENV.dark > 0.5) { ctx.fillStyle = 'rgba(255,245,200,0.18)'; ctx.beginPath(); ctx.arc(760, 44, 18, 0, TAU); ctx.fill(); ctx.fillStyle = '#FFF4C8'; ctx.beginPath(); ctx.arc(760, 44, 9, 0, TAU); ctx.fill(); ctx.fillStyle = rgba(mix(hex(SKY.night[1]), hex(SKY.day[1]), dn)); ctx.beginPath(); ctx.arc(764, 41, 8, 0, TAU); ctx.fill(); }
  else if (dn > 0.9) { ctx.fillStyle = 'rgba(255,255,230,0.35)'; ctx.beginPath(); ctx.arc(120, 38, 22, 0, TAU); ctx.fill(); ctx.fillStyle = '#FFFBE0'; ctx.beginPath(); ctx.arc(120, 38, 11, 0, TAU); ctx.fill(); }
}
// Feux d'artifice (14 juillet 22 h 25 → 23 h ; Nouvel An 0 h 00 → 0 h 20) : une gerbe toutes les 2,5 s, vie 2,4 s, fonction pure de T.
function fireworksActive(T, D) { return (D.event === 'feux' && T >= 22 + 25 * MIN && T <= 23) || (D.event === 'nouvel-an' && T >= 0 && T <= 20 * MIN); }
function paintFireworks(ctx, W, T, D) {
  if (!fireworksActive(T, D)) return;
  const t0 = D.event === 'feux' ? 22 + 25 * MIN : 0, s = (T - t0) / SEC;
  const COLS = ['#FFD86A', '#FF6A6A', '#8AF0FF', '#C8FF8A', '#FFA0E0', '#FFFFFF'];
  const STEP = 1.6, LIFE = 3.2;
  for (let k = Math.floor(s / STEP) - 2; k <= Math.floor(s / STEP); k++) {
    if (k < 0) continue;
    const r = mulberry32(1000 + k); const cx = 140 + r() * (W - 280), cy = 30 + r() * 80, c = hex(pick(COLS, r)), big = r() < 0.45, rise = 1.1;
    const age = s - k * STEP; if (age < 0 || age > rise + LIFE) continue;
    if (age < rise) { // fusée qui monte : traînée de points depuis les toits
      const q = age / rise, y = lerp(170, cy, smooth(q)); ctx.fillStyle = 'rgba(255,230,170,0.9)'; ctx.beginPath(); ctx.arc(cx, y, 0.9, 0, TAU); ctx.fill(); for (let i = 1; i < 6; i++) { ctx.fillStyle = `rgba(255,220,150,${0.5 - i * 0.08})`; ctx.beginPath(); ctx.arc(cx + Math.sin(i) * 0.4, y + i * 2.2, 0.5, 0, TAU); ctx.fill(); } continue;
    }
    const a = (age - rise) / LIFE, R = (big ? 66 : 42) * (1 - (1 - a) * (1 - a) * (1 - a)), g = a * a * 18;
    ctx.fillStyle = rgba(c, 0.14 * (1 - a)); ctx.fillRect(0, 0, W, 300);
    const n = big ? 32 : 22;
    ctx.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      const an = (i / n) * TAU + k * 0.7, dx = Math.cos(an), dy = Math.sin(an);
      // trait du centre vers la pointe (rayon), estompé, puis point brillant à la pointe
      ctx.strokeStyle = rgba(c, 0.35 * (1 - a)); ctx.lineWidth = big ? 1.4 : 1.0; ctx.beginPath(); ctx.moveTo(cx + dx * R * 0.45, cy + dy * R * 0.45 + g * 0.5); ctx.lineTo(cx + dx * R, cy + dy * R + g); ctx.stroke();
      ctx.fillStyle = rgba(c, 1 - a * a); ctx.beginPath(); ctx.arc(cx + dx * R, cy + dy * R + g, big ? 1.9 : 1.4, 0, TAU); ctx.fill();
      if (i % 2 === 0) { ctx.fillStyle = `rgba(255,255,255,${0.8 * (1 - a)})`; ctx.beginPath(); ctx.arc(cx + dx * R * 0.7, cy + dy * R * 0.7 + g * 0.7, 0.7, 0, TAU); ctx.fill(); }
    }
    if (a < 0.12) { ctx.fillStyle = `rgba(255,255,255,${1 - a / 0.12})`; ctx.beginPath(); ctx.arc(cx, cy, 5, 0, TAU); ctx.fill(); }
  }
}
