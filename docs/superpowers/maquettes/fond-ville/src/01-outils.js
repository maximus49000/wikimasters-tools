// ───────────── outils : vrai code de l'appli (bundle RUE), cellulo, temps, météo ─────────────
// `RUE` expose le code de src/core/library (city-plan, city-painter sans fond, cel, color, window-lights, lamps, calendar…).
// `AVANT` est le même code avec le fond actuel (hill-painter.ts tel quel) : il sert aux captures « avant ».
const { cityPaintPlan, hillCrestY, HILL_ROWS, FAR_HAZE, FAR_ROOF_H, leftOf, paintCityTile, tileCount, cityFacades, FAR_WINDOW, GROUND_FLOOR,
  hashString, mulberry32, SUN, COOL, INK, TAU, shade, light, ink, hexRgb, mixRgb, rgba, gradeFor, windowsLitFraction, windowLit, nightness,
  lampLit, lampsFor, publicHolidays, dayContext, roofLineY, roofSpan } = RUE;
let W = 1440; const H = 340;
const MIN = 1 / 60, SEC = 1 / 3600;
const sat = (v) => (v < 0 ? 0 : v > 1 ? 1 : v), lerp = (a, b, t) => a + (b - a) * t, ramp = (T, t0, d) => sat((T - t0) / d), smooth = (t) => t * t * (3 - 2 * t);
const pick = (l, r) => l[Math.floor(r() * l.length)];
const fmtT = (T) => { const h = Math.floor(T) % 24, m = Math.floor((T - Math.floor(T)) * 60); return `${h} h ${String(m).padStart(2, '0')}`; };
const css = (c, a = 1) => (typeof c === 'string' ? c : rgba(c, a));
function fillRect(ctx, c, x, y, w, h) { ctx.fillStyle = css(c); ctx.fillRect(x, y, w, h); }
function disc(ctx, c, x, y, r) { ctx.fillStyle = css(c); ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); }
function poly(ctx, c, pts) { ctx.fillStyle = css(c); ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); ctx.fill(); }
function inkPath(ctx, pts, lw = 0.7, alpha = 1, close = false) { ctx.strokeStyle = ink(alpha); ctx.lineWidth = lw; ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); if (close) ctx.closePath(); ctx.stroke(); }
// Générateur d'un objet du fond : graine de la pièce, date (jour) et clé de l'objet → jamais synchrone, jamais le même tirage d'un jour à l'autre.
const rngOf = (seed, key, day = '') => mulberry32((seed ^ hashString(key) ^ Math.imul(hashString(day) + 1, 2654435761)) >>> 0);

// Palette du fond (hill-painter.ts, reprise à l'identique) + ajouts.
const HAZE = hexRgb('#9CC0E4'), GRASS = hexRgb('#5E9A50'), STONE = hexRgb('#EAD6B0'), SPIRE = hexRgb('#4E6A78'), DOME_C = hexRgb('#5A8A80');
const BRICK = hexRgb('#C2724E'), GLASS_FAR = hexRgb('#5A7AA8');
const TREE_TONES = ['#2E6E34', '#56A844', '#A6DC60'].map(hexRgb);
const SHUTTERS = ['#5E9C5A', '#3E78A0', '#A06A3A', '#4E8EA0', '#8468B0', '#C85A50'].map(hexRgb);
const CLOTH = ['#E8456B', '#FFFFFF', '#F6C62E', '#4E8ED8', '#6BB36B', '#F28CB4'].map(hexRgb);
const ROAD = hexRgb('#E4C89A'), RAIL = hexRgb('#6A6050'), CABIN = hexRgb('#C8463A'), BUS = hexRgb('#E8B040');
const CARS = ['#D84A3A', '#F0F0E8', '#3A5A9A', '#8A8A90', '#E8C040', '#4A8A5A'].map(hexRgb);
const LIT_WARM = '#FFDFA0', LIT_BLUE = '#C4D8FF';
const haze = (c, t) => mixRgb(c, HAZE, t);
const FUNI_GAP = 2.2; // demi-écart des deux voies du funiculaire (les cabines se croisent côte à côte)
// Saisons du feuillage (G) : vert, roux, nu, fleuri.
const EVERGREEN = ['#2E5A3A', '#3E7048', '#5C8E5A'].map(hexRgb);
const LEAF_SEASON = {
  spring: ['#4E8A3A', '#8CC46A', '#F4C8D8'],
  summer: ['#2E6E34', '#56A844', '#A6DC60'],
  autumn: ['#8A4A24', '#D07A30', '#F0B040'],
  winter: ['#6A5A50', '#8A7A6A', '#A89888'],
};

// ───────────── temps, soleil, météo ─────────────
// Lever / coucher à Paris (heure locale), par mois ; `daylight` comme sky.ts (rampe de 60 min autour du lever et du coucher).
const SUNS = [[8.7, 17.3], [8.1, 18.2], [7.2, 19.0], [7.1, 20.7], [6.3, 21.4], [5.8, 21.9], [6.1, 21.8], [6.8, 21.1], [7.5, 20.1], [8.2, 19.0], [8.0, 17.3], [8.6, 16.9]];
// Interpolation au jour près entre les milieux de mois (le 27 octobre, le soleil se couche vers 18 h 20).
function sunsAt(month, day) { const k = (day - 15) / 30, a = SUNS[month - 1], b = SUNS[(month - 1 + (k < 0 ? 11 : 1)) % 12], t = Math.abs(k); return [lerp(a[0], b[0], t), lerp(a[1], b[1], t)]; }
function daylightAt(T, D) { const [sr, ss] = sunsAt(D.month, D.day); return sat(Math.min((T - (sr - 0.5)) / 1, (ss + 0.5 - T) / 1)); }
const twilightOf = (dl) => (dl > 0 && dl < 1 ? sat(1 - Math.abs(dl - 0.5) * 2) : 0);
const seasonOf = (m) => (m >= 3 && m <= 5 ? 'spring' : m >= 6 && m <= 8 ? 'summer' : m >= 9 && m <= 11 ? 'autumn' : 'winter');
// Météo de la scène (weather-types.ts : nuages, précipitations, brouillard, vent) ; `cold` : il fait froid (fumées).
const METEO = {
  soleil: { cloud: 0.1, precip: 0, fog: 0, wind: 0.2, gloom: false },
  nuages: { cloud: 0.65, precip: 0, fog: 0.05, wind: 0.4, gloom: false },
  pluie: { cloud: 0.92, precip: 0.65, fog: 0.2, wind: 0.5, gloom: true },
  brouillard: { cloud: 0.55, precip: 0, fog: 0.85, wind: 0.05, gloom: false },
  neige: { cloud: 0.85, precip: 0.5, fog: 0.25, wind: 0.2, gloom: true, snow: true },
  orage: { cloud: 1, precip: 1, fog: 0.15, wind: 0.9, gloom: true, wet: 1, storm: true },
  'apres-pluie': { cloud: 0.6, precip: 0, fog: 0.1, wind: 0.3, gloom: false, wet: 1 },   // l'averse vient de passer : tout est mouillé, il goutte
  redoux: { cloud: 0.5, precip: 0, fog: 0.1, wind: 0.35, gloom: false, snow: true, thaw: true }, // neige posée qui glisse des branches
};
METEO.pluie.wet = 1;
// Réglages d'URL (mode animé / débogage) : `?vent=0..3` force le vent (calme, faible, fort, tempête), `?dir=-1` l'inverse,
// `?motion=0` = prefers-reduced-motion (arbres immobiles, pas de particules), `?garni=0` = colline d'avant (comparatif).
const PARAMS = { vent: null, dir: 1, motion: 1, garni: 1, dense: 1 }; // `dense` : remplissage de ce retour (maisons de crête et de bord de route) ; `?dense=0` pour l'avant
const WIND_FORCES = [0, 0.2, 0.55, 0.9];
// Contexte du jour : date ISO, mois, saison, jour de semaine, férié (calendar.ts), météo.
function dayOf(dateStr, meteoName) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dc = dayContext({ y, m, d }, [], false);
  const base = METEO[meteoName] || METEO.soleil, meteo = PARAMS.vent === null ? { ...base, dir: PARAMS.dir } : { ...base, wind: WIND_FORCES[PARAMS.vent], dir: PARAMS.dir };
  const month = m, season = seasonOf(m);
  const cold = month <= 3 || month >= 11 || meteo.snow;
  const holiday = dc.publicHoliday;
  // Fêtes nationales (drapeaux) : 14 juillet, 8 mai, 11 novembre.
  const national = ['07-14', '05-08', '11-11'].includes(dateStr.slice(5));
  return { date: dateStr, y, month, day: d, doy: doyOf(y, m, d), season, weekday: dc.weekday, kind: dc.kind, holiday, national, meteo, cold, week: Math.floor((Date.UTC(y, m - 1, d) / 864e5 + 3) / 7), dc };
}
// Ambiance de l'instant : lumière du jour, crépuscule, obscurité (window-lights.ts : nightness), fraction allumée.
function envAt(T, D) {
  const dl = D.meteo.gloom ? Math.min(daylightAt(T, D), 0.75) : daylightAt(T, D);
  const tw = twilightOf(daylightAt(T, D));
  const night = D.meteo.gloom ? 1 : nightness(dl);
  const minutes = T * 60;
  return { T, D, daylight: dl, twilight: tw, night, minutes, seconds: T * 3600, lit: windowsLitFraction(minutes, { weekday: D.weekday, kind: D.kind }) * night, dark: night > 0.2 };
}

// ───────────── ciel (cellulo, comme la maquette vie-etages) ─────────────
const SKY = { night: ['#0A1038', '#1A2A66', '#34488C'], day: ['#3F8BE0', '#8EC3F0', '#DCEFF8'], dusk: ['#5E4E9C', '#D86C7A', '#FFD88C'], dawn: ['#3A4A8C', '#C88AA0', '#FFE0A8'], gloom: ['#6A7A90', '#9AA8B8', '#C4CCD4'] };
function paintSky(ctx, env) {
  const { daylight: dn, twilight: tw, T } = env, morning = T < 12;
  const g = ctx.createLinearGradient(0, 0, 0, H * 0.7);
  [0, 0.55, 1].forEach((s, i) => {
    let c = mixRgb(hexRgb(SKY.night[i]), hexRgb(SKY.day[i]), dn);
    c = mixRgb(c, hexRgb((morning ? SKY.dawn : SKY.dusk)[i]), tw * 0.85);
    if (env.D.meteo.cloud > 0.5) c = mixRgb(c, mixRgb(hexRgb(SKY.gloom[i]), hexRgb(SKY.night[i]), 1 - dn), (env.D.meteo.cloud - 0.5) * 1.6);
    g.addColorStop(s, rgba(c, 1));
  });
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  if (dn < 0.55 && env.D.meteo.cloud < 0.5) { const r = mulberry32(9); ctx.fillStyle = `rgba(255,246,208,${sat((0.55 - dn) / 0.3)})`; for (let i = 0; i < 90; i++) ctx.fillRect(r() * W, r() * 60, 1, 1); }
  if (dn < 0.5 && env.D.meteo.cloud < 0.5) { disc(ctx, 'rgba(255,245,200,0.18)', 760, 24, 12); disc(ctx, '#FFF4C8', 760, 24, 6); }
  else if (dn > 0.9 && env.D.meteo.cloud < 0.5) { disc(ctx, 'rgba(255,255,230,0.35)', 120, 22, 14); disc(ctx, '#FFFBE0', 120, 22, 7); }
}

// ───────────── calendrier des saisons (G, « on respectera les saisons ») : progressif, jamais une bascule à date fixe ─────────────
// Jour de l'année `doy` (0 = 1er janvier). Chaque arbre a son décalage propre (± 7 jours, tiré de sa clé) et son essence son
// avance d'automne (platanes et tilleuls roussissent avant les chênes).
const doyOf = (y, m, d) => Math.round((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 1)) / 864e5);
const EVERGREENS = new Set(['cypress', 'hedge', 'lierre']);
const AUTUMN_LEAD = { platane: -10, tilleul: -8, marronnier: -4, cerisier: -6, vigne: -6, glycine: -2, bouquet: 0, poplar: -5, chestnut: -4, chene: 4 };
const TONES = {
  tender: ['#5E9A4A', '#8CC46A', '#C4E89A'], summer: ['#2E6E34', '#56A844', '#A6DC60'],
  gold: ['#8A6A20', '#D8A830', '#F0D060'], roux: ['#7A3A1E', '#C86A2A', '#F0A040'], winter: ['#6A5A50', '#8A7A6A', '#A89888'],
};
const toRgb = (c) => (typeof c === 'string' ? hexRgb(c) : c);
const mixTones = (a, b, t) => a.map((c, i) => mixRgb(toRgb(c), toRgb(b[i]), t));
// État du feuillage d'un arbre à la date D : `d` densité 0..1 (0 = nu), `tones` (3 masses), `stage`, `drop` (part tombée).
//   débourrement 25 mars → 25 avril (vert tendre jusqu'à fin mai) · plein feuillage mai → septembre · jaunissement 1er oct → 15 nov
//   · chute 20 oct → 25 nov · nu fin novembre → mars. Persistants (cyprès, haies, lierre) : toujours verts.
function foliageOf(D, key, species = 'bouquet') {
  if (EVERGREENS.has(species)) return { d: 1, tones: EVERGREEN, stage: 'green', drop: 0 };
  const r = mulberry32(hashString('pheno-' + key)), o = (r() - 0.5) * 14, roux = r() < 0.5, lead = AUTUMN_LEAD[species] ?? 0, doy = D.doy;
  const base = TONES.summer.map(hexRgb), autumn = (roux ? TONES.roux : TONES.gold).map(hexRgb);
  if (doy < 84 + o || doy >= 330 + o + lead) return { d: 0, tones: TONES.winter.map(hexRgb), stage: 'bare', drop: 1, base, autumn };
  if (doy < 151 + o) { const out = sat((doy - (84 + o)) / 30); return { d: out, tones: mixTones(TONES.tender, TONES.summer, sat((doy - (110 + o)) / 40)), stage: out < 1 ? 'tender' : 'green', drop: 0, tender: 1 - out, base, autumn }; }
  const yel = sat((doy - (274 + o + lead)) / 45), drop = sat((doy - (293 + o + lead)) / 36);
  return { d: 1 - drop, tones: mixTones(TONES.summer, roux ? TONES.roux : TONES.gold, yel), stage: yel > 0 ? 'autumn' : 'green', drop, yel, base, autumn };
}
// Floraisons à leur date (0..1) : marronniers (chandelles) 25 avril → 25 mai, cerisiers 20 mars → 15 avril, glycine 10 avril → 20 mai,
// tilleuls 5 → 28 juin, vigne vierge rouge vif 1er octobre → 5 novembre.
const BLOOMS = { marronnier: [114, 144], cerisier: [78, 105], glycine: [99, 140], tilleul: [155, 178], vigne: [273, 309] };
function bloomOf(D, species) { const b = BLOOMS[species]; if (!b) return 0; const t = (D.doy - b[0]) / (b[1] - b[0]); return t < 0 || t > 1 ? 0 : Math.min(1, t * 4, (1 - t) * 3); }
// Parterres replantés par les jardiniers de la ville : bulbes 15 mars → 31 mai (fleurs 1er avril → 10 mai, fanées ensuite),
// géraniums et lavande 5 juin → 5 octobre (fanées à partir du 20 septembre), chrysanthèmes 10 octobre → 30 novembre (fanées à partir
// du 20 novembre), bruyères et paillage 5 décembre → 10 mars ; sol nu les quelques jours de replantation.
function bedState(D) {
  const doy = D.doy;
  if (doy >= 73 && doy < 151) return { kind: 'spring', shoots: 1 - sat((doy - 80) / 12), bloom: sat((doy - 91) / 10), faded: sat((doy - 130) / 20) };
  if (doy >= 151 && doy < 156) return { kind: 'bare', faded: 0, bloom: 0 };
  if (doy >= 156 && doy < 279) return { kind: 'summer', bloom: sat((doy - 156) / 12), faded: sat((doy - 263) / 16) };
  if (doy >= 279 && doy < 283) return { kind: 'bare', faded: 0, bloom: 0 };
  if (doy >= 283 && doy < 335) return { kind: 'autumn', bloom: sat((doy - 283) / 8), faded: sat((doy - 324) / 11) };
  if (doy >= 335 && doy < 340) return { kind: 'bare', faded: 0, bloom: 0 };
  return { kind: 'winter', bloom: 1, faded: 0 };
}
// Feuilles mortes au sol (0..~0,7) : chute nominale cumulée depuis le dernier balayage (un matin sur trois, à 7 h 30, tiré par
// graine et date), en moyenne sur les essences.
function leavesOnGround(D, T, seed) {
  const rate = (doy) => { let s = 0; for (const lead of [-10, -6, -2, 2]) s += doy >= 293 + lead && doy < 329 + lead ? 1 / 36 : 0; return s / 4; };
  let amount = 0;
  for (let k = 0; k < 30; k++) {
    const t = new Date(Date.UTC(D.y, D.month - 1, D.day - k)), ds = t.toISOString().slice(0, 10), doy = doyOf(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
    const sweep = rngOf(seed, 'balayage', ds)() < 0.35;
    if (sweep && (k > 0 || T >= 7.5)) { if (k === 0) return 0; break; }
    amount += rate(doy) * (k === 0 ? sat(T / 24) : 1);
  }
  return amount;
}
