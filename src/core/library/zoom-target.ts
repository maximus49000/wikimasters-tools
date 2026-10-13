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

// Caméra : translation puis agrandissement (origine en haut à gauche du conteneur) qui amène le centre du meuble au centre
// de la partie visible. Bornée : le conteneur agrandi couvre toujours le visible + une marge (le flou estompe les bords),
// quitte à décentrer le meuble ou à agrandir davantage ; sans meuble mesuré, elle agrandit autour du centre du visible.
export function cameraOf(container: { w: number; h: number }, visible: Box, target: Box | null, wanted = 1.6, margin = 32): { tx: number; ty: number; scale: number } {
  const scale = Math.max(wanted, (visible.w + 2 * margin) / container.w, (visible.h + 2 * margin) / container.h);
  const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);
  // Centre visé, ramené dans le conteneur (un meuble hors écran ne tire pas la caméra dans le vide).
  const cx = target ? clamp(target.x + target.w / 2, 0, container.w) : visible.x + visible.w / 2;
  const cy = target ? clamp(target.y + target.h / 2, 0, container.h) : visible.y + visible.h / 2;
  const axis = (vPos: number, vSize: number, c: number, size: number) =>
    clamp(vPos + vSize / 2 - c * scale, vPos + vSize + margin - scale * size, vPos - margin);
  return { tx: axis(visible.x, visible.w, cx, container.w), ty: axis(visible.y, visible.h, cy, container.h), scale };
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
