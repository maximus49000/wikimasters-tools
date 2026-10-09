import type { Layout } from '../library-types';
import { CELL_H, isStanding, rectOf } from '../room-grid';
import type { PetState } from './motion';

const bottomPx = (layout: Layout, id: string): number | null => {
  const placed = layout.find((p) => p.id === id);
  const rect = placed && rectOf(placed);
  return rect ? (rect.row + rect.h) * CELL_H : null;
};

// Hauteur de profondeur du chat : ses pieds, ou le bas du meuble qui le porte ou le contient (+0,1 : il est devant lui).
export function depthKey(layout: Layout, state: PetState): number {
  let key = state.pos.y;
  for (const id of state.depthHosts) {
    const bottom = id === null ? null : bottomPx(layout, id);
    if (bottom !== null) key = Math.max(key, bottom + 0.1);
  }
  return key;
}

// Combien de meubles debout (hors tapis) sont dessinés avant le chat : ceux dont le bas est au-dessus de sa profondeur.
export function depthIndex(layout: Layout, key: number): number {
  let count = 0;
  for (const p of layout) {
    if (!isStanding(p) || p.kind === 'rug') continue;
    const rect = rectOf(p);
    if (rect && (rect.row + rect.h) * CELL_H <= key) count++;
  }
  return count;
}
