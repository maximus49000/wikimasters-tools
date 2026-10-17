// Glissé d'un objet de tablette (vue Modifier d'une étagère) : le doigt saisit une carte ou un petit objet tout de suite, la place
// d'insertion dit vert/rouge (dropOnShelf / moveToTop sur la disposition avec les déplacements en attente appliqués), le relâcher
// demande le déplacement (`onBoard` / `onTop`, des intentions : l'appelant les applique à la disposition du moment) ou rend l'objet
// à sa place. En zoom, une carte tenue au bord haut ou bas de l'écran pendant EDGE_MS fait passer la vue à la tablette voisine
// (tablette 0 → le dessus), la carte reste tenue. Un objet lâché en vert reste dessiné à sa nouvelle place (`pending`, un par objet)
// jusqu'à ce que la disposition reçue change pour lui ou que l'écriture se termine.
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { isOnBoard, type Layout, type ShelfLevel } from '../../core/library/library-types';
import { dropOnShelf, isShelfLevel, moveToBoard, moveToTop, type BoardLike, type PxRect } from '../../core/library/room-grid';

// Niveaux de la vue Modifier d'une étagère, de haut en bas : le meuble entier à part, puis le dessus, la tablette 0, 1, 2.
export type ArrangeLevel = 'whole' | 'top' | ShelfLevel;
// Bande du bord de l'écran (px du calque) où une carte tenue fait changer de tablette, et délai avant le changement.
export const EDGE_PX = 48;
export const EDGE_MS = 600;
// Un toucher qui bouge de moins de 4 px n'est pas un glissé.
const SLOP_PX = 4;
export const TOP_CARD_MESSAGE = 'Les cartes se poseront sur le dessus avec la prochaine mise à jour.';
export const TOP_FULL_MESSAGE = 'Pas de place ici sur le dessus.';

// Ce que vise le doigt : une tablette (point en cm sur sa face) ou le dessus (coin avant gauche visé, cm).
export type BoardAim = { kind: 'board'; shelfId: string; level: ShelfLevel; xCm: number } | { kind: 'top'; hostId: string; x: number; z: number };
// Objet tenu : doigt (px du calque), prise relative dans la boîte de l'objet (0..1), visée et verdict.
export type BoardDrag = { id: string; lx: number; ly: number; fx: number; fy: number; aim: BoardAim | null; ok: boolean; order: number | null; message: string | null };
// Objet lâché en vert, en attente de la disposition écrite : sa place au lâcher (`from`) et le déplacement à appliquer pour le dessiner.
export type BoardPending = { id: string; from: string; apply(l: Layout): Layout | null };

type Held = { id: string; sx: number; sy: number; fx: number; fy: number; moving: boolean; pointerId: number; zone: 'up' | 'down' | null; timer: number; lx: number; ly: number };

type Options = {
  layout: Layout;
  level: ArrangeLevel;
  // Hauteur du calque (px) : les bandes du bord s'y mesurent.
  layerH: number;
  // Calque tourné de 90° (écran en hauteur) : un point écran (X, Y) vaut (Y, largeur de l'écran − X) dans le calque.
  rotated: boolean;
  // Visée du point (px du calque) pour l'objet tenu, au niveau courant, sur la disposition avec les attentes appliquées ; null dans le vide.
  aimAt(lx: number, ly: number, id: string, applied: Layout): BoardAim | null;
  // Boîte (px du calque) de l'objet au moment de la prise : la copie tenue garde la même prise sous le doigt.
  boxOf(id: string, applied: Layout): PxRect | null;
  onBoard(id: string, shelfId: string, level: ShelfLevel, order: number): Promise<unknown> | void;
  onTop(id: string, hostId: string, x: number, z: number): Promise<unknown> | void;
  onLevel(level: ArrangeLevel): void;
};

// Place d'un objet dans la disposition, en clair : l'attente d'un objet lâché tombe quand elle change (ou qu'il disparaît).
export function placeKey(layout: Layout, id: string): string {
  const p = layout.find((q) => q.id === id);
  if (!p) return '';
  if (p.kind === 'stored') return `s:${p.shelfId}:${p.level}:${p.order}`;
  if (p.kind === 'small') return isOnBoard(p) ? `b:${p.hostId}:${p.level}:${p.order}` : `t:${p.hostId}:${p.x}:${p.z}`;
  return p.kind;
}
const boardLikeOf = (layout: Layout, id: string): BoardLike | null => {
  const p = layout.find((q) => q.id === id);
  if (!p) return null;
  if (p.kind === 'stored') return p;
  if (p.kind === 'small') return { id, item: p.item };
  if (p.kind === 'posed') return { id, shape: p.shape, box: p.box };
  return null;
};
// Tablette voisine dans le sens du bord tenu ; null au bout (le dessus en haut, la dernière tablette en bas).
export function neighbourLevel(level: ArrangeLevel, zone: 'up' | 'down'): ArrangeLevel | null {
  if (level === 'whole') return null;
  const next = zone === 'down' ? (level === 'top' ? 0 : level + 1) : level === 'top' ? -1 : level - 1;
  return next === -1 ? (level === 0 ? 'top' : null) : isShelfLevel(next) ? next : null;
}

export function useBoardDrag({ layout, level, layerH, rotated, aimAt, boxOf, onBoard, onTop, onLevel }: Options): {
  drag: BoardDrag | null; pending: BoardPending[]; applied: Layout; preview: Layout; grab(id: string, e: ReactPointerEvent): void; wasDrag(): boolean;
} {
  const [drag, setDrag] = useState<BoardDrag | null>(null);
  const [pendingState, setPending] = useState<BoardPending[]>([]);
  // Attentes réglées retirées AU RENDU : aucune image ne montre l'objet à deux places.
  const pending = pendingState.some((w) => placeKey(layout, w.id) !== w.from) ? pendingState.filter((w) => placeKey(layout, w.id) === w.from) : pendingState;
  if (pending !== pendingState) setPending(pending);
  const applied = useMemo(() => pending.reduce((l, w) => w.apply(l) ?? l, layout), [layout, pending]);
  const held = useRef<Held | null>(null);
  const dragRef = useRef<BoardDrag | null>(null);
  const moved = useRef(false);
  const live = useRef({ layout, applied, pending, level, layerH, rotated, aimAt, boxOf, onBoard, onTop, onLevel });
  live.current = { layout, applied, pending, level, layerH, rotated, aimAt, boxOf, onBoard, onTop, onLevel };
  const stop = useRef<(() => void) | null>(null);
  useEffect(() => () => stop.current?.(), []);
  const forget = useCallback((w: BoardPending): void => setPending((list) => (list.includes(w) ? list.filter((q) => q !== w) : list)), []);

  // Visée et verdict au point (lx, ly) pour l'objet tenu, sur la disposition avec les attentes appliquées.
  const judge = useCallback((h: Held): BoardDrag => {
    const { applied: l, aimAt: at } = live.current;
    const aim = at(h.lx, h.ly, h.id, l);
    const base: BoardDrag = { id: h.id, lx: h.lx, ly: h.ly, fx: h.fx, fy: h.fy, aim, ok: false, order: null, message: null };
    if (!aim) return base;
    if (aim.kind === 'board') {
      const like = boardLikeOf(l, h.id);
      if (!like) return base;
      const d = dropOnShelf(l, aim.shelfId, aim.level, aim.xCm, like);
      return d.ok ? { ...base, ok: true, order: d.order } : { ...base, message: d.message };
    }
    const ok = moveToTop(l, h.id, aim.hostId, aim.x, aim.z) !== null;
    return ok ? { ...base, ok } : { ...base, message: l.find((q) => q.id === h.id)?.kind === 'stored' ? TOP_CARD_MESSAGE : TOP_FULL_MESSAGE };
  }, []);
  const aimNow = useCallback((h: Held): void => {
    dragRef.current = judge(h);
    setDrag(dragRef.current);
  }, [judge]);
  // La vue a changé de tablette (bord d'écran, ▲ ▼) pendant un glissé : la visée se refait au même point du doigt.
  useEffect(() => {
    const h = held.current;
    if (h?.moving) aimNow(h);
  }, [level, aimNow]);

  const grab = useCallback((id: string, e: ReactPointerEvent): void => {
    const p = live.current.applied.find((q) => q.id === id);
    // Objet en attente d'écriture : pas de nouvelle prise avant que sa place soit enregistrée.
    if (held.current || live.current.pending.some((w) => w.id === id) || !p || !(p.kind === 'stored' || (p.kind === 'small' && isOnBoard(p)))) return;
    e.preventDefault();
    moved.current = false;
    const toLayer = (ev: { clientX: number; clientY: number }): [number, number] => (live.current.rotated ? [ev.clientY, window.innerWidth - ev.clientX] : [ev.clientX, ev.clientY]);
    const [lx, ly] = toLayer(e);
    const box = live.current.boxOf(id, live.current.applied);
    const fx = box && box.w > 0 ? Math.min(1, Math.max(0, (lx - box.x) / box.w)) : 0.5;
    const fy = box && box.h > 0 ? Math.min(1, Math.max(0, (ly - box.y) / box.h)) : 0.5;
    held.current = { id, sx: lx, sy: ly, fx, fy, moving: false, pointerId: e.pointerId, zone: null, timer: 0, lx, ly };
    const mine = (ev: PointerEvent): boolean => held.current !== null && ev.pointerId === held.current.pointerId;
    const move = (ev: PointerEvent): void => {
      const h = held.current;
      if (!h || !mine(ev)) return;
      [h.lx, h.ly] = toLayer(ev);
      if (!h.moving && Math.hypot(h.lx - h.sx, h.ly - h.sy) < SLOP_PX) return;
      h.moving = true;
      moved.current = true;
      // Bord haut ou bas : la tablette voisine après EDGE_MS, une fois par entrée dans la bande (il faut en sortir pour recommencer).
      const zone = h.ly < EDGE_PX ? 'up' : h.ly > live.current.layerH - EDGE_PX ? 'down' : null;
      if (zone !== h.zone) {
        window.clearTimeout(h.timer);
        h.zone = zone;
        if (zone) {
          h.timer = window.setTimeout(() => {
            const next = neighbourLevel(live.current.level, zone);
            if (next !== null && held.current === h) live.current.onLevel(next);
          }, EDGE_MS);
        }
      }
      aimNow(h);
    };
    const end = (): { h: Held; d: BoardDrag | null } | null => {
      const h = held.current;
      const d = dragRef.current;
      if (h) window.clearTimeout(h.timer);
      stop.current?.();
      dragRef.current = null;
      setDrag(null);
      return h ? { h, d } : null;
    };
    const up = (ev: PointerEvent): void => {
      if (!mine(ev)) return;
      const r = end();
      if (!r || !r.d || !r.h.moving || !r.d.ok || !r.d.aim) return;
      const { id: did, order } = r.d;
      const aim: BoardAim = r.d.aim;
      const apply = aim.kind === 'board' ? (l: Layout) => moveToBoard(l, did, aim.shelfId, aim.level, order ?? 0) : (l: Layout) => moveToTop(l, did, aim.hostId, aim.x, aim.z);
      // `from` lu dans la disposition reçue (pas dans celle aux attentes appliquées, où une autre attente a pu décaler son rang) :
      // l'attente tombe seulement quand la disposition reçue change pour cet objet.
      const w: BoardPending = { id: did, from: placeKey(live.current.layout, did), apply };
      setPending((list) => [...list, w]);
      let done: Promise<unknown> | void;
      try {
        done = aim.kind === 'board' ? live.current.onBoard(did, aim.shelfId, aim.level, order ?? 0) : live.current.onTop(did, aim.hostId, aim.x, aim.z);
      } catch { done = undefined; }
      if (done && typeof done.then === 'function') done.then(() => forget(w), () => forget(w));
    };
    // Glissé interrompu (appel, geste du système) : rien n'est demandé, l'objet revient.
    const cancel = (ev: PointerEvent): void => { if (mine(ev)) end(); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    stop.current = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      held.current = null;
      stop.current = null;
    };
  }, [forget, aimNow]);

  // Disposition dessinée : les attentes appliquées ; pendant un glissé en vert, l'objet tenu à la place visée (la place s'ouvre, ses
  // voisins se resserrent) ; en rouge ou dans le vide, rien ne bouge (l'objet tenu reste, estompé, à sa place). Recalculée seulement
  // quand la place visée change, pas à chaque mouvement du doigt.
  const a = drag?.ok ? drag.aim : null;
  const aimKey = a ? (a.kind === 'board' ? `b:${drag!.id}:${a.shelfId}:${a.level}:${drag!.order ?? 0}` : `t:${drag!.id}:${a.hostId}:${a.x}:${a.z}`) : '';
  const preview = useMemo(() => {
    if (!a || !drag) return applied;
    return (a.kind === 'board' ? moveToBoard(applied, drag.id, a.shelfId, a.level, drag.order ?? 0) : moveToTop(applied, drag.id, a.hostId, a.x, a.z)) ?? applied;
  }, [applied, aimKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const wasDrag = useCallback(() => moved.current, []);
  return { drag, pending, applied, preview, grab, wasDrag };
}
