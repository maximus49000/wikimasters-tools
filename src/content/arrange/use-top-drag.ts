// Glissé au cm d'un objet sur le plateau (vue Modifier) : le doigt saisit l'objet tout de suite, l'empreinte dit vert/rouge, le relâcher
// enregistre (vert) ou rend l'objet à sa place (rouge). Pendant le glissé, seul l'objet tenu bouge (translation px) : la disposition
// n'est écrite qu'au relâcher, par `onCommit`. L'écriture est asynchrone (dépôt, puis notification) : jusqu'à ce que la disposition reçue
// montre la nouvelle place, l'objet reste dessiné là où on l'a lâché (`pending`), il ne saute pas.
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { dropOnTop, moveOnTop, topToScreen, type ArrangeFrame } from '../../core/library/arrange';
import type { Layout } from '../../core/library/library-types';

// Un toucher qui bouge de moins de 4 px n'est pas un glissé.
const SLOP_PX = 4;

// Images écran (px) des axes x et z du plateau, calculées une fois par cadre : la projection est affine, le glissé ne refait aucune projection.
export type TopAxes = { ex: [number, number]; ez: [number, number] };
export function axesOf(f: ArrangeFrame): TopAxes {
  const o = topToScreen(f, 0, 0);
  const x = topToScreen(f, 1, 0);
  const z = topToScreen(f, 0, 1);
  return { ex: [x[0] - o[0], x[1] - o[1]], ez: [z[0] - o[0], z[1] - o[1]] };
}

// Objet tenu : place visée (cm, coin avant gauche, arrondie au cm), validité, et translation px depuis sa place d'origine.
export type TopDrag = { id: string; x: number; z: number; ok: boolean; tx: number; ty: number };
// Objet lâché en vert, en attente de la disposition écrite : même translation, tenue jusqu'à ce que `layout` le montre à (x, z).
export type TopPending = { id: string; x: number; z: number; tx: number; ty: number };

// `pointerId` : seul ce doigt compte (un second doigt ou la paume n'ont pas de prise).
type Held = { id: string; x0: number; z0: number; sx: number; sy: number; moving: boolean; pointerId: number };

type Options = {
  layout: Layout;
  hostId: string;
  frame: ArrangeFrame;
  // Calque tourné de 90° (écran en hauteur) : un déplacement écran (dX, dY) vaut (dY, −dX) dans le calque.
  rotated: boolean;
  onCommit(next: Layout): void;
};

export function useTopDrag({ layout, hostId, frame, rotated, onCommit }: Options): { drag: TopDrag | null; pending: TopPending | null; grab(id: string, e: ReactPointerEvent): void } {
  const [drag, setDrag] = useState<TopDrag | null>(null);
  const [pending, setPending] = useState<TopPending | null>(null);
  const held = useRef<Held | null>(null);
  const dragRef = useRef<TopDrag | null>(null);
  const axes = useMemo(() => axesOf(frame), [frame]);
  // Relus par les écouteurs de la fenêtre (posés une fois par saisie).
  const live = useRef({ layout, hostId, axes, rotated, onCommit });
  live.current = { layout, hostId, axes, rotated, onCommit };
  const stop = useRef<(() => void) | null>(null);
  useEffect(() => () => stop.current?.(), []);
  // La disposition reçue montre l'objet à sa nouvelle place : la translation d'attente tombe (l'objet y est dessiné pour de bon).
  useEffect(() => {
    if (!pending) return;
    const p = layout.find((q) => q.id === pending.id);
    if (p && 'x' in p && p.x === pending.x && p.z === pending.z) setPending(null);
  }, [layout, pending]);

  const grab = (id: string, e: ReactPointerEvent): void => {
    const p = live.current.layout.find((q) => q.id === id);
    // Objet en attente d'écriture : pas de nouvelle prise avant que sa place soit enregistrée.
    if (held.current || pending?.id === id || !p || (p.kind !== 'small' && p.kind !== 'posed') || !('x' in p) || p.hostId !== live.current.hostId) return;
    e.preventDefault();
    held.current = { id, x0: p.x, z0: p.z, sx: e.clientX, sy: e.clientY, moving: false, pointerId: e.pointerId };
    const mine = (ev: PointerEvent): boolean => held.current !== null && ev.pointerId === held.current.pointerId;
    const move = (ev: PointerEvent): void => {
      const h = held.current;
      if (!h || !mine(ev)) return;
      const { axes: a, rotated: rot } = live.current;
      const [dX, dY] = rot ? [ev.clientY - h.sy, -(ev.clientX - h.sx)] : [ev.clientX - h.sx, ev.clientY - h.sy];
      if (!h.moving && Math.hypot(dX, dY) < SLOP_PX) return;
      h.moving = true;
      // Déplacement écran → cm sur le plan du plateau (système 2 × 2 des axes).
      const det = a.ex[0] * a.ez[1] - a.ez[0] * a.ex[1];
      const x = Math.round(h.x0 + (dX * a.ez[1] - a.ez[0] * dY) / det);
      const z = Math.round(h.z0 + (a.ex[0] * dY - a.ex[1] * dX) / det);
      const ok = dropOnTop(live.current.layout, live.current.hostId, h.id, x, z).ok;
      // L'objet se pose sur la place visée (au cm), pas sous le doigt au px près : l'empreinte et l'objet coïncident.
      const [cx, cz] = [x - h.x0, z - h.z0];
      dragRef.current = { id: h.id, x, z, ok, tx: cx * a.ex[0] + cz * a.ez[0], ty: cx * a.ex[1] + cz * a.ez[1] };
      setDrag(dragRef.current);
    };
    const up = (ev: PointerEvent): void => {
      if (!mine(ev)) return;
      const h = held.current;
      const d = dragRef.current;
      stop.current?.();
      dragRef.current = null;
      setDrag(null);
      if (!h || !d || !h.moving || !d.ok) return;
      const next = moveOnTop(live.current.layout, h.id, d.x, d.z);
      if (!next) return;
      setPending({ id: d.id, x: d.x, z: d.z, tx: d.tx, ty: d.ty });
      live.current.onCommit(next);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    stop.current = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      held.current = null;
      stop.current = null;
    };
  };
  return { drag, pending, grab };
}
