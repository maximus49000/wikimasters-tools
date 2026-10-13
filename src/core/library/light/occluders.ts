import { drawSize, localPointAt, occludersAt, perchAt, type Angle } from '../footprint';
import { FURNITURE_MODELS } from '../furniture-models';
import { CELL_H, CELL_W, DEPTH_PX_PER_CM, PX_PER_CM_X, PX_PER_CM_Y } from '../furniture-render3d';
import { SURFACE_SLOTS, angleOf, computerRectOn, isLamp, isLit, isStanding, pxRect, rectOf, surfaceSlotRectOn } from '../room-grid';
import type { PxRect } from '../room-grid';
import type { Layout, Placed, StandingKind } from '../library-types';
import { ROOM_DEPTH_FACTOR } from './beam';

// Monde : x = pixels de la pièce, d = profondeur (0 = fond du mur, depthMax = devant), z = hauteur en px.
// Écran : y = wallH + d·k − z, avec k = floorH / depthMax.
export type Geom = { wallH: number; floorH: number };
export type Box = { owner: string; x0: number; x1: number; d0: number; d1: number; z0: number; z1: number };
export type LampSource = { id: string; x: number; d: number; z: number; box: string };

const SMALL_BOX_H = 38;
const SMALL_HALF_W = 10;
const SMALL_LAMP_Z = 30;
// Demi-profondeur (cm) des boîtes de l'écran et des petits objets posés sur un dessus.
const COMPUTER_HALF_D = 10;
const SMALL_HALF_D = 8;

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
// Profondeur monde du point du dessus du porteur à la fraction u de sa largeur, à mi-profondeur (même point que topPoint).
function topDepth(f: Frame, u: number): number {
  const m = FURNITURE_MODELS[f.kind];
  return wd(f, localPointAt(f.kind, f.angle, [u * m.w, m.h, m.d / 2]).z);
}
const topZ = (f: Frame): number => wz(f, FURNITURE_MODELS[f.kind].h);

// Dessus praticable d'un meuble (assise, plateau, haut de l'étagère) dans le monde : profondeur et hauteur de son centre ; null sinon.
export function perchWorldOf(layout: Layout, id: string, g: Geom): { d: number; z: number } | null {
  const f = frameOf(layout.find((p) => p.id === id), g);
  const p = f && perchAt(f.kind, f.angle, f.r);
  return f && p ? { d: wd(f, p.depth), z: wz(f, p.height) } : null;
}

// Centre en x et profondeur du petit objet sur son emplacement (même place que son dessin).
function smallAt(p: Extract<Placed, { kind: 'small' }>, host: HostFrame): { x: number; d: number } {
  const s = surfaceSlotRectOn(host.r, host.kind, host.angle, p.slot);
  return { x: s.x + s.w / 2, d: topDepth(host, (p.slot + 0.5) / SURFACE_SLOTS[host.kind]) };
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
    } else if (p.kind === 'computer') {
      const host = hostFrame(layout, p.deskId, geom);
      if (!host || host.kind !== 'desk') continue;
      const c = computerRectOn(host.r, host.angle);
      const d = topDepth(host, 0.5);
      const hd = (COMPUTER_HALF_D * DEPTH_PX_PER_CM * host.sy) / host.k;
      const z0 = topZ(host);
      // Le pied de l'écran touche le dessus, l'écran en dépasse de c.h − 2 px (cf. computerRectOn).
      out.push({ owner: p.id, x0: c.x, x1: c.x + c.w, d0: d - hd, d1: d + hd, z0, z1: z0 + c.h - 2 });
    } else if (p.kind === 'small') {
      const host = hostFrame(layout, p.hostId, geom);
      if (!host) continue;
      const { x, d } = smallAt(p, host);
      const hd = (SMALL_HALF_D * DEPTH_PX_PER_CM * host.sy) / host.k;
      const z0 = topZ(host);
      out.push({ owner: p.id, x0: x - SMALL_HALF_W, x1: x + SMALL_HALF_W, d0: d - hd, d1: d + hd, z0, z1: z0 + SMALL_BOX_H });
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
      const host = hostFrame(layout, p.hostId, geom);
      if (!host) continue;
      const { x, d } = smallAt(p, host);
      out.push({ id: p.id, x, d, z: topZ(host) + SMALL_LAMP_Z, box: p.id });
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

export const layoutSignature = (layout: Layout, geom: Geom): string => signatureOf(boxesOf(layout, geom), lampsOf(layout, geom));
