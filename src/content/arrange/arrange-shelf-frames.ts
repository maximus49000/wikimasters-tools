// Cadres de la vue Modifier d'une étagère (px du calque paysage) : le meuble entier de face, une tablette zoomée, le dessus en plongée ;
// et les conversions doigt ↔ tablette que le glissé (use-board-drag) et les tests partagent. Repères en cm du meuble, jamais de l'écran.
import { applyFace, drawSize, faceFrame, invertFace, type FaceFrame } from '../../core/library/footprint';
import { carriedPlacementOf, placementRectPx } from '../../core/library/carried-items';
import type { Layout, ShelfLevel } from '../../core/library/library-types';
import { CELL_H, CELL_W, SHELF_INNER_CM, isShelfLevel, shelfBoardsIn, type PxRect, type ShelfBoard } from '../../core/library/room-grid';
import { screenToTop } from '../../core/library/arrange';
import { boardGeometry, POST_CM, type BoardGeometry } from '../shelf-board-zoom';
import { onShelfBoard } from '../furniture-zoom';
import { FURNITURE_MODELS } from '../../core/library/furniture-models';
import { arrangeFrameFor, frameAt } from './ArrangeView';
import type { BoardAim } from './use-board-drag';

export const PAD = 16;
// Bandeau du haut : pastille du mode et ✓.
export const TOP = 60;
// Place des boutons ▲ ▼ à droite de la tablette zoomée.
export const NAV = 56;

// Meuble entier de face : dessin (px natifs, `art` par bibliothèque, `pad` au-dessus pour les objets du dessus) mis à l'échelle dans le calque.
export type WholeFrame = { ids: string[]; ox: number; oy: number; scale: number; pad: number; art: PxRect; face: FaceFrame; boards: ShelfBoard[] };
export function wholeFrameFor(ids: string[], layout: Layout, layer: { w: number; h: number }): WholeFrame {
  const { w, h } = drawSize('shelf', 0);
  const art: PxRect = { x: 0, y: 0, w: w * CELL_W, h: h * CELL_H };
  // Les objets du dessus dépassent du meuble : le cadre monte jusqu'au plus haut d'entre eux (comme le zoom).
  const tops = layout.flatMap((p) => {
    if (onShelfBoard(p) || (p.kind !== 'small' && p.kind !== 'posed')) return [];
    const at = carriedPlacementOf(layout, p);
    return at && ids.includes(at.hostId) ? [placementRectPx('shelf', 0, art, at.placement).y] : [];
  });
  const pad = tops.length > 0 ? Math.max(0, art.y - Math.min(...tops)) + 8 : 0;
  const n = Math.max(1, ids.length);
  const [viewW, viewH] = [art.w * n, art.h + pad];
  const [availW, availH] = [layer.w - 2 * PAD, layer.h - TOP - PAD];
  const scale = Math.min(availW / viewW, availH / viewH);
  const ox = PAD + (availW - viewW * scale) / 2;
  const oy = TOP + (availH - viewH * scale) / 2;
  const face = faceFrame('shelf', 0, art)!;
  return { ids, ox, oy, scale, pad, art, face, boards: shelfBoardsIn(face) };
}
// Point de la face (px natifs, repère local de la face) de la bibliothèque `i` → px du calque.
export function wholeFacePx(f: WholeFrame, i: number, u: number, v: number): [number, number] {
  const [x, y] = applyFace(f.face, u, v);
  return [f.ox + (x + i * f.art.w) * f.scale, f.oy + (y + f.pad) * f.scale];
}
// Point à `xCm` du bord gauche d'une tablette (à 60 % de sa hauteur), px du calque : là où on la touche ou lâche.
export function wholeBoardPx(f: WholeFrame, i: number, level: ShelfLevel, xCm: number): [number, number] {
  const b = f.boards[level]!;
  return wholeFacePx(f, i, (xCm / SHELF_INNER_CM) * f.face.w, b.local.y + b.local.h * 0.6);
}
// Tablette sous le doigt au niveau entier ; null au-dessus des tablettes (le dessus, vu de face : on n'y pose rien) ou hors du meuble.
export function wholeAim(f: WholeFrame, lx: number, ly: number): BoardAim | null {
  const u = (lx - f.ox) / f.scale;
  const v = (ly - f.oy) / f.scale - f.pad;
  const i = Math.floor(u / f.art.w);
  if (i < 0 || i >= f.ids.length) return null;
  const [fu, fv] = invertFace(f.face, u - i * f.art.w, v);
  if (fu < 0 || fu >= f.face.w) return null;
  const board = f.boards.find((b) => fv >= b.local.y && fv < b.local.y + b.local.h);
  return board ? { kind: 'board', shelfId: f.ids[i]!, level: board.level, xCm: (fu / f.face.w) * SHELF_INNER_CM } : null;
}
// Rectangle (px du calque) d'une boîte de la face de la bibliothèque `i` (repère local, px natifs).
export function wholeBoxPx(f: WholeFrame, i: number, local: PxRect): PxRect {
  const pts = [[local.x, local.y], [local.x + local.w, local.y], [local.x + local.w, local.y + local.h], [local.x, local.y + local.h]].map(([u, v]) => wholeFacePx(f, i, u!, v!));
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
}

// Tablette zoomée : la mise en page du second zoom (cm) mise à l'échelle dans le calque, à gauche des boutons ▲ ▼.
export type BoardFrame = { ids: string[]; level: ShelfLevel; ox: number; oy: number; scale: number; geo: BoardGeometry };
export function boardFrameFor(layout: Layout, ids: string[], level: ShelfLevel, layer: { w: number; h: number }, measure: Layout = layout): BoardFrame {
  const geo = boardGeometry(layout, ids, level, false, measure);
  const [availW, availH] = [layer.w - 2 * PAD - NAV, layer.h - TOP - PAD];
  const scale = Math.min(availW / geo.width, availH / geo.height);
  const ox = PAD + (availW - geo.width * scale) / 2;
  const oy = TOP + (availH - geo.height * scale) / 2;
  return { ids, level, ox, oy, scale, geo };
}
export const boardRect = (f: BoardFrame): PxRect => ({ x: f.ox, y: f.oy, w: f.geo.width * f.scale, h: f.geo.height * f.scale });
// Point à `xCm` du bord gauche de la tablette de la bibliothèque `i` (à `yCm` du haut de la partie montrée, 60 % par défaut), px du calque.
export function boardPointPx(f: BoardFrame, i: number, xCm: number, yCm = f.geo.cropH * 0.6): [number, number] {
  const [x0, y0] = f.geo.originOf(i);
  return [f.ox + (x0 + xCm) * f.scale, f.oy + (y0 + yCm) * f.scale];
}
// Tablette sous le doigt en zoom : celle dont la largeur (montants compris) contient le point, quelle que soit la hauteur du doigt.
export function boardAim(f: BoardFrame, lx: number): BoardAim | null {
  const u = (lx - f.ox) / f.scale;
  for (let i = 0; i < f.ids.length; i++) {
    const [x0] = f.geo.originOf(i);
    if (u >= x0 - POST_CM && u < x0 + SHELF_INNER_CM + POST_CM) return { kind: 'board', shelfId: f.ids[i]!, level: f.level, xCm: Math.min(SHELF_INNER_CM, Math.max(0, u - x0)) };
  }
  return null;
}
export function boardBoxPx(f: BoardFrame, i: number, id: string): PxRect | null {
  const b = f.geo.boxesOf[i]?.find((q) => q.id === id);
  if (!b) return null;
  const [x0, y0] = f.geo.originOf(i);
  return { x: f.ox + (x0 + b.local.x) * f.scale, y: f.oy + (y0 + b.local.y - f.geo.cut) * f.scale, w: b.local.w * f.scale, h: b.local.h * f.scale };
}

// Dessus en plongée (ArrangeView, les dessus liés côte à côte) : le dessus sous le doigt (celui dont la largeur contient le point, sinon le
// plus proche), le doigt au centre de l'empreinte (cm) ; `size` : empreinte de l'objet tenu.
export function topAim(ids: string[], layer: { w: number; h: number }, lx: number, ly: number, size: { w: number; d: number }): BoardAim {
  const fit = arrangeFrameFor('shelf', layer, ids.length);
  const w = FURNITURE_MODELS.shelf.w;
  let best = { i: 0, x: 0, z: 0, off: Infinity };
  for (let i = 0; i < ids.length; i++) {
    const { x, z } = screenToTop(frameAt(fit, i), lx, ly);
    const off = x < 0 ? -x : x >= w ? x - w : 0;
    if (off < best.off) best = { i, x, z, off };
  }
  return { kind: 'top', hostId: ids[best.i]!, x: Math.round(best.x - size.w / 2), z: Math.round(best.z - size.d / 2) };
}

export const isBoardLevel = (level: unknown): level is ShelfLevel => isShelfLevel(level);
