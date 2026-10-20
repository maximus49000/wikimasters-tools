// ───────────── verdure de la rue principale (couche peinte PAR-DESSUS le premier plan de l'appli, dans les tranches) ─────────────
// Ce qu'on voit dans une rue parisienne : alignement d'arbres en pied de trottoir dans une fosse à grille en fonte (platanes,
// tilleuls, marronniers ; espacement 60-95 px tiré, un arbre plus jeune au tuteur, une fosse vide), pieds d'arbres fleuris, bacs
// de trottoir devant une vitrine, parterre au pied d'un immeuble sans commerce, grimpante (glycine, vigne vierge) sur l'arête
// d'une façade, pots devant une porte, herbe entre les pavés au bord de la chaussée, feuilles mortes à l'automne.
// Emplacements interdits (tirage par graine et position, `streetVerdure`) : entrées d'immeuble (± DOOR_MARGIN), portes de
// commerce (± 8), lampadaires (± 9, `lampsFor`), arbres existants du plan (`plan.trees`, ± r + 6), mobilier (`plan.furniture`),
// chaussée. Le couloir des passants (`doorY` → `walkY`, soit ground + 2 … ground + 14) reste libre : fosses à la bordure
// (curb − 5 … curb), bacs et parterres collés à la façade (ground … ground + 3,5), terrasses de cafés dans le même couloir
// que les passants (deux rangs de tables entre doorY et walkY : elles ne croisent ni les fosses ni les bacs).
const PIT = { w: 8, h: 3.2 };                       // grille de fosse (perspective)
const SPECIES = ['platane', 'platane', 'tilleul', 'marronnier', 'tilleul', 'cerisier'];
const FLOWERS = {                                   // fleurs de saison (pieds d'arbres, bacs, parterres)
  spring: ['#E8456B', '#F6C62E', '#F28CB4', '#FFFFFF'],      // tulipes
  summer: ['#E03A3A', '#8468B0', '#F0609A', '#9A78C8'],      // géraniums, lavande
  autumn: ['#F0B040', '#C87A2A', '#D8A040', '#B04A3A'],      // chrysanthèmes
  winter: ['#B890C0', '#C8A0C8', '#8A6A5A'],                 // bruyères, sol paillé
};
const BARK = { platane: '#C8B898', tilleul: '#8A7A66', marronnier: '#7A6654', cerisier: '#6A5A54', jeune: '#A89880' };

function streetVerdure(F) {
  const { plan, ground } = F, seed = F.seed, curb = plan.curb, u = plan.unit, out = [];
  const lamps = lampsFor(W, seed).map((l) => l.x);
  const doors = plan.doors.map((d) => ({ x0: d.x - 4, x1: d.x + 12 + 4 }));
  const shopDoors = plan.blocked.filter((s) => !doors.some((d) => Math.abs(d.x0 + 4 - s.x0) < 0.5)).map((s) => s); // locaux (porte côté opposé à l'entrée : on garde les 8 px de chaque bout libres)
  const busy = (x0, x1, kinds) => (kinds.includes('door') && doors.some((d) => x1 > d.x0 - 2 && x0 < d.x1 + 2)) || (kinds.includes('lamp') && lamps.some((l) => x1 > l - 9 && x0 < l + 9)) || (kinds.includes('tree') && plan.trees.some((t) => x1 > t.x - t.r - 6 && x0 < t.x + t.r + 6)) || (kinds.includes('furn') && plan.furniture.some((f) => x1 > f.x - 3 && x0 < f.x + f.w + 3)) || (kinds.includes('shopdoor') && shopDoors.some((s) => (x1 > s.x0 - 2 && x0 < s.x0 + 8) || (x1 > s.x1 - 8 && x0 < s.x1 + 2))) || out.some((v) => v.x0 !== undefined && x1 > v.x0 - 3 && x0 < v.x1 + 3);
  // 1. Alignement d'arbres en fosse à la bordure.
  const rng = rngOf(seed, 'rue-arbres');
  for (let x = 30 + rng() * 50; x < W - 20; x += 70 + rng() * 40) {
    let placed = false;
    for (let k = 0; k < 7 && !placed; k++) {
      const px = x + (k % 2 ? -1 : 1) * Math.ceil(k / 2) * 7;
      if (busy(px - 6, px + 6, ['door', 'lamp', 'tree', 'furn', 'shopdoor'])) continue;
      const roll = rng(), young = roll < 0.14, empty = roll >= 0.14 && roll < 0.22, species = pick(SPECIES, rng);
      const h = (young ? 13 : 34 + rng() * 18) * u, r = (young ? 4 + rng() * 1.5 : 16 + rng() * 8) * u, lean = (rng() - 0.5) * 2;
      out.push({ kind: 'pit', x: px, x0: px - 5, x1: px + 5, y: curb - 1.4, empty, young, species, h, r, lean, flowers: !empty && rng() < 0.45, flowerSeed: rng() * 1000 });
      placed = true;
    }
  }
  // 2. Bacs de trottoir devant une vitrine (jamais devant la porte du local), 40 % des locaux ; 3. parterre au pied d'un immeuble sans commerce.
  const rb = rngOf(seed, 'rue-bacs');
  for (const s of shopDoors) {
    if (rb() > 0.4 || s.x1 - s.x0 < 30) continue;
    const n = 1 + Math.floor(rb() * 2), left = rb() < 0.5;
    for (let i = 0; i < n; i++) { const w = 6 + rb() * 3, bx = left ? s.x0 + 9 + i * (w + 3) : s.x1 - 9 - w - i * (w + 3); if (!busy(bx, bx + w, ['door', 'furn'])) out.push({ kind: 'bac', x0: bx, x1: bx + w, y: ground + 0.5, w, h: 3 + rb(), tall: rb() < 0.3, flowerSeed: rb() * 1000 }); }
  }
  for (const b of F.near) {
    if (b.x < 0 || b.x + b.w > W) continue;
    const inShop = plan.blocked.some((s) => s.x1 - s.x0 > 20 && b.x + b.w / 2 > s.x0 && b.x + b.w / 2 < s.x1);
    if (inShop || rb() > 0.5) continue;
    const w = Math.min(22, b.w * 0.45), bx = b.x + (rb() < 0.5 ? 2 : b.w - w - 2);
    if (!busy(bx, bx + w, ['door', 'furn', 'tree'])) out.push({ kind: 'parterre', x0: bx, x1: bx + w, y: ground + 0.3, w, h: 3.5, flowerSeed: rb() * 1000, hedge: rb() < 0.5 });
  }
  // 4. Grimpantes sur l'arête d'une façade (15 %), 5. pots devant une porte (30 %), 6. herbe entre les pavés, 7. feuilles mortes (saison).
  const rg = rngOf(seed, 'rue-grimpantes');
  for (const b of F.near) if (b.x >= 0 && b.x + b.w <= W && rg() < 0.15) { const left = rg() < 0.5; out.push({ kind: 'grimpante', x: left ? b.x + 1.5 : b.x + b.w - 1.5, top: Math.max(b.top + b.look.roofH + 8, ground - 30 - (6 + rg() * 30)), bottom: ground, plant: rg() < 0.5 ? 'glycine' : 'vigne', flowerSeed: rg() * 1000 }); }
  const rp = rngOf(seed, 'rue-pots');
  for (const d of plan.doors) if (rp() < 0.3) out.push({ kind: 'pots', x: d.x, both: rp() < 0.5, flowerSeed: rp() * 1000 });
  const rh = rngOf(seed, 'rue-herbe');
  for (let x = 10 + rh() * 30; x < W; x += 30 + rh() * 45) out.push({ kind: 'herbe', x, y: curb + 0.8 + rh() * 1.6, n: 2 + Math.floor(rh() * 3) });
  return out;
}

// ── peinture (calendrier réel : foliageOf / bloomOf / bedState / leavesOnGround, brume nulle : premier plan) ──
// Modèle d'un arbre de rue (squelette fixe : fût = v.h, ramure = 2 × r, 4 niveaux, ≤ 60 touffes de rayon 0,2 r).
const rueModel = (v) => treeModelOf('rue' + Math.round(v.x), v.species, { x: v.x, y: v.y }, v.h, v.r * 2.0, v.young ? 3 : 4, v.r * (v.young ? 0.3 : 0.2), v.young ? 20 : 60, v.young ? 0.7 : 1.3 + v.r * 0.07);
const rueBark = (v) => hexRgb(BARK[v.young ? 'jeune' : v.species]);
function paintTuteur(ctx, v) { if (!v.young) return; const { x, y } = v; ctx.strokeStyle = '#8A7A5A'; ctx.lineWidth = 0.7; ctx.beginPath(); ctx.moveTo(x + 2.2, y); ctx.lineTo(x + 2.2, y - v.h * 0.7); ctx.stroke(); ctx.strokeStyle = INK; ctx.lineWidth = 0.5; ctx.beginPath(); ctx.moveTo(x - 0.5, y - v.h * 0.5); ctx.lineTo(x + 2.5, y - v.h * 0.55); ctx.stroke(); }
// Fleurs d'un pied d'arbre, d'un bac ou d'un parterre d'après l'état des parterres (bedState) : pousses, fleurs, fanées, sol nu.
function paintFlowersRow(ctx, x0, x1, y, D, seedF, dense = 1) {
  const st = bedState(D), r = mulberry32(Math.floor(seedF * 1000));
  if (st.kind === 'bare') { fillRect(ctx, '#7A6450', x0, y - 0.6, x1 - x0, 1); return; }
  if (D.meteo.snow) { fillRect(ctx, '#F0F4F8', x0, y - 1, x1 - x0, 1.2); return; }
  const cols = FLOWERS[st.kind];
  for (let x = x0 + 0.8; x < x1 - 0.6; x += (1.3 + r() * 0.9) / dense) {
    const c = hexRgb(pick(cols, r)), tall = st.kind === 'spring' || (st.kind === 'summer' && r() < 0.4), faded = r() < st.faded;
    if (st.kind === 'winter') { if (r() < 0.6) disc(ctx, c, x, y - 0.6, 0.55); else fillRect(ctx, '#6A5A4A', x - 0.5, y - 0.5, 1, 0.6); continue; }
    if (st.kind === 'spring' && r() < st.shoots) { fillRect(ctx, '#5E9A4A', x - 0.15, y - 1.2, 0.3, 1.2); continue; }
    if (r() > st.bloom) { disc(ctx, hexRgb('#3F8A3A'), x, y - 0.3, 0.6); continue; }
    const fc = faded ? mixRgb(c, hexRgb('#8A6A50'), 0.6) : c, leaf = faded ? hexRgb('#7A8A50') : hexRgb('#3F8A3A');
    disc(ctx, shade(leaf, 0.2), x, y - 0.2, 0.7); if (tall) { fillRect(ctx, rgba(leaf, 1), x - 0.15, y - 2.2, 0.3, 2); disc(ctx, fc, x + (faded ? 0.4 : 0), y - (faded ? 1.8 : 2.4), 0.6); } else disc(ctx, fc, x - 0.2, y - 0.9, 0.55);
  }
}
function paintRueVerdure(ctx, F, env) {
  const D = env.D, { ground } = F, curb = F.plan.curb, items = F.rue, winter = D.doy >= 330 || D.doy < 84;
  // Feuilles mortes sur le trottoir et à la bordure : accumulation depuis le dernier balayage (tirage par position).
  const leaves = leavesOnGround(D, env.T, F.seed);
  if (leaves > 0) { const r = rngOf(F.seed, 'rue-feuilles'); const pits = items.filter((v) => v.kind === 'pit' && !v.empty && !v.young), n = Math.round(leaves * 3600); for (let i = 0; i < n; i++) { const underTree = r() < 0.6 && pits.length, x = underTree ? pits[Math.floor(r() * pits.length)].x + (r() - 0.5) * 70 : r() * W, near = r() < 0.5, y = near ? curb - 3 + r() * 3 : ground + 1 + r() * (curb - ground - 1.5); fillRect(ctx, pick(['#C87A2A', '#E0A040', '#A85A30', '#D8B050', '#B86A28'], r), x, y, 1.2 + r() * 0.8, 0.8); } }
  for (const v of items) {
    if (v.kind === 'herbe') { ctx.strokeStyle = winter ? '#7A8A68' : '#5E9A50'; ctx.lineWidth = 0.5; ctx.beginPath(); for (let i = 0; i < v.n; i++) { ctx.moveTo(v.x + i * 1.2, v.y + 1); ctx.lineTo(v.x + i * 1.2 + (i % 2 ? 0.6 : -0.5), v.y - 1.2 - (i % 3) * 0.4); } ctx.stroke(); continue; }
    if (v.kind === 'pots') { for (const dx of v.both ? [-3.5, 13.5] : [13.5]) { const px = v.x + dx; fillRect(ctx, hexRgb('#A04A2E'), px, ground - 1.8, 2.4, 2.4); fillRect(ctx, shade(hexRgb('#A04A2E'), 0.35), px + 1.6, ground - 1.8, 0.8, 2.4); inkRectLine(ctx, px, ground - 1.8, 2.4, 2.4); disc(ctx, hexRgb('#3F8A3A'), px + 1.2, ground - 2.6, 1.3); disc(ctx, hexRgb('#56A844'), px + 0.8, ground - 3, 0.8); paintFlowersRow(ctx, px - 0.2, px + 2.6, ground - 2.6, D, v.flowerSeed, 1.4); } continue; }
    if (v.kind === 'bac' || v.kind === 'parterre') {
      const { x0, w, h, y } = v, wood = v.kind === 'bac' ? hexRgb(v.tall ? '#5A4A3E' : '#8A6A48') : hexRgb('#A09080');
      fillRect(ctx, 'rgba(70,50,130,0.2)', x0 + 1, y + h, w + 1.5, 1.2);
      fillRect(ctx, wood, x0, y, w, h); fillRect(ctx, shade(wood, 0.35), x0 + w * 0.75, y, w * 0.25, h); fillRect(ctx, light(wood, 0.4), x0, y, w, 0.6); inkRectLine(ctx, x0, y, w, h);
      if (v.kind === 'parterre' && v.hedge) { ctx.fillStyle = '#3F8A3A'; for (let x = x0 + 1; x < x0 + w - 0.5; x += 1.6) { ctx.beginPath(); ctx.arc(x, y - 0.4, 1.1, 0, TAU); ctx.fill(); } ctx.fillStyle = '#56A844'; for (let x = x0 + 0.6; x < x0 + w - 0.5; x += 1.6) { ctx.beginPath(); ctx.arc(x, y - 0.9, 0.7, 0, TAU); ctx.fill(); } if (D.meteo.snow) fillRect(ctx, '#F0F4F8', x0 + 0.5, y - 1.8, w - 1, 0.9); }
      else { fillRect(ctx, winter ? hexRgb('#6A5A4A') : hexRgb('#2E6E34'), x0 + 0.4, y - 0.8, w - 0.8, 1.2); paintFlowersRow(ctx, x0, x0 + w, y - 0.6, D, v.flowerSeed, v.tall ? 0.8 : 1); if (v.tall) { const f = foliageOf(D, 'bac' + x0, 'bouquet'); fillRect(ctx, hexRgb('#3F8A3A'), x0 + w / 2 - 0.3, y - 7, 0.6, 7); if (f.d > 0.1) { disc(ctx, rgba(f.tones[0], 1), x0 + w / 2, y - 7.5, 2.2 * (0.6 + 0.4 * f.d)); disc(ctx, rgba(f.tones[1], 1), x0 + w / 2 - 0.6, y - 8, 1.4 * (0.6 + 0.4 * f.d)); } } }
      continue;
    }
    if (v.kind === 'grimpante') {
      const gly = v.plant === 'glycine', f = foliageOf(D, 'gr' + v.x, gly ? 'glycine' : 'vigne'), bare = f.d <= 0.1;
      const red = !gly ? bloomOf(D, 'vigne') : 0, tones = red > 0 ? [mixRgb(f.tones[0], hexRgb('#A82A1E'), red), mixRgb(f.tones[1], hexRgb('#E04A30'), red)] : f.tones;
      ctx.strokeStyle = '#5A4A3A'; ctx.lineWidth = 0.9; ctx.beginPath(); ctx.moveTo(v.x, v.bottom); ctx.quadraticCurveTo(v.x + 2, (v.top + v.bottom) / 2, v.x - 1, v.top); ctx.stroke();
      const r = mulberry32(Math.floor(v.flowerSeed * 1000)), span = v.bottom - v.top, leaves = [];
      for (let y = v.bottom - 1.5; y > v.top; y -= 1.3 + r() * 1.2) { const q = (y - v.top) / span, n = q > 0.5 ? 2 + Math.floor(r() * 2) : 1; for (let i = 0; i < n; i++) leaves.push({ x: v.x + (r() - 0.5) * (2 + q * 10), y, rr: ((bare ? 0.35 : 1.1) + r() * (bare ? 0.25 : 1.4) * (0.5 + q)) * (bare ? 1 : 0.6 + 0.4 * f.d) }); }
      ctx.strokeStyle = '#5A4A3A'; ctx.lineWidth = bare ? 0.45 : 0.5; ctx.beginPath(); for (let i = 0; i < leaves.length; i += bare ? 1 : 3) { ctx.moveTo(v.x, leaves[i].y + 1); ctx.lineTo(leaves[i].x, leaves[i].y); } ctx.stroke();
      if (!bare) { ctx.strokeStyle = INK; ctx.lineWidth = 0.7; ctx.beginPath(); for (const l of leaves) { ctx.moveTo(l.x + l.rr, l.y); ctx.arc(l.x, l.y, l.rr, 0, TAU); } ctx.stroke(); }
      for (let t = 0; t < 2; t++) { ctx.fillStyle = rgba(tones[t], 1); ctx.globalAlpha = bare ? 0.6 : 1; ctx.beginPath(); for (const l of leaves) { const rr = l.rr * (1 - t * 0.4); ctx.moveTo(l.x - t * 0.4 + rr, l.y - t * 0.4); ctx.arc(l.x - t * 0.4, l.y - t * 0.4, rr, 0, TAU); } ctx.fill(); ctx.globalAlpha = 1; }
      const blg = gly ? bloomOf(D, 'glycine') : 0;
      if (blg > 0) { for (const l of leaves) if (r() < 0.45 * blg + 0.1) { ctx.fillStyle = '#9A78C8'; ctx.fillRect(l.x - 0.4, l.y + l.rr * 0.6, 0.8, (2 + r() * 2) * blg); ctx.fillStyle = '#B898E0'; ctx.fillRect(l.x - 0.2, l.y + l.rr * 0.6, 0.4, 1.2 * blg); } }
      continue;
    }
    if (v.kind === 'pit') {
      const { x, y } = v;
      fillRect(ctx, '#4A4238', x - PIT.w / 2, y - PIT.h / 2, PIT.w, PIT.h); ctx.strokeStyle = '#8A8070'; ctx.lineWidth = 0.35; ctx.beginPath(); for (let k = -3; k <= 3; k++) { ctx.moveTo(x + k * 1.1, y - PIT.h / 2 + 0.3); ctx.lineTo(x + k * 1.1, y + PIT.h / 2 - 0.3); } ctx.moveTo(x - PIT.w / 2 + 0.3, y); ctx.lineTo(x + PIT.w / 2 - 0.3, y); ctx.stroke();
      if (v.empty) { fillRect(ctx, '#7A6450', x - 1.2, y - 0.8, 2.4, 1.6); continue; }
      if (v.flowers) paintFlowersRow(ctx, x - 3.4, x + 3.6, y + 0.4, D, v.flowerSeed, 1.3);
      const trunkH = v.h;
      if (D.meteo.wet) { ctx.fillStyle = 'rgba(60,70,110,0.22)'; ctx.beginPath(); ctx.ellipse(x + 1, y + 1.4, 5 + v.r * 0.15, 1.3, 0, 0, TAU); ctx.fill(); ctx.fillStyle = 'rgba(200,220,240,0.25)'; ctx.beginPath(); ctx.ellipse(x - 0.5, y + 1.1, 2.5, 0.5, 0, 0, TAU); ctx.fill(); }
      ctx.fillStyle = 'rgba(70,50,130,0.26)'; ctx.beginPath(); ctx.moveTo(x - 1, y); ctx.lineTo(x + 1.4, y); ctx.lineTo(x + 1.4 + trunkH * 0.22, y + 1.8); ctx.lineTo(x - 1 + trunkH * 0.22, y + 1.8); ctx.closePath(); ctx.fill();
      // Tronc et houppier : sprites cuits et cisaillés par le vent (04a-vent.js), sauf si la scène est rendue sans vent.
      if (!F.animTrees) { const m = rueModel(v); paintTreeStatic(ctx, m, foliageOf(D, 'rue' + Math.round(x), v.species), D, { bark: rueBark(v), shadow: true, veil: 0.2, young: v.young }); paintTuteur(ctx, v); }
    }
  }
}
function inkRectLine(ctx, x, y, w, h) { ctx.strokeStyle = INK; ctx.lineWidth = 0.6; ctx.strokeRect(x, y, w, h); }
// Lumière de nuit : les houppiers proches d'un lampadaire allumé prennent un lavis chaud (dessous du houppier, côté lampe).
function paintLightsRue(ctx, F, env) {
  if (!env.dark) return;
  const lamps = lampsFor(W, F.seed);
  for (const v of F.rue) if (v.kind === 'pit' && !v.empty) for (const l of lamps) {
    const d = Math.abs(l.x - v.x); if (d > 40 || !lampLit(l, env.minutes, env.daylight)) continue;
    const cy = v.y - v.h - v.r * 0.75, k = (1 - d / 40) * 0.35 * env.night; ctx.fillStyle = `rgba(255,214,140,${k.toFixed(3)})`;
    ctx.beginPath(); ctx.ellipse(v.x + v.lean + Math.sign(l.x - v.x) * v.r * 0.3, cy + v.r * 0.35, v.r * 0.8, v.r * 0.5, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = `rgba(255,214,140,${(k * 0.7).toFixed(3)})`; ctx.fillRect(v.x - 1.5, v.y - v.h, 3, v.h);
  }
}
