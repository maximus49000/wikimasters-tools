// Passage d'un seuil (habitants et clients des commerces) : un <svg> imbriqué (ni clipPath ni masque : le calque des figurants
// reste copiable par <use>, comme pour la fenêtre soulevée) qui rogne la figure à l'ouverture d'une porte, avec l'ombre de l'entrée dessous.
import { doorDarkOpacity, type Passage } from '../core/library/city/doorway';
import type { CityMetrics } from '../core/library/city/metrics';
import type { Rect } from '../core/library/city/shops/slots';
import { hideAtZero } from './svg-write';

// Cadre du <svg> (px du monde) : sur le seuil (profondeur 0), centre de l'ouverture ± DOOR_SILL_HALF et, en haut, le sommet de la
// figure parapluie compris (m.doorY − DOOR_SILL_TOP unités du sprite × `k`, échelle de la figure) : elle est encore sur le trottoir,
// rien n'en est coupé au passage rue → porte ; le cadre se resserre linéairement jusqu'à l'ouverture à DOOR_NARROW_AT, puis reste
// l'ouverture. En bas, jusqu'à la ligne des pieds (m.doorY, un peu sous le bas de la porte d'un local) : pas de saut de hauteur.
// L'ombre (`dark`, repère local) reste exactement sur l'ouverture.
export const DOOR_SILL_HALF = 10;
export const DOOR_SILL_TOP = 60;
const DOOR_NARROW_AT = 0.4;
export function sillBox(o: Rect, depth: number, m: CityMetrics, k: number): { clip: Rect; dark: Rect } {
  const half = DOOR_SILL_HALF * Math.max(1, m.unit);
  const a = Math.min(1, depth / DOOR_NARROW_AT);
  const lerp = (from: number, to: number): number => from + (to - from) * a;
  const mid = o.x + o.w / 2;
  const left = lerp(mid - half, o.x);
  const right = lerp(mid + half, o.x + o.w);
  const top = lerp(Math.min(o.y, m.doorY - DOOR_SILL_TOP * k), o.y);
  const clip = { x: left, y: top, w: right - left, h: Math.max(o.y + o.h, m.doorY) - top };
  return { clip, dark: { x: o.x - left, y: o.y - top, w: o.w, h: o.h } };
}

// Figure dans le cadre (repère local) : pieds sur m.doorY au bord du seuil ; elle s'enfonce et rapetisse avec la profondeur.
// `sgn` : −1 pour le sprite classique retourné en miroir.
export const sillFigTransform = (p: Passage, clip: Rect, m: CityMetrics, k: number, sgn: number): string => {
  const kk = k * (1 - 0.12 * p.depth);
  return `translate(${(p.x - clip.x).toFixed(2)} ${(m.doorY - clip.y - p.depth * 3 * m.unit).toFixed(2)}) scale(${(sgn * kk).toFixed(3)} ${kk.toFixed(3)})`;
};

const set = (node: Element | null, name: string, value: string): void => {
  if (node && node.getAttribute(name) !== value) node.setAttribute(name, value);
};
const setRect = (node: Element | null, r: Rect): void => {
  set(node, 'x', r.x.toFixed(2));
  set(node, 'y', r.y.toFixed(2));
  set(node, 'width', r.w.toFixed(2));
  set(node, 'height', r.h.toFixed(2));
};

// Placement par la boucle d'un nœud de seuil actif (`node` : le <svg> ; enfants `[data-door-dark]` et `[data-door-fig]`).
// Enfant à opacité 0 (ombre ou figure au fond de l'entrée) : caché (display none), montré dès qu'elle remonte (svg-write.ts
// hideAtZero) ; les rendus React des seuils donnent le même `display` au premier dessin (zeroDisplay).
export function placeSill(node: Element, o: Rect, p: Passage, m: CityMetrics, k: number, sgn: number): void {
  const box = sillBox(o, p.depth, m, k);
  setRect(node, box.clip);
  const dark = node.querySelector(':scope > [data-door-dark]');
  setRect(dark, box.dark);
  const darkOp = doorDarkOpacity(p.depth).toFixed(2);
  set(dark, 'opacity', darkOp);
  if (dark) hideAtZero(dark, darkOp);
  const fig = node.querySelector(':scope > [data-door-fig]');
  fig?.setAttribute('transform', sillFigTransform(p, box.clip, m, k, sgn));
  const figOp = (1 - p.depth).toFixed(2);
  set(fig, 'opacity', figOp);
  if (fig) hideAtZero(fig, figOp);
}
