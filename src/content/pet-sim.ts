import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { PetPlan, Room } from '../core/library/library-types';
import type { PetContext } from '../core/library/pets/context';
import { createPetRunner, type PetFrame } from '../core/library/pets/runner';

export type PetView = Omit<PetFrame, 'pos' | 'depthY'> & { depthY?: number; still?: boolean };
// Seuil (px) en dessous duquel un changement d'ordonnée ne justifie pas un nouveau rendu.
const DEPTH_STEP = 12;

const FRAME_MS = 33;
// Clé du nœud de la bulle (nom, cœurs), dessinée dans une couche à part mais placée comme le chat.
export const BUBBLE = ':bubble';

const reducedMotion = (): boolean => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const toView = ({ pos: _pos, ...view }: PetFrame, still: boolean): PetView => ({ ...view, still });
const sameViews = (a: PetView[], b: PetFrame[]): boolean =>
  a.length === b.length && a.every((v, i) => v.id === b[i]!.id && v.pose === b[i]!.pose && v.facing === b[i]!.facing && v.behind === b[i]!.behind && Math.floor((v.depthY ?? 0) / DEPTH_STEP) === Math.floor(b[i]!.depthY / DEPTH_STEP) && v.top === b[i]!.top && v.name === b[i]!.name && v.coat === b[i]!.coat && v.species === b[i]!.species);

const place = (el: SVGGElement, pos: { x: number; y: number }): void => el.setAttribute('transform', `translate(${pos.x.toFixed(1)} ${pos.y.toFixed(1)})`);

// Anime les animaux de la pièce affichée. La position passe directement dans l'attribut `transform` (aucun rendu React par image) ;
// React ne re-rend que lorsque la pose, le sens ou le rang de dessin changent. `getContext` (ciel, météo, soleil) est relu à chaque image.
export function usePetSim(room: Room | null, onPlan: (roomId: string, petId: string, plan: PetPlan) => void, getContext?: () => PetContext) {
  const [views, setViews] = useState<PetView[]>([]);
  const nodes = useRef(new Map<string, SVGGElement>());
  const frames = useRef<PetFrame[]>([]);
  const roomRef = useRef(room);
  const onPlanRef = useRef(onPlan);
  const ctxRef = useRef(getContext);
  useLayoutEffect(() => {
    roomRef.current = room;
    onPlanRef.current = onPlan;
    ctxRef.current = getContext;
  });
  const still = useMemo(reducedMotion, []);
  const runner = useMemo(
    () => createPetRunner({ still, onPlan: (petId, plan) => { const r = roomRef.current; if (r) onPlanRef.current(r.id, petId, plan); } }),
    [still],
  );

  const tick = useCallback(() => {
    const r = roomRef.current;
    const list = r ? runner.step(r, Date.now(), ctxRef.current?.()) : [];
    frames.current = list;
    for (const f of list) {
      const el = nodes.current.get(f.id);
      if (el) place(el, f.pos);
      const bubble = nodes.current.get(`${f.id}${BUBBLE}`);
      if (bubble) place(bubble, f.pos);
    }
    setViews((prev) => (sameViews(prev, list) ? prev : list.map((f) => toView(f, still))));
  }, [runner, still]);

  // Changement de pièce : on repeint tout de suite avec les chats de la nouvelle, jamais un instant avec ceux de l'ancienne.
  const roomIdNow = room?.id;
  useLayoutEffect(() => {
    tick();
  }, [roomIdNow, tick]);

  const petCount = room?.pets.length ?? 0;
  const roomId = room?.id;
  useEffect(() => {
    tick();
    if (petCount === 0) return;
    if (still) {
      const timer = window.setInterval(() => { if (document.visibilityState !== 'hidden') tick(); }, 1000);
      return () => window.clearInterval(timer);
    }
    let frame = 0;
    let last = 0;
    const loop = (now: number): void => {
      frame = window.requestAnimationFrame(loop);
      if (document.visibilityState === 'hidden' || now - last < FRAME_MS) return;
      last = now;
      tick();
    };
    frame = window.requestAnimationFrame(loop);
    return () => window.cancelAnimationFrame(frame);
  }, [tick, still, petCount, roomId]);

  // Pose le transform tout de suite quand le nœud apparaît (sinon le chat resterait à l'origine jusqu'à l'image suivante).
  const attach = useCallback((id: string, el: SVGGElement | null) => {
    if (!el) {
      nodes.current.delete(id);
      return;
    }
    nodes.current.set(id, el);
    const frame = frames.current.find((f) => f.id === (id.endsWith(BUBBLE) ? id.slice(0, -BUBBLE.length) : id));
    if (frame) place(el, frame.pos);
  }, []);

  const touch = useCallback((id: string) => {
    const r = roomRef.current;
    if (r && runner.touch(r, id, Date.now())) tick();
  }, [runner, tick]);

  // Images courantes (position à l'image), relues par le calque de lumière ; identité stable.
  const frameList = useCallback((): readonly PetFrame[] => frames.current, []);

  return { views, attach, touch, frames: frameList };
}
