import { sizeOf } from './furniture-catalog';
import type { Layout } from './library-types';
import { CELL_H, CELL_W, depthOf, isStanding, rectOf, type Rect, type Standing } from './room-grid';
import type { PetState } from './pets/motion';

const bottom = (p: Standing): number => p.row + sizeOf(p.kind).h;

// Meubles debout (hors tapis) dans l'ordre de dessin : niveau d'abord, puis le bas le plus haut d'abord, puis l'ordre du plan.
export function drawOrder(layout: Layout): Standing[] {
  const items = layout.filter((p): p is Standing => isStanding(p) && p.kind !== 'rug');
  return items
    .map((p, i) => ({ p, i, d: depthOf(layout, p), b: bottom(p) }))
    .sort((a, b) => a.d - b.d || a.b - b.b || a.i - b.i)
    .map((e) => e.p);
}

const contains = (r: Rect, x: number, y: number): boolean =>
  x >= r.col * CELL_W && x < (r.col + r.w) * CELL_W && y >= r.row * CELL_H && y <= (r.row + r.h) * CELL_H;

// Demi-largeur d'un animal dessiné, en px (le chien va de -28 à +28 autour des pieds, voir light/pet-boxes).
const PET_HALF_W = 28;

// Nombre de meubles dessinés avant l'animal. Porté : juste devant son porteur. Pieds dans l'emprise d'un meuble
// (dessous ou derrière lui) : juste derrière le premier dessiné d'entre eux. Sinon niveau 2, à sa ligne de pieds,
// corrigé par les meubles qui le chevauchent en largeur : devant ceux dont le bas est au-dessus de ses pieds
// (un panier, une table basse au niveau 3), derrière ceux dont le bas est plus bas.
export function petSlot(layout: Layout, state: PetState): number {
  const order = drawOrder(layout);
  const hosts = state.depthHosts.filter((id): id is string => id !== null);
  if (hosts.length > 0) {
    const at = Math.max(...hosts.map((id) => order.findIndex((p) => p.id === id)));
    if (at >= 0) return at + 1;
  }
  const { x, y } = state.pos;
  const covering = order.findIndex((p) => contains(rectOf(p)!, x, y));
  if (covering >= 0) return covering;
  const level2 = order.filter((p) => {
    const d = depthOf(layout, p);
    return d < 2 || (d === 2 && bottom(p) * CELL_H <= y);
  }).length;
  let lo = 0;
  let hi = order.length;
  order.forEach((p, i) => {
    const r = rectOf(p)!;
    if (r.col * CELL_W >= x + PET_HALF_W || (r.col + r.w) * CELL_W <= x - PET_HALF_W) return;
    if (bottom(p) * CELL_H <= y) lo = i + 1;
    else hi = Math.min(hi, i);
  });
  // Contraintes contradictoires (rare) : la règle du niveau 2 seule.
  return lo <= hi ? Math.min(Math.max(level2, lo), hi) : level2;
}

const overlaps = (a: Rect, b: Rect): boolean =>
  a.col < b.col + b.w && b.col < a.col + a.w && a.row < b.row + b.h && b.row < a.row + a.h;

// Les objets superposés à `id` (lui compris), du plus en avant au plus en arrière : meubles debout, fenêtres et objets accrochés.
export function stackAt(layout: Layout, id: string): string[] {
  const target = layout.find((p) => p.id === id);
  const targetRect = target && rectOf(target);
  if (!targetRect) return [id];
  const back = layout.filter((p) => p.kind === 'window' || p.kind === 'wall');
  const candidates = [...back, ...drawOrder(layout)];
  const ids = candidates.filter((p) => p.id === id || overlaps(rectOf(p)!, targetRect)).map((p) => p.id);
  // Hors pile (tapis, petit objet, ordinateur, carte rangée) : seul, pour que le toucher répété le désélectionne.
  return ids.includes(id) ? ids.reverse() : [id];
}

// Toucher de nouveau le même objet (`lastTappedId`) ou celui déjà choisi passe à celui de derrière ; au bout de la pile,
// retour au premier ; seul, il se désélectionne. Toucher un autre objet le choisit.
export function nextInStack(layout: Layout, selectedId: string | null, tappedId: string, lastTappedId: string | null): string | null {
  if (tappedId !== lastTappedId && tappedId !== selectedId) return tappedId;
  const stack = stackAt(layout, tappedId);
  const at = selectedId ? stack.indexOf(selectedId) : -1;
  if (at < 0) return tappedId;
  if (stack.length === 1) return null;
  return stack[(at + 1) % stack.length]!;
}
