// ───────────── Halloween (maquette de la PR 1) : décors posés par les habitants et par la mairie ─────────────
// Tout est une fonction pure de l'heure absolue A (heures depuis le 1er octobre 2026 à 0 h). Le plan (qui décore quoi,
// où, avec quel style, quand il pose et quand il retire) est tiré une fois de la graine de la rue et de l'année de
// l'édition ; chaque élément est ensuite absent, en pose, posé, en dépose ou retiré selon A. Aucun état caché.
const HW_YEAR = 2026;
const HW_DAY0 = Date.UTC(2026, 9, 1);
const hwDay = (dateStr) => Math.round((Date.parse(dateStr + 'T00:00:00Z') - HW_DAY0) / 86400000);
const hwAbs = (sc) => hwDay(sc.D.date) * 24 + sc.T;
const OCT = (d) => d - 1, NOV = (d) => 30 + d;
const hwWeekday = (day) => (4 + day) % 7; // le 1er octobre 2026 est un jeudi

// Jour de pose (24 → 31 octobre) et de retrait (1er → 8 novembre), pondérés : le week-end et la veille comptent plus.
const HW_INSTALL_DAYS = [[OCT(24), 3], [OCT(25), 3], [OCT(26), 1], [OCT(27), 1], [OCT(28), 1.2], [OCT(29), 1], [OCT(30), 1.4], [OCT(31), 1.6]];
const HW_REMOVE_DAYS = [[NOV(1), 2], [NOV(2), 1], [NOV(3), 1], [NOV(4), 1.2], [NOV(5), 1], [NOV(6), 1], [NOV(7), 2.2], [NOV(8), 1.2]];
function hwDrawDay(list, r) { const tot = list.reduce((s, [, w]) => s + w, 0); let a = r() * tot; for (const [d, w] of list) { a -= w; if (a < 0) return d; } return list[list.length - 1][0]; }
// Heure : en journée le week-end, le 1er novembre (férié) et le 31 (avant la soirée) ; après le travail en semaine.
function hwDrawHour(day, r) { const wd = hwWeekday(day); if (day === OCT(31)) return 10 + r() * 5; return wd === 0 || wd === 6 || day === NOV(1) ? 10 + r() * 7 : 18 + r() * 2.2; }

// Part des logements qui mettent une citrouille (≈ une fenêtre sur huit au total) et un décor de balcon, par type de foyer.
const HW_PUMPKIN = { famille: 0.4, couple: 0.2, coloc: 0.25, etudiant: 0.14, retraite: 0.1, solo: 0.14 };
const HW_BALCONY = { famille: 0.5, couple: 0.3, coloc: 0.45, etudiant: 0.2, retraite: 0.15, solo: 0.2 };
// Style dominant de la façade → poids des décors de balcon et de porte (un style et un ou deux accents, pas un mélange).
const HW_STYLES = {
  citrouilles: { pumpkin: 1.4, balcony: { 'rail-pumpkin': 4, crow: 2, witch: 1, skeleton: 1, spider: 1 }, door: { ghost: 2, web: 1 }, cauldron: 0.3, doorP: 0.5 },
  sorcellerie: { pumpkin: 0.85, balcony: { witch: 4, crow: 3, spider: 1, skeleton: 1 }, door: { ghost: 1, web: 1 }, cauldron: 0.7, doorP: 0.6 },
  macabre: { pumpkin: 0.85, balcony: { skeleton: 4, spider: 3, crow: 1, witch: 1 }, door: { web: 3, ghost: 1 }, cauldron: 0.2, doorP: 0.75 },
};
const hwPickW = (weights, r) => { const e = Object.entries(weights), tot = e.reduce((s, [, w]) => s + w, 0); let a = r() * tot; for (const [k, w] of e) { a -= w; if (a < 0) return k; } return e[e.length - 1][0]; };
// Durées des gestes (heures) et fraction du geste où l'objet est posé (montage) ou repris (démontage).
const HW_DUR = { lean: 1.2 * MIN, walk: 2.2 * MIN, door: 4 * MIN, cauldron: 1.3 * MIN };
const HW_GESTURE = { lean: 0.5, walk: 0.55, door: 0.6, cauldron: 0.5 };

const winOf = (f, hm, bay) => f.windows.find((w) => w.level === hm.level && w.bay === bay);

function hwPlan(street) {
  const items = [];
  const hero = street.hero;
  street.facades.forEach((f, fi) => {
    const r = mulberry32(SEED ^ hashString(`halloween${HW_YEAR}:${fi}`));
    const style = f === hero ? 'citrouilles' : pick(Object.keys(HW_STYLES), r);
    const S = HW_STYLES[style];
    f.hwStyle = style; f.hwItems = [];
    const homes = f.homes.filter((h) => h.hh);
    for (const hm of homes) {
      const rh = mulberry32(SEED ^ hashString(`hw${HW_YEAR}:${fi}:${f.homes.indexOf(hm)}`));
      const day = hwDrawDay(HW_INSTALL_DAYS, rh), rday = hwDrawDay(HW_REMOVE_DAYS, rh);
      hm.hwAt = day * 24 + hwDrawHour(day, rh); hm.hwRat = rday * 24 + hwDrawHour(rday, rh);
      const mem = hm.hh.members.find((m) => m.size >= 0.9) || hm.hh.members[0];
      const pumpR = rh(), balcR = rh(), v = rh(), off = rh(), kindR = mulberry32(Math.floor(rh() * 1e9)), xr = rh();
      let at = hm.hwAt, rat = hm.hwRat;
      const add = (it) => { it.dur = HW_DUR[it.gesture]; it.inst = at; it.rem = rat; at += it.dur + 1.5 * MIN; rat += it.dur + 1.5 * MIN; it.f = f; it.home = hm; it.mem = mem; f.hwItems.push(it); items.push(it); };
      const wins = hm.bays.map((b) => winOf(f, hm, b)).filter(Boolean);
      // Citrouille : sur l'appui d'une fenêtre ordinaire (ou sur la rambarde de son balconnet), posée penché à la fenêtre ;
      // sans fenêtre ordinaire (porte-fenêtre sur balcon filant), sur la rambarde du balcon, posée depuis le balcon.
      if (pumpR < HW_PUMPKIN[hm.hh.type] * S.pumpkin && wins.length) {
        const std = wins.filter((w) => w.kind === 'std');
        if (std.length) { const win = std[Math.floor(v * std.length)]; add({ type: 'pumpkin', gesture: 'lean', win, place: win.level.balcony === 'balconnet' ? 'balconnet' : 'sill', x: win.x + win.w * 0.72, v, off }); }
        else if (hm.balcony) { const win = wins[Math.floor(v * wins.length)]; add({ type: 'rail-pumpkin', gesture: 'walk', win, x: win.x + win.w * (0.2 + 0.6 * xr), v, off }); }
      }
      // Décor de balcon (balcon filant seulement) : sorti de la porte-fenêtre du salon, posé à la main sur la dalle ou la rambarde.
      if (hm.balcony && balcR < HW_BALCONY[hm.hh.type] && wins.length) {
        const type = hwPickW(S.balcony, kindR);
        const exit = winOf(f, hm, hm.bays[hm.rooms.indexOf('salon')]) || wins[0];
        const target = wins[Math.floor(kindR() * wins.length)];
        add({ type, gesture: 'walk', win: exit, x: target.x + target.w * (type === 'witch' ? 0.15 : 0.55 + 0.3 * kindR()), v: kindR(), off });
      }
    }
    // Entrée d'immeuble : un foyer (de préférence une famille) descend avec un escabeau ; chaudron posé à côté de la porte.
    const rd = mulberry32(SEED ^ hashString(`hw${HW_YEAR}:${fi}:door`));
    if (homes.length && rd() < S.doorP) {
      const fam = homes.filter((h) => h.hh.type === 'famille');
      const hm = fam.length ? fam[Math.floor(rd() * fam.length)] : homes[Math.floor(rd() * homes.length)];
      const kind = hwPickW(S.door, rd), mem = hm.hh.members.find((m) => m.size >= 0.9) || hm.hh.members[0];
      const last = f.hwItems.filter((i) => i.home === hm);
      const at = last.length ? last[last.length - 1].inst + last[last.length - 1].dur + 3 * MIN : hm.hwAt;
      const rat = last.length ? last[last.length - 1].rem + last[last.length - 1].dur + 3 * MIN : hm.hwRat;
      const door = { type: kind, gesture: 'door', inst: at, rem: rat, dur: HW_DUR.door, f, home: hm, mem, v: rd(), side: rd() < 0.5 ? -1 : 1 };
      f.hwItems.push(door); items.push(door);
      if (rd() < S.cauldron) { const c = { type: 'cauldron', gesture: 'cauldron', inst: at + HW_DUR.door + 0.5 * MIN, rem: rat + HW_DUR.door + 0.5 * MIN, dur: HW_DUR.cauldron, f, home: hm, mem, v: rd(), side: -door.side }; f.hwItems.push(c); items.push(c); }
    }
  });
  hwForceHero(street);
  street.hwItems = items;
  street.hwLamps = hwLampSet();
}
// Immeuble héros : horaires imposés pour que chaque capture montre ce qu'elle doit (comme la maquette vie-etages).
function hwForceHero(street) {
  const f = street.hero, at = (d, h) => d * 24 + h;
  const fam = f.homes.find((h) => h.hh && h.hh.type === 'famille') || f.homes.find((h) => h.hh);
  let door = f.hwItems.find((i) => i.gesture === 'door');
  if (!door) { door = { type: 'web', gesture: 'door', dur: HW_DUR.door, f, v: 0.2, side: 1 }; f.hwItems.push(door); }
  door.type = 'web'; door.home = fam; door.mem = fam.hh.members[0];
  if (!f.hwItems.some((i) => i.type === 'cauldron')) f.hwItems.push({ type: 'cauldron', gesture: 'cauldron', dur: HW_DUR.cauldron, f, home: fam, mem: fam.hh.members[0], v: 0.5, side: -door.side });
  // une sorcière au balcon filant du premier logement qui en a un (capture du 27 au soir)
  const bh = f.homes.find((h) => h.hh && h.balcony);
  if (bh && !f.hwItems.some((i) => i.type === 'witch')) {
    const wins = bh.bays.map((b) => winOf(f, bh, b)).filter(Boolean), exit = winOf(f, bh, bh.bays[bh.rooms.indexOf('salon')]) || wins[0];
    f.hwItems.unshift({ type: 'witch', gesture: 'walk', dur: HW_DUR.walk, f, home: bh, mem: bh.hh.members[0], win: exit, x: wins[0].x + wins[0].w * 0.15, v: 0.4, off: 0.5 });
  }
  const set = (it, inst, rem) => { if (it) { it.inst = inst; it.rem = rem; } };
  set(door, at(OCT(24), 15), at(NOV(3), 10 + 58.5 * MIN));
  set(f.hwItems.find((i) => i.type === 'cauldron'), at(OCT(24), 15 + 4.5 * MIN), at(NOV(3), 10 + 53 * MIN));
  const pumps = f.hwItems.filter((i) => i.type === 'pumpkin');
  pumps.forEach((p, k) => set(p, k === 0 ? at(OCT(24), 15 + 12 * MIN) : at(OCT(27), 18 + (40 + 7 * k) * MIN), k === 0 ? at(NOV(3), 10 + 46 * MIN) : at(NOV(1), 15 + k * 0.4)));
  const balc = f.hwItems.filter((i) => i.gesture === 'walk');
  balc.forEach((b, k) => set(b, k === 0 ? at(OCT(27), 18 + 59 * MIN) : at(OCT(25), 11 + k), at(NOV(5), 18 + k * 0.3)));
}

function hwPhase(it, A) {
  if (A < it.inst) return null;
  if (A < it.inst + it.dur) return { k: 'in', p: (A - it.inst) / it.dur };
  if (A < it.rem) return { k: 'on' };
  if (A < it.rem + it.dur) return { k: 'out', p: (A - it.rem) / it.dur };
  return null;
}
const hwShown = (it, ph) => !!ph && (ph.k === 'on' || (ph.k === 'in' ? ph.p >= HW_GESTURE[it.gesture] : ph.p < HW_GESTURE[it.gesture]));
// Objet dans les mains pendant le geste : à la pose, avant le geste ; à la dépose, après.
const hwHeld = (it, ph) => !!ph && ph.k !== 'on' && (ph.k === 'in' ? ph.p < HW_GESTURE[it.gesture] : ph.p >= HW_GESTURE[it.gesture]);
// Lumières de fête : la nuit, du soir de la pose jusqu'à la nuit du 31 au 1er novembre (extinction entre 0 h 20 et 1 h 30,
// plus tard que les pièces) ; après, ce qui reste n'est plus allumé.
function hwLit(it, A) {
  if (!isNight()) return false;
  const day = Math.floor(A / 24), T = A - day * 24, offH = 0.33 + it.off * 1.17;
  return T >= 12 ? day <= OCT(31) : T < offH && day - 1 <= OCT(31);
}
// Ouverture de la fenêtre pendant un geste (penché à la fenêtre, sortie sur le balcon).
function hwWindowSession(f, win, sc) {
  if (!f.hwItems) return null;
  const A = hwAbs(sc);
  for (const it of f.hwItems) {
    if (it.win !== win || (it.gesture !== 'lean' && it.gesture !== 'walk')) continue;
    const ph = hwPhase(it, A); if (!ph || ph.k === 'on') continue;
    return { it, ph, open: smooth(sat(ph.p / 0.12)) * smooth(sat((1 - ph.p) / 0.12)) };
  }
  return null;
}

// ───────────── dessins ─────────────
// Citrouille sculptée : teinte, aplatissement et visage tirés de `v` (jamais deux pareilles côte à côte). Pied en (cx, by).
function paintPumpkin(ctx, cx, by, r, v, lit) {
  const rr = mulberry32(Math.floor(v * 1e9) + 7);
  const hue = hex(pick(['#E8772E', '#F08A2A', '#D86A22', '#F2A03A', '#E06A30'], rr)), squash = 0.72 + rr() * 0.22, face = Math.floor(rr() * 4), lean = (rr() - 0.5) * 0.5;
  const ry = r * squash, cy = by - ry;
  if (lit) { ctx.fillStyle = 'rgba(255,170,60,0.22)'; ctx.beginPath(); ctx.arc(cx, cy, r * 2.6, 0, TAU); ctx.fill(); ctx.fillStyle = 'rgba(255,190,90,0.25)'; ctx.beginPath(); ctx.arc(cx, cy, r * 1.6, 0, TAU); ctx.fill(); }
  const body = (c, dx, rx) => { ctx.fillStyle = lit ? rgba(mix(c, hex('#FF9A3A'), 0.25)) : col(c); ctx.beginPath(); ctx.ellipse(cx + dx * r, cy, rx * r, ry, 0, 0, TAU); ctx.fill(); };
  body(shade(hue, 0.3), 0.42, 0.62); body(light(hue, 0.08), -0.42, 0.62); body(hue, 0, 0.6);
  ctx.strokeStyle = INK; ctx.lineWidth = Math.max(0.25, r * 0.12); ctx.beginPath(); ctx.ellipse(cx, cy, r * 1.04, ry, 0, 0, TAU); ctx.stroke();
  ctx.lineWidth = Math.max(0.15, r * 0.06); ctx.beginPath(); ctx.ellipse(cx, cy, r * 0.5, ry * 0.98, 0, 0, TAU); ctx.stroke();
  ctx.fillStyle = col('#5A6A2E'); ctx.beginPath(); ctx.moveTo(cx - r * 0.12, cy - ry * 0.95); ctx.lineTo(cx + lean * r, cy - ry - r * 0.42); ctx.lineTo(cx + lean * r + r * 0.22, cy - ry - r * 0.36); ctx.lineTo(cx + r * 0.14, cy - ry * 0.95); ctx.fill();
  if (face === 3 && !lit) return; // citrouille non sculptée (de jour) ; la nuit, une bougie derrière une seule fente
  const fc = lit ? '#FFE27A' : '#3A1A10', ex = r * 0.38, ey = cy - ry * 0.22, es = r * 0.22;
  ctx.fillStyle = fc;
  const tri = (x, y, s, up = true) => { ctx.beginPath(); ctx.moveTo(x - s, y + (up ? s * 0.6 : -s * 0.6)); ctx.lineTo(x + s, y + (up ? s * 0.6 : -s * 0.6)); ctx.lineTo(x, y + (up ? -s * 0.8 : s * 0.8)); ctx.closePath(); ctx.fill(); };
  if (face === 0) { tri(cx - ex, ey, es); tri(cx + ex, ey, es); tri(cx, cy + ry * 0.05, es * 0.6); ctx.beginPath(); ctx.moveTo(cx - r * 0.6, cy + ry * 0.3); for (let k = 0; k <= 6; k++) ctx.lineTo(cx - r * 0.6 + k * r * 0.2, cy + ry * (0.3 + (k % 2 ? 0.22 : 0))); ctx.lineTo(cx + r * 0.5, cy + ry * 0.58); ctx.quadraticCurveTo(cx, cy + ry * 0.75, cx - r * 0.5, cy + ry * 0.58); ctx.closePath(); ctx.fill(); }
  else if (face === 1) { ctx.beginPath(); ctx.arc(cx - ex, ey, es * 0.85, 0, TAU); ctx.arc(cx + ex, ey, es * 0.85, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.moveTo(cx - r * 0.62, cy + ry * 0.2); ctx.quadraticCurveTo(cx, cy + ry * 0.95, cx + r * 0.62, cy + ry * 0.2); ctx.quadraticCurveTo(cx, cy + ry * 0.5, cx - r * 0.62, cy + ry * 0.2); ctx.fill(); ctx.fillStyle = lit ? rgba(mix(hue, hex('#FF9A3A'), 0.25)) : col(hue); ctx.fillRect(cx - r * 0.18, cy + ry * 0.36, r * 0.14, ry * 0.18); ctx.fillRect(cx + r * 0.08, cy + ry * 0.38, r * 0.14, ry * 0.16); }
  else if (face === 2) { tri(cx - ex, ey, es, false); tri(cx + ex, ey, es, false); ctx.fillRect(cx - r * 0.55, cy + ry * 0.28, r * 1.1, ry * 0.3); ctx.fillStyle = lit ? rgba(mix(hue, hex('#FF9A3A'), 0.25)) : col(hue); for (let k = 0; k < 4; k++) ctx.fillRect(cx - r * 0.45 + k * r * 0.28, cy + ry * (k % 2 ? 0.44 : 0.28), r * 0.12, ry * 0.14); }
  else { ctx.fillRect(cx - r * 0.5, cy - ry * 0.05, r * 1.0, ry * 0.12); }
}
// Fantôme en drap pendu à l'imposte : bas ondulé, deux yeux ; un peu phosphorescent la nuit.
function paintGhost(ctx, cx, top, w, h, T, glow) {
  const sway = Math.sin(T / SEC / 1.7) * 0.25;
  if (glow) { ctx.fillStyle = 'rgba(200,230,255,0.18)'; ctx.beginPath(); ctx.ellipse(cx, top + h * 0.5, w * 0.9, h * 0.75, 0, 0, TAU); ctx.fill(); }
  ctx.fillStyle = glow ? '#E8F0FF' : col('#F4F2EC');
  ctx.beginPath(); ctx.moveTo(cx - w / 2, top + h * 0.45); ctx.quadraticCurveTo(cx - w / 2, top, cx, top); ctx.quadraticCurveTo(cx + w / 2, top, cx + w / 2, top + h * 0.45);
  ctx.lineTo(cx + w / 2 + sway, top + h); for (let k = 3; k >= 0; k--) ctx.quadraticCurveTo(cx - w / 2 + (k + 0.5) * (w / 4) + sway, top + h - h * 0.16, cx - w / 2 + k * (w / 4) + sway, top + h); ctx.closePath(); ctx.fill();
  fillRect(ctx, shade(hex('#F4F2EC'), 0.25), cx + w * 0.2, top + h * 0.3, w * 0.28, h * 0.6);
  ctx.strokeStyle = INK; ctx.lineWidth = 0.4; ctx.stroke();
  ctx.fillStyle = INK; ctx.beginPath(); ctx.ellipse(cx - w * 0.17, top + h * 0.34, w * 0.07, h * 0.08, 0, 0, TAU); ctx.ellipse(cx + w * 0.17, top + h * 0.34, w * 0.07, h * 0.08, 0, 0, TAU); ctx.fill();
}
// Toile d'araignée dans l'angle de l'encadrement : rayons depuis le coin, trois fils en arc, une petite araignée.
function paintWeb(ctx, x, y, s, dir, glow) {
  ctx.strokeStyle = glow ? 'rgba(230,236,255,0.85)' : 'rgba(250,250,250,0.9)'; ctx.lineWidth = 0.28;
  const rays = 5, ang = (k) => (dir > 0 ? 0 : Math.PI / 2) + (k / (rays - 1)) * (Math.PI / 2) * (dir > 0 ? 1 : 1);
  ctx.beginPath(); for (let k = 0; k < rays; k++) { const a = ang(k); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * s * (dir > 0 ? 1 : -1) * (dir > 0 ? 1 : -1), y + Math.sin(a) * s); } ctx.stroke();
  for (const q of [0.35, 0.62, 0.9]) { ctx.beginPath(); for (let k = 0; k < rays; k++) { const a = ang(k), px = x + Math.cos(a) * s * q, py = y + Math.sin(a) * s * q; if (k === 0) ctx.moveTo(px, py); else { const a0 = ang(k - 1), mx = x + Math.cos((a + a0) / 2) * s * q * 0.82, my = y + Math.sin((a + a0) / 2) * s * q * 0.82; ctx.quadraticCurveTo(mx, my, px, py); } } ctx.stroke(); }
  const sx = x + Math.cos(ang(2)) * s * 0.62, sy = y + Math.sin(ang(2)) * s * 0.62;
  ctx.strokeStyle = INK; ctx.lineWidth = 0.22; ctx.beginPath(); for (let k = 0; k < 4; k++) { ctx.moveTo(sx - 1.1, sy - 0.6 + k * 0.4); ctx.lineTo(sx + 1.1, sy + 0.6 - k * 0.4); } ctx.stroke();
  disc(ctx, '#1A1418', sx, sy, 0.55, true);
}
// Chaudron sur trois pieds au bord du pas de porte ; la nuit, lueur verte et bulles.
function paintCauldron(ctx, cx, by, r, T, glow) {
  ctx.fillStyle = col('#2A2430');
  ctx.fillRect(cx - r * 0.8, by - r * 0.35, r * 0.25, r * 0.35); ctx.fillRect(cx + r * 0.55, by - r * 0.35, r * 0.25, r * 0.35);
  ctx.beginPath(); ctx.ellipse(cx, by - r * 0.95, r, r * 0.78, 0, 0, Math.PI); ctx.lineTo(cx - r, by - r * 0.95); ctx.fill();
  ctx.beginPath(); ctx.ellipse(cx, by - r * 0.95, r, r * 0.8, 0, 0, Math.PI); ctx.strokeStyle = INK; ctx.lineWidth = 0.4; ctx.stroke();
  fillRect(ctx, '#3E3846', cx - r * 1.1, by - r * 1.1, r * 2.2, r * 0.3); inkRect(ctx, cx - r * 1.1, by - r * 1.1, r * 2.2, r * 0.3, 0.3);
  rawRect(ctx, glow ? '#8AF070' : rgba(amb(hex('#6AB050'))), cx - r * 0.95, by - r * 1.12, r * 1.9, r * 0.12);
  if (glow) {
    ctx.fillStyle = 'rgba(140,240,110,0.25)'; ctx.beginPath(); ctx.ellipse(cx, by - r * 1.3, r * 1.6, r * 0.9, 0, 0, TAU); ctx.fill();
    const s = T / SEC; for (let k = 0; k < 3; k++) { const q = ((s * 0.5 + k / 3) % 1); ctx.fillStyle = `rgba(180,255,150,${0.8 * (1 - q)})`; ctx.beginPath(); ctx.arc(cx + (k - 1) * r * 0.5, by - r * 1.2 - q * r * 1.4, r * 0.16, 0, TAU); ctx.fill(); }
  }
}
// Sorcière : silhouette découpée debout sur la dalle (chapeau pointu, cape), balai posé contre le mur.
function paintWitch(ctx, cx, fy, h, dir) {
  const c = rgba(amb(hex('#2A1E30')));
  ctx.fillStyle = c;
  ctx.beginPath(); ctx.moveTo(cx - h * 0.2, fy); ctx.lineTo(cx - h * 0.1, fy - h * 0.62); ctx.lineTo(cx + h * 0.1, fy - h * 0.62); ctx.lineTo(cx + h * 0.22, fy); ctx.closePath(); ctx.fill();
  disc(ctx, c, cx, fy - h * 0.7, h * 0.09, true);
  ctx.beginPath(); ctx.moveTo(cx + dir * h * 0.08, fy - h * 0.71); ctx.lineTo(cx + dir * h * 0.2, fy - h * 0.66); ctx.lineTo(cx + dir * h * 0.07, fy - h * 0.66); ctx.fill();
  ctx.beginPath(); ctx.moveTo(cx - h * 0.2, fy - h * 0.76); ctx.lineTo(cx + h * 0.2, fy - h * 0.76); ctx.lineTo(cx + h * 0.03, fy - h * 1.08); ctx.lineTo(cx - h * 0.02, fy - h * 0.86); ctx.closePath(); ctx.fill();
  fillRect(ctx, '#8A5A8E', cx - h * 0.1, fy - h * 0.8, h * 0.2, h * 0.035);
  // balai contre le mur
  ctx.strokeStyle = col('#7A5A3A'); ctx.lineWidth = Math.max(0.4, h * 0.04); ctx.beginPath(); ctx.moveTo(cx - dir * h * 0.42, fy - h * 0.95); ctx.lineTo(cx - dir * h * 0.3, fy - h * 0.15); ctx.stroke();
  ctx.fillStyle = col('#C8A050'); ctx.beginPath(); ctx.moveTo(cx - dir * h * 0.33, fy - h * 0.25); ctx.lineTo(cx - dir * h * 0.4, fy); ctx.lineTo(cx - dir * h * 0.18, fy); ctx.lineTo(cx - dir * h * 0.27, fy - h * 0.25); ctx.fill();
}
// Squelette assis sur la rambarde, jambes pendantes devant le garde-corps ; la tête se tourne doucement.
function paintSkeleton(ctx, cx, ry, h, T) {
  const bone = col('#F2EEE2'), turn = Math.sin(T / SEC / 3.1) * 0.12;
  ctx.strokeStyle = bone; ctx.lineCap = 'round'; ctx.lineWidth = Math.max(0.35, h * 0.05);
  const seg = (pts) => { ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke(); };
  seg([[cx, ry], [cx, ry - h * 0.45]]);
  for (let k = 0; k < 3; k++) seg([[cx - h * 0.12, ry - h * (0.18 + k * 0.08)], [cx + h * 0.12, ry - h * (0.18 + k * 0.08)]]);
  seg([[cx - h * 0.04, ry], [cx - h * 0.1, ry + h * 0.22], [cx - h * 0.08, ry + h * 0.45]]); seg([[cx + h * 0.06, ry], [cx + h * 0.12, ry + h * 0.22], [cx + h * 0.16, ry + h * 0.44]]);
  seg([[cx - h * 0.12, ry - h * 0.4], [cx - h * 0.22, ry - h * 0.18], [cx - h * 0.18, ry - h * 0.02]]); seg([[cx + h * 0.12, ry - h * 0.4], [cx + h * 0.26, ry - h * 0.5], [cx + h * 0.32, ry - h * 0.66]]);
  const hx = cx + turn * h, hy = ry - h * 0.58;
  disc(ctx, '#F2EEE2', hx, hy, h * 0.12); ctx.strokeStyle = INK; ctx.lineWidth = 0.25; ctx.beginPath(); ctx.arc(hx, hy, h * 0.12, 0, TAU); ctx.stroke();
  disc(ctx, INK, hx - h * 0.045, hy - h * 0.01, h * 0.035, true); disc(ctx, INK, hx + h * 0.045, hy - h * 0.01, h * 0.035, true);
  ctx.lineCap = 'butt';
}
// Corbeau perché sur la rambarde : il tourne la tête de temps en temps.
function paintCrow(ctx, cx, ry, s, T, v) {
  const look = Math.sin(T / SEC / 2.3 + v * 9) > 0.4 ? -1 : 1, c = rgba(amb(hex('#1E1A24')));
  ctx.fillStyle = c; ctx.beginPath(); ctx.ellipse(cx, ry - s * 0.5, s * 0.75, s * 0.48, -0.2 * look, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.moveTo(cx - look * s * 0.5, ry - s * 0.4); ctx.lineTo(cx - look * s * 1.25, ry - s * 0.1); ctx.lineTo(cx - look * s * 0.55, ry - s * 0.7); ctx.fill();
  disc(ctx, c, cx + look * s * 0.55, ry - s * 0.95, s * 0.32, true);
  ctx.fillStyle = col('#C89A3A'); ctx.beginPath(); ctx.moveTo(cx + look * s * 0.82, ry - s * 1.0); ctx.lineTo(cx + look * s * 1.2, ry - s * 0.9); ctx.lineTo(cx + look * s * 0.8, ry - s * 0.86); ctx.fill();
  disc(ctx, '#FFD86A', cx + look * s * 0.62, ry - s * 1.02, s * 0.08, true);
  rawRect(ctx, col('#C89A3A'), cx - s * 0.1, ry - s * 0.1, s * 0.08, s * 0.12); rawRect(ctx, col('#C89A3A'), cx + s * 0.12, ry - s * 0.1, s * 0.08, s * 0.12);
}
// Araignée géante pendue sous la dalle du balcon au bout de son fil (balancement lent) ; yeux rouges la nuit.
function paintSpider(ctx, cx, top, len, s, T, glow) {
  const sw = Math.sin(T / SEC / 2.6) * s * 0.6, x = cx + sw, y = top + len;
  ctx.strokeStyle = 'rgba(240,240,240,0.8)'; ctx.lineWidth = 0.22; ctx.beginPath(); ctx.moveTo(cx, top); ctx.lineTo(x, y - s * 0.6); ctx.stroke();
  ctx.strokeStyle = rgba(amb(hex('#1A1418'))); ctx.lineWidth = Math.max(0.3, s * 0.18);
  for (const sd of [-1, 1]) for (let k = 0; k < 4; k++) { const a = -0.9 + k * 0.55; ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + sd * s * 1.1, y + Math.sin(a) * s * 1.4 - s * 0.6, x + sd * s * 1.7, y + Math.sin(a) * s * 1.2 + s * 0.4); ctx.stroke(); }
  disc(ctx, '#1A1418', x, y + s * 0.15, s * 0.7); disc(ctx, '#1A1418', x, y - s * 0.55, s * 0.42);
  fillRect(ctx, '#C83A3A', x - s * 0.18, y + s * 0.05, s * 0.36, s * 0.14);
  if (glow) { disc(ctx, '#FF3A3A', x - s * 0.15, y - s * 0.58, s * 0.1, true); disc(ctx, '#FF3A3A', x + s * 0.15, y - s * 0.58, s * 0.1, true); }
}
// Escabeau : replié (porté sous le bras, horizontal) ou déplié (en A, hauteur h).
function paintStepladder(ctx, x, by, h, open) {
  const spread = h * 0.32 * open;
  const rails = (c, lw) => { ctx.strokeStyle = c; ctx.lineWidth = lw; ctx.beginPath(); ctx.moveTo(x - spread, by); ctx.lineTo(x, by - h); ctx.lineTo(x + spread * 0.7, by); for (let k = 1; k <= 3; k++) { const q = k / 4; ctx.moveTo(x - spread * (1 - q), by - h * q); ctx.lineTo(x + spread * 0.7 * (1 - q), by - h * q); } ctx.stroke(); };
  rails(INK, 1.0); rails(col('#C8D2DA'), 0.5);
}
function paintCarriedLadder(ctx, hx, hy, dir) {
  const seg = (c, lw) => { ctx.strokeStyle = c; ctx.lineWidth = lw; ctx.beginPath(); ctx.moveTo(hx - dir * 3.5, hy - 0.4); ctx.lineTo(hx + dir * 3.5, hy + 0.2); ctx.moveTo(hx - dir * 3.5, hy + 0.6); ctx.lineTo(hx + dir * 3.5, hy + 1.2); ctx.stroke(); };
  seg(INK, 1.0); seg(col('#C8D2DA'), 0.5);
}
// Petit objet tenu à la main pendant le geste (repère de la main).
function paintHeldDecor(ctx, it, hx, hy, T, lit) {
  if (it.type === 'pumpkin' || it.type === 'rail-pumpkin') paintPumpkin(ctx, hx, hy + 1.6, 1.6, it.v, false);
  else if (it.type === 'ghost') paintGhost(ctx, hx, hy - 1, 3.4, 4, T, false);
  else if (it.type === 'web') { ctx.fillStyle = col('#F4F2EC'); ctx.beginPath(); ctx.arc(hx, hy + 0.6, 0.9, 0, TAU); ctx.fill(); }
  else if (it.type === 'cauldron') paintCauldron(ctx, hx, hy + 2.8, 1.8, T, false);
  else if (it.type === 'witch') paintWitch(ctx, hx + 1, hy + 2.5, 5, 1);
  else if (it.type === 'skeleton') paintSkeleton(ctx, hx, hy + 1, 4, T);
  else if (it.type === 'crow') paintCrow(ctx, hx, hy + 0.8, 1.4, T, it.v);
  else if (it.type === 'spider') paintSpider(ctx, hx, hy - 0.5, 1.5, 1.1, T, false);
}

// ───────────── fenêtres : citrouille sur l'appui, habitant penché qui la pose ─────────────
function paintHwSill(ctx, f, win, sc, hwS, leaners, fl, figH) {
  if (!f.hwItems) return;
  const A = hwAbs(sc);
  for (const it of f.hwItems) {
    if (it.win !== win || it.type !== 'pumpkin') continue;
    const ph = hwPhase(it, A);
    // posée sur l'appui (fenêtre ordinaire) : dessinée ici ; sur la rambarde d'un balconnet : passe « front » des balcons
    if (it.place === 'sill' && hwShown(it, ph)) paintPumpkin(ctx, it.x, win.y + win.h + 0.2, Math.min(2.1, win.w * 0.3), it.v, hwLit(it, A));
    if (hwS && hwS.it === it && hwS.ph.p > 0.1 && hwS.ph.p < 0.9) leaners.push(() => paintHwLeaner(ctx, f, win, it, hwS.ph, fl, figH, sc.T));
  }
}
function paintHwLeaner(ctx, f, win, it, ph, fl, figH, T) {
  const { x, y, w, h } = win, sill = y + h, night = isNight();
  const hh = figH * it.mem.size * 1.08, ax = x + w * 0.42;
  // il se penche (montée 0,1 → 0,2), tend les bras vers l'appui, puis se redresse (0,8 → 0,9)
  const k = smooth(sat((ph.p - 0.1) / 0.1)) * smooth(sat((0.9 - ph.p) / 0.1));
  const reach = smooth(sat(1 - Math.abs(ph.p - 0.5) / 0.22));
  const P = mixPose(POSE.stand, { ...POSE.lean, aL: [72 + 18 * reach, -60 + 30 * reach], aR: [72 + 18 * reach, -60 + 30 * reach] }, k);
  ctx.save(); ctx.beginPath(); ctx.rect(x - 2.5, y - 6, w + 5, sill - y + 6.5); ctx.clip();
  const sty = night ? { silhouette: rgba(amb(hex('#3A2E3C'))) } : { mem: it.mem, amb: true };
  const J = drawFigure(ctx, ax, sill + hh * 0.5, hh, P, 0, sty);
  ctx.restore();
  if (hwHeld(it, ph)) { const hx = ax + (J.hL[0] + J.hR[0]) / 2, hy = sill + hh * 0.5 + (J.hL[1] + J.hR[1]) / 2; paintPumpkin(ctx, lerp(hx, it.x, reach * 0.6), Math.min(sill + 0.2, hy + 1.6), Math.min(2.1, w * 0.3), it.v, false); }
}

// ───────────── balcons : décors posés à la main depuis la porte-fenêtre ─────────────
function hwBalconyGeom(it) {
  const win = it.win, lv = win.level;
  if (it.place === 'balconnet') return { by: win.y + win.h, rh: 4, h: lv.h * 0.66 };
  return { by: lv.y + lv.h, rh: 5.5, h: lv.h * 0.66 };
}
function paintHwBalconies(ctx, f, sc, pass) {
  if (!f.hwItems) return;
  const A = hwAbs(sc), T = sc.T, night = isNight();
  for (const it of f.hwItems) {
    if (it.gesture !== 'walk' && !(it.type === 'pumpkin' && it.place === 'balconnet')) continue;
    const ph = hwPhase(it, A), shown = hwShown(it, ph), g = hwBalconyGeom(it), rail = g.by - g.rh;
    if (pass === 'back') {
      if (shown && it.type === 'witch') paintWitch(ctx, it.x, g.by - 0.4, g.h * 0.92, 1);
      if (it.gesture === 'walk' && ph && ph.k !== 'on') paintHwBalconyWalker(ctx, it, ph, g, T, night);
    } else {
      const lit = hwLit(it, A);
      if (!shown) continue;
      if (it.type === 'rail-pumpkin' || it.type === 'pumpkin') paintPumpkin(ctx, it.x, rail + 0.2, 1.9, it.v, lit);
      else if (it.type === 'skeleton') paintSkeleton(ctx, it.x, rail + 0.3, g.h * 0.62, T);
      else if (it.type === 'crow') paintCrow(ctx, it.x, rail + 0.2, 1.5, T, it.v);
      else if (it.type === 'spider') paintSpider(ctx, it.x, g.by + 2.4, ph.k === 'on' ? 7 : 7 * sat((ph.p - 0.3) / 0.25), 1.2, T, lit);
    }
  }
}
// L'habitant sort par la porte-fenêtre ouverte, va jusqu'à l'emplacement, pose (ou reprend) l'objet, revient et rentre.
function paintHwBalconyWalker(ctx, it, ph, g, T, night) {
  const p = ph.p, wx = it.win.x + it.win.w / 2, hh = g.h * it.mem.size;
  if (p < 0.1 || p > 0.92) return;
  const out = sat((p - 0.1) / 0.18), back = sat((p - 0.72) / 0.18), at = out * (1 - back);
  const x = lerp(wx, it.x + (it.type === 'witch' ? 2.5 : -1.5), at), walking = (p < 0.28 || p > 0.72);
  const bend = smooth(sat(1 - Math.abs(p - 0.5) / 0.15));
  const dir = it.x >= wx ? (p > 0.72 ? -1 : 1) : (p > 0.72 ? 1 : -1);
  let P = walking ? walkPose(T / SEC / 0.9) : mixPose(POSE.stand, it.type === 'spider' ? POSE.leanRail : { ...POSE.reach, torso: 22, aR: [84, -10], aL: [70, -10] }, bend);
  const sty = night ? { silhouette: rgba(amb(hex('#3A2E3C'))) } : { mem: it.mem, amb: true };
  ctx.globalAlpha = sat((p - 0.1) / 0.04) * sat((0.92 - p) / 0.04);
  const J = drawFigure(ctx, x, g.by - 0.4, hh, P, dir, sty);
  ctx.globalAlpha = 1;
  if (hwHeld(it, ph)) paintHeldDecor(ctx, it, x + J.hR[0], g.by - 0.4 + J.hR[1], T, false);
}

// ───────────── porte : toile ou fantôme, chaudron ; l'habitant descend avec son escabeau ─────────────
function paintHwDoor(ctx, f, sc) {
  if (!f.hwItems || !f.door) return;
  const A = hwAbs(sc), d = f.door, night = isNight();
  for (const it of f.hwItems) {
    if (it.gesture !== 'door') continue;
    const ph = hwPhase(it, A); if (!hwShown(it, ph)) continue;
    const top = GROUND - d.h;
    if (it.type === 'ghost') { ctx.strokeStyle = INK; ctx.lineWidth = 0.2; ctx.beginPath(); ctx.moveTo(d.x, top - 1); ctx.lineTo(d.x, top + 0.6); ctx.stroke(); paintGhost(ctx, d.x, top + 0.4, d.w * 0.62, 7.5, sc.T, night); }
    else { paintWeb(ctx, d.x + it.side * (d.w / 2 + 1), top - 1, 7, -it.side, night); if (it.v < 0.4) paintWeb(ctx, d.x - it.side * (d.w / 2 + 1), top - 1, 4.5, it.side, night); }
  }
}
const HW_FOOT = GROUND + 5, HW_STEP = 6;
function paintHwStreet(ctx, f, sc) {
  if (!f.hwItems || !f.door) return;
  const A = hwAbs(sc), d = f.door, T = sc.T, night = isNight();
  for (const it of f.hwItems) {
    if (it.gesture !== 'door' && it.gesture !== 'cauldron') continue;
    const ph = hwPhase(it, A), cx = d.x + it.side * (d.w / 2 + 4);
    if (it.type === 'cauldron' && hwShown(it, ph)) paintCauldron(ctx, cx, GROUND + 3.5, 2.6, T, hwLit({ off: 0.6 }, A));
    if (!ph || ph.k === 'on') continue;
    paintHwDoorWalker(ctx, it, ph, d, T, night);
  }
}
// Sortie par la porte (fondu dans l'encadrement), marche jusqu'au pied de l'escabeau, dépliage, montée, fixation, descente,
// repliage, retour, entrée. Le chaudron : un aller-retour à la main, sans escabeau.
function paintHwDoorWalker(ctx, it, ph, d, T, night) {
  const p = ph.p, h = 13 * it.mem.size, sty = { mem: it.mem, amb: true };
  const spot = d.x + it.side * (d.w / 2 + (it.gesture === 'door' ? 2.5 : 4)), dir = it.side;
  const fade = (a) => { ctx.globalAlpha = a; };
  const walk = (x0, x1, q, face, carry) => { const x = lerp(x0, x1, smooth(q)); const J = drawFigure(ctx, x, HW_FOOT, h, carry ? { ...walkPose(T / SEC / 0.9), aR: [70, -30] } : walkPose(T / SEC / 0.9), face, sty); return { x, J }; };
  if (it.gesture === 'cauldron') {
    const ex = sat(p / 0.12), back = sat((p - 0.88) / 0.12);
    let r;
    if (p < 0.12) { fade(ex); r = walk(d.x, d.x, 0, dir, true); }
    else if (p < 0.4) r = walk(d.x, spot - dir * 2, (p - 0.12) / 0.28, dir, hwHeld(it, ph));
    else if (p < 0.6) { const P = mixPose(POSE.stand, POSE.kneel, smooth(sat(1 - Math.abs(p - 0.5) / 0.1))); r = { x: spot - dir * 2, J: drawFigure(ctx, spot - dir * 2, HW_FOOT, h, P, dir, sty) }; }
    else if (p < 0.88) r = walk(spot - dir * 2, d.x, (p - 0.6) / 0.28, -dir, hwHeld(it, ph));
    else { fade(1 - back); r = walk(d.x, d.x, 0, -dir, false); }
    fade(1);
    if (hwHeld(it, ph) && r) paintHeldDecor(ctx, it, r.x + r.J.hR[0], HW_FOOT + r.J.hR[1], T, false);
    return;
  }
  const ladderOpen = p < 0.16 ? 0 : p < 0.24 ? (p - 0.16) / 0.08 : p < 0.68 ? 1 : p < 0.76 ? 1 - (p - 0.68) / 0.08 : 0;
  const ladderX = spot, onLadder = p >= 0.24 && p < 0.68;
  if (ladderOpen > 0) paintStepladder(ctx, ladderX, GROUND + 3.5, HW_STEP + 1, ladderOpen);
  let r = null;
  if (p < 0.08) { fade(sat(p / 0.08)); r = walk(d.x, d.x, 0, dir, true); }
  else if (p < 0.16) r = walk(d.x, ladderX - dir * 2.5, (p - 0.08) / 0.08, dir, true);
  else if (!onLadder && p < 0.24) r = { x: ladderX - dir * 2.5, J: drawFigure(ctx, ladderX - dir * 2.5, HW_FOOT, h, POSE.reach, dir, sty) };
  else if (onLadder) {
    const up = p < 0.32 ? (p - 0.24) / 0.08 : p < 0.6 ? 1 : 1 - (p - 0.6) / 0.08;
    const fy = HW_FOOT - 1.5 - up * HW_STEP, work = p >= 0.32 && p < 0.6;
    const P = work ? { ...POSE.armsUp, aL: [150 + Math.sin(T / SEC * 3) * 8, -18], aR: [140, -10], torso: 4 } : { ...walkPose(up * 2), torso: 6 };
    r = { x: ladderX, J: drawFigure(ctx, ladderX - dir * 0.6, fy, h, P, -dir, sty), fy };
  } else if (p < 0.76) r = { x: ladderX - dir * 2.5, J: drawFigure(ctx, ladderX - dir * 2.5, HW_FOOT, h, POSE.reach, dir, sty) };
  else if (p < 0.88) r = walk(ladderX - dir * 2.5, d.x, (p - 0.76) / 0.12, -dir, true);
  else { fade(1 - sat((p - 0.88) / 0.12)); r = walk(d.x, d.x, 0, -dir, true); }
  fade(1);
  if (!r) return;
  const fy = r.fy ?? HW_FOOT;
  if (ladderOpen === 0) paintCarriedLadder(ctx, r.x + r.J.hR[0] * 0.6, fy + r.J.hR[1] - 1.5, dir);
  if (hwHeld(it, ph)) paintHeldDecor(ctx, it, r.x + r.J.hL[0], fy + r.J.hL[1], T, false);
}
// Porte ouverte et hall éclairé pendant les allers et retours à la porte.
function hwStreetEvents(f, T, D, ev) {
  if (!f.hwItems) return ev;
  const A = hwDay(D.date) * 24 + T;
  for (const it of f.hwItems) {
    if (it.gesture !== 'door' && it.gesture !== 'cauldron') continue;
    const ph = hwPhase(it, A); if (!ph || ph.k === 'on') continue;
    const q = it.gesture === 'door' ? 0.08 : 0.12;
    const o = ph.p < q + 0.04 ? sat(1 - Math.abs(ph.p - q / 2) / (q * 0.9)) : ph.p > 1 - q - 0.04 ? sat(1 - Math.abs(ph.p - (1 - q / 2)) / (q * 0.9)) : 0;
    ev.door = Math.max(ev.door, o);
    if (isNight()) ev.stairLit = true;
  }
  return ev;
}

// ───────────── lampadaires : décor de la mairie, posé au camion-nacelle ─────────────
// Même mécanique que les drapeaux (install.ts) : un élément par lampadaire, traité un par un dans l'ordre de `u` ; pose le
// samedi 24 octobre de 9 h à 17 h, retrait le mardi 3 novembre de 9 h à 17 h. Étapes : arrive, deploy, rise, fix, lower,
// stow, leave (poids 3, 2, 2, 6, 2, 2, 3) ; l'élément apparaît à la fin de `fix` et disparaît à la fin de `unfix`.
const HW_LAMP_XS = [110, 370, 630, 890];
const HW_LIFT_STEPS = ['arrive', 'deploy', 'rise', 'fix', 'lower', 'stow', 'leave'], HW_LIFT_W = [3, 2, 2, 6, 2, 2, 3];
function hwLampSet() {
  const r = mulberry32(SEED ^ hashString('hw-lamps' + HW_YEAR));
  const items = HW_LAMP_XS.map((x, i) => ({ x, kind: r() < 0.55 ? 'lantern' : 'bats', u: r(), removeU: r(), v: r(), i }));
  const n = items.length, slot = (key, it, day) => { const k = [...items].sort((a, b) => a[key] - b[key]).indexOf(it); return { from: day * 24 + 9 + (k * 8) / n, to: day * 24 + 9 + ((k + 1) * 8) / n }; };
  for (const it of items) { it.ins = slot('u', it, OCT(24)); it.out = slot('removeU', it, NOV(3)); }
  return items;
}
function hwLiftStep(slot, A) {
  const tot = HW_LIFT_W.reduce((s, x) => s + x, 0); let at = slot.from;
  for (let i = 0; i < HW_LIFT_STEPS.length; i++) { const to = at + ((slot.to - slot.from) * HW_LIFT_W[i]) / tot; if (A < to) return { i, step: HW_LIFT_STEPS[i], p: (A - at) / (to - at) }; at = to; }
  return null;
}
function hwLampState(it, A) {
  if (A < it.ins.from) return { shown: false };
  if (A < it.ins.to) { const s = hwLiftStep(it.ins, A); return { shown: s.i > 3, crew: s, removing: false }; }
  if (A < it.out.from) return { shown: true };
  if (A < it.out.to) { const s = hwLiftStep(it.out, A); return { shown: s.i <= 3, crew: s, removing: true }; }
  return { shown: false };
}
function paintHwLamps(ctx, T, D) {
  const street = buildStreet(D); if (!street.hwLamps) return;
  const A = hwDay(D.date) * 24 + T, night = isNight();
  for (const it of street.hwLamps) {
    const st = hwLampState(it, A);
    if (st.shown) paintLampDecor(ctx, it, T, night);
    if (st.crew) paintLiftTruck(ctx, it, st, T, night);
  }
}
function paintLampDecor(ctx, it, T, lit) {
  const lx = it.x;
  if (it.kind === 'lantern') {
    inkLine(ctx, [[lx, GROUND - 27], [lx - 5.5, GROUND - 27], [lx - 5.5, GROUND - 25.5]], 0.5);
    paintPumpkin(ctx, lx - 5.5, GROUND - 21.3, 2.2, it.v, lit);
  } else {
    // guirlande de chauves-souris en papier : deux festons depuis la lanterne
    ctx.strokeStyle = col('#8A5A8E'); ctx.lineWidth = 0.35;
    const fest = (x0, y0, x1, y1, sag) => { ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo((x0 + x1) / 2, (y0 + y1) / 2 + sag, x1, y1); ctx.stroke(); };
    fest(lx - 1, GROUND - 31, lx - 1, GROUND - 16, 0); fest(lx + 0.8, GROUND - 31, lx + 9, GROUND - 24, 4); fest(lx - 0.8, GROUND - 31, lx - 9, GROUND - 24, 4);
    const bat = (x, y, s, ph) => { const fl = Math.sin(T / SEC * 2 + ph) * 0.3; ctx.fillStyle = rgba(amb(hex('#22182A'))); ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x - s * 0.6, y - s * (0.6 + fl), x - s * 1.4, y - s * 0.2); ctx.quadraticCurveTo(x - s * 0.9, y + s * 0.1, x - s * 0.7, y + s * 0.4); ctx.quadraticCurveTo(x - s * 0.3, y + s * 0.1, x, y + s * 0.4); ctx.quadraticCurveTo(x + s * 0.3, y + s * 0.1, x + s * 0.7, y + s * 0.4); ctx.quadraticCurveTo(x + s * 0.9, y + s * 0.1, x + s * 1.4, y - s * 0.2); ctx.quadraticCurveTo(x + s * 0.6, y - s * (0.6 + fl), x, y); ctx.fill(); if (lit) { disc(ctx, '#FFB040', x - s * 0.15, y + s * 0.05, 0.18, true); disc(ctx, '#FFB040', x + s * 0.15, y + s * 0.05, 0.18, true); } };
    [[-5, -25.6], [-8, -23.2], [5, -25.6], [8, -23.2], [0, -20], [0, -17.5]].forEach(([dx, dy], k) => bat(lx + dx, GROUND + dy, 1.5, k));
  }
}
// Camion-nacelle garé contre le trottoir sous le lampadaire (cabine vers la droite, sens de la file du premier plan).
function paintLiftTruck(ctx, it, st, T, night) {
  const { step, p } = st.crew, park = it.x - 33, wy = GROUND + 36;
  let tx = park;
  if (step === 'arrive') tx = lerp(-60, park, smooth(Math.min(1, p * 1.25)));
  else if (step === 'leave') tx = lerp(park, W + 60, smooth(sat((p - 0.2) * 1.25)));
  // flèche : repliée sur le plateau → nacelle au niveau de la lanterne
  const up = step === 'rise' ? smooth(p) : step === 'fix' ? 1 : step === 'lower' ? 1 - smooth(p) : 0;
  const pivot = [tx - 6, wy - 13], rest = [tx - 20, wy - 13], target = [it.x - 9, GROUND - 26];
  const bucket = [lerp(rest[0], target[0], up), lerp(rest[1], target[1], up)];
  const L = 32, dx = bucket[0] - pivot[0], dy = bucket[1] - pivot[1], dd = Math.min(2 * L - 0.1, Math.hypot(dx, dy)), a = Math.atan2(dy, dx), b = Math.acos(dd / (2 * L));
  const elbow = [pivot[0] + Math.cos(a + b) * L, pivot[1] + Math.sin(a + b) * L];
  const folded = up < 0.02;
  // stabilisateurs sortis (deploy → stow)
  const legs = step === 'deploy' ? smooth(p) : step === 'stow' ? 1 - smooth(p) : step === 'rise' || step === 'fix' || step === 'lower' ? 1 : 0;
  if (legs > 0) for (const lx of [tx - 18, tx + 6]) { fillRect(ctx, '#3A3A40', lx - 0.5, wy - 6, 1, 4 + legs * 3); fillRect(ctx, '#3A3A40', lx - 1.8, wy - 2 + legs * 3, 3.6, 0.8); }
  // carrosserie
  fillRect(ctx, '#F2F0E8', tx - 24, wy - 11, 34, 7); fillRect(ctx, '#E8B830', tx - 24, wy - 6, 34, 1.4); inkRect(ctx, tx - 24, wy - 11, 34, 7, 0.6);
  fillRect(ctx, '#F2F0E8', tx + 10, wy - 17, 12, 13); fillRect(ctx, '#BBD8F0', tx + 13, wy - 15.5, 8, 5); inkRect(ctx, tx + 10, wy - 17, 12, 13, 0.6);
  ctx.fillStyle = INK; ctx.font = 'bold 2.4px sans-serif'; ctx.fillText('VILLE', tx - 20, wy - 7.4);
  if (night || step !== 'fix') { disc(ctx, '#FFB040', tx + 16, wy - 18, 0.9, true); if (night) { ctx.fillStyle = 'rgba(255,176,64,0.3)'; ctx.beginPath(); ctx.arc(tx + 16, wy - 18, 2.6, 0, TAU); ctx.fill(); } }
  disc(ctx, '#2A2A2A', tx - 15, wy - 2.5, 3); disc(ctx, '#2A2A2A', tx + 15, wy - 2.5, 3); disc(ctx, '#8A8A90', tx - 15, wy - 2.5, 1.1); disc(ctx, '#8A8A90', tx + 15, wy - 2.5, 1.1);
  // caisse de décors sur le plateau
  fillRect(ctx, '#B8885A', tx - 2, wy - 15, 9, 4); inkRect(ctx, tx - 2, wy - 15, 9, 4, 0.4);
  ctx.strokeStyle = '#E8B830'; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(pivot[0], pivot[1]); if (folded) ctx.lineTo(rest[0], rest[1]); else { ctx.lineTo(elbow[0], elbow[1]); ctx.lineTo(bucket[0], bucket[1]); } ctx.stroke();
  ctx.strokeStyle = INK; ctx.lineWidth = 0.35; ctx.stroke(); ctx.lineCap = 'butt';
  disc(ctx, '#5A5A60', pivot[0], pivot[1], 1.4); if (!folded) disc(ctx, '#5A5A60', elbow[0], elbow[1], 1.1);
  // ouvrier : en cabine pendant les trajets, dans la nacelle de « deploy » à « stow » (il y monte depuis la cabine)
  const inBucket = (step === 'deploy' && p > 0.5) || step === 'rise' || step === 'fix' || step === 'lower' || (step === 'stow' && p < 0.5);
  const mem = { size: 1, shirt: '#E8772E', pants: '#2E3A4A', skin: '#D9A070' };
  if (inBucket) {
    const working = step === 'fix', P = working ? { ...POSE.armsUp, aL: [146, -10], aR: [128 + Math.sin(T / SEC * 3) * 10, -20], torso: 4 } : POSE.stand;
    const J = drawFigure(ctx, bucket[0], bucket[1], 12, P, 1, { mem, amb: true });
    // l'objet : pris dans la caisse au déploiement, tenu jusqu'à la fin de la fixation (à la dépose, l'inverse)
    const holding = st.removing ? step === 'lower' || (step === 'stow' && p < 0.5) || (working && p > 0.85) : step === 'rise' || (step === 'deploy' && p > 0.5) || (working && p < 0.7);
    if (holding) { if (it.kind === 'lantern') paintPumpkin(ctx, bucket[0] + J.hR[0] + 1, bucket[1] + J.hR[1] + 2, 1.8, it.v, false); else { ctx.fillStyle = col('#22182A'); ctx.fillRect(bucket[0] + J.hR[0], bucket[1] + J.hR[1], 2.6, 1.6); } }
  } else if (step === 'deploy' || step === 'stow') {
    const q = step === 'deploy' ? p / 0.5 : (1 - p) / 0.5, x = lerp(tx + 12, tx - 18, sat(q));
    ctx.globalAlpha = sat(q * 4); drawFigure(ctx, x, wy - 1, 12, walkPose(T / SEC / 0.9), -1, { mem, amb: true }); ctx.globalAlpha = 1;
  }
  // nacelle (devant l'ouvrier, garde-corps)
  fillRect(ctx, '#F4F4F0', bucket[0] - 4, bucket[1] - 4.5, 8, 5); fillRect(ctx, '#E8B830', bucket[0] - 4, bucket[1] - 4.5, 8, 1); inkRect(ctx, bucket[0] - 4, bucket[1] - 4.5, 8, 5, 0.45);
}

// ───────────── planche des décors (×4, jour / nuit) ─────────────
function renderHwPlanche() {
  const CW = 120, CH = 70, LB = 11, S = 4;
  const cells = [
    ['Citrouille (4 visages)', (ctx, T, lit) => { [0.11, 0.37, 0.58, 0.83].forEach((v, k) => paintPumpkin(ctx, -15 + k * 10, 8, 3.4, v, lit)); }],
    ['Toile d’araignée (porte)', (ctx, T, lit) => { fillRect(ctx, '#5A3A2E', -8, -14, 16, 22); paintWeb(ctx, -8, -14, 11, 1, lit); paintWeb(ctx, 8, -14, 7, -1, lit); }],
    ['Fantôme (porte)', (ctx, T, lit) => { fillRect(ctx, '#2F5D50', -9, -14, 18, 22); paintGhost(ctx, 0, -12, 11, 13, T, lit); }],
    ['Chaudron (pas de porte)', (ctx, T, lit) => paintCauldron(ctx, 0, 8, 6, T, lit)],
    ['Sorcière + balai (balcon)', (ctx, T, lit) => paintWitch(ctx, 2, 8, 20, 1)],
    ['Squelette assis (rambarde)', (ctx, T, lit) => { fillRect(ctx, INK, -14, -1, 28, 1); paintSkeleton(ctx, 0, -1, 15, T); }],
    ['Corbeau perché (rambarde)', (ctx, T, lit) => { fillRect(ctx, INK, -14, 2, 28, 1); paintCrow(ctx, -5, 2, 4, T, 0.2); paintCrow(ctx, 7, 2, 4, T + 0.0006, 0.7); }],
    ['Araignée géante (sous la dalle)', (ctx, T, lit) => { fillRect(ctx, '#D8CCB8', -14, -16, 28, 2); paintSpider(ctx, 0, -14, 14, 3, T, lit); }],
    ['Lanterne citrouille (lampadaire)', (ctx, T, lit) => { ctx.save(); ctx.translate(-110 + 4, -GROUND + 12); paintLampDecor(ctx, { x: 110, kind: 'lantern', v: 0.37 }, T, lit); ctx.restore(); }],
    ['Chauves-souris (lampadaire)', (ctx, T, lit) => { ctx.save(); ctx.translate(-110, -GROUND + 12); paintLampDecor(ctx, { x: 110, kind: 'bats', v: 0 }, T, lit); ctx.restore(); }],
    ['Escabeau porté / déplié', (ctx, T, lit) => { paintCarriedLadder(ctx, -8, -2, 1); paintStepladder(ctx, 8, 8, 9, 1); }],
    ['Citrouille sur l’appui', (ctx, T, lit) => { fillRect(ctx, GLASS_DAY, -6, -16, 12, 16); inkRect(ctx, -6, -16, 12, 16, 0.5); fillRect(ctx, '#F2E8D4', -8, 0, 16, 1.6); paintPumpkin(ctx, 3, 0.2, 3, 0.58, lit); }],
  ];
  const cols = 4, rows = Math.ceil(cells.length / cols);
  const ctx = canvasFor('planche-decors', CW * cols * S, (CH + LB) * rows * S, 'planche-decors (×4) — nuit (allumé) / jour');
  ctx.scale(S, S);
  const D = dayContext('2026-10-28');
  cells.forEach(([label, fn], i) => {
    const ox = (i % cols) * CW, oy = Math.floor(i / cols) * (CH + LB);
    ctx.fillStyle = '#F2EDE2'; ctx.fillRect(ox, oy, CW, LB); ctx.fillStyle = INK; ctx.font = 'bold 5.5px sans-serif'; ctx.fillText(label, ox + 3, oy + 7.5);
    [[22, true, 'nuit'], [11, false, 'jour']].forEach(([T, lit, lab], k) => {
      ctx.save(); ctx.translate(ox + k * (CW / 2), oy + LB); ctx.beginPath(); ctx.rect(0, 0, CW / 2, CH); ctx.clip();
      setEnvAt(T, D); fillRect(ctx, STONES[2], 0, 0, CW / 2, CH);
      ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(0, CH - 7, 16, 7); ctx.fillStyle = '#fff'; ctx.font = '4px sans-serif'; ctx.fillText(lab, 2, CH - 2);
      ctx.translate(CW / 4, CH * 0.62); ctx.scale(1.25, 1.25);
      fn(ctx, T + 0.0004, lit);
      ctx.restore();
    });
  });
}
