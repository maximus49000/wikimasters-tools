// Cœur du glissé au cm sur un plateau (vue Modifier) : conversion plateau ↔ écran et dépôt validé. Repère du meuble, jamais celui de l'écran.
import { applyHomography, homographyOf, invertHomography, type Homography } from './footprint';
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

// Plateau (x, z) cm → px du dessin (échelle 1) : homographie du plan y = hauteur du plateau (la perspective est exacte sur un plan),
// déterminée par ses 4 coins ; mise en cache par porteur.
const topHom = new Map<string, Homography>();
function topHomOf(f: ArrangeFrame): Homography {
  let H = topHom.get(f.hostKind);
  if (!H) {
    const m = FURNITURE_MODELS[f.hostKind];
    const plane: [number, number][] = [[0, 0], [m.w, 0], [m.w, m.d], [0, m.d]];
    H = homographyOf(plane, plane.map(([x, z]) => px(f, x, z)));
    topHom.set(f.hostKind, H);
  }
  return H;
}

// Inverse exact sur le plan y = hauteur du plateau (homographie inverse).
export function screenToTop(f: ArrangeFrame, sx: number, sy: number): { x: number; z: number } {
  const [x, z] = applyHomography(invertHomography(topHomOf(f)), (sx - f.origin[0]) / f.scale, (sy - f.origin[1]) / f.scale);
  return { x, z };
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
