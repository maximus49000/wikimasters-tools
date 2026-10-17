// Plateau des meubles en cm : empreintes, chevauchement, première place libre (repère du meuble, z = 0 au bord avant).
import { computerPlacement, placementBounds } from './carried-items';
import { FURNITURE_MODELS } from './furniture-models';
import { ITEM_MODELS, storedModel } from './item-models';
import type { BoxFormat } from '../game/platform-boxes';
import type { Layout, Placed, Posed, ShelfShape, SmallItem, SmallOnTop } from './library-types';
import { canHostSmall, type HostKind } from './room-grid';

export type TopRect = { x: number; z: number; w: number; d: number };
export const HOST_TOP: Record<HostKind, { w: number; d: number }> = {
  desk: { w: FURNITURE_MODELS.desk.w, d: FURNITURE_MODELS.desk.d },
  shelf: { w: FURNITURE_MODELS.shelf.w, d: FURNITURE_MODELS.shelf.d },
};
// Profondeur réservée devant le poste hi-fi pour la pochette couchée (hifi.ts la réutilise).
export const SLEEVE_ZONE_CM = 14.5;
// Profondeur du chevalet d'une carte posée.
export const POSED_DEPTH_CM = 8;
export const TOP_STEP_CM = 2;

export type TopThing = { item: SmallItem } | { shape: ShelfShape; box?: BoxFormat };

export function topSize(t: TopThing): { w: number; d: number } {
  if ('shape' in t) return { w: storedModel(t.shape, t.box).w, d: POSED_DEPTH_CM };
  const m = ITEM_MODELS[`small-${t.item}`];
  return t.item === 'hifi' ? { w: m.w, d: m.d + SLEEVE_ZONE_CM } : { w: m.w, d: m.d };
}

const hostKindOf = (layout: Layout, hostId: string): HostKind | null => {
  const h = layout.find((p) => p.id === hostId);
  return h && (h.kind === 'desk' || h.kind === 'shelf') ? h.kind : null;
};

// Empreintes déjà prises sur le plateau : petits objets et cartes posées (nouvelles formes x/z), plus l'ordinateur. Les objets sur tablette sont ignorés.
export function topRectsOf(layout: Layout, hostId: string, ignoreId?: string): TopRect[] {
  const out: TopRect[] = [];
  for (const p of layout as (Placed | SmallOnTop | Posed)[]) {
    if (p.id === ignoreId) continue;
    if (p.kind === 'computer' && p.deskId === hostId) {
      const [x0, x1, , , z0, z1] = placementBounds(computerPlacement(p.id));
      out.push({ x: x0, z: z0, w: x1 - x0, d: z1 - z0 });
    } else if ((p.kind === 'small' || p.kind === 'posed') && p.hostId === hostId && 'x' in p) {
      out.push({ x: p.x, z: p.z, ...topSize(p.kind === 'small' ? { item: p.item } : { shape: p.shape, box: p.box }) });
    }
  }
  return out;
}

const apart = (a: TopRect, b: TopRect): boolean => a.x + a.w <= b.x || b.x + b.w <= a.x || a.z + a.d <= b.z || b.z + b.d <= a.z;

export function canPutOnTop(layout: Layout, hostId: string, thing: TopThing, x: number, z: number, ignoreId?: string): boolean {
  const kind = hostKindOf(layout, hostId);
  if (!kind || ('item' in thing && !canHostSmall(kind, thing.item))) return false;
  const { w, d } = topSize(thing);
  const top = HOST_TOP[kind];
  if (x < 0 || z < 0 || x + w > top.w || z + d > top.d) return false;
  const r = { x, z, w, d };
  return topRectsOf(layout, hostId, ignoreId).every((o) => apart(r, o));
}

// Première place libre : du bord avant vers le fond, de la gauche vers la droite, au pas de 2 cm ; en dernier essai, collé au bord droit / fond.
export function firstFreeTopSpot(layout: Layout, hostId: string, thing: TopThing, ignoreId?: string): { x: number; z: number } | null {
  const kind = hostKindOf(layout, hostId);
  if (!kind || ('item' in thing && !canHostSmall(kind, thing.item))) return null;
  const { w, d } = topSize(thing);
  const top = HOST_TOP[kind];
  const [maxX, maxZ] = [top.w - w, top.d - d];
  if (maxX < 0 || maxZ < 0) return null;
  for (let z = 0; z <= maxZ; z += TOP_STEP_CM)
    for (let x = 0; x <= maxX; x += TOP_STEP_CM) if (canPutOnTop(layout, hostId, thing, x, z, ignoreId)) return { x, z };
  return canPutOnTop(layout, hostId, thing, maxX, maxZ, ignoreId) ? { x: maxX, z: maxZ } : null;
}
