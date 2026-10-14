import type { Layout } from './library-types';
import { CELL_H, CELL_W, byDrawOrder, footBottom, isStanding, rectOf, type Rect, type Standing } from './room-grid';
import type { PetState } from './pets/motion';

const bottom = footBottom;

// Meubles debout (hors tapis) dans l'ordre de dessin : le bas le plus haut d'abord, puis le niveau, puis l'ordre du plan.
export function drawOrder(layout: Layout): Standing[] {
  return byDrawOrder(layout, layout.filter((p): p is Standing => isStanding(p) && p.kind !== 'rug'));
}

const contains = (r: Rect, x: number, y: number): boolean =>
  x >= r.col * CELL_W && x < (r.col + r.w) * CELL_W && y >= r.row * CELL_H && y <= (r.row + r.h) * CELL_H;

// Nombre de meubles dessinés avant l'animal. Porté : juste devant son porteur. Pieds dans l'emprise d'un meuble
// (dessous ou derrière lui) : juste derrière le premier dessiné d'entre eux. Sinon, comme un meuble : devant ceux
// dont le bas est au-dessus de ses pieds, derrière les autres.
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
  return order.filter((p) => bottom(p) * CELL_H <= y).length;
}

const overlaps = (a: Rect, b: Rect): boolean =>
  a.col < b.col + b.w && b.col < a.col + a.w && a.row < b.row + b.h && b.row < a.row + a.h;

// Les objets superposés à `id` (lui compris), du plus en avant au plus en arrière : meubles debout, fenêtres et objets accrochés.
export function stackAt(layout: Layout, id: string): string[] {
  const target = layout.find((p) => p.id === id);
  const targetRect = target && rectOf(target);
  if (!targetRect) return [id];
  const back = layout.filter((p) => p.kind === 'window' || p.kind === 'wall' || p.kind === 'deco');
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
