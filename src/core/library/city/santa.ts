import type { HillHouse } from '../paint/city-plan';
import { WORLD_MARGIN, hashString, mulberry32 } from '../scene-world';

// Père Noël (vague 1b-ii-a) : le soir du 24 décembre, un traîneau passe toutes les 15 minutes d'horloge murale. Le passage
// (décalage dans la tranche, sens, hauteur, livraison ou non) est tiré de (graine de la pièce, numéro de tranche) : le même
// dans toutes les fenêtres et après un rechargement. Moteur pur et sans état ; ne pas importer `events.ts` (il importe ce fichier).
export const SANTA_PERIOD_S = 900;
export const SANTA_WINDOW_S = 75;
// Même seuil de nuit que `DARK` de events.ts (un test le vérifie) : copié ici pour éviter un import circulaire.
export const SANTA_DARK = 0.3;
// Marge (px) de chaque côté d'un toit : le traîneau ne se pose pas sur un immeuble coupé par le bord de la scène.
const ROOF_EDGE = 40;
const ROOF_MIN_WIDTH = 30;

export type SantaPass = { tranche: number; start: number; end: number; deliver: boolean; dir: 1 | -1; skyY: number; roofRoll: number };
export type SantaRoof = { cx: number; y: number; w: number; lamp: { x: number; y: number } | null };
export type SantaPose = { x: number; y: number; dir: 1 | -1; landed: boolean; santa: 'aboard' | 'walking' | 'hidden'; windowLit: boolean };
type SantaFacade = { x: number; w: number; h: number; far: boolean; lamps: readonly { x: number; y: number }[] };

// Actif la nuit de la fête seulement (rien le 24 de jour, ni par un ciel clair de l'aube).
export const santaOn = (fests: readonly string[], daylight: number): boolean => fests.includes('christmas-eve') && daylight < SANTA_DARK;

export function santaPassFor(tranche: number, seed: number): SantaPass {
  const rng = mulberry32(seed ^ hashString('santa') ^ Math.imul(tranche + 1, 2654435761));
  // Toujours le même nombre de tirages, dans cet ordre.
  const offset = rng();
  const deliverRoll = rng();
  const dirRoll = rng();
  const yRoll = rng();
  const roofRoll = rng();
  const start = tranche * SANTA_PERIOD_S + offset * (SANTA_PERIOD_S - SANTA_WINDOW_S);
  return { tranche, start, end: start + SANTA_WINDOW_S, deliver: deliverRoll < 1 / 3, dir: dirRoll < 0.5 ? 1 : -1, skyY: 0.08 + yRoll * 0.12, roofRoll };
}

// Fenêtres de passage qui chevauchent [t0, t1) (une fenêtre reste dans sa tranche).
export function santaWindowsIn(t0: number, t1: number, seed: number): { start: number; end: number }[] {
  const out: { start: number; end: number }[] = [];
  for (let n = Math.floor(t0 / SANTA_PERIOD_S); n <= Math.floor(t1 / SANTA_PERIOD_S); n++) {
    const { start, end } = santaPassFor(n, seed);
    if (start < t1 && t0 < end) out.push({ start, end });
  }
  return out;
}

// Toit d'atterrissage : un immeuble de la rangée proche, assez large et visible en entier. La fenêtre qui s'allume est l'une
// des trois plus hautes de l'immeuble (tirage recomposé depuis `roofRoll`, sans nouveau tirage).
export function santaRoof(pass: SantaPass, facades: readonly SantaFacade[], ground: number, width: number): SantaRoof | null {
  const candidates = facades.filter((b) => !b.far && b.w >= ROOF_MIN_WIDTH && b.x + b.w / 2 >= ROOF_EDGE && b.x + b.w / 2 <= width - ROOF_EDGE);
  if (candidates.length === 0) return null;
  const scaled = pass.roofRoll * candidates.length;
  const index = Math.min(candidates.length - 1, Math.floor(scaled));
  const b = candidates[index]!;
  const highest = [...b.lamps].sort((p, q) => p.y - q.y).slice(0, 3);
  const lamp = highest.length === 0 ? null : highest[Math.min(highest.length - 1, Math.floor((scaled - index) * highest.length))]!;
  return { cx: b.x + b.w / 2, y: ground - b.h, w: b.w, lamp: lamp ? { x: lamp.x, y: lamp.y } : null };
}

const ease = (u: number): number => u * u * (3 - 2 * u);
const lerp = (a: number, b: number, u: number): number => a + (b - a) * u;

// Pose à l'instant `t` (secondes), ou null hors fenêtre. Livraison : approche, posé, le père Noël marche (traîneau posé),
// disparaît derrière la cheminée (fenêtre allumée), revient, remonte à bord, puis le traîneau repart. Sans toit, repli en
// passage simple.
export function santaPoseAt(pass: SantaPass, roof: SantaRoof | null, t: number, width: number, height: number): SantaPose | null {
  const p = (t - pass.start) / SANTA_WINDOW_S;
  if (p < 0 || p >= 1) return null;
  const { dir } = pass;
  const entry = dir > 0 ? -WORLD_MARGIN : width + WORLD_MARGIN;
  const exit = dir > 0 ? width + WORLD_MARGIN : -WORLD_MARGIN;
  const sky = pass.skyY * height;
  if (!pass.deliver || roof === null) {
    return { x: lerp(entry, exit, p), y: sky + 4 * Math.sin(p * 6 * Math.PI), dir, landed: false, santa: 'aboard', windowLit: false };
  }
  const posed = (santa: SantaPose['santa'], windowLit = false): SantaPose => ({ x: roof.cx, y: roof.y, dir, landed: true, santa, windowLit });
  if (p < 0.25) {
    const e = ease(p / 0.25);
    return { x: lerp(entry, roof.cx, e), y: lerp(sky, roof.y, e), dir, landed: false, santa: 'aboard', windowLit: false };
  }
  if (p < 0.3) return posed('aboard');
  if (p < 0.4) return posed('walking');
  if (p < 0.6) return posed('hidden', true);
  if (p < 0.7) return posed('walking');
  if (p < 0.75) return posed('aboard');
  const e = ease((p - 0.75) / 0.25);
  return { x: lerp(roof.cx, exit, e), y: lerp(roof.y, sky - 10, e), dir, landed: false, santa: 'aboard', windowLit: false };
}

// Pas du père Noël posé sur un toit (repère du dessin du traîneau, tourné vers +x, pieds à y = 0 au niveau du toit), pour
// les deux styles : il ne saute plus de sa place au bout du toit et ne s'efface pas sur place. Aller (tranche « walking »
// d'avant la livraison) : demi-tour vers le dossier, enjambe le traîneau en grimpant, demi-tour, quelques pas avec la hotte,
// demi-tour face à la cheminée, descend dedans (rogné au toit par le calque) ; retour : l'inverse, puis se retourne vers
// l'attelage. `yaw` : orientation dans le repère du dessin (0 vers les rennes, 8 vers l'arrière, 12 de dos) ; le calque la
// retourne avec le sens du traîneau ; les demi-tours passent par le plus court (0 → 12 par 15, 14, 13). `dist` : chemin
// parcouru (unités du dessin), qui fait avancer les pas.
export type SantaStep = { x: number; y: number; yaw: number; gait: 'stand' | 'step' | 'walk' | 'climb'; dist: number };
type Pt = { x: number; y: number };
// Place à bord (pieds au fond de la caisse), pied du traîneau derrière le dossier, bouche de la cheminée, profondeur où il
// est entièrement descendu (hauteur du pantin ≈ 26 unités du dessin, hotte comprise).
export const SANTA_SEAT: Pt = { x: -5, y: -4 };
const BEHIND: Pt = { x: -23, y: 0 };
const HOLE: Pt = { x: -31, y: 0 };
// Le dessin posé est recentré de LANDED_DX sur le toit (santa-sprite) ; marge (px) gardée au bord du toit.
const LANDED_DX = -14;
const ROOF_MARGIN = 3;
export const SANTA_SUNK = 34;
// Durées (s) : demi-tour (TURN_S de figure/gait.ts, recopié pour garder ce moteur sans dépendance), enjambée, pas, descente.
const TURN = 0.45;
const OVER = 1.4;
const WALK = 0.8;
const SINK = 3;
// Hauteur de l'enjambée au-dessus de la ligne droite (unités).
const ARC = 9;
type Seg = { d: number; a: Pt; b: Pt; yaw: readonly [number, number]; gait: SantaStep['gait']; arc?: number };
const seg = (d: number, a: Pt, b: Pt, yaw: readonly [number, number], gait: SantaStep['gait'], arc?: number): Seg => ({ d, a, b, yaw, gait, arc });
// Côté avant (toit trop court derrière) : pied du traîneau juste devant la caisse (qui va jusqu'à x = 13), cheminée 8
// unités plus loin, comme à l'arrière.
const AHEAD: Pt = { x: 16, y: 0 };
const AHEAD_HOLE: Pt = { x: 24, y: 0 };
const mod16 = (y: number): number => ((y % 16) + 16) % 16;
// Demi-tour de `from` vers `to` noté pour passer par le plus court (interpolé puis ramené dans 0–15).
const turn = (from: number, to: number): readonly [number, number] => {
  const d = mod16(to - from);
  return [from, d > 8 ? from + d - 16 : from + d];
};
// Chemin sur le toit, dans le repère du dessin : le toit va de cx − w/2 à cx + w/2, soit de −w/2 − LANDED_DX à
// w/2 − LANDED_DX (le retournement selon le sens est symétrique autour de cx), marge comprise. Chemin d'origine derrière
// le traîneau s'il y tient ; sinon devant la caisse (côté le plus long : le dessin posé est décalé vers l'arrière), pour
// toujours marcher quelques pas hors de la caisse ; sur un toit trop étroit même pour cela, ramené au point le plus proche
// du toit (il ne marche jamais dans le vide).
function scriptFor(w: number): { out: readonly Seg[]; back: readonly Seg[] } {
  const lo = -w / 2 - LANDED_DX + ROOF_MARGIN;
  const hi = w / 2 - LANDED_DX - ROOF_MARGIN;
  const on = (p: Pt): Pt => ({ x: Math.min(hi, Math.max(lo, p.x)), y: p.y });
  const [behind, hole] = lo <= HOLE.x ? [BEHIND, HOLE] : hi >= AHEAD_HOLE.x ? [AHEAD, AHEAD_HOLE] : [on(BEHIND), on(HOLE)];
  const sunk: Pt = { x: hole.x, y: SANTA_SUNK };
  // Orientation de marche à l'aller (vers la cheminée) et au retour : 8 vers l'arrière, 0 vers l'attelage.
  const go = hole.x < behind.x ? 8 : 0;
  const come = 8 - go;
  return {
    out: [
      seg(TURN, SANTA_SEAT, SANTA_SEAT, turn(0, 12), 'step'),
      seg(OVER, SANTA_SEAT, behind, [12, 12], 'climb', ARC),
      seg(TURN, behind, behind, turn(12, go), 'step'),
      seg(WALK, behind, hole, [go, go], 'walk'),
      seg(TURN, hole, hole, turn(go, 12), 'step'),
      seg(SINK, hole, sunk, [12, 12], 'climb'),
    ],
    back: [
      seg(SINK, sunk, hole, [12, 12], 'climb'),
      seg(TURN, hole, hole, turn(12, come), 'step'),
      seg(WALK, hole, behind, [come, come], 'walk'),
      seg(TURN, behind, behind, turn(come, 12), 'step'),
      seg(OVER, behind, SANTA_SEAT, [12, 12], 'climb', ARC),
      seg(TURN, SANTA_SEAT, SANTA_SEAT, turn(12, 0), 'step'),
    ],
  };
}
// Longueur d'un segment (l'enjambée compte sa montée et sa descente) ; un demi-tour fait avancer d'un petit pas.
const segLen = (s: Seg): number => Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y) + 2 * (s.arc ?? 0) + (s.gait === 'step' ? 4 : 0);
const SEATED: SantaStep = { x: SANTA_SEAT.x, y: SANTA_SEAT.y, yaw: 0, gait: 'stand', dist: 0 };
function scriptAt(segs: readonly Seg[], u: number): SantaStep {
  let dist = 0;
  let left = u;
  for (const s of segs) {
    if (left < s.d) {
      const k = Math.max(0, left / s.d);
      const yaw = mod16(Math.round(s.yaw[0] + (s.yaw[1] - s.yaw[0]) * k));
      const y = lerp(s.a.y, s.b.y, k) - (s.arc ?? 0) * Math.sin(Math.PI * k);
      return { x: lerp(s.a.x, s.b.x, k), y, yaw, gait: s.gait, dist: dist + segLen(s) * k };
    }
    left -= s.d;
    dist += segLen(s);
  }
  const last = segs[segs.length - 1]!;
  return { x: last.b.x, y: last.b.y, yaw: mod16(last.yaw[1]), gait: last.gait === 'climb' ? 'climb' : 'stand', dist };
}

// Pas du père Noël à l'instant t : à sa place pendant qu'il est à bord (en vol compris), sur le script pendant ses tranches à
// pied, null s'il est dans la maison ou hors fenêtre.
export function santaStepAt(pass: SantaPass, roof: SantaRoof | null, t: number): SantaStep | null {
  const pose = santaPoseAt(pass, roof, t, 1, 1);
  if (!pose || pose.santa === 'hidden') return null;
  if (pose.santa === 'aboard') return SEATED;
  const p = (t - pass.start) / SANTA_WINDOW_S;
  // Fin de l'aller : resté au fond de la cheminée jusqu'à la tranche cachée (rogné, donc invisible).
  // À pied : seulement pendant une livraison posée, donc avec un toit.
  const { out, back } = scriptFor(roof!.w);
  return p < 0.5 ? scriptAt(out, t - (pass.start + 0.3 * SANTA_WINDOW_S)) : scriptAt(back, t - (pass.start + 0.6 * SANTA_WINDOW_S));
}

// ---------- Ghibli (G5) : livraison sur une maison de la colline du fond ----------
// Le traîneau ne se pose plus sur un immeuble (classique inchangé : `santaRoof`) mais sur une maison peinte du fond
// (hill-painter.ts), à l'échelle de la maison : derrière les immeubles, devant la colline. Tout est exprimé dans le REPÈRE
// LOCAL DU TOIT : origine au faîte (cx, y), `u = dir·(x − cx)` (le bord d'arrivée est toujours du côté négatif : le calque
// retourne le repère avec le sens du traîneau, les toits étant symétriques), y vers le bas, en pixels de la scène.
export type SantaHillRoof = { cx: number; y: number; w: number; rh: number; kind: HillHouse['kind']; chimney: number; s: number; haze: number };
// Même proportion que le peintre du fond (`rh = h × 0,32`), même cheminée (brique de 3 s à x + w·chimney, haut à top − 4 s + 0,4 rh).
const HILL_ROOF_RATIO = 0.32;
// Échelle du groupe posé : 0,55 (taille des passants) × échelle de la maison (notes §7) ; teinte lointaine du groupe.
export const SANTA_FAR_K = 0.55;
export const SANTA_FAR_HAZE = 0.28;

// Maisons du fond dont le toit se voit : les immeubles (près et loin, peints devant la colline) ne couvrent pas plus de 15 %
// de la largeur du toit (le père Noël posé derrière une façade serait invisible). `facades` : immeubles de la scène.
export function visibleHillHouses(houses: readonly HillHouse[], facades: readonly { x: number; w: number; h: number }[], ground: number): HillHouse[] {
  return houses.filter((h) => {
    const roofBottom = h.top + h.h * HILL_ROOF_RATIO;
    let covered = 0;
    for (const f of facades) {
      if (ground - f.h >= roofBottom) continue;
      covered += Math.max(0, Math.min(h.x + h.w, f.x + f.w) - Math.max(h.x, f.x));
    }
    return covered <= 0.15 * h.w;
  });
}

// Maison de la colline où se poser : rang 2 (le plus proche) avec cheminée, assez large et entière dans [x0, x1] ; à défaut
// rang 1 ; jamais le rang 0 (trop loin) ; sinon null (repli en passage simple). De préférence une cheminée sur l'autre
// versant que l'arrivée (le père Noël passe le faîte à découvert) ; tirage recomposé depuis `roofRoll`, sans nouveau tirage.
export function santaHillRoof(pass: SantaPass, houses: readonly HillHouse[], x0: number, x1: number): SantaHillRoof | null {
  const ok = (h: HillHouse): boolean => h.chimney !== null && h.w >= ROOF_MIN_WIDTH && h.x + h.w / 2 >= x0 + ROOF_EDGE && h.x + h.w / 2 <= x1 - ROOF_EDGE;
  for (const row of [2, 1] as const) {
    const all = houses.filter((h) => h.row === row && ok(h));
    if (all.length === 0) continue;
    // De préférence loin sur l'autre versant (au-delà de l'attelage étagé vers le faîte), sinon sur l'autre versant, sinon
    // n'importe où.
    const beyond = (k: number): HillHouse[] => all.filter((h) => (pass.dir > 0 ? h.chimney! >= k : h.chimney! <= 1 - k));
    const list = [beyond(0.65), beyond(0.5), all].find((l) => l.length > 0)!;
    const h = list[Math.min(list.length - 1, Math.floor(pass.roofRoll * list.length))]!;
    return { cx: h.x + h.w / 2, y: h.top, w: h.w, rh: h.h * HILL_ROOF_RATIO, kind: h.kind, chimney: h.chimney!, s: h.s, haze: h.haze };
  }
  return null;
}

// Surface du toit à l'abscisse x (scène) : pignon = deux versants ; croupe = faîte plat sur la moitié centrale ; mansarde =
// terrasson à 1 px sous le faîte puis brisis raide sur 1,5 s de chaque bord (tracés de paintHillHouse).
export function roofSurface(r: SantaHillRoof, x: number): number {
  const half = r.w / 2;
  const d = Math.abs(x - r.cx);
  if (r.kind === 'gable') return r.y + (r.rh * Math.min(half, d)) / half;
  if (r.kind === 'hip') return r.y + (r.rh * Math.max(0, Math.min(half, d) - half / 2)) / (half / 2);
  // Mansarde : le brisis déborde de 1,5 s du mur (comme le toit peint).
  const o = 1.5 * r.s;
  const e = half - o;
  const a = Math.min(half + o, d);
  return a <= e ? r.y + 1 : r.y + 1 + ((r.rh - 1) * (a - e)) / (2 * o);
}
export function roofSlope(r: SantaHillRoof, x: number): number {
  return Math.atan2(roofSurface(r, x + 0.5) - roofSurface(r, x - 0.5), 1);
}
// Point de pose : à mi-pente du versant d'arrivée (−0,45 demi-largeur ; −0,4 en mansarde, où le terrasson est plat).
export const landDx = (r: SantaHillRoof): number => (r.kind === 'mansard' ? -0.4 : -0.45) * (r.w / 2);
// Bouche de la cheminée peinte (scène) : centre de la brique, à son sommet.
export const chimneyHole = (r: SantaHillRoof): Pt => ({ x: r.cx - r.w / 2 + r.w * r.chimney + 1.5 * r.s, y: r.y - 4 * r.s + 0.4 * r.rh });
// Haut de la cheminée d'une maison de la colline (même point que `chimneyHole`, depuis la maison) ; null sans cheminée. Sert
// aussi aux mouettes qui s'y posent (city/gulls.ts).
export const hillChimneyTop = (h: HillHouse): Pt | null =>
  h.chimney === null ? null : { x: h.x + h.w * h.chimney + 1.5 * h.s, y: h.top - 4 * h.s + 0.4 * h.h * HILL_ROOF_RATIO };
export const santaHillScale = (r: SantaHillRoof): number => SANTA_FAR_K * r.s;
// Première fenêtre de la maison (grille de paintHillHouse) : s'allume pendant la visite.
export const santaHillWindow = (r: SantaHillRoof): { x: number; y: number; w: number; h: number } => ({ x: r.cx - r.w / 2 + 3 * r.s, y: r.y + r.rh + 4 * r.s, w: 3.2 * r.s, h: 4.5 * r.s });

// Repère local (voir ci-dessus) : surface et pente le long de u (les toits sont symétriques, le signe de dir ne change rien).
const surfLocal = (r: SantaHillRoof, u: number): number => roofSurface(r, r.cx + u) - r.y;
const slopeLocal = (r: SantaHillRoof, u: number): number => Math.atan2(surfLocal(r, u + 0.5) - surfLocal(r, u - 0.5), 1);

// Pose du traîneau (point de contact des patins, repère local) : `tilt` inclinaison (rad, celle de la pente une fois posé),
// `slide` glissade de freinage (0 → 1 sur 23,5–25 %, gerbe de givre), `landed` dès que les patins touchent (23,5 %).
// Approche en courbe descendante avec un petit arrondi, départ en montée vers la sortie (notes §7).
export type SantaHillPose = { u: number; y: number; dir: 1 | -1; landed: boolean; santa: SantaPose['santa']; windowLit: boolean; tilt: number; slide: number };
export function santaHillPoseAt(pass: SantaPass, r: SantaHillRoof, t: number, width: number, height: number): SantaHillPose | null {
  const p = (t - pass.start) / SANTA_WINDOW_S;
  if (p < 0 || p >= 1) return null;
  const { dir } = pass;
  const K = santaHillScale(r);
  const entry = dir > 0 ? -(r.cx + WORLD_MARGIN) : -(width + WORLD_MARGIN - r.cx);
  const exit = dir > 0 ? width + WORLD_MARGIN - r.cx : r.cx + WORLD_MARGIN;
  const sky = pass.skyY * height - r.y;
  const landU = landDx(r);
  const landY = surfLocal(r, landU);
  const slope = slopeLocal(r, landU);
  const posed = (santa: SantaPose['santa'], windowLit = false): SantaHillPose => ({ u: landU, y: landY, dir, landed: true, santa, windowLit, tilt: slope, slide: 0 });
  // Approche : toute la courbe tient dans 0–23,5 % (les patins touchent au début de la glissade, sans saut) ; inclinaison
  // −0,08 → APPROACH_TILT, raccordée à la pente pendant la glissade.
  if (p < 0.235) {
    const e = ease(p / 0.235);
    return { u: lerp(entry, landU - 6 * K, e), y: lerp(sky, landY, e) - Math.sin(e * Math.PI) * 8 * K, dir, landed: false, santa: 'aboard', windowLit: false, tilt: -0.08 + (APPROACH_TILT + 0.08) * e, slide: 0 };
  }
  if (p < 0.25) {
    const k = (p - 0.235) / 0.015;
    return { ...posed('aboard'), u: lerp(landU - 6 * K, landU, ease(k)), tilt: lerp(APPROACH_TILT, slope, ease(k)), slide: k };
  }
  if (p < 0.3) return posed('aboard');
  if (p < 0.4) return posed('walking');
  if (p < 0.6) return posed('hidden', true);
  if (p < 0.7) return posed('walking');
  if (p < 0.75) return posed('aboard');
  // Départ : les patins suivent le versant jusqu'au faîte (u = 0), puis montée vers la sortie ; l'inclinaison passe de la
  // pente à TAKEOFF_TILT sur les premiers 15 % du trajet après le faîte.
  const e = ease((p - 0.75) / 0.25);
  const u = lerp(landU, exit, e);
  // Sur le versant, l'inclinaison se redresse progressivement de la pente à 0 (horizontal au faîte), sans le coup de bascule
  // du changement de versant.
  if (u <= 0) return { u, y: surfLocal(r, u), dir, landed: false, santa: 'aboard', windowLit: false, tilt: slope * (landU < 0 ? Math.max(0, u / landU) : 0), slide: 0 };
  const g = u / exit;
  const ridge = surfLocal(r, 0);
  return { u, y: lerp(ridge, sky - 10, g) - Math.sin(g * Math.PI) * 6 * K, dir, landed: false, santa: 'aboard', windowLit: false, tilt: TAKEOFF_TILT * Math.min(1, g / 0.15), slide: 0 };
}
const APPROACH_TILT = 0.12;
const TAKEOFF_TILT = 0.1;

// Point relatif (au contact du traîneau) où la hotte est posée sur le toit, de l'autre côté de la cheminée : visible tant
// que le père Noël est dans la maison.
export function santaHillSackGround(pass: SantaPass, r: SantaHillRoof): Pt {
  const K = santaHillScale(r);
  const landU = landDx(r);
  const landY = surfLocal(r, landU);
  const hole = chimneyHole(r);
  const holeX = pass.dir * (hole.x - r.cx) - landU;
  const sign = holeX > BEHIND_U * K ? 1 : -1;
  const x = holeX + sign * 9 * K;
  return { x, y: surfLocal(r, landU + x) - landY + 1 };
}

// Pas du père Noël sur la maison (repère local, RELATIF au point de contact du traîneau, en px) : assis les rênes en main
// (`seated`, l'accroche `seat` à SEAT_FAR·K), enjambe l'arrière du traîneau (1,2 s), marche vers la cheminée la hotte à
// l'épaule, penché vers l'amont (lean = −0,45 × pente, pas courts ×0,8 ; 4,5 s), pose la hotte (`reach`, 0,9 s), descend dans
// la cheminée (`climb`, rogné à la bouche : `clip`, 0,9 s) ; retour à l'inverse. `sack` : à l'épaule (hotte à la nuque),
// posée au sol (point relatif) pendant qu'il enjambe la cheminée, absente quand il est dans la maison.
export type SantaHillStep = {
  x: number; y: number; yaw: number; gait: 'stand' | 'walk' | 'climb' | 'seated'; phase: number; arms: 'handlebar' | 'phone' | 'reach';
  lean: number; sack: 'shoulder' | { x: number; y: number }; clip: number | null; slope: number;
};
// Place assise (accroche `seat`, unités du traîneau) ; pieds au fond de la caisse quand il se lève ; pied du traîneau derrière
// (patin arrière à −20) ; écart entre lui et la bouche de la cheminée ; enfoncement (unités du pantin) et hauteur de l'enjambée.
export const SEAT_FAR: Pt = { x: -8.2, y: -10.9 };
const FLOOR_U = -4;
const BEHIND_U = -22;
const GAP_U = 5.5;
const SUNK_U = 28;
const CLIMB_S = 1.2;
const WALK_S = 4.5;
const REACH_S = 0.9;
const SINK_S = 0.9;
const STEP_PHASES = 12;
const walkPhase = (units: number): number => ((Math.floor((units / 23) * STEP_PHASES) % STEP_PHASES) + STEP_PHASES) % STEP_PHASES;
export function santaHillStepAt(pass: SantaPass, r: SantaHillRoof, t: number): SantaHillStep | null {
  const p = (t - pass.start) / SANTA_WINDOW_S;
  if (p < 0 || p >= 1) return null;
  const K = santaHillScale(r);
  const landU = landDx(r);
  const landY = surfLocal(r, landU);
  const surf = (x: number): number => surfLocal(r, landU + x) - landY;
  const slopeAt = (x: number): number => slopeLocal(r, landU + x);
  const seat: SantaHillStep = { x: SEAT_FAR.x * K, y: SEAT_FAR.y * K, yaw: 0, gait: 'seated', phase: 0, arms: 'handlebar', lean: 0, sack: 'shoulder', clip: null, slope: 0 };
  if (p < 0.3 || p >= 0.7) return seat;
  if (p >= 0.4 && p < 0.6) return null;
  // Points du chemin (relatifs) : fond de la caisse, pied du traîneau, poste devant la cheminée, bouche de la cheminée.
  const floor: Pt = { x: SEAT_FAR.x * K, y: FLOOR_U * K };
  const behind: Pt = { x: BEHIND_U * K, y: surf(BEHIND_U * K) };
  const hole = chimneyHole(r);
  const holeP: Pt = { x: pass.dir * (hole.x - r.cx) - landU, y: hole.y - r.y - landY };
  const sign = holeP.x > behind.x ? 1 : -1;
  const standX = holeP.x - sign * GAP_U * K;
  const stand: Pt = { x: standX, y: surf(standX) };
  const sunk: Pt = { x: holeP.x, y: holeP.y + SUNK_U * K };
  const ground = santaHillSackGround(pass, r);
  const go = sign > 0 ? 0 : 8;
  const out = p < 0.5;
  // Temps dans la tranche à pied ; au retour, le même chemin lu à l'envers.
  const span = 0.1 * SANTA_WINDOW_S;
  const local = out ? t - (pass.start + 0.3 * SANTA_WINDOW_S) : span - (t - (pass.start + 0.6 * SANTA_WINDOW_S));
  const step = (x: number, y: number, s: Partial<SantaHillStep>): SantaHillStep => ({ x, y, yaw: 12, gait: 'stand', phase: 0, arms: 'phone', lean: 0, sack: 'shoulder', clip: null, slope: slopeAt(x), ...s });
  if (local < CLIMB_S) {
    const k = Math.max(0, local / CLIMB_S);
    const y = lerp(floor.y, behind.y, k) - ARC * K * Math.sin(Math.PI * k);
    return step(lerp(floor.x, behind.x, k), y, { gait: 'climb', phase: Math.floor((out ? k : 1 - k) * STEP_PHASES) % STEP_PHASES });
  }
  if (local < CLIMB_S + WALK_S) {
    const k = (local - CLIMB_S) / WALK_S;
    const x = lerp(behind.x, stand.x, k);
    const d = (Math.abs(stand.x - behind.x) * (out ? k : 1 - k)) / K;
    return step(x, surf(x), { gait: 'walk', yaw: out ? go : 8 - go, phase: walkPhase(d * 0.8), lean: -0.45 * slopeAt(x) });
  }
  if (local < CLIMB_S + WALK_S + REACH_S) return step(stand.x, stand.y, { yaw: go, arms: 'reach', sack: ground });
  // Enjambe la bouche (le quart du temps : de son poste au sommet de la brique, sans rognage), puis s'enfonce, rogné.
  const k = Math.min(1, (local - CLIMB_S - WALK_S - REACH_S) / SINK_S);
  const up = Math.min(1, k / 0.25);
  const down = Math.max(0, (k - 0.25) / 0.75);
  return step(lerp(stand.x, holeP.x, up), lerp(stand.y, holeP.y, up) + (sunk.y - holeP.y) * down, {
    gait: 'climb', phase: Math.floor((out ? k : 1 - k) * STEP_PHASES) % STEP_PHASES, sack: ground, clip: up >= 1 ? holeP.y : null,
  });
}
