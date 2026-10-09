import { SURFACE_SLOTS, computerRect, isLamp, isLit, isStanding, pxRect, rectOf, surfaceSlotRect } from '../room-grid';
import type { PxRect } from '../room-grid';
import type { Layout, Placed, StandingKind } from '../library-types';
import { ROOM_DEPTH_FACTOR } from './beam';

// Monde : x = pixels de la pièce, d = profondeur (0 = fond du mur, depthMax = devant), z = hauteur en px.
// Écran : y = wallH + d·k − z, avec k = floorH / depthMax.
export type Geom = { wallH: number; floorH: number };
export type Box = { owner: string; x0: number; x1: number; d0: number; d1: number; z0: number; z1: number };
export type LampSource = { id: string; x: number; d: number; z: number; box: string };

type Prim = readonly [fx0: number, fx1: number, fz0: number, fz1: number, fd0: number, fd1: number];
type Kind = Exclude<StandingKind, 'rug'>;

// Profondeur de chaque meuble, en px monde.
const DEPTH: Record<Kind, number> = {
  shelf: 50, desk: 70, chair: 50, sofa: 80, armchair: 70, basket: 60, bowl: 30, kennel: 90,
  charger: 30, plant: 40, lamp: 30, 'coffee-table': 70, globe: 50, telescope: 40, automaton: 40,
};

// Primitives en fractions de largeur, de hauteur et de profondeur (depuis l'avant).
const SOFA: Prim[] = [[0, 1, 0, 0.5, 0, 1], [0, 1, 0.5, 1, 0.7, 1], [0, 0.12, 0.5, 0.72, 0, 0.7], [0.88, 1, 0.5, 0.72, 0, 0.7]];
const FULL: Prim[] = [[0.1, 0.9, 0, 1, 0.1, 0.9]];
const PRIMS: Record<Kind, Prim[]> = {
  desk: [[0, 1, 0.84, 1, 0, 1], [0, 0.06, 0, 0.84, 0, 0.15], [0.94, 1, 0, 0.84, 0, 0.15], [0, 0.06, 0, 0.84, 0.85, 1], [0.94, 1, 0, 0.84, 0.85, 1]],
  'coffee-table': [[0, 1, 0.66, 1, 0, 1], [0.08, 0.14, 0, 0.66, 0, 0.2], [0.86, 0.92, 0, 0.66, 0, 0.2], [0.08, 0.14, 0, 0.66, 0.8, 1], [0.86, 0.92, 0, 0.66, 0.8, 1]],
  shelf: [[0, 0.04, 0, 1, 0, 1], [0.96, 1, 0, 1, 0, 1], [0, 1, 0, 0.03, 0, 1], [0, 1, 0.31, 0.34, 0, 1], [0, 1, 0.62, 0.65, 0, 1], [0, 1, 0.97, 1, 0, 1]],
  chair: [[0.1, 0.9, 0.4, 0.5, 0, 1], [0.1, 0.9, 0.5, 1, 0.85, 1], [0.1, 0.2, 0, 0.4, 0, 0.15], [0.8, 0.9, 0, 0.4, 0, 0.15], [0.1, 0.2, 0, 0.4, 0.85, 1], [0.8, 0.9, 0, 0.4, 0.85, 1]],
  sofa: SOFA,
  armchair: SOFA,
  basket: [[0, 1, 0, 0.5, 0, 1]],
  bowl: [[0, 1, 0, 0.5, 0, 1]],
  kennel: [[0, 1, 0, 0.7, 0, 1], [0, 1, 0.7, 1, 0, 1]],
  charger: [[0, 1, 0, 0.3, 0, 1]],
  plant: [[0.2, 0.8, 0, 0.25, 0.2, 0.8], [0.1, 0.9, 0.25, 1, 0.1, 0.9]],
  lamp: [[0.1, 0.9, 0, 0.05, 0.2, 0.8], [0.45, 0.55, 0.05, 0.83, 0.45, 0.55], [0, 1, 0.83, 1, 0.2, 0.8]],
  globe: FULL,
  telescope: FULL,
  automaton: FULL,
};

const SMALL_BOX_H = 38;
const SMALL_HALF_W = 10;
const SMALL_LAMP_Z = 30;
const LAMP_TOP_Z = 0.92;

export const kOf = (g: Geom): number => g.floorH / (g.wallH * ROOM_DEPTH_FACTOR);
// Profondeur du bord avant du meuble (le bas de son rectangle écran).
const dFrontOf = (r: PxRect, g: Geom): number => Math.max(0, (r.y + r.h - g.wallH) / kOf(g));

function primBoxes(owner: string, kind: Kind, r: PxRect, dFront: number): Box[] {
  const D = DEPTH[kind];
  return PRIMS[kind].map(([fx0, fx1, fz0, fz1, fd0, fd1]) => ({
    owner,
    x0: r.x + fx0 * r.w, x1: r.x + fx1 * r.w,
    d0: dFront - fd1 * D, d1: dFront - fd0 * D,
    z0: fz0 * r.h, z1: fz1 * r.h,
  }));
}

export type Host = { kind: 'desk' | 'shelf'; r: PxRect; dFront: number; D: number };

export function hostOf(layout: Layout, id: string, g: Geom): Host | null {
  const h = layout.find((p) => p.id === id);
  if (!h || (h.kind !== 'desk' && h.kind !== 'shelf')) return null;
  const rect = rectOf(h);
  if (!rect) return null;
  const r = pxRect(rect);
  return { kind: h.kind, r, dFront: dFrontOf(r, g), D: DEPTH[h.kind] };
}

// Support quelconque (canapé, fauteuil, chaise, table basse…) : même empreinte que ses boîtes, sans exiger bureau ou étagère.
export type Support = { r: PxRect; dFront: number; D: number };

export function supportOf(layout: Layout, id: string, g: Geom): Support | null {
  const h = layout.find((p) => p.id === id);
  if (!h || !isStanding(h) || h.kind === 'rug') return null;
  const rect = rectOf(h);
  if (!rect) return null;
  const r = pxRect(rect);
  return { r, dFront: dFrontOf(r, g), D: DEPTH[h.kind] };
}

// Centre en x du petit objet sur son emplacement.
function smallCx(p: Extract<Placed, { kind: 'small' }>, host: Host): number {
  const s = surfaceSlotRect(host.r, SURFACE_SLOTS[host.kind], p.slot);
  return s.x + s.w / 2;
}

export function boxesOf(layout: Layout, geom: Geom): Box[] {
  const out: Box[] = [];
  for (const p of layout) {
    if (isStanding(p)) {
      if (p.kind === 'rug') continue;
      const rect = rectOf(p);
      if (!rect) continue;
      const r = pxRect(rect);
      out.push(...primBoxes(p.id, p.kind, r, dFrontOf(r, geom)));
    } else if (p.kind === 'computer') {
      const host = hostOf(layout, p.deskId, geom);
      if (!host || host.kind !== 'desk') continue;
      const c = computerRect(host.r);
      out.push({
        owner: p.id, x0: c.x, x1: c.x + c.w,
        d0: host.dFront - 0.7 * host.D, d1: host.dFront - 0.3 * host.D,
        z0: host.r.h, z1: host.r.h + c.h,
      });
    } else if (p.kind === 'small') {
      const host = hostOf(layout, p.hostId, geom);
      if (!host) continue;
      const cx = smallCx(p, host);
      out.push({
        owner: p.id, x0: cx - SMALL_HALF_W, x1: cx + SMALL_HALF_W,
        d0: host.dFront - 0.7 * host.D, d1: host.dFront - 0.3 * host.D,
        z0: host.r.h, z1: host.r.h + SMALL_BOX_H,
      });
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
      const rect = rectOf(p);
      if (!rect) continue;
      const r = pxRect(rect);
      out.push({ id: p.id, x: r.x + r.w / 2, d: dFrontOf(r, geom) - 0.5 * DEPTH.lamp, z: LAMP_TOP_Z * r.h, box: p.id });
    } else if (p.kind === 'small') {
      const host = hostOf(layout, p.hostId, geom);
      if (!host) continue;
      out.push({ id: p.id, x: smallCx(p, host), d: host.dFront - 0.5 * host.D, z: host.r.h + SMALL_LAMP_Z, box: p.id });
    }
  }
  return out;
}

export function layoutSignature(layout: Layout, geom: Geom): string {
  const n = Math.round;
  const boxes = boxesOf(layout, geom).map((b) => `${b.owner}:${n(b.x0)},${n(b.x1)},${n(b.d0)},${n(b.d1)},${n(b.z0)},${n(b.z1)}`);
  const lamps = lampsOf(layout, geom).map((l) => `${l.id}:${n(l.x)},${n(l.d)},${n(l.z)}`);
  return `${boxes.join(';')}|${lamps.join(';')}`;
}
