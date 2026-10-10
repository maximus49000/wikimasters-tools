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
