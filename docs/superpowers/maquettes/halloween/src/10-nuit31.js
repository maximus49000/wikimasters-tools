// ───────────── Halloween, nuit du 31 (maquette de la PR 2) : déguisés, porte-à-porte, bonbons, farces, pluie ─────────────
// Comme les décors, tout est une fonction pure de l'heure absolue A. Le plan de la soirée (groupes, trajets, arrêts aux
// portes, farces) est tiré une fois de la graine de la rue et du jour ; chaque figure est ensuite placée selon A.
// Groupes : familles (enfants déguisés et un adulte, seau à bonbons, d'entrée en entrée), jeunes (déguisés, sonnent et
// s'enfuient), adultes déguisés (vont à une soirée), passants ordinaires. Farce « faire peur » : un jeune surgit d'une
// entrée au passage de quelqu'un. Pluie : moins de monde, parapluies, les farces continuent.
const N31_LANE = GROUND + 7, N31_STEP = GROUND + 2.5, N31_EDGE = 24;
const isN31 = (D) => D.date === '2026-10-31';
const isN31Eve = (D) => D.date === '2026-10-30' || D.date === '2026-11-01';
const N31_COSTUMES = ['sorciere', 'fantome', 'squelette', 'vampire', 'momie', 'zombie', 'diable', 'citrouille', 'chat', 'heros'];
const N31_LABEL = { sorciere: 'sorcière', fantome: 'fantôme', squelette: 'squelette', vampire: 'vampire', momie: 'momie', zombie: 'zombie', diable: 'diable', citrouille: 'citrouille', chat: 'chat noir', heros: 'super-héros' };
const N31_KID_W = { sorciere: 2, fantome: 1.5, squelette: 1.2, vampire: 0.8, momie: 0.6, zombie: 0.6, diable: 1, citrouille: 1.5, chat: 1.2, heros: 1.6 };
const N31_ADO_W = { sorciere: 1, fantome: 1, squelette: 1.5, vampire: 1.2, momie: 0.8, zombie: 2, diable: 1, chat: 0.6, heros: 0.5 };
const N31_ADULT_W = { sorciere: 1.4, vampire: 1.3, diable: 1, squelette: 1, zombie: 0.8, momie: 0.6, chat: 1 };
// Accessoire léger d'un adulte qui accompagne (pas un costume complet).
const N31_TOUCH = ['chapeau', 'cornes', 'oreilles'];

// Débit par minute pour toute la rue (900 px) selon l'heure ; la pluie réduit surtout les familles.
const ramp2 = (h, a, b, c, d) => (h < a || h > d ? 0 : h < b ? (h - a) / (b - a) : h <= c ? 1 : 1 - (h - c) / (d - c));
function n31Rate(kind, h, D) {
  const rain = D.rain;
  if (isN31Eve(D)) return kind === 'adultes' ? 0.08 * ramp2(h, 19, 20, 23, 23.9) : kind === 'ados' ? 0.05 * ramp2(h, 19.5, 20.5, 23, 23.9) : 0;
  if (!isN31(D)) return 0;
  if (kind === 'famille') return 1.4 * ramp2(h, 17.25, 17.9, 19.6, 20.8) * (rain ? 0.35 : 1);
  if (kind === 'ados') return 1.8 * ramp2(h, 18.8, 19.9, 22.4, 23.3) * (rain ? 0.7 : 1);
  if (kind === 'adultes') return 1.4 * ramp2(h, 18.8, 19.8, 23, 23.9) * (rain ? 0.6 : 1);
  return 0.9 * ramp2(h, 16.5, 17, 22, 23.9) * (rain ? 0.5 : 1);
}

// ───────────── plan de la soirée ─────────────
function n31Doors(street) { return street.facades.map((f, fi) => ({ f, fi, x: f.bayX(f.doorBay), w: Math.min(11, f.winW * 1.6), h: 21 })); }
const n31Decorated = (d, A) => (d.f.hwItems || []).some((it) => it.gesture === 'door' && hwShown(it, hwPhase(it, A)));
const n31Pumpkins = (d, A) => (d.f.hwItems || []).filter((it) => (it.type === 'pumpkin' || it.type === 'rail-pumpkin') && hwShown(it, hwPhase(it, A))).length;
// Durées (secondes) des arrêts ; le hall reste éclairé 2 min (minuterie, HALL_TIMER_S).
const N31_TREAT = 24, N31_NOBODY = 13, N31_RING = 4, N31_HALL = 120;
const N31_BUSY = { treat: [-4, 34], nobody: [-4, 16], ring: [-2, 26], scare: [-26, 16] };

function n31Plan(street, D) {
  const key = 'n31|' + D.date + '|' + D.event;
  if (street[key]) return street[key];
  const doors = n31Doors(street), busy = new Map(doors.map((d) => [d.fi, []]));
  const free = (d, kind, A) => { const [a, b] = N31_BUSY[kind]; return !busy.get(d.fi).some(([x, y]) => A + a * SEC < y && A + b * SEC > x); };
  const take = (d, kind, A) => { const [a, b] = N31_BUSY[kind]; busy.get(d.fi).push([A + a * SEC, A + b * SEC]); };
  const plan = { groups: [], scares: [], doorEv: new Map(doors.map((d) => [d.fi, []])), doors };
  const day = hwDay(D.date);
  // Événements imposés à l'immeuble héros (captures) : familles à 18 h 30, sonner et s'enfuir à 21 h 10, peur à 21 h 40.
  const hero = doors[street.facades.indexOf(street.hero)];
  if (isN31(D)) {
    n31Forced(plan, doors, hero, D, day * 24 + 18.5, 'famille', 'treat', take);
    n31Forced(plan, doors, hero, D, day * 24 + 21 + 10 * MIN, 'ados', 'ring', take);
    n31ForcedScare(plan, hero, D, day * 24 + 21 + 40 * MIN, take);
  }
  for (let m = 16 * 60; m < 24 * 60; m++) {
    const h = m / 60, r = mulberry32(SEED ^ hashString(`n31:${D.date}:${D.event}:${m}`));
    for (const kind of ['famille', 'ados', 'adultes', 'ordinaire']) {
      const rate = n31Rate(kind, h, D), n = Math.floor(rate) + (r() < rate % 1 ? 1 : 0);
      for (let k = 0; k < n; k++) {
        const g = n31Group(kind, day * 24 + h + r() * MIN, r, D, `${kind}-${m}-${k}`);
        n31Path(g, doors, r, D, free, take, plan);
        plan.groups.push(g);
      }
    }
    // Faire peur : de 20 h 30 à 22 h 45, environ une fois toutes les 7 minutes (pluie comprise).
    if (isN31(D) && h >= 20.5 && h < 22.75 && r() < 1 / 7) {
      const d = doors[Math.floor(r() * doors.length)], A = day * 24 + h + r() * MIN;
      if (free(d, 'scare', A)) { take(d, 'scare', A); plan.scares.push(n31Scare(d, A, r, D, `peur-${m}`)); }
    }
  }
  for (const s of plan.scares) plan.doorEv.get(s.door.fi).push({ k: 'scare', A0: s.A0, s });
  street[key] = plan;
  return plan;
}
function n31Member(kind, r, D, i) {
  const base = member(r);
  if (kind === 'famille' && i > 0) return { ...base, size: 1, costume: null, touch: r() < 0.3 ? pick(N31_TOUCH, r) : null, adult: true };
  if (kind === 'famille') return { ...base, size: 0.55 + r() * 0.15, costume: hwPickW(N31_KID_W, r), kid: true, acc: r() < 0.75 ? 'seau' : 'sac' };
  if (kind === 'ados') return { ...base, size: 0.86 + r() * 0.1, costume: r() < 0.9 ? hwPickW(N31_ADO_W, r) : null, touch: null };
  if (kind === 'adultes') return { ...base, size: 0.96 + r() * 0.06, costume: r() < 0.6 ? hwPickW(N31_ADULT_W, r) : null, touch: r() < 0.5 ? pick(N31_TOUCH, r) : null };
  return { ...base, size: 0.94 + r() * 0.08, costume: isN31(D) && r() < 0.06 ? hwPickW(N31_ADULT_W, r) : null };
}
function n31Group(kind, A0, r, D, id) {
  const dir = r() < 0.5 ? 1 : -1;
  const n = kind === 'famille' ? 1 + (r() < 0.55 ? 1 : 0) + (r() < 0.2 ? 1 : 0) : kind === 'ados' ? 2 + Math.floor(r() * 3) : kind === 'adultes' ? 2 : 1;
  const members = [];
  for (let i = 0; i < n; i++) members.push(n31Member(kind, r, D, kind === 'famille' ? 0 : i));
  if (kind === 'famille') members.push(n31Member(kind, r, D, 1));            // l'adulte ferme la marche
  // adultes déguisés : au moins un des deux
  if (kind === 'adultes' && !members.some((m) => m.costume)) members[0].costume = hwPickW(N31_ADULT_W, r);
  const speed = kind === 'famille' ? 5.4 + r() * 0.8 : kind === 'ados' ? 7.2 + r() * 0.8 : 7.2 + r() * 0.8;
  const gap = kind === 'famille' ? 4.2 : kind === 'ados' ? 4.6 : kind === 'adultes' ? 4.8 : 0;
  // sous la pluie : parapluie pour les adultes et les passants ; les enfants restent dessous, contre l'adulte
  for (const m of members) m.umbrella = !!D.rain && (m.adult || kind === 'ordinaire' || (kind === 'adultes' && m === members[0]) || (kind === 'ados' && r() < 0.25));
  return { id, kind, A0, dir, members, speed: D.rain ? speed * 1.08 : speed, gap: D.rain && kind === 'famille' ? 3.2 : gap, phase: r(), pieces: [] };
}
// Trajet : d'un bord à l'autre, avec arrêts. Pièces { mode: 'walk'|'stop'|'run', A0, A1, x0, x1, stop? }.
function n31Path(g, doors, r, D, free, take, plan, force) {
  const x0 = g.dir > 0 ? -N31_EDGE : W + N31_EDGE, xEnd = g.dir > 0 ? W + N31_EDGE + g.gap * 4 : -N31_EDGE - g.gap * 4;
  const ahead = doors.slice().sort((a, b) => g.dir * (a.x - b.x));
  let A = g.A0, x = x0, rang = false;
  const walkTo = (x1, mult = 1) => { const dt = (Math.abs(x1 - x) / (g.speed * mult)) * SEC; g.pieces.push({ mode: mult > 1 ? 'run' : 'walk', A0: A, A1: A + dt, x0: x, x1 }); A += dt; x = x1; };
  for (const d of ahead) {
    let type = null;
    const stopX = d.x - g.dir * (g.kind === 'ados' ? 9 : 5);
    if (g.dir * (stopX - x) <= 0) continue;                                          // déjà dépassée (après une course)
    const tArr = A + (Math.abs(stopX - x) / g.speed) * SEC;
    if (force) { if (d === force.door) type = force.type; }
    else if (g.kind === 'famille') {
      const dec = n31Decorated(d, tArr), pk = n31Pumpkins(d, tArr), p = dec ? 0.8 : pk ? 0.35 : 0;
      if (r() < p) type = r() < (dec ? 0.85 : 0.5) ? 'treat' : 'nobody';
    } else if (g.kind === 'ados' && !rang && r() < 0.18) type = 'ring';
    if (!type) continue;
    if (!force && !free(d, type, tArr)) continue;                                    // une autre bande y est déjà
    walkTo(stopX);
    take(d, type, A);
    const dur = type === 'treat' ? N31_TREAT : type === 'nobody' ? N31_NOBODY : N31_RING;
    const res = { mem: member(mulberry32(SEED ^ hashString(`n31-res:${d.fi}`))), touch: hashString(`n31-hat:${d.fi}`) % 10 < 3 ? 'chapeau' : null };
    const stop = { type, door: d, resident: res };
    g.pieces.push({ mode: 'stop', A0: A, A1: A + dur * SEC, x0: x, x1: x, stop });
    if (type !== 'nobody') plan.doorEv.get(d.fi).push({ k: type, A0: A, g, stop });
    A += dur * SEC;
    if (type === 'ring') { rang = true; walkTo(x + g.dir * 42, 2.6); }              // ils détalent en riant
  }
  walkTo(xEnd);
}
// Groupe imposé : il s'arrête à la porte voulue à l'instant voulu (on décale tout le trajet).
function n31Forced(plan, doors, door, D, Astop, kind, type, take) {
  const r = mulberry32(SEED ^ hashString(`n31-force:${kind}:${type}`));
  const g = n31Group(kind, 0, r, D, `force-${kind}-${type}`);
  if (kind === 'famille') { const ad = g.members[g.members.length - 1]; g.members = [{ ...n31Member('famille', r, D, 0), costume: 'sorciere', acc: 'seau' }, { ...n31Member('famille', r, D, 0), costume: 'citrouille', acc: 'seau' }, { ...n31Member('famille', r, D, 0), costume: 'fantome', acc: 'sac' }, ad]; }
  n31Path(g, doors, r, D, () => true, () => {}, plan, { door, type });
  const st = g.pieces.find((p) => p.mode === 'stop'), shift = st ? Astop - st.A0 : Astop - g.pieces[0].A1 * 0.5;
  for (const p of g.pieces) { p.A0 += shift; p.A1 += shift; }
  g.A0 += shift;
  for (const ev of plan.doorEv.get(door.fi)) if (ev.g === g) ev.A0 += shift;
  take(door, type, Astop);
  plan.groups.push(g);
}

// ───────────── faire peur ─────────────
function n31Scare(d, A0, r, D, id) {
  const dir = r() < 0.5 ? 1 : -1;
  const teen = { ...member(r), size: 0.9, costume: pick(['zombie', 'squelette', 'fantome', 'vampire', 'momie'], r) };
  const victim = { ...member(r), size: 0.98, umbrella: !!D.rain };
  return { id, door: d, A0, dir, teen, victim, speed: 7.4 };
}
function n31ForcedScare(plan, d, D, A0, take) {
  const s = n31Scare(d, A0, mulberry32(SEED ^ hashString('n31-force-scare')), D, 'force-peur');
  s.teen.costume = 'zombie'; s.dir = 1;
  take(d, 'scare', A0); plan.scares.push(s);
}
// Victime : arrive devant la porte à s = 5,8, sursaute, recule, reprend son souffle, repart plus vite.
function n31ScareVictim(s, A) {
  const t = (A - s.A0) / SEC, stopX = s.door.x - s.dir * 6, x0 = s.dir > 0 ? -N31_EDGE : W + N31_EDGE;
  const tWalk = Math.abs(stopX - x0) / s.speed;
  if (t < 5.8 - tWalk || t > 40) return null;
  if (t < 5.8) return { x: lerp(stopX, x0, (5.8 - t) / tWalk), mode: 'walk', facing: s.dir };
  if (t < 9.5) { const q = sat((t - 5.8) / 0.5); return { x: stopX - s.dir * 2.2 * smooth(q), mode: t < 7.2 ? 'startle' : 'chest', t: t - 5.8, facing: s.dir }; }
  const x = stopX - s.dir * 2.2 + s.dir * (t - 9.5) * s.speed * 1.35; if (x < -N31_EDGE || x > W + N31_EDGE) return null;
  return { x, mode: 'walk', facing: s.dir, fast: true };
}

// ───────────── la porte : hall, ouverture, habitant ─────────────
// Pour chaque porte : ouverture (0..1) et hall éclairé à l'instant A, d'après les événements du plan.
function n31DoorState(plan, d, A) {
  let open = 0, lit = false;
  for (const ev of plan.doorEv.get(d.fi)) {
    const s = (A - ev.A0) / SEC;
    if (ev.k === 'treat') { if (s >= 4.5 && s < 4.5 + N31_HALL) lit = true; open = Math.max(open, sat((s - 7.5) / 1) * sat((20.5 - s) / 1)); }
    else if (ev.k === 'ring') { if (s >= 8 && s < 8 + N31_HALL) lit = true; open = Math.max(open, sat((s - 12) / 1) * sat((19.5 - s) / 1)); }
    else if (ev.k === 'scare') { open = Math.max(open, s > -22 && s < 5.5 ? 0.22 : s >= 5.5 && s < 12.5 ? (s < 10.5 ? 0.6 : lerp(0.6, 0, (s - 10.5) / 2)) : 0); }
  }
  return { open, lit };
}
function n31StreetEvents(f, T, D, ev) {
  if (!isN31(D)) return ev;
  const street = buildStreet(D), plan = n31Plan(street, D), d = plan.doors.find((x) => x.f === f), A = hwDay(D.date) * 24 + T;
  const st = n31DoorState(plan, d, A);
  ev.door = Math.max(ev.door, st.open);
  if (st.lit && isNight()) ev.stairLit = true;
  return ev;
}

// ───────────── figures déguisées ─────────────
const POSE31 = {
  ring: { torso: 2, head: -8, aL: [6, 8], aR: [150, -10], lL: [4, 0], lR: [4, 0] },
  hold: { torso: 0, head: -6, aL: [6, 8], aR: [70, -30], lL: [4, 0], lR: [4, 0] },
  give: { torso: 10, head: 6, aL: [40, -60], aR: [78, -8], lL: [4, 0], lR: [4, 0] },
  bowl: { torso: 2, head: 4, aL: [40, -70], aR: [40, -70], lL: [4, 0], lR: [4, 0] },
  boo: { torso: 14, head: 4, aL: [150, -40], aR: [140, -30], lL: [26, 0], lR: [-18, 14], dy: 0.03 },
  startle: { torso: -16, head: -14, aL: [128, -60], aR: [118, -50], lL: [-12, 18], lR: [16, 4], dy: 0.07 },
  chest: { torso: -4, head: 8, aL: [40, -120], aR: [30, -110], lL: [4, 0], lR: [4, 0] },
  laugh: { torso: 18, head: 14, aL: [30, -100], aR: [30, -100], lL: [6, 0], lR: [6, 0] },
  crouch: { torso: 22, head: -10, aL: [40, -60], aR: [50, -70], lL: [70, -110], lR: [50, -100] },
  look: { torso: 4, head: 0, aL: [10, -20], aR: [24, -40], lL: [4, 0], lR: [4, 0] },
  zombie: { torso: 8, head: 10, aL: [88, -4], aR: [96, -8], lL: [4, 0], lR: [4, 0] },
};
const runPose = (ph) => { const P = walkPose(ph); return { ...P, torso: 14, aL: [P.aL[0] * 1.6, -60], aR: [P.aR[0] * 1.6, -60], lL: [P.lL[0] * 1.4, P.lL[1] * 1.4], lR: [P.lR[0] * 1.4, P.lR[1] * 1.4] }; };
// Couleurs de base d'un costume (le pantin est d'abord peint avec, les pièces du costume viennent par-dessus).
function costumeMem(m) {
  const c = m.costume;
  const k = { shirt: m.shirt, pants: m.pants, skin: m.skin, hair: '#3A2A28' };
  if (c === 'sorciere') return { ...k, shirt: '#3A2A4A', pants: '#3A2A4A', hair: '#C8602A' };
  if (c === 'squelette') return { ...k, shirt: '#1C1A22', pants: '#1C1A22', skin: '#F2EEE2', hair: '#F2EEE2' };
  if (c === 'vampire') return { ...k, shirt: '#1E1A24', pants: '#1E1A24', skin: '#E8E2DC', hair: '#14101A' };
  if (c === 'momie') return { ...k, shirt: '#E6DCC4', pants: '#E0D4B8', skin: '#E6DCC4', hair: '#E6DCC4' };
  if (c === 'zombie') return { ...k, shirt: '#6A7A5A', pants: '#4A4A5A', skin: '#9CB88A', hair: '#3A3A2A' };
  if (c === 'diable') return { ...k, shirt: '#C8302A', pants: '#A8262A', hair: '#2A1414' };
  if (c === 'citrouille') return { ...k, shirt: '#E8772E', pants: '#2A3A2A' };
  if (c === 'chat') return { ...k, shirt: '#1E1A22', pants: '#1E1A22', hair: '#1E1A22' };
  if (c === 'heros') return { ...k, shirt: '#2E6AD8', pants: '#2E6AD8', hair: '#2A1A18' };
  return k;
}
const strokeC = (ctx, c, lw, pts) => { ctx.strokeStyle = c; ctx.lineWidth = lw; ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke(); };
const fillC = (ctx, c, pts) => { ctx.fillStyle = c; ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); ctx.fill(); };
// Dessine un passant déguisé, pieds en (fx, fy). opts : { back (vu de dos), T, alpha, dark (silhouette dans l'embrasure) }.
function drawCostumed(ctx, fx, fy, h, P, facing, m, opts = {}) {
  const c = m.costume, T = opts.T || 0, s = T / SEC, F = facing || 0, f = F || 1;
  if (c === 'zombie' && !opts.keepArms) P = { ...P, aL: [Math.max(P.aL[0], 82), -6], aR: [Math.max(P.aR[0], 92), -10] };
  const J = figurePts(h, P, facing), cm = costumeMem(m);
  const C = (x) => col(typeof x === 'string' ? hex(x) : x);
  const lw = 0.085 * h, inkW = Math.max(0.25, 0.045 * h);
  ctx.save(); ctx.translate(fx, fy); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (opts.alpha != null) ctx.globalAlpha = opts.alpha;
  const head = J.head, hr = J.headR;
  // ── derrière le corps : capes, queues ──
  if (c === 'vampire' || c === 'heros') {
    const flap = Math.sin(s * 5 + fx) * 0.04 * h * (P.dy ? 1 : 0.4);
    const sh = J.sh, bot = Math.max(J.kL[1], J.kR[1]) + (c === 'vampire' ? 0.08 * h : 0.02 * h);
    const pts = [[sh[0] - 0.09 * h, sh[1] - 0.01 * h], [sh[0] + 0.09 * h, sh[1] - 0.01 * h], [sh[0] - f * 0.06 * h + 0.13 * h + flap, bot], [sh[0] - f * 0.12 * h - 0.13 * h + flap, bot]];
    fillC(ctx, INK, pts.map(([x, y], i) => [x + (i > 1 ? (x > 0 ? 0.3 : -0.3) : 0), y + 0.3]));
    fillC(ctx, C(c === 'vampire' ? '#1A1420' : '#D83A3A'), pts);
    if (c === 'vampire') fillC(ctx, C('#A82A3A'), [[sh[0] + f * 0.02 * h, sh[1]], [sh[0] + 0.09 * h, sh[1]], [sh[0] - f * 0.06 * h + 0.13 * h + flap, bot], [sh[0] - f * 0.02 * h + 0.06 * h + flap, bot]]);
  }
  if (c === 'diable' || c === 'chat') {
    const sw = Math.sin(s * 3 + fx) * 0.05 * h, hp = J.hip, bx = hp[0] - f * 0.05 * h;
    const pts = c === 'chat' ? [[bx, hp[1]], [bx - f * 0.16 * h, hp[1] + 0.02 * h], [bx - f * 0.24 * h + sw, hp[1] - 0.12 * h], [bx - f * 0.2 * h + sw, hp[1] - 0.2 * h]] : [[bx, hp[1]], [bx - f * 0.14 * h, hp[1] + 0.08 * h], [bx - f * 0.22 * h + sw, hp[1] + 0.02 * h]];
    strokeC(ctx, INK, Math.max(0.5, 0.06 * h), pts); strokeC(ctx, C(c === 'chat' ? '#1E1A22' : '#C8302A'), Math.max(0.3, 0.035 * h), pts);
    if (c === 'diable') { const [tx, ty] = pts[2]; fillC(ctx, C('#C8302A'), [[tx - f * 0.04 * h, ty - 0.035 * h], [tx - f * 0.04 * h, ty + 0.035 * h], [tx - f * 0.09 * h, ty]]); }
  }
  ctx.restore();
  // ── le corps ──
  if (c === 'fantome') { n31Ghost(ctx, fx, fy, h, J, P, facing, s, opts); return J; }
  const style = opts.dark ? { silhouette: rgba(amb(hex('#2A2030'))) } : { mem: { shirt: cm.shirt, pants: cm.pants, skin: cm.skin }, hair: col(cm.hair), amb: true };
  if (opts.alpha != null) { ctx.save(); ctx.globalAlpha = opts.alpha; }
  drawFigure(ctx, fx, fy, h, P, facing, style);
  if (opts.alpha != null) ctx.restore();
  if (opts.dark) return J;
  ctx.save(); ctx.translate(fx, fy); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (opts.alpha != null) ctx.globalAlpha = opts.alpha;
  if (opts.back && !c) disc(ctx, cm.hair, head[0], head[1], hr * 0.95);
  // ── par-dessus : pièces du costume ──
  const eyes = (cE, r = 0.22) => { if (opts.back) return; const ex = F === 0 ? [-0.35, 0.35] : [0.25 * f, 0.62 * f]; for (const e of ex) disc(ctx, cE, head[0] + e * hr, head[1] - 0.05 * hr, hr * r, true); };
  if (c === 'sorciere') {
    const hips = J.hip, kn = Math.max(J.kL[1], J.kR[1]) + 0.04 * h;
    fillC(ctx, INK, [[hips[0] - 0.07 * h, hips[1] - 0.02 * h], [hips[0] + 0.07 * h, hips[1] - 0.02 * h], [hips[0] + 0.15 * h, kn + 0.3], [hips[0] - 0.15 * h, kn + 0.3]]);
    fillC(ctx, C('#3A2A4A'), [[hips[0] - 0.06 * h, hips[1] - 0.02 * h], [hips[0] + 0.06 * h, hips[1] - 0.02 * h], [hips[0] + 0.14 * h, kn], [hips[0] - 0.14 * h, kn]]);
    for (let k = -1; k <= 1; k++) fillC(ctx, C('#2A1E36'), [[hips[0] + k * 0.1 * h, kn], [hips[0] + k * 0.1 * h + 0.03 * h, kn], [hips[0] + k * 0.1 * h + 0.015 * h, kn - 0.04 * h]]);
    const by = head[1] - hr * 0.55, tipX = head[0] - f * hr * 0.9 * (F ? 1 : 0.2), tipY = head[1] - hr * 3.4;
    ctx.fillStyle = INK; ctx.beginPath(); ctx.ellipse(head[0], by, hr * 1.55, hr * 0.42, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = C('#2A1E30'); ctx.beginPath(); ctx.ellipse(head[0], by, hr * 1.4, hr * 0.3, 0, 0, TAU); ctx.fill();
    fillC(ctx, INK, [[head[0] - hr * 0.85, by + 0.2], [head[0] + hr * 0.85, by + 0.2], [tipX, tipY - 0.3]]);
    fillC(ctx, C('#2A1E30'), [[head[0] - hr * 0.7, by], [head[0] + hr * 0.7, by], [tipX, tipY]]);
    fillC(ctx, C('#8A5ABE'), [[head[0] - hr * 0.68, by - hr * 0.05], [head[0] + hr * 0.68, by - hr * 0.05], [head[0] + hr * 0.6, by - hr * 0.42], [head[0] - hr * 0.6, by - hr * 0.42]]);
  } else if (c === 'squelette') {
    const bone = C('#F2EEE2'), bw = Math.max(0.2, 0.024 * h);
    for (const [a, b, cc] of [[J.hip, J.kL, J.fL], [J.hip, J.kR, J.fR], [J.sh, J.eL, J.hL], [J.sh, J.eR, J.hR]]) strokeC(ctx, bone, bw, [a, b, cc]);
    strokeC(ctx, bone, bw, [J.hip, J.neck]);
    for (let k = 0; k < 3; k++) { const q = 0.35 + k * 0.17, y = lerp(J.hip[1], J.neck[1], q), x = lerp(J.hip[0], J.neck[0], q); strokeC(ctx, bone, bw * 0.9, [[x - 0.05 * h, y + 0.008 * h], [x + 0.05 * h, y - 0.008 * h]]); }
    eyes(INK, 0.26); if (!opts.back) strokeC(ctx, INK, Math.max(0.12, 0.012 * h), [[head[0] - hr * 0.35 + (F ? f * hr * 0.3 : 0), head[1] + hr * 0.45], [head[0] + hr * 0.35 + (F ? f * hr * 0.3 : 0), head[1] + hr * 0.45]]);
  } else if (c === 'vampire') {
    fillC(ctx, C('#A82A3A'), [[J.neck[0] - hr * 0.9, J.neck[1] + hr * 0.2], [J.neck[0] - hr * 1.2, J.neck[1] - hr * 1.3], [J.neck[0] - hr * 0.2, J.neck[1]]]);
    fillC(ctx, C('#A82A3A'), [[J.neck[0] + hr * 0.9, J.neck[1] + hr * 0.2], [J.neck[0] + hr * 1.2, J.neck[1] - hr * 1.3], [J.neck[0] + hr * 0.2, J.neck[1]]]);
    if (!opts.back) { fillC(ctx, C('#14101A'), [[head[0] - hr * 0.8, head[1] - hr * 0.5], [head[0], head[1] - hr * 0.05], [head[0] + hr * 0.8, head[1] - hr * 0.5], [head[0], head[1] - hr * 1.05]]); eyes('#C8202A', 0.16); }
  } else if (c === 'momie') {
    ctx.strokeStyle = C('#9A8A6A'); ctx.lineWidth = Math.max(0.12, 0.012 * h);
    for (const [a, b] of [[J.hip, J.kL], [J.kL, J.fL], [J.hip, J.kR], [J.kR, J.fR], [J.sh, J.eL], [J.eL, J.hL], [J.sh, J.eR], [J.eR, J.hR], [J.hip, J.neck]]) {
      const n = 3; for (let k = 1; k <= n; k++) { const q = k / (n + 1), x = lerp(a[0], b[0], q), y = lerp(a[1], b[1], q); ctx.beginPath(); ctx.moveTo(x - 0.045 * h, y - 0.015 * h); ctx.lineTo(x + 0.045 * h, y + 0.015 * h); ctx.stroke(); }
    }
    ctx.beginPath(); ctx.moveTo(head[0] - hr, head[1] - hr * 0.3); ctx.lineTo(head[0] + hr, head[1] + hr * 0.1); ctx.moveTo(head[0] - hr, head[1] + hr * 0.4); ctx.lineTo(head[0] + hr, head[1] + hr * 0.6); ctx.stroke();
    if (!opts.back) { fillRect(ctx, '#2A2018', head[0] - hr * 0.6 + (F ? f * hr * 0.25 : 0), head[1] - hr * 0.2, hr * 1.2, hr * 0.28); eyes('#FFF4C0', 0.12); }
    const fl = Math.sin(s * 4 + fx) * 0.03 * h; strokeC(ctx, C('#E6DCC4'), Math.max(0.2, 0.025 * h), [J.hL, [J.hL[0] - f * 0.05 * h + fl, J.hL[1] + 0.06 * h]]);
  } else if (c === 'zombie') {
    const kn = Math.max(J.kL[1], J.kR[1]) - 0.02 * h, hp = J.hip;
    fillC(ctx, C('#6A7A5A'), [[hp[0] - 0.08 * h, hp[1] - 0.02 * h], [hp[0] + 0.08 * h, hp[1] - 0.02 * h], [hp[0] + 0.07 * h, hp[1] + 0.05 * h], [hp[0] + 0.03 * h, hp[1] + 0.02 * h], [hp[0], hp[1] + 0.06 * h], [hp[0] - 0.04 * h, hp[1] + 0.02 * h], [hp[0] - 0.08 * h, hp[1] + 0.05 * h]]);
    disc(ctx, '#7A3A3A', lerp(J.hip[0], J.neck[0], 0.6) + 0.02 * h, lerp(J.hip[1], J.neck[1], 0.6), 0.02 * h);
    if (!opts.back) { eyes('#2A2A1E', 0.24); eyes('#E8F0A0', 0.09); }
    void kn;
  } else if (c === 'diable') {
    for (const sd of [-1, 1]) fillC(ctx, C('#E83A2A'), [[head[0] + sd * hr * 0.45, head[1] - hr * 0.75], [head[0] + sd * hr * 0.85, head[1] - hr * 0.5], [head[0] + sd * hr * 0.95, head[1] - hr * 1.6]]);
    if (!opts.back) eyes(INK, 0.15);
  } else if (c === 'citrouille') {
    const cx = lerp(J.hip[0], J.neck[0], 0.45), cy = lerp(J.hip[1], J.neck[1], 0.45), rx = 0.17 * h, ry = 0.15 * h;
    ctx.fillStyle = INK; ctx.beginPath(); ctx.ellipse(cx, cy, rx + 0.3, ry + 0.3, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = C('#E8772E'); ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = C(shade(hex('#E8772E'), 0.3)); ctx.beginPath(); ctx.ellipse(cx + rx * 0.45, cy, rx * 0.5, ry * 0.95, 0, -Math.PI / 2, Math.PI / 2); ctx.fill();
    ctx.strokeStyle = C('#B85A1E'); ctx.lineWidth = Math.max(0.12, 0.012 * h); ctx.beginPath(); ctx.ellipse(cx, cy, rx * 0.45, ry * 0.98, 0, 0, TAU); ctx.stroke();
    if (!opts.back) { ctx.fillStyle = C('#2A1408'); const fxp = F ? f * rx * 0.2 : 0; for (const sd of [-1, 1]) fillC(ctx, C('#2A1408'), [[cx + fxp + sd * rx * 0.42 - rx * 0.14, cy - ry * 0.12], [cx + fxp + sd * rx * 0.42 + rx * 0.14, cy - ry * 0.12], [cx + fxp + sd * rx * 0.42, cy - ry * 0.42]]); ctx.beginPath(); ctx.ellipse(cx + fxp, cy + ry * 0.35, rx * 0.45, ry * 0.18, 0, 0, Math.PI); ctx.fill(); }
    fillRect(ctx, '#3F8A3A', head[0] - hr * 0.2, head[1] - hr * 1.5, hr * 0.4, hr * 0.6);
    fillC(ctx, C('#5AA84A'), [[head[0], head[1] - hr * 1.1], [head[0] + hr * 0.9, head[1] - hr * 1.5], [head[0] + hr * 0.4, head[1] - hr * 0.9]]);
  } else if (c === 'chat') {
    for (const sd of [-1, 1]) { fillC(ctx, C('#1E1A22'), [[head[0] + sd * hr * 0.25, head[1] - hr * 0.8], [head[0] + sd * hr * 0.95, head[1] - hr * 0.55], [head[0] + sd * hr * 0.8, head[1] - hr * 1.55]]); fillC(ctx, C('#D88AA0'), [[head[0] + sd * hr * 0.5, head[1] - hr * 0.8], [head[0] + sd * hr * 0.82, head[1] - hr * 0.68], [head[0] + sd * hr * 0.76, head[1] - hr * 1.2]]); }
    if (!opts.back) { disc(ctx, '#1A1418', head[0] + (F ? f * hr * 0.55 : 0), head[1] + hr * 0.15, hr * 0.16, true); if (h > 20) { ctx.strokeStyle = 'rgba(40,30,30,0.8)'; ctx.lineWidth = 0.15; ctx.beginPath(); for (const sd of [-1, 1]) { ctx.moveTo(head[0] + sd * hr * 0.3, head[1] + hr * 0.25); ctx.lineTo(head[0] + sd * hr * 1.0, head[1] + hr * 0.15); } ctx.stroke(); } }
  } else if (c === 'heros') {
    if (!opts.back) fillRect(ctx, '#14101A', head[0] - hr * 0.95, head[1] - hr * 0.3, hr * 1.9, hr * 0.42);
    disc(ctx, '#FFD84A', lerp(J.hip[0], J.neck[0], 0.65), lerp(J.hip[1], J.neck[1], 0.65), Math.max(0.35, 0.03 * h));
    for (const ft of [J.fL, J.fR]) disc(ctx, '#D83A3A', ft[0], ft[1] - 0.02 * h, Math.max(0.3, 0.035 * h));
  }
  // accessoires légers d'adulte (accompagnateur, soirée)
  if (!c && m.touch === 'chapeau') { const by = head[1] - hr * 0.55; ctx.fillStyle = C('#2A1E30'); ctx.beginPath(); ctx.ellipse(head[0], by, hr * 1.35, hr * 0.28, 0, 0, TAU); ctx.fill(); fillC(ctx, C('#2A1E30'), [[head[0] - hr * 0.65, by], [head[0] + hr * 0.65, by], [head[0] - f * hr * 0.6, head[1] - hr * 3]]); }
  if (!c && m.touch === 'cornes') for (const sd of [-1, 1]) fillC(ctx, C('#E83A2A'), [[head[0] + sd * hr * 0.4, head[1] - hr * 0.8], [head[0] + sd * hr * 0.8, head[1] - hr * 0.55], [head[0] + sd * hr * 0.85, head[1] - hr * 1.5]]);
  if (!c && m.touch === 'oreilles') for (const sd of [-1, 1]) fillC(ctx, C('#1E1A22'), [[head[0] + sd * hr * 0.2, head[1] - hr * 0.8], [head[0] + sd * hr * 0.9, head[1] - hr * 0.6], [head[0] + sd * hr * 0.75, head[1] - hr * 1.5]]);
  ctx.restore();
  return J;
}
// Fantôme : un drap qui couvre tout, bas ondulé qui traîne derrière, deux trous pour les yeux ; les pieds dépassent.
function n31Ghost(ctx, fx, fy, h, J, P, facing, s, opts) {
  const F = facing || 0, f = F || 1, top = J.head[1] - J.headR * 1.15, cx = J.head[0], r = J.headR * 1.3, w = Math.max(0.2 * h, Math.abs(J.fL[0]) + 0.05 * h, Math.abs(J.fR[0]) + 0.05 * h), bot = -0.07 * h;
  ctx.save(); ctx.translate(fx, fy); if (opts.alpha != null) ctx.globalAlpha = opts.alpha;
  for (const ft of [J.fL, J.fR]) disc(ctx, '#2A2430', ft[0], ft[1] - 0.02 * h, Math.max(0.3, 0.035 * h));
  const lag = -f * (F ? 0.05 : 0) * h, wav = (k) => Math.sin(s * 6 + k * 1.7 + fx) * 0.02 * h;
  const path = () => { ctx.beginPath(); ctx.moveTo(cx - r, top + r); ctx.arc(cx, top + r, r, Math.PI, 0); ctx.quadraticCurveTo(cx + w * 0.8, (top + bot) / 2, cx + w + lag, bot + wav(0)); for (let k = 4; k >= 1; k--) { const x0 = cx - w + lag + ((k - 0.5) / 4) * 2 * w, x1 = cx - w + lag + ((k - 1) / 4) * 2 * w; ctx.quadraticCurveTo(x0, bot - 0.04 * h + wav(k), x1, bot + wav(k + 1)); } ctx.quadraticCurveTo(cx - w * 0.8, (top + bot) / 2, cx - r, top + r); ctx.closePath(); };
  ctx.fillStyle = INK; ctx.save(); ctx.translate(0, 0.3); path(); ctx.lineWidth = Math.max(0.5, 0.05 * h); ctx.strokeStyle = INK; ctx.stroke(); ctx.restore();
  ctx.fillStyle = col('#F4F2EC'); path(); ctx.fill();
  ctx.save(); path(); ctx.clip(); ctx.fillStyle = col(shade(hex('#F4F2EC'), 0.28)); ctx.fillRect(cx + w * 0.35, top, w, -top + bot + 1); ctx.restore();
  // bras sous le drap : une bosse vers l'avant quand ils sont levés
  if (P.aR[0] > 60) { ctx.fillStyle = col('#F4F2EC'); ctx.beginPath(); ctx.ellipse(J.hR[0] * 0.8, J.hR[1], 0.07 * h, 0.05 * h, 0, 0, TAU); ctx.fill(); }
  if (!opts.back) { const ex = F === 0 ? [-0.38, 0.38] : [0.15 * f, 0.6 * f]; ctx.fillStyle = '#14101A'; for (const e of ex) { ctx.beginPath(); ctx.ellipse(cx + e * r, top + r * 1.05, r * 0.16, r * 0.24, 0, 0, TAU); ctx.fill(); } }
  ctx.restore();
}
// Seau citrouille (ou sac) à la main ; parapluie tenu au-dessus de la tête.
function paintBucket(ctx, hx, hy, h, kind) {
  const r = Math.max(0.9, 0.075 * h);
  if (kind === 'sac') { ctx.fillStyle = col('#F2EEE4'); ctx.beginPath(); ctx.ellipse(hx, hy + r * 1.1, r * 0.9, r * 1.2, 0, 0, TAU); ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 0.25; ctx.stroke(); return; }
  ctx.strokeStyle = INK; ctx.lineWidth = Math.max(0.2, r * 0.18); ctx.beginPath(); ctx.arc(hx, hy + r * 0.9, r * 0.9, Math.PI, 0); ctx.stroke();
  ctx.fillStyle = INK; ctx.beginPath(); ctx.ellipse(hx, hy + r * 1.7, r + 0.25, r * 0.85 + 0.25, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = col('#F08A2A'); ctx.beginPath(); ctx.ellipse(hx, hy + r * 1.7, r, r * 0.85, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = col('#2A1408'); ctx.fillRect(hx - r * 0.45, hy + r * 1.5, r * 0.25, r * 0.22); ctx.fillRect(hx + r * 0.2, hy + r * 1.5, r * 0.25, r * 0.22); ctx.fillRect(hx - r * 0.4, hy + r * 1.95, r * 0.8, r * 0.16);
}
function paintUmbrella(ctx, hx, hy, h, color) {
  const top = hy - 0.32 * h, R = 0.3 * h;
  strokeC(ctx, INK, Math.max(0.3, 0.025 * h), [[hx, hy + 0.04 * h], [hx, top]]);
  ctx.fillStyle = INK; ctx.beginPath(); ctx.ellipse(hx, top + 0.3, R + 0.3, R * 0.5 + 0.3, 0, Math.PI, 0); ctx.fill();
  ctx.fillStyle = col(color); ctx.beginPath(); ctx.ellipse(hx, top, R, R * 0.5, 0, Math.PI, 0); ctx.closePath(); ctx.fill();
  ctx.fillStyle = col(shade(hex(color), 0.3)); ctx.beginPath(); ctx.ellipse(hx + R * 0.5, top, R * 0.5, R * 0.48, 0, Math.PI, 0); ctx.fill();
  ctx.fillStyle = 'rgba(220,230,255,0.35)'; ctx.fillRect(hx - R, top, R * 2, 0.25);
}
const UMBRELLAS = ['#2E4A6E', '#C85A3A', '#1E1A24', '#3F8A3A', '#8A5A8E', '#E8C060'];

// ───────────── placement des groupes à l'instant A ─────────────
// Rend la liste des figures : { x, y, h, P, facing, m, back, acc ('seau'|'sac'), umbrella, held? }
function n31GroupFigures(g, A, out) {
  const p = g.pieces.find((q) => A >= q.A0 && A < q.A1); if (!p) return;
  const s = A / SEC, n = g.members.length, kids = g.members.filter((m) => m.kid), nk = kids.length;
  const slot = (i) => -g.dir * i * g.gap;
  if (p.mode !== 'stop') {
    const q = (A - p.A0) / (p.A1 - p.A0), x = lerp(p.x0, p.x1, q), run = p.mode === 'run';
    g.members.forEach((m, i) => {
      const h = 13 * m.size, per = m.kid ? 0.62 : 0.9, ph = s / (run ? 0.5 : per) + g.phase * 3 + i * 0.37;
      const laugh = run && q > 0.6;
      const P = run ? (laugh ? { ...POSE31.laugh, dy: Math.abs(Math.sin(s * 9 + i)) * 0.04 } : runPose(ph)) : m.kid && m.acc ? { ...walkPose(ph), aR: [56, -26] } : walkPose(ph);
      out.push({ x: x + slot(i) + (m.kid && g.members.find((a) => a.umbrella) ? g.dir * 1 : 0), y: N31_LANE + (i % 2 ? 0.8 : 0), h, P, facing: g.dir, m, acc: m.acc, umbrella: m.umbrella, T: A });
    });
    return;
  }
  const st = p.stop, d = st.door, t = (A - p.A0) / SEC, dur = (p.A1 - p.A0) / SEC;
  if (st.type === 'ring') {
    // le premier file à la porte, sonne, revient ; les autres attendent un peu plus loin, accroupis, pouffent
    g.members.forEach((m, i) => {
      const h = 13 * m.size, home = p.x0 + slot(i) - g.dir * 2;
      if (i === 0) {
        const tx = d.x + d.w * 0.55 * -g.dir, go = smooth(sat(t / 1.4)), back = smooth(sat((t - 2.3) / 1.4)), k = go * (1 - back);
        const x = lerp(home, tx, k), y = lerp(N31_LANE, N31_STEP, k), moving = (t < 1.4 || t > 2.3);
        const P = moving ? runPose(s / 0.5) : POSE31.ring;
        out.push({ x, y, h, P, facing: moving ? (t < 1.4 ? g.dir : -g.dir) : 0, back: !moving, m, T: A });
      } else out.push({ x: home, y: N31_LANE + (i % 2 ? 0.8 : 0), h, P: { ...POSE31.crouch, dy: Math.abs(Math.sin(s * 8 + i)) * 0.015 }, facing: g.dir, m, T: A });
    });
    return;
  }
  // porte-à-porte : les enfants vont au pas de la porte, l'aîné sonne ; l'adulte attend au bord du trottoir
  const answered = st.type === 'treat';
  g.members.forEach((m, i) => {
    const h = 13 * m.size;
    if (!m.kid) { out.push({ x: p.x0 + slot(Math.max(nk, 1)) * 0.6, y: N31_LANE + 1, h, P: { ...POSE.stand, head: Math.sin(s / 3) * 6 }, facing: g.dir, m, umbrella: m.umbrella, T: A }); return; }
    const k = kids.indexOf(m), spot = d.x + (k - (nk - 1) / 2) * 3.6 + g.dir * 0.5, path = p.x0 + slot(i);
    const leave = dur - 3.2, go = smooth(sat(t / 2.4)), back = smooth(sat((t - leave) / 2.4)), q = go * (1 - back);
    const x = lerp(path, spot, q), y = lerp(N31_LANE, N31_STEP, q);
    if (t < 2.4 || t > leave) { out.push({ x, y, h, P: { ...walkPose(s / 0.62 + i), aR: [56, -26] }, facing: t < 2.4 ? Math.sign(spot - path) || g.dir : -Math.sign(spot - path) || g.dir, m, acc: m.acc, T: A }); return; }
    let P = { ...POSE.stand, dy: Math.abs(Math.sin(s * 3 + i)) * 0.01 };
    if (k === 0 && t >= 2.6 && t < 3.6) P = POSE31.ring;
    if (!answered && k === 0 && t >= 7 && t < 7.8) P = POSE31.ring;
    if (answered) {
      const tg = 9 + k * 2.4;
      if (t >= tg - 0.6 && t < tg + 1.6) P = POSE31.hold;                                     // tend le seau
      if (t >= 17 && t < 19) P = { ...POSE.armsUp, aL: [120, -20], aR: [110, -10], dy: Math.abs(Math.sin(s * 7 + k)) * 0.05 }; // « merci ! »
    } else if (t > 9) P = { ...POSE.stand, head: Math.sin(s * 2 + k) * 14 };
    out.push({ x, y, h, P, facing: 0, back: true, m, acc: m.acc, T: A });
  });
}
// L'habitant dans l'embrasure (porte-à-porte, sonner et s'enfuir) et les bonbons qui volent jusqu'aux seaux.
function paintN31Resident(ctx, ev, A) {
  const d = ev.stop.door, t = (A - ev.A0) / SEC, res = ev.stop.resident, h = 13 * 0.97;
  const show = ev.k === 'treat' ? t >= 8 && t < 20.2 : t >= 12.6 && t < 19.2;
  if (!show) return;
  const top = GROUND - d.h, x = d.x - d.w * 0.22;
  ctx.save(); ctx.beginPath(); ctx.moveTo(d.x - d.w / 2, GROUND + 1); ctx.lineTo(d.x - d.w / 2, top + d.w / 2); ctx.arc(d.x, top + d.w / 2, d.w / 2, Math.PI, 0); ctx.lineTo(d.x + d.w / 2, GROUND + 1); ctx.closePath(); ctx.clip();
  let P = POSE.stand, facing = 0;
  if (ev.k === 'treat') { const k = Math.floor((t - 9) / 2.4), q = ((t - 9) / 2.4) % 1; P = t >= 9 && t < 16.5 && q > 0.25 && q < 0.75 ? POSE31.give : POSE31.bowl; void k; }
  else { const look = Math.floor((t - 13) / 1.4); P = POSE31.look; facing = t < 13 ? 0 : look % 2 ? 1 : -1; }
  const J = drawCostumed(ctx, x, GROUND, h, P, facing, { ...res.mem, costume: null, touch: res.touch }, { T: A });
  if (ev.k === 'treat') { const hx = x + (P === POSE31.give ? J.hR[0] : (J.hL[0] + J.hR[0]) / 2), hy = GROUND + (P === POSE31.give ? J.hR[1] : (J.hL[1] + J.hR[1]) / 2); ctx.fillStyle = col('#C8A0D8'); ctx.beginPath(); ctx.ellipse(hx, hy, 1.4, 0.6, 0, 0, Math.PI); ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 0.2; ctx.stroke(); }
  ctx.restore();
  if (ev.k === 'treat') {
    // bonbons : trois points de couleur en arc de la coupe au seau du k-ième enfant
    const kids = ev.g.members.filter((m) => m.kid), nk = kids.length, k = Math.floor((t - 9) / 2.4), q = ((t - 9) / 2.4) % 1;
    if (t >= 9 && k < nk && q > 0.35 && q < 0.75) {
      const tx = d.x + (k - (nk - 1) / 2) * 3.6 + ev.g.dir * 0.5, ty = N31_STEP - 13 * kids[k].size * 0.42, fx0 = x + 3, fy0 = GROUND - 8, u = (q - 0.35) / 0.4;
      ['#FF5A7A', '#FFD84A', '#6AD8FF'].forEach((c, j) => { const uu = sat(u - j * 0.12); disc(ctx, c, lerp(fx0, tx, uu), lerp(fy0, ty, uu) - Math.sin(uu * Math.PI) * 3, 0.45, true); });
    }
  }
}
// Le jeune qui fait peur : tapi dans l'embrasure entrouverte, il surgit (« bouh ! »), rit, rentre.
function paintN31ScareTeen(ctx, sc, A) {
  const t = (A - sc.A0) / SEC, d = sc.door, h = 13 * sc.teen.size;
  if (t < -22 || t > 12) return;
  const inX = d.x - d.w * 0.25, outX = d.x - sc.dir * 1.5;
  if (t < 5.5) { // tapi dans l'ombre de la porte entrouverte
    ctx.save(); ctx.beginPath(); ctx.rect(d.x - d.w / 2, GROUND - d.h, d.w * 0.3, d.h + 1); ctx.clip();
    drawCostumed(ctx, inX, GROUND, h, { ...POSE31.crouch, torso: 6, lL: [20, -30], lR: [16, -26] }, sc.dir, sc.teen, { T: A, dark: true });
    ctx.restore(); return;
  }
  if (t < 6.3) { const q = smooth((t - 5.5) / 0.8); drawCostumed(ctx, lerp(inX, outX, q), lerp(GROUND, N31_STEP + 1, q), h, POSE31.boo, -sc.dir, sc.teen, { T: A, keepArms: true }); return; }
  if (t < 8.5) { const w = Math.sin(t * 14) * 10; drawCostumed(ctx, outX, N31_STEP + 1, h, { ...POSE31.boo, aL: [150 + w, -40], aR: [140 - w, -30] }, -sc.dir, sc.teen, { T: A, keepArms: true }); paintBoo(ctx, outX - sc.dir * 4, N31_STEP - h - 2, t); return; }
  if (t < 9.5) { drawCostumed(ctx, outX, N31_STEP + 1, h, { ...POSE31.laugh, dy: Math.abs(Math.sin(t * 10)) * 0.04 }, -sc.dir, sc.teen, { T: A, keepArms: true }); return; }
  const q = smooth(sat((t - 9.5) / 2)); drawCostumed(ctx, lerp(outX, inX, q), lerp(N31_STEP + 1, GROUND, q), h, walkPose(t / 0.6), sc.dir, sc.teen, { T: A, alpha: 1 - sat((t - 10.8) / 1.2) });
}
function paintBoo(ctx, x, y, t) {
  const a = sat(1 - Math.abs(t - 7) / 1.8);
  ctx.save(); ctx.globalAlpha = a; ctx.fillStyle = '#FFF8E8'; ctx.strokeStyle = INK; ctx.lineWidth = 0.3;
  ctx.beginPath(); ctx.ellipse(x, y, 5.2, 2.6, 0, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.fillStyle = INK; ctx.font = 'bold 3px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('BOUH !', x, y + 1); ctx.restore();
}
function paintN31Victim(ctx, sc, A) {
  const v = n31ScareVictim(sc, A); if (!v) return;
  const h = 13 * sc.victim.size, s = A / SEC;
  let P = walkPose(s / (v.fast ? 0.7 : 0.9)), facing = v.facing;
  if (v.mode === 'startle') { const q = sat(v.t / 0.25); P = mixPose(POSE.stand, POSE31.startle, q * (v.t < 1 ? 1 : 1 - sat((v.t - 1) / 0.4))); }
  if (v.mode === 'chest') P = { ...POSE31.chest, dy: 0 };
  const J = drawCostumed(ctx, v.x, N31_LANE, h, P, facing, { ...sc.victim, costume: null }, { T: A });
  if (v.mode === 'startle' && v.t < 1.2) { ctx.strokeStyle = 'rgba(255,248,232,0.9)'; ctx.lineWidth = 0.35; for (let k = -1; k <= 1; k++) { ctx.beginPath(); ctx.moveTo(v.x + J.head[0] + k * 2.2, N31_LANE + J.head[1] - 3.6); ctx.lineTo(v.x + J.head[0] + k * 3, N31_LANE + J.head[1] - 5.4); ctx.stroke(); } }
  if (sc.victim.umbrella) paintUmbrella(ctx, v.x + J.hR[0], N31_LANE + J.hR[1], h, UMBRELLAS[hashString(sc.id) % UMBRELLAS.length]);
}

// ───────────── pluie ─────────────
function paintRain(ctx, T) {
  const s = T / SEC; ctx.save(); ctx.strokeStyle = 'rgba(200,214,255,0.35)'; ctx.lineWidth = 0.35;
  const r = mulberry32(5); ctx.beginPath();
  for (let i = 0; i < 520; i++) { const x0 = r() * (W + 60), sp = 260 + r() * 80, y = ((r() * H + s * sp) % (H + 20)) - 10, x = x0 - y * 0.12; ctx.moveTo(x, y); ctx.lineTo(x - 0.9, y + 6); }
  ctx.stroke();
  ctx.fillStyle = 'rgba(160,180,230,0.10)'; ctx.fillRect(0, GROUND, W, 22);   // trottoir mouillé
  ctx.restore();
}

// ───────────── rendu de la nuit ─────────────
function paintN31(ctx, street, T, D) {
  if (!isN31(D) && !isN31Eve(D)) { if (D.rain) paintRain(ctx, T); return; }
  const plan = n31Plan(street, D), A = hwDay(D.date) * 24 + T;
  // Les figures de la rue sont éclairées par les lampadaires et les vitrines : voile de nuit allégé (comme dans l'app,
  // où les passants restent lisibles la nuit).
  const keep = ENV.dark; ENV.dark *= 0.5;
  for (const [, evs] of plan.doorEv) for (const ev of evs) if (ev.k === 'treat' || ev.k === 'ring') paintN31Resident(ctx, ev, A);
  for (const sc of plan.scares) paintN31ScareTeen(ctx, sc, A);
  const figs = [];
  for (const g of plan.groups) n31GroupFigures(g, A, figs);
  figs.sort((a, b) => a.y - b.y);
  for (const fg of figs) {
    const J = drawCostumed(ctx, fg.x, fg.y, fg.h, fg.P, fg.facing, fg.m, { back: fg.back, T: fg.T });
    if (fg.acc) { const hand = fg.facing === 0 ? J.hR : fg.facing > 0 ? J.hR : J.hR; paintBucket(ctx, fg.x + hand[0], fg.y + hand[1], fg.h, fg.acc); }
    if (fg.umbrella) paintUmbrella(ctx, fg.x + J.hR[0] * 0.5, fg.y + J.neck[1], fg.h * 1.15, UMBRELLAS[Math.floor(fg.m.size * 1000) % UMBRELLAS.length]);
  }
  for (const sc of plan.scares) paintN31Victim(ctx, sc, A);
  ENV.dark = keep;
  if (D.rain) paintRain(ctx, T);
}

// ───────────── planche des déguisements, captures ─────────────
function renderN31Planche() {
  const CW = 64, CH = 60, LB = 9, S = 6, cols = 5;
  const list = N31_COSTUMES.map((c) => ({ c }));
  const rows = Math.ceil(list.length / cols);
  const ctx = canvasFor('planche-deguisements', CW * cols * S, (CH + LB) * rows * S, 'planche-deguisements (×6) — adulte ou jeune / enfant, de jour et de nuit (marche, face)');
  ctx.scale(S, S);
  const D = dayContext('2026-10-31');
  list.forEach(({ c }, i) => {
    const ox = (i % cols) * CW, oy = Math.floor(i / cols) * (CH + LB);
    ctx.fillStyle = '#F2EDE2'; ctx.fillRect(ox, oy, CW, LB); ctx.fillStyle = INK; ctx.font = 'bold 5px sans-serif'; ctx.fillText(N31_LABEL[c], ox + 2.5, oy + 6.5);
    [[12, 'jour'], [21, 'nuit']].forEach(([T, lab], k) => {
      ctx.save(); ctx.translate(ox + k * (CW / 2), oy + LB); ctx.beginPath(); ctx.rect(0, 0, CW / 2, CH); ctx.clip();
      setEnvAt(T, D); fillRect(ctx, '#E6D4AE', 0, 0, CW / 2, CH); fillRect(ctx, STONES[2], 0, 0, CW / 2, CH * 0.62);
      ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(0, CH - 6, 13, 6); ctx.fillStyle = '#fff'; ctx.font = '3.6px sans-serif'; ctx.fillText(lab, 1.5, CH - 1.8);
      const m = { ...member(mulberry32(i * 7 + 3)), costume: c };
      const adultH = 30, kidH = 19;
      drawCostumed(ctx, 9, CH - 9, adultH, walkPose(0.2), 1, m, { T: 0.0004 * i });
      const J = drawCostumed(ctx, 23, CH - 9, kidH, c === 'zombie' ? POSE.stand : { ...POSE.stand, aR: [30, -10] }, 0, m, { T: 0.0004 * i });
      paintBucket(ctx, 23 + J.hR[0], CH - 9 + J.hR[1], kidH, 'seau');
      ctx.restore();
    });
  });
}
// Vue rapprochée sur la porte de l'immeuble héros (trottoir compris).
const n31HeroView = (D, scale = 8) => { const h = buildStreet(D).hero, dx = h.bayX(h.doorBay); return { x0: Math.round(dx - 55), y0: GROUND - 36, w: 110, h: 50, scale }; };
const N31_CAPTURES = [
  { id: 'n31-18h30', T: 18.5 + 6 * SEC, date: '2026-10-31', zoom: true, note: 'samedi 31 oct. 18 h 30 — les familles font le tour des portes décorées ; à l’immeuble héros, les enfants reçoivent des bonbons' },
  { id: 'n31-19h15', T: 19.25, date: '2026-10-31', note: 'samedi 31 oct. 19 h 15 — plein du porte-à-porte' },
  { id: 'n31-21h30', T: 21.5, date: '2026-10-31', note: 'samedi 31 oct. 21 h 30 — les jeunes et les adultes déguisés, les farces' },
  { id: 'n31-pluie-19h15', T: 19.25, date: '2026-10-31', event: 'pluie', note: 'samedi 31 oct. 19 h 15 sous la pluie — moins de monde, parapluies ; les farces continuent' },
  { id: 'veille-30oct-21h30', T: 21.5, date: '2026-10-30', note: 'vendredi 30 oct. 21 h 30 — la veille : quelques déguisés isolés' },
  { id: 'n31-17h', T: 17, date: '2026-10-31', note: 'samedi 31 oct. 17 h — avant la nuit : passants ordinaires, quelques déguisés' },
];
// Séquences à la porte de l'immeuble héros (secondes après le début de l'arrêt).
const N31_SEQS = [
  { id: 'bonbons', A: 18.5, at: [0.5, 3, 6, 8.6, 10.6, 13, 17.8, 22], note: 'porte-à-porte (familles)' },
  { id: 'sonner-fuir', A: 21 + 10 * MIN, at: [0.6, 1.9, 3.4, 6, 9, 13.5, 15.5, 18], note: 'sonner et s’enfuir' },
  { id: 'peur', A: 21 + 40 * MIN, at: [-4, 4.5, 5.9, 6.6, 8, 9.2, 10.8, 14], note: 'faire peur' },
];
function renderN31Captures() {
  const ids = [];
  for (const cap of N31_CAPTURES) {
    const D = dayContext(cap.date, cap.event); D.rain = cap.event === 'pluie';
    renderScene(canvasFor(cap.id, W * 2, H * 2, `${cap.id} — ${cap.note}`), cap.T, D, fullView(2)); ids.push(cap.id);
    const zv = { x0: 0, y0: 230, w: 450, h: 100, scale: 4 };
    renderScene(canvasFor(cap.id + '-rue', zv.w * 4, zv.h * 4, cap.id + '-rue (×4, moitié gauche de la rue)'), cap.T, D, zv); ids.push(cap.id + '-rue');
    const zr = { x0: 450, y0: 230, w: 450, h: 100, scale: 4 };
    renderScene(canvasFor(cap.id + '-rue2', zr.w * 4, zr.h * 4, cap.id + '-rue2 (×4, moitié droite)'), cap.T, D, zr); ids.push(cap.id + '-rue2');
  }
  const D = dayContext('2026-10-31');
  for (const seq of N31_SEQS) seq.at.forEach((sec, i) => { const id = `${seq.id}-seq-${i + 1}`; const T = seq.A + sec * SEC; renderScene(canvasFor(id, 110 * 8, 50 * 8, `${id} — ${seq.note}, ${fmtT(T)} (${sec >= 0 ? '+' : ''}${sec} s)`), T, D, n31HeroView(D, 8)); ids.push(id); });
  renderN31Planche(); ids.push('planche-deguisements');
  renderN31Pets(); ids.push('animaux-seq');
  window.__ids = ids; window.__done = true;
}

// ───────────── animaux de la pièce (vague 1c) : schéma de la réaction ─────────────
// La fenêtre de la pièce donne sur la rue : un groupe déguisé (ou le promeneur de chien) dans l'axe de la fenêtre déclenche
// la réaction. Chien éveillé : court à la fenêtre, pattes sur l'appui, aboie quelques secondes. Chat éveillé près du chien
// qui aboie : sursaute (dos rond), parfois feule et file sous le canapé (1 fois sur 3). Animal endormi : ne bouge pas.
function renderN31Pets() {
  const frames = [
    { t: 0, lab: '0 s — un groupe entre dans l’axe de la fenêtre', dog: { x: 70, pose: 'lie', awake: true }, cat: { x: 30, pose: 'sit' }, grp: 0.15 },
    { t: 1.2, lab: '1,2 s — le chien se lève et court à la fenêtre', dog: { x: 92, pose: 'run' }, cat: { x: 30, pose: 'ears' }, grp: 0.3 },
    { t: 2.4, lab: '2,4 s — pattes sur l’appui, il aboie', dog: { x: 104, pose: 'bark' }, cat: { x: 30, pose: 'arch' }, grp: 0.45, bark: true },
    { t: 4, lab: '4 s — le chat feule et file sous le canapé (1 fois sur 3)', dog: { x: 104, pose: 'bark' }, cat: { x: 18, pose: 'hide' }, grp: 0.6, bark: true },
    { t: 9, lab: '9 s — le groupe est passé : le chien retourne se coucher', dog: { x: 84, pose: 'walk' }, cat: { x: 18, pose: 'hide' }, grp: 1.2 },
    { t: 0, lab: 'chien endormi : aucune réaction', dog: { x: 70, pose: 'sleep' }, cat: { x: 30, pose: 'sleep' }, grp: 0.45 },
  ];
  const CW = 140, CH = 80, LB = 9, S = 4, cols = 3;
  const ctx = canvasFor('animaux-seq', CW * cols * S, (CH + LB) * 2 * S, 'animaux-seq (×4) — réaction à un groupe déguisé dans l’axe de la fenêtre (schéma, les animaux de la pièce gardent leurs sprites)');
  ctx.scale(S, S);
  const D = dayContext('2026-10-31'); setEnvAt(19, D);
  frames.forEach((fr, i) => {
    const ox = (i % cols) * CW, oy = Math.floor(i / cols) * (CH + LB);
    ctx.save(); ctx.translate(ox, oy);
    ctx.fillStyle = '#F2EDE2'; ctx.fillRect(0, 0, CW, LB); ctx.fillStyle = INK; ctx.font = 'bold 4.2px sans-serif'; ctx.fillText(fr.lab, 2, 6);
    ctx.translate(0, LB); ctx.beginPath(); ctx.rect(0, 0, CW, CH); ctx.clip();
    rawRect(ctx, '#E8D8C0', 0, 0, CW, CH); rawRect(ctx, '#B88A5A', 0, CH - 16, CW, 16); rawRect(ctx, '#C89A6A', 0, CH - 16, CW, 1.2);
    // fenêtre (nuit) avec la rue en contrebas
    const wx = 88, wy = 10, ww = 40, wh = 42;
    rawRect(ctx, '#1E2A5A', wx, wy, ww, wh);
    ctx.save(); ctx.beginPath(); ctx.rect(wx, wy, ww, wh); ctx.clip();
    rawRect(ctx, '#3A3A5A', wx, wy + wh - 12, ww, 12); rawRect(ctx, '#5A5A7A', wx, wy + wh - 13, ww, 1);
    const gx = wx - 12 + fr.grp * (ww + 24);
    const kidM = { ...member(mulberry32(3)), costume: 'sorciere' }, kid2 = { ...member(mulberry32(5)), costume: 'fantome' }, ad = { ...member(mulberry32(8)), costume: null };
    drawCostumed(ctx, gx, wy + wh - 4, 8, walkPose(fr.t), 1, kidM, {}); drawCostumed(ctx, gx - 4, wy + wh - 4, 8, walkPose(fr.t + 0.3), 1, kid2, {}); drawCostumed(ctx, gx - 9, wy + wh - 3.5, 12, walkPose(fr.t + 0.6), 1, ad, {});
    ctx.restore();
    rawRect(ctx, '#F4F0E8', wx - 2, wy + wh, ww + 4, 2.4); inkRect(ctx, wx, wy, ww, wh, 0.8); inkLine(ctx, [[wx + ww / 2, wy], [wx + ww / 2, wy + wh]], 0.8);
    ctx.strokeStyle = 'rgba(255,220,120,0.5)'; ctx.setLineDash([1.5, 1.5]); ctx.lineWidth = 0.4; ctx.beginPath(); ctx.moveTo(wx, wy + wh); ctx.lineTo(wx - 18, CH - 16); ctx.moveTo(wx + ww, wy + wh); ctx.lineTo(wx + ww + 4, CH - 16); ctx.stroke(); ctx.setLineDash([]);
    // canapé
    rawRect(ctx, '#7A5A8E', 4, CH - 30, 46, 10); rawRect(ctx, '#6A4A7E', 4, CH - 22, 46, 6); rawRect(ctx, '#5A3A6E', 6, CH - 16, 3, 3); rawRect(ctx, '#5A3A6E', 45, CH - 16, 3, 3); inkRect(ctx, 4, CH - 30, 46, 14, 0.6);
    n31PaintCat(ctx, fr.cat.x, fr.cat.pose === 'hide' ? CH - 14 : CH - 30, fr.cat.pose);
    n31PaintDog(ctx, fr.dog.x, CH - 16, fr.dog.pose, fr.t, wy + wh);
    if (fr.bark) { ctx.fillStyle = '#FFF8E8'; ctx.strokeStyle = INK; ctx.lineWidth = 0.3; ctx.beginPath(); ctx.ellipse(fr.dog.x - 12, 24, 9, 4, 0, 0, TAU); ctx.fill(); ctx.stroke(); ctx.fillStyle = INK; ctx.font = 'bold 4px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('Ouaf ! Ouaf !', fr.dog.x - 12, 25.4); ctx.textAlign = 'left'; }
    if (fr.dog.pose === 'sleep') { ctx.fillStyle = INK; ctx.font = 'italic 4px sans-serif'; ctx.fillText('z z', fr.dog.x + 4, CH - 26); ctx.fillText('z', fr.cat.x + 5, CH - 38); }
    ctx.restore();
  });
}
function n31PaintDog(ctx, x, fy, pose, t, sillY) {
  const C = '#C8904A', dark = '#8A5A2A';
  ctx.save(); ctx.lineCap = 'round';
  const leg = (x0, y0, x1, y1) => { strokeC(ctx, INK, 2.2, [[x0, y0], [x1, y1]]); strokeC(ctx, C, 1.4, [[x0, y0], [x1, y1]]); };
  if (pose === 'bark') { // dressé contre le mur, pattes avant sur l'appui
    leg(x - 4, fy - 6, x - 5, fy); leg(x - 2, fy - 6, x - 1, fy);
    ctx.fillStyle = INK; ctx.beginPath(); ctx.ellipse(x, fy - 12, 4.2, 7.2, -0.5, 0, TAU); ctx.fill(); ctx.fillStyle = C; ctx.beginPath(); ctx.ellipse(x, fy - 12, 3.6, 6.6, -0.5, 0, TAU); ctx.fill();
    leg(x + 2, fy - 16, x + 6, sillY - 0.5);
    ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(x + 5, sillY - 4, 3.6, 0, TAU); ctx.fill(); ctx.fillStyle = C; ctx.beginPath(); ctx.arc(x + 5, sillY - 4, 3, 0, TAU); ctx.fill();
    fillC(ctx, C, [[x + 7, sillY - 5], [x + 11, sillY - 4.5], [x + 10.5, sillY - 2.5], [x + 7, sillY - 2.6]]); fillC(ctx, dark, [[x + 3, sillY - 6.4], [x + 1.4, sillY - 2], [x + 3.6, sillY - 3]]);
    disc(ctx, INK, x + 6.4, sillY - 5, 0.5, true); strokeC(ctx, '#C83A3A', 0.6, [[x + 9.6, sillY - 2.6], [x + 10, sillY - 1.4]]);
    strokeC(ctx, C, 1.2, [[x - 3, fy - 6], [x - 7, fy - 9 + Math.sin(t * 20) * 1.5]]);
  } else {
    const lying = pose === 'lie' || pose === 'sleep', by = lying ? fy - 2.6 : fy - 5.4, ph = pose === 'run' ? Math.sin(t * 30) * 2 : pose === 'walk' ? Math.sin(t * 12) : 0;
    if (!lying) { leg(x - 4, by + 1, x - 4 - ph, fy); leg(x + 4, by + 1, x + 4 + ph, fy); }
    ctx.fillStyle = INK; ctx.beginPath(); ctx.ellipse(x, by, 6.6, 3.4, 0, 0, TAU); ctx.fill(); ctx.fillStyle = C; ctx.beginPath(); ctx.ellipse(x, by, 6, 2.8, 0, 0, TAU); ctx.fill();
    const hx = pose === 'sleep' ? x + 6 : x + 7, hy = pose === 'sleep' ? by + 0.4 : by - 3;
    ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(hx, hy, 3.2, 0, TAU); ctx.fill(); ctx.fillStyle = C; ctx.beginPath(); ctx.arc(hx, hy, 2.6, 0, TAU); ctx.fill();
    fillC(ctx, dark, [[hx - 1.6, hy - 2], [hx - 3.2, hy + 1.8], [hx - 0.8, hy + 0.6]]);
    if (pose === 'sleep') strokeC(ctx, INK, 0.35, [[hx + 0.4, hy - 0.6], [hx + 1.6, hy - 0.6]]); else disc(ctx, INK, hx + 1, hy - 0.6, 0.45, true);
    strokeC(ctx, C, 1.2, [[x - 6, by - 0.5], [x - 9, by - (lying ? 0.5 : 3)]]);
  }
  ctx.restore();
}
function n31PaintCat(ctx, x, fy, pose) {
  const C = '#5A5A6A';
  if (pose === 'hide') { ctx.fillStyle = INK; ctx.beginPath(); ctx.ellipse(x, fy, 3, 1.4, 0, 0, TAU); ctx.fill(); disc(ctx, '#E8F07A', x - 1, fy - 0.2, 0.35, true); disc(ctx, '#E8F07A', x + 0.6, fy - 0.2, 0.35, true); return; }
  if (pose === 'arch') { // sursaut : dos rond, poils hérissés, en l'air
    const y = fy - 3;
    ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(x, y, 4.6, Math.PI, 0); ctx.fill(); ctx.fillStyle = C; ctx.beginPath(); ctx.arc(x, y, 4, Math.PI, 0); ctx.fill();
    for (let k = 0; k < 7; k++) { const a = Math.PI + (k + 0.5) * (Math.PI / 7); strokeC(ctx, INK, 0.35, [[x + Math.cos(a) * 4.2, y + Math.sin(a) * 4.2], [x + Math.cos(a) * 5.4, y + Math.sin(a) * 5.4]]); }
    strokeC(ctx, C, 0.9, [[x - 3.6, y], [x - 4, y + 3]]); strokeC(ctx, C, 0.9, [[x + 3.6, y], [x + 4, y + 3]]);
    disc(ctx, C, x + 4.6, y - 1.8, 1.8, true); fillC(ctx, C, [[x + 3.6, y - 3], [x + 4, y - 4.8], [x + 4.8, y - 3.2]]); fillC(ctx, C, [[x + 5, y - 3.2], [x + 6, y - 4.8], [x + 6.2, y - 2.8]]);
    strokeC(ctx, C, 0.9, [[x - 4, y - 1], [x - 6, y - 6]]); for (let k = 0; k < 3; k++) strokeC(ctx, INK, 0.3, [[x - 1 + k * 2, y - 6.6], [x - 1.4 + k * 2, y - 8]]);
    return;
  }
  const lying = pose === 'sleep';
  ctx.fillStyle = INK; ctx.beginPath(); ctx.ellipse(x, fy - 2.6, lying ? 4.4 : 2.6, lying ? 2 : 3, 0, 0, TAU); ctx.fill(); ctx.fillStyle = C; ctx.beginPath(); ctx.ellipse(x, fy - 2.6, lying ? 3.9 : 2.1, lying ? 1.5 : 2.5, 0, 0, TAU); ctx.fill();
  const hx = lying ? x + 3.4 : x + 0.6, hy = lying ? fy - 2.8 : fy - 6.4;
  disc(ctx, C, hx, hy, 1.7, true); const up = pose === 'ears' ? 1.2 : 0.8;
  fillC(ctx, C, [[hx - 1.5, hy - 0.5], [hx - 1.2, hy - 1.8 - up], [hx - 0.2, hy - 1.2]]); fillC(ctx, C, [[hx + 1.5, hy - 0.5], [hx + 1.2, hy - 1.8 - up], [hx + 0.2, hy - 1.2]]);
  if (!lying) { disc(ctx, '#E8F07A', hx - 0.6, hy - 0.1, 0.32, true); disc(ctx, '#E8F07A', hx + 0.6, hy - 0.1, 0.32, true); }
  strokeC(ctx, C, 0.8, [[x - 2, fy - 1], [x - 4.6, fy - 2.4]]);
}
