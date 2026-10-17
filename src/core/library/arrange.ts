// Cœur du glissé au cm sur un plateau (vue Modifier) : conversion plateau ↔ écran et dépôt validé. Repère du meuble, jamais celui de l'écran.
import { FURNITURE_MODELS } from './furniture-models';
import { PLUNGE_CAMERA, projectOf } from './furniture-render3d';
import type { Layout } from './library-types';
import { canPutOnTop, topThingOf } from './surface';
import type { HostKind } from './room-grid';

// Le plateau est toujours montré de face (angle 0) en plongée, quel que soit l'angle du meuble dans la pièce.
export type ArrangeFrame = { hostKind: HostKind; scale: number; origin: [number, number] };
export type TopDrop = { ok: true; x: number; z: number } | { ok: false };

const px = (f: ArrangeFrame, x: number, z: number): [number, number] =>
  projectOf(FURNITURE_MODELS[f.hostKind], 0, [x, FURNITURE_MODELS[f.hostKind].h, z], PLUNGE_CAMERA);

// (x, z) en cm sur le plan du plateau → px écran.
export function topToScreen(f: ArrangeFrame, x: number, z: number): [number, number] {
  const [px0, py0] = px(f, x, z);
  return [px0 * f.scale + f.origin[0], py0 * f.scale + f.origin[1]];
}

// Inverse exact sur le plan y = hauteur du plateau (la projection est affine : on résout le système 2×2 des images des axes x et z).
export function screenToTop(f: ArrangeFrame, sx: number, sy: number): { x: number; z: number } {
  const o = px(f, 0, 0);
  const ex = px(f, 1, 0);
  const ez = px(f, 0, 1);
  const [ax, ay, bx, by] = [ex[0] - o[0], ex[1] - o[1], ez[0] - o[0], ez[1] - o[1]];
  const [dx, dy] = [(sx - f.origin[0]) / f.scale - o[0], (sy - f.origin[1]) / f.scale - o[1]];
  const det = ax * by - bx * ay;
  return { x: (dx * by - bx * dy) / det, z: (ax * dy - ay * dx) / det };
}

// x/z = coin avant gauche visé (l'appelant a déjà soustrait le décalage de saisie).
export function dropOnTop(layout: Layout, hostId: string, id: string, x: number, z: number): TopDrop {
  const p = layout.find((q) => q.id === id);
  if (!p || (p.kind !== 'small' && p.kind !== 'posed') || !('x' in p) || p.hostId !== hostId) return { ok: false };
  const thing = topThingOf(p);
  return canPutOnTop(layout, hostId, thing, x, z, id) ? { ok: true, x, z } : { ok: false };
}

export function moveOnTop(layout: Layout, id: string, x: number, z: number): Layout | null {
  const p = layout.find((q) => q.id === id);
  if (!p || (p.kind !== 'small' && p.kind !== 'posed') || !('x' in p)) return null;
  const d = dropOnTop(layout, p.hostId, id, x, z);
  return d.ok ? layout.map((q) => (q.id === id ? { ...q, x: d.x, z: d.z } : q)) : null;
}
