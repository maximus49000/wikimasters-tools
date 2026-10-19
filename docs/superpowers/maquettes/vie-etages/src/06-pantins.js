// ───────────── pantins : poses (angles en degrés), cinématique, tracé ─────────────
// Convention : angle 0 = membre pendant vers le bas ; positif = vers l'avant (sens du regard) ; vue de face (facing 0) :
// le côté gauche est miroir, les angles positifs écartent les membres du corps.
const POSE = {
  stand: { torso: 0, head: 0, aL: [6, 8], aR: [6, 8], lL: [4, 0], lR: [4, 0] },
  armsUp: { torso: -4, head: -10, aL: [150, -18], aR: [150, -18], lL: [5, 0], lR: [5, 0] },
  reach: { torso: 5, head: -4, aL: [100, -30], aR: [22, 10], lL: [4, 0], lR: [4, 0] },
  lean: { torso: 26, head: -16, aL: [58, -80], aR: [58, -80], lL: [2, 0], lR: [2, 0] },
  leanRail: { torso: 16, head: -8, aL: [32, -42], aR: [32, -42], lL: [4, 0], lR: [4, 0] },
  smokeUp: { torso: 2, head: 6, aL: [8, 10], aR: [24, -142], lL: [4, 0], lR: [4, 0] },
  smokeDown: { torso: 2, head: -6, aL: [8, 10], aR: [16, -28], lL: [4, 0], lR: [4, 0] },
  water: { torso: 30, head: -6, aL: [-14, 16], aR: [74, -14], lL: [10, 0], lR: [-6, 0] },
  shake: { torso: 20, head: -8, aL: [88, -14], aR: [88, -14], lL: [4, 0], lR: [4, 0] },
  curtain: { torso: 2, head: 8, aL: [10, 8], aR: [116, -16], lL: [4, 0], lR: [4, 0] },
  sitTable: { torso: -4, head: 12, aL: [64, -88], aR: [64, -88], lL: [88, -88], lR: [88, -88] },
  sitTv: { torso: -16, head: 8, aL: [24, -48], aR: [24, -48], lL: [78, -70], lR: [84, -74] },
  cook: { torso: 8, head: 16, aL: [40, -64], aR: [54, -80], lL: [4, 0], lR: [4, 0] },
  kneel: { torso: 34, head: 10, aL: [60, -40], aR: [80, -60], lL: [90, -140], lR: [60, -120] },
};
const d2r = Math.PI / 180;
const mixPose = (A, B, t) => ({ torso: lerp(A.torso, B.torso, t), head: lerp(A.head, B.head, t), aL: [lerp(A.aL[0], B.aL[0], t), lerp(A.aL[1], B.aL[1], t)], aR: [lerp(A.aR[0], B.aR[0], t), lerp(A.aR[1], B.aR[1], t)], lL: [lerp(A.lL[0], B.lL[0], t), lerp(A.lL[1], B.lL[1], t)], lR: [lerp(A.lR[0], B.lR[0], t), lerp(A.lR[1], B.lR[1], t)], dy: lerp(A.dy || 0, B.dy || 0, t) });
function walkPose(ph) { const s = Math.sin(ph * TAU), c = Math.cos(ph * TAU); const sw = s * 26; return { torso: 3, head: 0, aL: [-sw * 0.7, 14], aR: [sw * 0.7, 14], lL: [sw, sw < 0 ? sw * 1.1 : 6], lR: [-sw, -sw < 0 ? -sw * 1.1 : 6], dy: Math.abs(c) * 0.018 }; }
function dancePose(ph) { const s = Math.sin(ph * TAU); return { torso: s * 6, head: -s * 6, aL: [132 + s * 24, -24], aR: [132 - s * 24, -24], lL: [6 + s * 4, 0], lR: [6 - s * 4, 0], dy: Math.abs(s) * 0.03 }; }
// Cinématique : hanche au-dessus du pied le plus bas ; renvoie les articulations (repère local, pieds en (0,0), y vers le bas).
function figurePts(h, P, facing) {
  const F = facing === 0 ? 0 : facing, sL = facing === 0 ? -1 : F, sR = facing === 0 ? 1 : F;
  const thigh = 0.25 * h, shin = 0.22 * h, torso = 0.30 * h, headR = 0.082 * h, upper = 0.15 * h, fore = 0.14 * h;
  const leg = (a, s) => { const k = [Math.sin(a[0] * d2r) * s * thigh, Math.cos(a[0] * d2r) * thigh]; return [k, [k[0] + Math.sin((a[0] + a[1]) * d2r) * s * shin, k[1] + Math.cos((a[0] + a[1]) * d2r) * shin]]; };
  const [kL, fL] = leg(P.lL, sL), [kR, fR] = leg(P.lR, sR);
  const hip = [0, -Math.max(fL[1], fR[1]) - (P.dy || 0) * h];
  const tx = Math.sin(P.torso * d2r) * F * torso, ty = -Math.cos(P.torso * d2r) * torso;
  const neck = [hip[0] + tx, hip[1] + ty], sh = [hip[0] + tx * 0.9, hip[1] + ty * 0.9];
  const head = [neck[0] + Math.sin((P.torso + P.head) * d2r) * F * headR * 1.3, neck[1] - Math.cos((P.torso + P.head) * d2r) * headR * 1.3];
  const arm = (a, s) => { const e = [sh[0] + Math.sin(a[0] * d2r) * s * upper, sh[1] + Math.cos(a[0] * d2r) * upper]; return [e, [e[0] + Math.sin((a[0] + a[1]) * d2r) * s * fore, e[1] + Math.cos((a[0] + a[1]) * d2r) * fore]]; };
  const [eL, hL] = arm(P.aL, sL), [eR, hR] = arm(P.aR, sR);
  const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
  return { hip, neck, sh, head, headR, kL: add(hip, kL), fL: add(hip, fL), kR: add(hip, kR), fR: add(hip, fR), eL, hL, eR, hR };
}
// Tracé : silhouette (une couleur) ou pantin couleur (passe encre épaisse puis couleurs, membre arrière plus sombre).
function drawFigure(ctx, fx, fy, h, P, facing, style) {
  const J = figurePts(h, P, facing);
  ctx.save(); ctx.translate(fx, fy); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const line = (pts, c, lw) => { ctx.strokeStyle = c; ctx.lineWidth = lw; ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.stroke(); };
  const dot = (p, r, c) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, TAU); ctx.fill(); };
  if (style.silhouette) {
    const c = style.silhouette, lw = 0.1 * h;
    if (style.alpha != null) ctx.globalAlpha = style.alpha;
    line([J.hip, J.kL, J.fL], c, lw); line([J.hip, J.kR, J.fR], c, lw); line([J.hip, J.neck], c, lw * 1.9); line([J.sh, J.eL, J.hL], c, lw * 0.9); line([J.sh, J.eR, J.hR], c, lw * 0.9); dot(J.head, J.headR + lw * 0.25, c);
  } else {
    const lw = 0.085 * h, ink = lw + 0.07 * h, m = style.mem;
    const inkC = style.ink || INK, shirt = style.amb ? col(m.shirt) : m.shirt, pants = style.amb ? col(m.pants) : m.pants, skin = style.amb ? col(m.skin) : m.skin;
    const back = facing !== 0;   // de profil : le membre gauche est derrière
    const limbs = [['leg', [J.hip, J.kL, J.fL], pants, back], ['arm', [J.sh, J.eL, J.hL], shirt, back], ['leg', [J.hip, J.kR, J.fR], pants, false], ['arm', [J.sh, J.eR, J.hR], shirt, false]];
    for (const [, pts, , ] of limbs) line(pts, inkC, ink);
    line([J.hip, J.neck], inkC, lw * 2.2 + 0.07 * h);
    dot(J.head, J.headR + 0.035 * h, inkC);
    for (const [, pts, c, isBack] of limbs) line(pts, isBack ? rgba(shade(hex(c), 0.35)) : c, lw);
    line([J.hip, J.neck], shirt, lw * 2.2); line([J.hip, [J.hip[0] * 0.5 + J.neck[0] * 0.5, J.hip[1] * 0.5 + J.neck[1] * 0.5]], pants, lw * 2.0);
    dot(J.head, J.headR, skin); dot([J.head[0] - J.headR * 0.1, J.head[1] - J.headR * 0.45], J.headR * 0.72, style.hair || '#3A2A28');
  }
  ctx.restore();
  return J;
}
// Chorégraphies : p ∈ [0,1] → { P, dx (en largeurs de fenêtre, 0 = centré), facing, where?, props, still? }.
// Entrée / sortie : toute scène « in » commence en marchant depuis la pièce voisine et finit en repartant (rien n'apparaît sur place).
function choreo(seg, p, T, home) {
  const dur = seg.t1 - seg.t0, tIn = Math.min(0.3, 11 * SEC / dur), tOut = Math.min(0.3, 11 * SEC / dur);
  const s = T / SEC, name = seg.choreo, slot = seg.slot || 0;
  const walkIn = (q, from, to) => ({ P: walkPose(s / 0.9), dx: lerp(from, to, q), facing: to > from ? 1 : -1 });
  const bal = seg.where === 'balcony', lean = seg.where === 'lean';
  if (name === 'cross') return { P: walkPose(s / 0.9), dx: lerp(-1.6, 1.6, p), facing: 1, cross: true, props: [] };
  if (name === 'tv') { const side = (seg.seat || 0) % 2 ? -1 : 1; if (p < tIn) return walkIn(p / tIn, -1.4, 0.22 * side); if (p > 1 - tOut) return walkIn((p - 1 + tOut) / tOut, 0.22 * side, 1.4); return { P: POSE.sitTv, dx: 0.22 + (seg.seat || 0) * 0.16, facing: -1, props: [{ type: 'tv', dx: -0.34 }], still: true }; }
  if (name === 'table') { const i = seg.seat || 0, n = seg.party || 2, side = i % 2 ? 1 : -1; const dx = n === 1 ? (seg.desk ? -0.12 : -0.2) : side * (0.24 + Math.floor(i / 2) * 0.1); const fac = n === 1 ? 1 : -side; if (p < tIn) return walkIn(p / tIn, -1.4, dx); if (p > 1 - tOut) return walkIn((p - 1 + tOut) / tOut, dx, 1.4); const stir = Math.sin(s / 1.7 + i) * 4; return { P: mixPose(POSE.sitTable, { ...POSE.sitTable, aR: [64 + stir, -88 - stir] }, 0.5), dx, facing: fac, props: i === 0 ? [{ type: seg.desk ? 'desk' : 'table', n }] : [], still: true }; }
  if (name === 'cook') { if (p < tIn) return walkIn(p / tIn, 1.4, -0.22); if (p > 1 - tOut) return walkIn((p - 1 + tOut) / tOut, -0.22, 1.4); const st = Math.sin(s / 0.6) * 10; return { P: { ...POSE.cook, aR: [54, -80 + st] }, dx: -0.22, facing: 1, props: [{ type: 'stove' }], still: false }; }
  if (name === 'armsUp') { if (p < 0.2) return walkIn(p / 0.2, -1.5, 0); if (p > 0.8) return walkIn((p - 0.8) / 0.2, 0, 1.5); return { P: mixPose(POSE.stand, POSE.armsUp, smooth(sat((p - 0.2) / 0.1)) * smooth(sat((0.8 - p) / 0.1))), dx: 0, facing: 0 }; }
  if (name === 'stand') { if (p < tIn) return walkIn(p / tIn, -1.4, 0.1); if (p > 1 - tOut) return walkIn((p - 1 + tOut) / tOut, 0.1, 1.4); return { P: POSE.stand, dx: 0.1 + Math.sin(s / 7) * 0.1, facing: 0, still: true }; }
  if (name === 'openShutters') {
    if (p < 0.12) return walkIn(p / 0.12, -1.5, 0);
    if (p < 0.26) return { P: mixPose(POSE.stand, POSE.armsUp, smooth((p - 0.12) / 0.14)), dx: 0, facing: 0 };
    if (p < 0.6) return { P: { ...POSE.armsUp, aL: [150 - (p - 0.26) * 60, -18], aR: [150 - (p - 0.26) * 60, -18] }, dx: 0, facing: 0 };
    if (p < 0.72) return { P: mixPose(POSE.armsUp, POSE.reach, smooth((p - 0.6) / 0.12)), dx: 0, facing: 0 };
    if (p < 0.9) return { P: mixPose(POSE.reach, POSE.lean, smooth((p - 0.72) / 0.06)), dx: 0, facing: 0, where: 'lean' };
    return walkIn((p - 0.9) / 0.1, 0, 1.5);
  }
  if (name === 'closeShutters') {
    if (p < 0.14) return walkIn(p / 0.14, 1.5, 0);
    if (p < 0.3) return { P: mixPose(POSE.stand, POSE.reach, smooth((p - 0.14) / 0.16)), dx: 0, facing: 0 };
    if (p < 0.45) return { P: mixPose(POSE.reach, POSE.armsUp, smooth((p - 0.3) / 0.15)), dx: 0, facing: 0 };
    if (p < 0.82) return { P: { ...POSE.armsUp, aL: [120 + (p - 0.45) * 40, -18], aR: [120 + (p - 0.45) * 40, -18] }, dx: 0, facing: 0 };
    return walkIn((p - 0.82) / 0.18, 0, -1.5);
  }
  if (name === 'drawCurtains') {
    const rev = seg.reverse ? -1 : 1;
    if (p < 0.22) return walkIn(p / 0.22, -1.5 * rev, -0.45 * rev);
    if (p < 0.75) return { P: POSE.curtain, dx: lerp(-0.45, 0.45, (p - 0.22) / 0.53) * rev, facing: 0 };
    return walkIn((p - 0.75) / 0.25, 0.45 * rev, 1.5 * rev);
  }
  if (name === 'lean') { if (p < tIn) return walkIn(p / tIn, -1.5, 0); if (p > 1 - tOut) return walkIn((p - 1 + tOut) / tOut, 0, 1.5); return { P: { ...POSE.lean, head: -16 + Math.sin(s / 5) * 8 }, dx: 0, facing: 0, where: 'lean', still: true }; }
  if (name === 'leanRail') { const out = bal ? balconyInOut(p, tIn, tOut, slot) : null; if (out) return out; return { P: { ...POSE.leanRail, head: -8 + Math.sin(s / 6 + slot) * 10 }, dx: bal ? 0.3 + slot * 0.55 : 0, facing: 0, where: bal ? 'balcony' : 'lean', still: true }; }
  if (name === 'smoke') {
    const out = bal ? balconyInOut(p, tIn, tOut, slot) : null; if (out) return out;
    if (!bal && p < tIn) return walkIn(p / tIn, -1.5, 0); if (!bal && p > 1 - tOut) return walkIn((p - 1 + tOut) / tOut, 0, 1.5);
    const cyc = (s / 11 + slot) % 1, up = cyc < 0.3 ? smooth(sat(cyc / 0.08)) * smooth(sat((0.3 - cyc) / 0.08)) : 0;
    return { P: mixPose(bal ? POSE.smokeDown : { ...POSE.smokeDown, torso: 18, aL: [50, -75] }, POSE.smokeUp, up), dx: bal ? 0.3 + slot * 0.55 : 0, facing: 0, where: bal ? 'balcony' : 'lean', props: [{ type: 'ember', puff: cyc > 0.3 && cyc < 0.6 ? (cyc - 0.3) / 0.3 : -1 }] };
  }
  if (name === 'water') {
    const out = bal ? balconyInOut(p, tIn, tOut, 0) : null; if (out) return out;
    if (!bal && p < tIn) return walkIn(p / tIn, -1.5, 0); if (!bal && p > 1 - tOut) return walkIn((p - 1 + tOut) / tOut, 0, 1.5);
    const q = (p - tIn) / (1 - tIn - tOut), pot = Math.floor(q * 3), ph = (q * 3) % 1, pour = ph > 0.25 && ph < 0.8;
    const dx = bal ? [0.1, 0.5, 0.9][pot] : 0;
    return { P: mixPose(POSE.stand, POSE.water, smooth(sat(ph / 0.2)) * smooth(sat((1 - ph) / 0.15))), dx, facing: 1, where: bal ? 'balcony' : 'lean', props: [{ type: 'can', pour }] };
  }
  if (name === 'shake') { if (p < tIn) return walkIn(p / tIn, -1.5, 0); if (p > 1 - tOut) return walkIn((p - 1 + tOut) / tOut, 0, 1.5); const sh = Math.sin(s / 0.35) * 12; return { P: { ...POSE.shake, aL: [88 + sh, -14], aR: [88 + sh, -14], torso: 20 + sh * 0.3 }, dx: 0, facing: 0, where: 'lean', props: [{ type: 'rug', ph: s / 0.35 }] }; }
  if (name === 'dance') { if (p < tIn) return walkIn(p / tIn, -1.5, -0.4 + slot * 0.3); if (p > 1 - tOut) return walkIn((p - 1 + tOut) / tOut, -0.4 + slot * 0.3, 1.5); return { P: dancePose(s / 1.1 + slot * 0.3), dx: -0.4 + slot * 0.3 + Math.sin(s / 2.3 + slot) * 0.08, facing: 0 }; }
  return { P: POSE.stand, dx: 0, facing: 0 };
}
// Sortie sur le balcon par la porte-fenêtre : on traverse le plan de la vitre (dedans → dehors), et retour en fin de scène.
function balconyInOut(p, tIn, tOut, slot) {
  const target = 0.3 + slot * 0.55;
  if (p < tIn * 0.55) return { P: walkPose(p * 400), dx: lerp(-1.5, 0.05, p / (tIn * 0.55)), facing: 1, where: 'in' };
  if (p < tIn) return { P: walkPose(p * 400), dx: lerp(0.05, target, (p - tIn * 0.55) / (tIn * 0.45)), facing: 1, where: 'balcony' };
  if (p > 1 - tOut * 0.45) return { P: walkPose(p * 400), dx: lerp(0.05, -1.5, (p - 1 + tOut * 0.45) / (tOut * 0.45)), facing: -1, where: 'in' };
  if (p > 1 - tOut) return { P: walkPose(p * 400), dx: lerp(target, 0.05, (p - 1 + tOut) / (tOut * 0.55)), facing: -1, where: 'balcony' };
  return null;
}
