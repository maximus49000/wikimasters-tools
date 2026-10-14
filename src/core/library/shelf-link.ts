import { drawSize } from './footprint';
import { FURNITURE_MODELS } from './furniture-models';
import { localPointOf } from './furniture-render3d';
import type { Layout } from './library-types';
import { angleOf, type Standing } from './room-grid';

// Deux bibliothèques collées bord à bord, tournées pareil, s'affichent ensemble (zoom). Le lien n'est jamais enregistré : il se lit
// dans les positions ; seul le refus (`unlinked`) l'est. Deux au maximum : une rangée se lie par paires de gauche à droite (vu de face).

const MODEL = FURNITURE_MODELS.shelf;
// Tolérance : une demi-case (21 cm de large, 50 cm de profondeur) ; en diagonale les cases arrondissent le pas de 80 cm.
const TOL_X = 10.5;
const TOL_Z = 25;

const isShelf = (p: Layout[number]): p is Standing => p.kind === 'shelf';

// Coin avant (x = 0 : gauche, x = MODEL.w : droit, vus de face) posé au sol, en cm de la pièce : x vers la droite, z vers le fond.
function corner(s: Standing, x: number): [number, number] {
  const a = angleOf(s);
  const l = localPointOf(MODEL, a, [x, 0, 0]);
  return [s.col * 21 + l.x, l.z - (s.row + drawSize('shelf', a).h - 1) * 50];
}

// `b` est collée à droite de `a` (vu de face) : même angle, coin avant gauche de `b` sur le coin avant droit de `a`.
export function touchesRight(a: Standing, b: Standing): boolean {
  if (a.id === b.id || angleOf(a) !== angleOf(b)) return false;
  const [ax, az] = corner(a, MODEL.w);
  const [bx, bz] = corner(b, 0);
  return Math.abs(bx - ax) < TOL_X && Math.abs(bz - az) < TOL_Z;
}

// Voisine collée (à droite d'abord, sinon à gauche), drapeaux ignorés : celle que le bouton ⛓ relierait.
export function linkCandidateOf(layout: Layout, id: string): string | null {
  const self = layout.find((p) => p.id === id);
  if (!self || !isShelf(self)) return null;
  const all = layout.filter(isShelf);
  return (all.find((b) => touchesRight(self, b)) ?? all.find((b) => touchesRight(b, self)))?.id ?? null;
}

// Bibliothèques affichées avec `id`, de gauche à droite (1 ou 2) ; [] si `id` n'est pas une étagère.
export function shelfGroupOf(layout: Layout, id: string): string[] {
  const self = layout.find((p) => p.id === id);
  if (!self || !isShelf(self)) return [];
  if (self.unlinked) return [id];
  const all = layout.filter((p): p is Standing => isShelf(p) && !p.unlinked);
  const right = (a: Standing) => all.find((b) => touchesRight(a, b));
  const left = (a: Standing) => all.find((b) => touchesRight(b, a));
  // Tête de la rangée, puis la rangée entière ; on la découpe en paires depuis la tête.
  let head = self;
  const seen = new Set([head.id]);
  for (let l = left(head); l && !seen.has(l.id); l = left(head)) {
    head = l;
    seen.add(l.id);
  }
  const chain = [head];
  for (let r = right(head); r && !chain.some((c) => c.id === r!.id); r = right(chain[chain.length - 1]!)) chain.push(r);
  const i = chain.findIndex((c) => c.id === id);
  const start = i - (i % 2);
  return chain.slice(start, start + 2).map((c) => c.id);
}

// ⛓ : liée → refuse le lien sur cette étagère ; sinon retire le refus d'elle et de sa voisine collée.
export function toggleShelfLink(layout: Layout, id: string): Layout {
  if (shelfGroupOf(layout, id).length === 2) return layout.map((p) => (p.id === id && isShelf(p) ? { ...p, unlinked: true as const } : p));
  const other = linkCandidateOf(layout, id);
  if (!other) return layout;
  return layout.map((p) => {
    if ((p.id !== id && p.id !== other) || !isShelf(p) || !p.unlinked) return p;
    const { unlinked: _, ...rest } = p;
    return rest;
  });
}

// Bibliothèque `id` déplacée ou tournée (de `before` à `after`) : un refus visait le voisin d'alors, pas le prochain. Le refus est oublié
// sur elle et sur chaque voisine dont il la visait (celle que ⛓ aurait reliée à elle). Rien ne change si la position et l'angle sont les mêmes.
export function forgetUnlinkOnMove(before: Layout, after: Layout, id: string): Layout {
  const was = before.find((p) => p.id === id);
  const now = after.find((p) => p.id === id);
  if (!was || !now || !isShelf(was) || !isShelf(now)) return after;
  if (was.col === now.col && was.row === now.row && angleOf(was) === angleOf(now)) return after;
  const forget = new Set([id, ...before.filter((p) => isShelf(p) && p.unlinked && linkCandidateOf(before, p.id) === id).map((p) => p.id)]);
  return after.map((p) => {
    if (!forget.has(p.id) || !isShelf(p) || !p.unlinked) return p;
    const { unlinked: _, ...rest } = p;
    return rest;
  });
}

// Le bouton ⛓ n'a de sens que si l'appui change le groupe affiché.
export function canToggleShelfLink(layout: Layout, id: string): boolean {
  if (shelfGroupOf(layout, id).length === 2) return true;
  return shelfGroupOf(toggleShelfLink(layout, id), id).length === 2;
}
