import type { Layout } from './library-types';

// Meuble qui ouvre la vue zoomée : une étagère qui range au moins une carte, ou un bureau dont l'ordinateur affiche une carte.
export type ZoomTarget = { kind: 'shelf' | 'desk'; id: string };
export type Box = { x: number; y: number; w: number; h: number };

// Toucher une carte rangée vise son étagère, toucher un ordinateur vise son bureau.
export function zoomTargetOf(layout: Layout, id: string): ZoomTarget | null {
  const item = layout.find((p) => p.id === id);
  if (!item) return null;
  if (item.kind === 'stored') return zoomTargetOf(layout, item.shelfId);
  if (item.kind === 'computer') return zoomTargetOf(layout, item.deskId);
  if (item.kind === 'shelf') return layout.some((p) => p.kind === 'stored' && p.shelfId === id) ? { kind: 'shelf', id } : null;
  if (item.kind === 'desk') return layout.some((p) => p.kind === 'computer' && p.deskId === id && p.slug) ? { kind: 'desk', id } : null;
  return null;
}

// Caméra : translation puis agrandissement (origine en haut à gauche) qui amène le centre du meuble au centre de la scène.
export function cameraOf(stage: { w: number; h: number }, target: Box, scale = 1.6): { tx: number; ty: number; scale: number } {
  return { tx: stage.w / 2 - (target.x + target.w / 2) * scale, ty: stage.h / 2 - (target.y + target.h / 2) * scale, scale };
}

// Cadre final de la vue de face : 80 % de la hauteur, largeur selon les proportions (au plus 90 % de la largeur), centré.
export function zoomRectOf(stage: { w: number; h: number }, aspect: number): Box {
  let h = stage.h * 0.8;
  let w = h * aspect;
  if (w > stage.w * 0.9) {
    w = stage.w * 0.9;
    h = w / aspect;
  }
  return { x: (stage.w - w) / 2, y: (stage.h - h) / 2, w, h };
}
