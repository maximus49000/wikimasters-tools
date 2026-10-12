import { useLayoutEffect, useRef } from 'react';
import { clampCamera, clientToWorld, easeInOut, followStep, initialCamera, lerpRect, pan, viewBoxOf, viewRect, zoomAt, type Camera, type Rect, type Size } from '../../core/library/outside-camera';
import { reducedMotion } from '../ghibli-sky';
import { isShown, pickFigure } from './pick-figure';

// Vue « dehors » de la bibliothèque : la caméra écrit directement le viewBox du <svg> de la pièce (aucun re-rendu React par geste).
export type OutsidePhase = 'inside' | 'leaving' | 'outside' | 'returning';
export const TRANSITION_MS = 600;
const TAP_PX = 8;
const DOUBLE_TAP_MS = 300;
const DOUBLE_TAP_ZOOM_MS = 300;
const LOST_MS = 1000;
const WHEEL_STEP = 1.15;

type Options = { svg: () => SVGSVGElement | null; box: () => HTMLElement | null; world: Size; phase: OutsidePhase; from: Rect | null; windows: readonly Rect[]; onSettled: (phase: 'outside' | 'inside') => void };

export function useOutsideCamera(o: Options): void {
  const opts = useRef(o);
  opts.current = o;
  const cam = useRef<Camera | null>(null);
  // useLayoutEffect : aucune image ne doit être peinte avec le viewBox constant de RoomView avant que la caméra écrive le sien.
  useLayoutEffect(() => {
    const { phase, world } = opts.current;
    const svg = opts.current.svg();
    const el = opts.current.box();
    if (phase === 'inside' || !svg || !el) return;
    let raf = 0;
    const frames = new Set<number>();
    const later = (f: FrameRequestCallback): void => { const id = requestAnimationFrame((t) => { frames.delete(id); f(t); }); frames.add(id); };
    const size = (): { w: number; h: number; left: number; top: number } => { const r = el.getBoundingClientRect(); return { w: r.width, h: r.height, left: r.left, top: r.top }; };
    const write = (r: Rect): void => svg.setAttribute('viewBox', viewBoxOf(r));
    const show = (): void => { const b = size(); if (!b.w || !b.h || !cam.current) return; cam.current = clampCamera(cam.current, b, world); write(viewRect(cam.current, b, world)); };
    const tween = (from: Rect, to: Rect, ms: number, done: () => void): void => {
      const t0 = performance.now();
      const step = (now: number): void => {
        const k = easeInOut(Math.min(1, (now - t0) / ms));
        write(lerpRect(from, to, k));
        if (k < 1) later(step); else done();
      };
      later(step);
    };
    const settle = (p: 'outside' | 'inside'): void => queueMicrotask(() => opts.current.onSettled(p));
    const still = reducedMotion();

    if (phase === 'leaving') {
      const b = size();
      const { from, windows } = opts.current;
      if (b.w && b.h) {
        cam.current = initialCamera(b, world, windows, from ? from.x + from.w / 2 : world.w / 2);
        const target = viewRect(cam.current, b, world);
        if (still || !from) { write(target); settle('outside'); } else tween(from, target, TRANSITION_MS, () => settle('outside'));
      } else settle('outside');
    }

    if (phase === 'returning') {
      const b = size();
      const from = opts.current.from;
      const now = cam.current && b.w && b.h ? viewRect(cam.current, b, world) : null;
      if (still || !from || !now) { if (from) write(from); settle('inside'); } else tween(now, from, TRANSITION_MS, () => settle('inside'));
    }

    const cleanup: Array<() => void> = [() => { for (const id of frames) cancelAnimationFrame(id); frames.clear(); }];
    if (phase === 'outside') {
      const marker = (): SVGGElement | null => svg.querySelector<SVGGElement>('[data-follow-marker]');
      let following: Element | null = null;
      let lostAt = 0;
      let last = 0;
      const stop = (): void => { following = null; marker()?.setAttribute('opacity', '0'); if (raf) { cancelAnimationFrame(raf); frames.delete(raf); raf = 0; } };
      const tick = (now: number): void => {
        raf = 0;
        const b = size();
        if (!following || !cam.current || !b.w || !b.h) return;
        const dt = last ? Math.min(100, now - last) : 16;
        last = now;
        if (!isShown(following, svg)) {
          lostAt ||= now;
          if (now - lostAt > LOST_MS) return stop();
        } else {
          lostAt = 0;
          const r = following.getBoundingClientRect();
          const cx = r.left + r.width / 2 - b.left;
          const centre = clientToWorld(cam.current, b, world, cx, r.top + r.height / 2 - b.top);
          const head = clientToWorld(cam.current, b, world, cx, r.top - b.top);
          cam.current = followStep(cam.current, b, world, centre, dt);
          write(viewRect(cam.current, b, world));
          const m = marker();
          m?.setAttribute('transform', `translate(${head.x.toFixed(1)} ${(head.y - 4).toFixed(1)})`);
          m?.setAttribute('opacity', '1');
        }
        raf = requestAnimationFrame((t) => { frames.delete(raf); tick(t); });
        frames.add(raf);
      };
      const startFollow = (target: Element): void => { stop(); following = target; lostAt = 0; last = 0; tick(performance.now()); };

      const zoomTo = (target: number, px: number, py: number): void => {
        if (!cam.current) return;
        const c0 = cam.current;
        if (still) { cam.current = zoomAt(c0, size(), world, target / c0.zoom, px, py); show(); return; }
        const t0 = performance.now();
        const step = (now: number): void => {
          const k = easeInOut(Math.min(1, (now - t0) / DOUBLE_TAP_ZOOM_MS));
          const z = c0.zoom + (target - c0.zoom) * k;
          cam.current = zoomAt(c0, size(), world, z / c0.zoom, px, py);
          show();
          if (k < 1) later(step);
        };
        later(step);
      };

      const ptrs = new Map<number, { x: number; y: number }>();
      let moved = 0;
      let pinch = 0;
      let lastTap = { t: -Infinity, x: 0, y: 0 };
      const local = (e: { clientX: number; clientY: number }): { x: number; y: number } => { const b = size(); return { x: e.clientX - b.left, y: e.clientY - b.top }; };
      const spread = (): number => { const [a, b] = [...ptrs.values()]; return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0; };
      const down = (e: PointerEvent): void => {
        if ((e.target as Element | null)?.closest?.('button')) return;
        el.setPointerCapture?.(e.pointerId);
        ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
        moved = 0;
        if (ptrs.size === 2) { stop(); pinch = spread(); }
      };
      const move = (e: PointerEvent): void => {
        const p = ptrs.get(e.pointerId);
        if (!p || !cam.current) return;
        const dx = e.clientX - p.x;
        const dy = e.clientY - p.y;
        p.x = e.clientX;
        p.y = e.clientY;
        if (ptrs.size >= 2) {
          const d = spread();
          const [a, b] = [...ptrs.values()];
          const mid = local({ clientX: (a!.x + b!.x) / 2, clientY: (a!.y + b!.y) / 2 });
          if (pinch > 0 && d > 0) { cam.current = zoomAt(cam.current, size(), world, d / pinch, mid.x, mid.y); show(); }
          pinch = d;
          moved = Infinity;
          return;
        }
        moved += Math.abs(dx) + Math.abs(dy);
        if (moved > TAP_PX) { if (following) stop(); cam.current = pan(cam.current, size(), world, dx, dy); show(); }
      };
      const up = (e: PointerEvent): void => {
        if (!ptrs.delete(e.pointerId)) return;
        if (ptrs.size < 2) pinch = 0;
        if (moved > TAP_PX || ptrs.size > 0 || !cam.current) return;
        const now = performance.now();
        const at = local(e);
        if (now - lastTap.t < DOUBLE_TAP_MS && Math.hypot(at.x - lastTap.x, at.y - lastTap.y) < 30) {
          lastTap = { t: -Infinity, x: 0, y: 0 };
          zoomTo(cam.current.zoom < 1.75 ? 2.5 : 1, at.x, at.y);
          return;
        }
        lastTap = { t: now, x: at.x, y: at.y };
        const target = pickFigure(svg, e.clientX, e.clientY);
        if (target) startFollow(target); else stop();
      };
      const cancel = (e: PointerEvent): void => { ptrs.delete(e.pointerId); pinch = 0; };
      const wheel = (e: WheelEvent): void => {
        if (!cam.current) return;
        e.preventDefault();
        stop();
        const at = local(e);
        cam.current = zoomAt(cam.current, size(), world, e.deltaY < 0 ? WHEEL_STEP : 1 / WHEEL_STEP, at.x, at.y);
        show();
      };
      el.addEventListener('pointerdown', down);
      el.addEventListener('pointermove', move);
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', cancel);
      el.addEventListener('wheel', wheel, { passive: false });
      window.addEventListener('resize', show);
      document.addEventListener('fullscreenchange', show);
      show();
      cleanup.push(() => {
        stop();
        el.removeEventListener('pointerdown', down);
        el.removeEventListener('pointermove', move);
        el.removeEventListener('pointerup', up);
        el.removeEventListener('pointercancel', cancel);
        el.removeEventListener('wheel', wheel);
        window.removeEventListener('resize', show);
        document.removeEventListener('fullscreenchange', show);
      });
    }
    return () => { for (const f of cleanup) f(); };
  }, [o.phase, o.world.w, o.world.h]);
}
