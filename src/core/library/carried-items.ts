// src/core/library/carried-items.ts
// Objets portés par un meuble (cartes rangées, écran, petits objets) posés en 3D dans le repère de leur porteur (cm) : la pièce, le zoom
// et le calque de lumière les placent tous de la même façon. Un objet posé se dessine par translation de son propre dessin (la projection
// est affine) : sa géométrie est calculée une fois par (forme, présentation, angle), quelle que soit sa place.
import { drawSize, type Angle } from './footprint';
import { FURNITURE_MODELS } from './furniture-models';
import { CELL_H, CELL_W, levelsOf, localPointOf, pieceBounds, projectOf, type V3t } from './furniture-render3d';
import { ITEM_MODELS, bookColor, itemModel, itemPieces, storedFrontCorners, type ItemPlacement, type ItemShape } from './item-models';
import type { Layout, Placed, ShelfLevel, SmallItem } from './library-types';
import { SHELF_GAP_CM, SURFACE_SLOTS, boardItems, displayOf, storedWidthCm, type HostKind, type PxRect, type Stored } from './room-grid';

const SHELF = FURNITURE_MODELS.shelf;
const DESK = FURNITURE_MODELS.desk;
// Tout objet rangé, de face comme sur la tranche, se tient près du bord avant de sa tablette (2 cm en retrait), comme dans une vraie
// bibliothèque : il se lit posé sur la tablette, pas reculé contre le fond.
// Écart volontaire : la visée d'une tablette, le fantôme du dépôt et les pointillés de place libre (room-grid : boardAt, shelfLayoutIn,
// shelfFreeIn) restent sur le plan de la face (z = 0), 2 cm devant les objets ; à l'écran (échelle 1), environ 1 px de face et 2 px en ¾.
// Un seul repère de face pour la visée garde les tablettes alignées sur les planches dessinées.
const FRONT_CM = 2;
// Écran posé vers le fond du bureau (son pied à 40 cm de l'avant) : la place devant reste libre pour les petits objets.
const MONITOR_Z_CM = 40;
const SMALL_SHAPE: Record<SmallItem, ItemShape> = { plant: 'small-plant', lamp: 'small-lamp' };

// Dessus (cm) de la planche qui porte chaque tablette : du haut (0) vers le bas (2), lu dans le modèle de l'étagère.
// (arrondi au millionième : les fractions de levelsOf laissent des restes de calcul flottant).
const BOARD_TOP_CM: readonly number[] = levelsOf(SHELF).map(([, bottom]) => Math.round((SHELF.face!.y + SHELF.face!.h * (1 - bottom)) * 1e6) / 1e6);
export const boardTopCm = (level: ShelfLevel): number => BOARD_TOP_CM[level]!;

// Objet rangé à `x0Cm` du bord gauche de la face (rangement de room-grid), près du bord avant ; un livre prend la couleur de dos de sa carte.
export function storedPlacement(item: Stored, x0Cm: number): ItemPlacement {
  const display = displayOf(item);
  return {
    key: item.id, shape: item.shape, display,
    x: SHELF.face!.x + x0Cm, y: boardTopCm(item.level), z: FRONT_CM,
    ...(item.shape === 'book' && { color: bookColor(item.slug) }),
  };
}

// Objets rangés d'une étagère posés à leur place (même rangement que shelfLayoutIn : largeur réelle + 1 cm entre deux objets).
export function storedPlacementsOf(layout: Layout, shelfId: string): Map<string, ItemPlacement> {
  const out = new Map<string, ItemPlacement>();
  for (const level of [0, 1, 2] as const) {
    let x0 = 0;
    for (const p of boardItems(layout, shelfId, level)) {
      out.set(p.id, storedPlacement(p, x0));
      x0 += storedWidthCm(p) + SHELF_GAP_CM;
    }
  }
  return out;
}

// Écran : centré sur la largeur du bureau, vers le fond.
export function computerPlacement(id: string): ItemPlacement {
  const m = ITEM_MODELS.monitor;
  return { key: id, shape: 'monitor', x: (DESK.w - m.w) / 2, y: DESK.h, z: MONITOR_Z_CM };
}

// Petit objet : centré sur son emplacement (les emplacements se suivent le long de la largeur du porteur), à mi-profondeur du dessus.
export function smallPlacement(id: string, item: SmallItem, hostKind: HostKind, slot: number): ItemPlacement {
  const host = FURNITURE_MODELS[hostKind];
  const shape = SMALL_SHAPE[item];
  const m = ITEM_MODELS[shape];
  return { key: id, shape, x: (host.w * (slot + 0.5)) / SURFACE_SLOTS[hostKind] - m.w / 2, y: host.h, z: host.d / 2 - m.d / 2 };
}

// Porteur et pose d'un objet porté ; null pour un autre objet ou un porteur absent. Un objet rangé est posé d'après ses voisins de tablette.
export function carriedPlacementOf(layout: Layout, p: Placed): { hostId: string; hostKind: HostKind; placement: ItemPlacement } | null {
  const hostId = p.kind === 'computer' ? p.deskId : p.kind === 'small' ? p.hostId : p.kind === 'stored' ? p.shelfId : null;
  const host = hostId ? layout.find((x) => x.id === hostId) : undefined;
  if (!host || (host.kind !== 'desk' && host.kind !== 'shelf')) return null;
  if (p.kind === 'computer') return host.kind === 'desk' ? { hostId: host.id, hostKind: 'desk', placement: computerPlacement(p.id) } : null;
  if (p.kind === 'small') return { hostId: host.id, hostKind: host.kind, placement: smallPlacement(p.id, p.item, host.kind, p.slot) };
  if (p.kind === 'stored' && host.kind === 'shelf') {
    const placement = storedPlacementsOf(layout, host.id).get(p.id);
    return placement ? { hostId: host.id, hostKind: 'shelf', placement } : null;
  }
  return null;
}

// Projection du porteur (affine) mise en cache par (porteur, angle) : origine et images des trois axes, en px de son dessin non mis à l'échelle.
const affineCache = new Map<string, [number, number][]>();
// Point du repère du porteur (cm) → px de son dessin à l'échelle 1 (repère du Model3DArt avant mise à l'échelle).
export function hostNativePx(hostKind: HostKind, angle: Angle, p: V3t): [number, number] {
  const key = `${hostKind}:${angle}`;
  let a = affineCache.get(key);
  if (!a) {
    const m = FURNITURE_MODELS[hostKind];
    const o = projectOf(m, angle, [0, 0, 0]);
    const axis = (v: V3t): [number, number] => {
      const q = projectOf(m, angle, v);
      return [q[0] - o[0], q[1] - o[1]];
    };
    a = [o, axis([1, 0, 0]), axis([0, 1, 0]), axis([0, 0, 1])];
    affineCache.set(key, a);
  }
  const [o, ex, ey, ez] = a as [[number, number], [number, number], [number, number], [number, number]];
  return [o[0] + p[0] * ex[0] + p[1] * ey[0] + p[2] * ez[0], o[1] + p[0] * ex[1] + p[1] * ey[1] + p[2] * ez[1]];
}

// Point du repère du porteur (cm) → px de la pièce, dans le rectangle `rect` du porteur tourné (même projection et même échelle que son dessin).
export function hostPointPx(hostKind: HostKind, angle: Angle, rect: PxRect, p: V3t): [number, number] {
  const { w, h } = drawSize(hostKind, angle);
  const [x, y] = hostNativePx(hostKind, angle, p);
  return [rect.x + (x * rect.w) / (w * CELL_W), rect.y + (y * rect.h) / (h * CELL_H)];
}

// Encombrement (cm, repère du porteur) des pièces d'un objet posé : [x0, x1, y0, y1, z0, z1].
export function placementBounds(pl: ItemPlacement, steampunk = false): [number, number, number, number, number, number] {
  const b: [number, number, number, number, number, number] = [Infinity, -Infinity, Infinity, -Infinity, Infinity, -Infinity];
  for (const q of itemPieces(pl, steampunk)) {
    const [x0, x1, y0, y1, z0, z1] = pieceBounds(q);
    b[0] = Math.min(b[0], x0); b[1] = Math.max(b[1], x1); b[2] = Math.min(b[2], y0); b[3] = Math.max(b[3], y1); b[4] = Math.min(b[4], z0); b[5] = Math.max(b[5], z1);
  }
  return b;
}

// Rectangle englobant (px de la pièce) d'un objet posé, ses 8 coins projetés : zone touchable de l'écran et des petits objets (l'écran
// dépasse au-dessus du rectangle du bureau : sa zone aussi).
export function placementRectPx(hostKind: HostKind, angle: Angle, rect: PxRect, pl: ItemPlacement, steampunk = false): PxRect {
  const [x0, x1, y0, y1, z0, z1] = placementBounds(pl, steampunk);
  const pts = [x0, x1].flatMap((x) => [y0, y1].flatMap((y) => [z0, z1].map((z) => hostPointPx(hostKind, angle, rect, [x, y, z]))));
  const xs = pts.map((q) => q[0]);
  const ys = pts.map((q) => q[1]);
  return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
}

// Face avant d'un objet rangé (couverture de face, penchée sur son présentoir ; tranche sur la tranche), px de la pièce : haut gauche, haut droit, bas droit, bas gauche
// (parallélogramme en ¾). Zone touchable de l'objet, là où on le voit.
export function storedFrontQuad(angle: Angle, rect: PxRect, pl: ItemPlacement): [number, number][] {
  return storedFrontCorners(pl).map((q) => hostPointPx('shelf', angle, rect, q));
}

// Vitre de l'écran (pièce décorée « screen »), px de la pièce, mêmes coins : zone touchable de la carte affichée.
export function screenQuad(angle: Angle, rect: PxRect, pl: ItemPlacement, steampunk = false): [number, number][] {
  const glass = itemModel('monitor', steampunk).pieces.find((q) => q.shape === 'box' && q.decals?.some((d) => d.key.startsWith('screen:')));
  if (!glass || glass.shape !== 'box') return [];
  const [x0, x1, y0, y1, z] = [pl.x + glass.x, pl.x + glass.x + glass.w, pl.y + glass.y, pl.y + glass.y + glass.h, pl.z + glass.z];
  return ([[x0, y1], [x1, y1], [x1, y0], [x0, y0]] as const).map(([x, y]) => hostPointPx('desk', angle, rect, [x, y, z]));
}

// Zone touchable de la carte d'un objet porté (px de la pièce) : face avant d'un objet rangé, vitre d'un écran qui affiche une carte ;
// null pour un petit objet ou un écran vide.
export function cardQuad(p: Placed, angle: Angle, rect: PxRect, pl: ItemPlacement, steampunk = false): [number, number][] | null {
  if (p.kind === 'stored') return storedFrontQuad(angle, rect, pl);
  if (p.kind === 'computer' && p.slug) return screenQuad(angle, rect, pl, steampunk);
  return null;
}

// Rectangle englobant d'un polygone (px).
export function boxOfQuad(quad: readonly (readonly [number, number])[]): PxRect {
  const xs = quad.map((q) => q[0]);
  const ys = quad.map((q) => q[1]);
  return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
}

// Profondeur (cm, depuis l'avant de la trace tournée) du centre d'un objet posé : les objets d'un même dessus se dessinent du plus loin au plus proche.
export function placementDepth(hostKind: HostKind, angle: Angle, pl: ItemPlacement, steampunk = false): number {
  const [x0, x1, , , z0, z1] = placementBounds(pl, steampunk);
  return localPointOf(FURNITURE_MODELS[hostKind], angle, [(x0 + x1) / 2, pl.y, (z0 + z1) / 2]).z;
}

// Ordre de dessin des objets rangés d'une étagère : tablette du bas d'abord, puis, sur une tablette, celui du côté opposé au spectateur
// (à l'angle 1 on voit le flanc droit : de gauche à droite ; à l'angle 7, de droite à gauche). Ils sont séparés par des plans verticaux :
// cet ordre est exact.
export function storedDrawOrder<T extends { level: ShelfLevel; order: number }>(items: readonly T[], angle: Angle): T[] {
  const dir = angle === 7 ? -1 : 1;
  return [...items].sort((a, b) => b.level - a.level || dir * (a.order - b.order));
}
