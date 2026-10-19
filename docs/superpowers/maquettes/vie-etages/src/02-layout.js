// ───────────── mise en page des façades (chantier 1, + foyers) ─────────────
// force = { kind, stair, tabatiere } : impose un type pour l'immeuble « héros » (mêmes tirages, déterministe).
function facadeLayout(b, ground, seed, force = {}) {
  const rng = mulberry32(seed ^ hashString('facade') ^ Math.round(b.x * 8));
  const kind = force.kind || (b.w >= 56 && b.h >= 120 && rng() < 0.78 ? 'haussmann' : 'faubourg');
  const top = ground - b.h;
  const roof = kind === 'haussmann'
    ? { kind: 'mansard', h: clamp(Math.round(b.h * 0.12), 14, 20), zinc: pick(ZINCS, rng), terrasson: 4 }
    : rng() < 0.55 ? { kind: 'zinc', h: 11, zinc: pick(ZINCS, rng) } : { kind: 'tile', h: 12, tile: pick(TILES, rng) };
  const eave = top + roof.h;
  const nBays = clamp(Math.round((b.w - 6) / (kind === 'haussmann' ? 17 : 15)), 2, 5);
  const pitch = b.w / nBays;
  const winW = clamp(Math.round(pitch * 0.42 * 2) / 2, 5, 8);
  const bayX = (i) => b.x + pitch * (i + 0.5);
  const entresol = kind === 'haussmann' && b.h >= 150 && rng() < 0.6 ? 11 : 0;
  const avail = b.h - roof.h - GF - entresol;
  let n = clamp(Math.round(avail / (kind === 'haussmann' ? 17 : 14.5)), 1, 7);
  let floors;
  for (;;) {
    const weights = Array.from({ length: n }, (_, i) => (kind === 'haussmann' && n >= 3 && i === 0 ? 1.25 : n >= 3 && i === n - 1 ? 0.85 : 1));
    const sum = weights.reduce((a, v) => a + v, 0);
    floors = weights.map((wgt) => (avail * wgt) / sum);
    if (Math.min(...floors) >= MIN_FLOOR || n === 1) break;
    n--;
  }
  const floorsBottom = ground - GF - entresol;
  let y = floorsBottom;
  const levels = floors.map((fh, i) => {
    y -= fh;
    const level = kind === 'haussmann' && n >= 3 && i === 0 ? 'noble' : i === n - 1 && n >= 3 ? 'top' : 'std';
    const balcony = level === 'noble' ? 'filant' : level === 'top' && kind === 'haussmann' && n >= 4 ? 'filant' : kind === 'haussmann' && rng() < 0.6 ? 'balconnet' : 'none';
    return { y, h: fh, level, balcony, idx: i };
  });
  if (entresol) levels.unshift({ y: floorsBottom, h: entresol, level: 'entresol', balcony: 'none', idx: -1 });
  const doorBay = rng() < 0.5 ? 0 : nBays - 1;
  const stairBay = force.stair ? doorBay : nBays >= 4 && rng() < 0.65 ? doorBay : -1;
  const shutters = kind === 'faubourg' ? pick(['#8FA88C', '#6A7A9A', '#B8705A', '#7A8A6A'], rng) : null;
  const persienne = kind === 'haussmann' ? pick(PERSIENNES, rng) : null;
  const windows = [];
  for (const lv of levels) {
    for (let i = 0; i < nBays; i++) {
      const french = lv.level === 'noble' || lv.balcony === 'filant';
      if (i === stairBay && lv.level !== 'entresol') {
        const sw = Math.max(3, winW - 2.5), sh = clamp(lv.h * 0.4, 4, 7);
        windows.push({ bay: i, level: lv, kind: 'stair', x: bayX(i) - sw / 2, y: lv.y + lv.h * 0.78 - sh / 2, w: sw, h: sh });
        continue;
      }
      const wh = lv.level === 'entresol' ? clamp(lv.h * 0.5, 4, 6) : french ? lv.h * 0.72 : lv.level === 'top' ? lv.h * 0.56 : lv.h * 0.62;
      const wy = french ? lv.y + lv.h - wh - 0.5 : lv.y + (lv.h - wh) * 0.42;
      windows.push({ bay: i, level: lv, kind: lv.level === 'entresol' ? 'entresol' : french ? 'french' : 'std', x: bayX(i) - winW / 2, y: wy, w: winW, h: wh });
    }
  }
  // Logements : 2 ou 3 travées voisines ; pièces (cuisine / chambre / salon) ; foyer.
  const homes = [];
  const liveBays = Array.from({ length: nBays }, (_, i) => i).filter((i) => i !== stairBay);
  for (const lv of levels) {
    if (lv.level === 'entresol') { homes.push({ level: lv, bays: liveBays.slice(), rooms: liveBays.map(() => 'bureau'), tone: 'cream', curtain: null, props: [], hh: null }); continue; }
    for (const g of splitBays(liveBays, rng)) {
      const r = rng();
      const rooms = g.length === 1 ? ['salon'] : g.length === 2 ? ['cuisine', 'salon'] : ['cuisine', 'chambre', 'salon'];
      homes.push({ level: lv, bays: g, rooms, tone: r < 0.5 ? 'warm' : r < 0.78 ? 'cream' : 'orange',
        curtain: rng() < 0.75 ? { color: pick(CURTAINS, rng), style: rng() < 0.4 ? 'voile' : 'side' } : null,
        props: g.map(() => (rng() < 0.45 ? pick(['lamp', 'plant', 'shelf', 'lamp'], rng) : null)),
        balcony: lv.balcony === 'filant', floorIdx: lv.idx, hh: null, u: rng() });
    }
  }
  const dormers = dormersFor(roof, nBays, stairBay, bayX, winW, top, rng);
  if (force.tabatiere && roof.kind === 'mansard' && !dormers.some((d) => d.type === 'tabatiere')) dormers.push({ type: 'tabatiere', cx: bayX(1) + 3, y: top + 1 });
  const chimneys = [b.x + 4 + rng() * 3];
  if (b.w > 70 || rng() < 0.3) chimneys.push(b.x + b.w - 8 - rng() * 3);
  const wall = kind === 'haussmann' ? pick(STONES, rng) : pick(PLASTERS, rng);
  const f = { ...b, kind, top, eave, roof, nBays, pitch, winW, bayX, levels, windows, homes, dormers, chimneys, wall, doorBay, stairBay, shutters, persienne, entresol, ground, seedRng: rng() };
  for (const hm of homes) if (hm.level.level !== 'entresol') { hm.hh = householdFor(hm, f, rng); hm.climb = (0.35 + hm.floorIdx * 0.22) * MIN; }
  return f;
}
function splitBays(bays, rng) {
  const n = bays.length;
  if (n <= 3) return [bays.slice()];
  if (n === 4) return [bays.slice(0, 2), bays.slice(2)];
  return rng() < 0.5 ? [bays.slice(0, 2), bays.slice(2)] : [bays.slice(0, 3), bays.slice(3)];
}
function dormersFor(roof, nBays, stairBay, bayX, winW, top, rng) {
  const out = [];
  if (roof.kind === 'mansard') {
    const main = rng() < 0.6 ? 'fronton-tri' : 'fronton-cintre';
    const brisisTop = top + roof.terrasson;
    for (let i = 0; i < nBays; i++) {
      if (i === stairBay) { if (rng() < 0.5) out.push({ type: 'oeil', cx: bayX(i), y: brisisTop + (roof.h - roof.terrasson) * 0.5 }); continue; }
      const r = rng();
      if (r < 0.5) out.push({ type: main, cx: bayX(i), w: winW + 1, y: brisisTop + 2, h: roof.h - roof.terrasson - 3 });
      else if (r < 0.7) out.push({ type: 'oeil', cx: bayX(i), y: brisisTop + (roof.h - roof.terrasson) * 0.5 });
    }
    if (!out.some((d) => d.type !== 'oeil')) { const i = Math.floor(nBays / 2); out.push({ type: main, cx: bayX(i), w: winW + 1, y: brisisTop + 2, h: roof.h - roof.terrasson - 3 }); }
    if (rng() < 0.5) { const i = Math.floor(rng() * nBays); out.push({ type: 'tabatiere', cx: bayX(i) + 3, y: top + 1 }); }
  } else {
    const mid = clamp(Math.round(0.42 * nBays - 0.5), 0, nBays - 1);
    const i = clamp(mid + (rng() < 0.5 ? 0 : 1), 0, nBays - 1);
    if (rng() < 0.7) out.push({ type: 'capucine', cx: bayX(i), w: winW - 1, y: top + 3, h: roof.h - 5 });
    if (rng() < 0.6) { let j = (i + 1 + Math.floor(rng() * (nBays - 1))) % nBays; out.push({ type: 'tabatiere', cx: bayX(j), y: top + 2 }); }
  }
  return out;
}
const LIT_KEYS = [[0, 0.22], [1, 0.08], [2, 0.03], [4, 0.01], [6, 0.2], [7, 0.45], [8, 0.5], [10, 0.25], [16, 0.25], [18, 0.5], [20, 0.8], [21, 0.85], [22, 0.65], [23, 0.4], [24, 0.22]];
function litFraction(hour) { for (let i = 1; i < LIT_KEYS.length; i++) { const [h1, a1] = LIT_KEYS[i], [h0, a0] = LIT_KEYS[i - 1]; if (hour <= h1) return a0 + ((a1 - a0) * (hour - h0)) / (h1 - h0); } return 0.22; }

// ───────────── foyers ─────────────
// Types : couple, famille, retraite, etudiant, coloc, solo. Chaque membre = { size, shirt, pants, skin }.
function member(rng, size = 1) { return { size, shirt: pick(SHIRTS, rng), pants: pick(PANTS, rng), skin: pick(SKINS, rng) }; }
function householdFor(home, f, rng) {
  const r = rng();
  let type = r < 0.25 ? 'couple' : r < 0.45 ? 'famille' : r < 0.63 ? 'retraite' : r < 0.75 ? 'etudiant' : r < 0.85 ? 'coloc' : 'solo';
  if (home.bays.length === 1 && (type === 'famille' || type === 'coloc')) type = 'etudiant';
  return makeHousehold(type, rng);
}
function makeHousehold(type, rng) {
  const members = [];
  if (type === 'couple') members.push(member(rng), member(rng));
  else if (type === 'famille') { members.push(member(rng), member(rng), member(rng, 0.62)); if (rng() < 0.5) members.push(member(rng, 0.7)); }
  else if (type === 'retraite') { members.push(member(rng, 0.94)); if (rng() < 0.6) members.push(member(rng, 0.94)); }
  else if (type === 'etudiant') members.push(member(rng, 0.97));
  else if (type === 'coloc') { members.push(member(rng), member(rng)); if (rng() < 0.6) members.push(member(rng)); }
  else members.push(member(rng));
  return { type, members, jitter: rng() * 0.6, jitter2: rng() * 1.2, smoker: rng() < 0.4, sapin: rng() < (type === 'famille' ? 0.7 : 0.3), seed: Math.floor(rng() * 1e9), tone: pick(['warm', 'warm', 'cream', 'orange'], rng), late: rng() < 0.5 };
}
