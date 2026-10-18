// Plateau des meubles en cm : empreintes, chevauchement, première place libre (repère du meuble, z = 0 au bord avant).
import { computerPlacement, placementBounds } from './carried-items';
import { FURNITURE_MODELS } from './furniture-models';
import { ITEM_MODELS, storedModel } from './item-models';
import type { BoxFormat } from '../game/platform-boxes';
import type { Layout, Pose, Posed, ShelfShape, SmallItem, SmallOnTop } from './library-types';
import { canHostSmall, type HostKind } from './room-grid';

export type TopRect = { x: number; z: number; w: number; d: number };
export const HOST_TOP: Record<HostKind, { w: number; d: number }> = {
  desk: { w: FURNITURE_MODELS.desk.w, d: FURNITURE_MODELS.desk.d },
  shelf: { w: FURNITURE_MODELS.shelf.w, d: FURNITURE_MODELS.shelf.d },
};
// Profondeur réservée devant le poste hi-fi pour la pochette couchée (hifi.ts la réutilise).
export const SLEEVE_ZONE_CM = 14.5;
// Profondeur du trépied d'une carte posée.
export const POSED_DEPTH_CM = 8;
export const TOP_STEP_CM = 2;

// `pose` absente = trépied.
export type TopThing = { item: SmallItem } | { shape: ShelfShape; box?: BoxFormat; pose?: Pose };

// Empreinte au sol : trépied = largeur de la couverture × profondeur du trépied ; à plat = la couverture couchée (largeur × hauteur du boîtier).
export function topSize(t: TopThing): { w: number; d: number } {
  if ('shape' in t) {
    const m = storedModel(t.shape, t.box);
    return { w: m.w, d: t.pose === 'flat' ? m.h : POSED_DEPTH_CM };
  }
  const m = ITEM_MODELS[`small-${t.item}`];
  return t.item === 'hifi' ? { w: m.w, d: m.d + SLEEVE_ZONE_CM } : { w: m.w, d: m.d };
}

// Ce qu'un objet du plateau occupe (petit objet ou carte posée, avec sa pose).
export const topThingOf = (p: SmallOnTop | Posed): TopThing => (p.kind === 'small' ? { item: p.item } : { shape: p.shape, box: p.box, ...(p.pose && { pose: p.pose }) });

const hostKindOf = (layout: Layout, hostId: string): HostKind | null => {
  const h = layout.find((p) => p.id === hostId);
  return h && (h.kind === 'desk' || h.kind === 'shelf') ? h.kind : null;
};

// Empreintes déjà prises sur le plateau : petits objets et cartes posées (nouvelles formes x/z), plus l'ordinateur. Les objets sur tablette sont ignorés.
export function topRectsOf(layout: Layout, hostId: string, ignoreId?: string): TopRect[] {
  const out: TopRect[] = [];
  for (const p of layout) {
    if (p.id === ignoreId) continue;
    if (p.kind === 'computer' && p.deskId === hostId) out.push(computerTopRect());
    else if ((p.kind === 'small' || p.kind === 'posed') && p.hostId === hostId && 'x' in p) {
      out.push({ x: p.x, z: p.z, ...topSize(topThingOf(p)) });
    }
  }
  return out;
}

export const topsApart = (a: TopRect, b: TopRect): boolean => a.x + a.w <= b.x || b.x + b.w <= a.x || a.z + a.d <= b.z || b.z + b.d <= a.z;

// Empreinte de l'écran sur le bureau (bornes x/z de ses pièces) : la même pour tout ordinateur (il ne se déplace pas sur son bureau).
// Toujours l'écran plat, même en Steampunk (la machine analytique a 1 cm de plus en profondeur) : la chaîne hi-fi (40,5 cm avec sa
// pochette) doit tenir devant l'écran dans tous les styles, et une empreinte qui changerait avec le style déplacerait des objets.
let computerRect: TopRect | null = null;
export function computerTopRect(): TopRect {
  if (!computerRect) {
    const [x0, x1, , , z0, z1] = placementBounds(computerPlacement('pc'));
    computerRect = { x: x0, z: z0, w: x1 - x0, d: z1 - z0 };
  }
  return computerRect;
}

// Le rectangle tient sur le plateau (bords compris) sans chevaucher les empreintes `taken` (contact toléré).
const fitsTop = (top: { w: number; d: number }, taken: readonly TopRect[], r: TopRect): boolean =>
  r.x >= 0 && r.z >= 0 && r.x + r.w <= top.w && r.z + r.d <= top.d && taken.every((o) => topsApart(r, o));

export function canPutOnTop(layout: Layout, hostId: string, thing: TopThing, x: number, z: number, ignoreId?: string): boolean {
  const kind = hostKindOf(layout, hostId);
  if (!kind || ('item' in thing && !canHostSmall(kind, thing.item))) return false;
  return fitsTop(HOST_TOP[kind], topRectsOf(layout, hostId, ignoreId), { x, z, ...topSize(thing) });
}

// Première place libre : du bord avant vers le fond, de la gauche vers la droite, au pas de 2 cm ; en dernier essai, collé au bord droit / fond.
// La grille de 2 cm peut manquer un creux à un décalage impair : la pose précise viendra avec la vue Modifier.
// Les empreintes du plateau sont lues une seule fois (la fonction sert pendant les glissés).
export function firstFreeTopSpot(layout: Layout, hostId: string, thing: TopThing, ignoreId?: string): { x: number; z: number } | null {
  const kind = hostKindOf(layout, hostId);
  if (!kind || ('item' in thing && !canHostSmall(kind, thing.item))) return null;
  const { w, d } = topSize(thing);
  const top = HOST_TOP[kind];
  const [maxX, maxZ] = [top.w - w, top.d - d];
  if (maxX < 0 || maxZ < 0) return null;
  const taken = topRectsOf(layout, hostId, ignoreId);
  for (let z = 0; z <= maxZ; z += TOP_STEP_CM)
    for (let x = 0; x <= maxX; x += TOP_STEP_CM) if (fitsTop(top, taken, { x, z, w, d })) return { x, z };
  return fitsTop(top, taken, { x: maxX, z: maxZ, w, d }) ? { x: maxX, z: maxZ } : null;
}
