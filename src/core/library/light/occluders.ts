import { drawSize, localPointAt, occludersAt, perchAt, type Angle } from '../footprint';
import { FURNITURE_MODELS } from '../furniture-models';
import { CELL_H, CELL_W, DEPTH_PX_PER_CM, PX_PER_CM_X, PX_PER_CM_Y, occluderBoxesOf, openingOf, pieceBounds, type Piece } from '../furniture-render3d';
import { SHELF_GAP_CM, angleOf, boardItems, isLamp, isLit, isStanding, pxRect, rectOf, storedWidthCm } from '../room-grid';
import { computerPlacement, placementBounds, smallPlacement, storedPlacement } from '../carried-items';
import { itemPieces, type ItemPlacement } from '../item-models';
import type { PxRect } from '../room-grid';
import { isOnBoard, type Layout, type Placed, type StandingKind } from '../library-types';
import { ROOM_DEPTH_FACTOR } from './beam';

// Monde : x = pixels de la pièce, d = profondeur (0 = fond du mur, depthMax = devant), z = hauteur en px.
// Écran : y = wallH + d·k − z, avec k = floorH / depthMax.
export type Geom = { wallH: number; floorH: number };
export type Box = { owner: string; x0: number; x1: number; d0: number; d1: number; z0: number; z1: number };
export type LampSource = { id: string; x: number; d: number; z: number; box: string };

export const kOf = (g: Geom): number => g.floorH / (g.wallH * ROOM_DEPTH_FACTOR);

// Repère « lumière » d'un meuble posé (cm, cf. occluderBoxesOf) → monde : x px = bord gauche du rectangle + x cm (centrage compris),
// hauteur px = y cm × PX_PER_CM_Y, profondeur = bord avant (le bas du rectangle écran) − z cm × DEPTH_PX_PER_CM / k.
type Frame = { kind: Exclude<StandingKind, 'rug'>; angle: Angle; r: PxRect; dFront: number; sx: number; sy: number; k: number };
type HostFrame = Frame & { kind: 'desk' | 'shelf' };

function frameOf(p: Placed | undefined, g: Geom): Frame | null {
  if (!p || !isStanding(p) || p.kind === 'rug') return null;
  const rect = rectOf(p);
  if (!rect) return null;
  const r = pxRect(rect);
  const angle = angleOf(p);
  const { w, h } = drawSize(p.kind, angle);
  const k = kOf(g);
  return { kind: p.kind, angle, r, dFront: Math.max(0, (r.y + r.h - g.wallH) / k), sx: r.w / (w * CELL_W), sy: r.h / (h * CELL_H), k };
}
const wx = (f: Frame, x: number): number => f.r.x + x * PX_PER_CM_X * f.sx;
const wz = (f: Frame, y: number): number => y * PX_PER_CM_Y * f.sy;
const wd = (f: Frame, z: number): number => f.dFront - (z * DEPTH_PX_PER_CM * f.sy) / f.k;

// Bureau ou étagère qui porte l'écran ou un petit objet.
function hostFrame(layout: Layout, id: string, g: Geom): HostFrame | null {
  const f = frameOf(layout.find((p) => p.id === id), g);
  return f && (f.kind === 'desk' || f.kind === 'shelf') ? (f as HostFrame) : null;
}

// Dessus praticable d'un meuble (assise, plateau, haut de l'étagère) dans le monde : profondeur et hauteur de son centre ; null sinon.
export function perchWorldOf(layout: Layout, id: string, g: Geom): { d: number; z: number } | null {
  const f = frameOf(layout.find((p) => p.id === id), g);
  const p = f && perchAt(f.kind, f.angle, f.r);
  return f && p ? { d: wd(f, p.depth), z: wz(f, p.height) } : null;
}

// Boîtes (monde) d'un objet posé dans le repère de son porteur : celles de ses pièces, tournées avec le porteur (comme un meuble).
function carriedBoxes(owner: string, host: HostFrame, pieces: Piece[], out: Box[]): void {
  for (const b of occluderBoxesOf({ ...FURNITURE_MODELS[host.kind], pieces }, host.angle)) {
    out.push({ owner, x0: wx(host, b.x0), x1: wx(host, b.x1), d0: wd(host, b.d1), d1: wd(host, b.d0), z0: wz(host, b.z0), z1: wz(host, b.z1) });
  }
}

// Pose 3D d'un écran ou d'un petit objet sur le dessus de son porteur.
function topPlacementOf(p: Placed, layout: Layout, g: Geom): { host: HostFrame; pl: ItemPlacement } | null {
  if (p.kind === 'computer') {
    const host = hostFrame(layout, p.deskId, g);
    return host && host.kind === 'desk' ? { host, pl: computerPlacement(p.id) } : null;
  }
  if (p.kind !== 'small' || isOnBoard(p)) return null;
  const host = hostFrame(layout, p.hostId, g);
  return host ? { host, pl: smallPlacement(p.id, p.item, host.kind, p.x, p.z) } : null;
}

export function boxesOf(layout: Layout, geom: Geom): Box[] {
  const out: Box[] = [];
  for (const p of layout) {
    if (isStanding(p)) {
      const f = frameOf(p, geom);
      if (!f) continue;
      // Une boîte par pièce du modèle tourné ; la profondeur monde croît vers l'avant (z′ = 0).
      for (const b of occludersAt(f.kind, f.angle)) {
        out.push({ owner: p.id, x0: wx(f, b.x0), x1: wx(f, b.x1), d0: wd(f, b.d1), d1: wd(f, b.d0), z0: wz(f, b.z0), z1: wz(f, b.z1) });
      }
      // Objets rangés : une boîte par tablette garnie (du premier au dernier objet, à la hauteur du plus haut), pas une par objet :
      // le calque de lumière reste léger avec une étagère pleine. Ouverture cachée (profil, dos) : les montants pleins suffisent.
      if (p.kind === 'shelf' && openingOf(FURNITURE_MODELS.shelf, f.angle)) {
        const host = f as HostFrame;
        // Tablette par tablette (même rangement que storedPlacementsOf : largeur réelle + 1 cm d'écart), sans recherche par objet.
        for (const level of [0, 1, 2] as const) {
          let u: [number, number, number, number, number, number] | null = null;
          let at = 0;
          for (const item of boardItems(layout, p.id, level)) {
            const b = placementBounds(storedPlacement(item, at));
            at += storedWidthCm(item) + SHELF_GAP_CM;
            u = u ? [Math.min(u[0], b[0]), Math.max(u[1], b[1]), Math.min(u[2], b[2]), Math.max(u[3], b[3]), Math.min(u[4], b[4]), Math.max(u[5], b[5])] : b;
          }
          if (!u) continue;
          const [x0, x1, y0, y1, z0, z1] = u;
          carriedBoxes(`${p.id}#${level}`, host, [{ shape: 'box', x: x0, y: y0, z: z0, w: x1 - x0, h: y1 - y0, d: z1 - z0, fill: 'metal' }], out);
        }
      }
    } else if (p.kind === 'computer' || p.kind === 'small') {
      // Écran et petits objets : les boîtes de leurs pièces (modèle 3D posé sur le dessus, comme leur dessin).
      const at = topPlacementOf(p, layout, geom);
      if (at) carriedBoxes(p.id, at.host, itemPieces(at.pl), out);
    }
  }
  return out;
}

// Seulement les lampes allumées ; `box` est l'occulteur à ignorer pour cette source.
export function lampsOf(layout: Layout, geom: Geom): LampSource[] {
  const out: LampSource[] = [];
  for (const p of layout) {
    if (!isLamp(p) || !isLit(p)) continue;
    if (isStanding(p)) {
      const f = frameOf(p, geom);
      if (!f) continue;
      // Ampoule dans l'abat-jour (point `glow` du modèle), sinon au centre du dessus.
      const m = FURNITURE_MODELS[f.kind];
      const q = localPointAt(f.kind, f.angle, m.glow ?? [m.w / 2, m.h, m.d / 2]);
      out.push({ id: p.id, x: wx(f, q.x), d: wd(f, q.z), z: wz(f, q.y), box: p.id });
    } else if (p.kind === 'small') {
      // Petite lampe : ampoule au centre de son abat-jour (pièce `glow` du modèle).
      const at = topPlacementOf(p, layout, geom);
      if (!at) continue;
      const shade = itemPieces(at.pl).find((q) => q.tag?.startsWith('glow:'));
      const [x0, x1, y0, y1, z0, z1] = shade ? pieceBounds(shade) : placementBounds(at.pl);
      const q = localPointAt(at.host.kind, at.host.angle, [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2]);
      out.push({ id: p.id, x: wx(at.host, q.x), d: wd(at.host, q.z), z: wz(at.host, q.y), box: p.id });
    }
  }
  return out;
}
// Signature des occulteurs et des lampes déjà calculés (la pièce les a sous la main : pas de second calcul).
export function signatureOf(boxList: readonly Box[], lampList: readonly LampSource[]): string {
  const n = Math.round;
  const boxes = boxList.map((b) => `${b.owner}:${n(b.x0)},${n(b.x1)},${n(b.d0)},${n(b.d1)},${n(b.z0)},${n(b.z1)}`);
  const lamps = lampList.map((l) => `${l.id}:${n(l.x)},${n(l.d)},${n(l.z)}`);
  return `${boxes.join(';')}|${lamps.join(';')}`;
}

