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
