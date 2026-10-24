import { useLayoutEffect, useRef } from 'react';
import { clampCamera, clientToWorld, easeInOut, followStep, initialCamera, lerpRect, pan, viewBoxOf, viewRect, zoomAt, type Camera, type Rect, type Size } from '../../core/library/outside-camera';
import { figureHeadTop } from '../figure/ghibli-figure';
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
// Geste fluide : recadrage après ce temps sans mouvement, ou au-delà de ces écarts entre l'image dessinée et la vue voulue.
const COMMIT_IDLE_MS = 220;
const COMMIT_SCALE = 1.8;
const COMMIT_SHIFT = 0.45;

type Options = { svg: () => SVGSVGElement | null; box: () => HTMLElement | null; world: Size; phase: OutsidePhase; from: Rect | null; windows: readonly Rect[]; onSettled: (phase: 'outside' | 'inside') => void };

// Ordonnée écran du sommet de la tête d'une figure Ghibli (le sprite a une marge transparente au-dessus du crâne, donc la boîte
// du nœud est trop haute) ; null hors art Ghibli ou sans matrice d'écran : l'appelant garde le haut de la boîte.
function headClientY(node: Element, svg: SVGSVGElement): number | null {
  // Figure principale : le nœud lui-même, sinon l'enfant direct, sinon la première figure hors accompagnant (enfant tenu par la main,
  // rendu avant le parent et à l'échelle réduite).
  const fig = node.matches('[data-figure]')
    ? node
    : (node.querySelector(':scope > [data-figure][data-key]') ??
      [...node.querySelectorAll('[data-figure][data-key]')].find((f) => { const c = f.closest('[data-companion]'); return !(c && node.contains(c)); }) ??
      null);
  const top = fig && figureHeadTop(fig);
  const ctm = fig && (fig as SVGGraphicsElement).getScreenCTM?.();
  if (!top || !ctm) return null;
  const pt = svg.createSVGPoint?.();
  if (!pt) return null;
  pt.x = top[0];
  pt.y = top[1];
  return pt.matrixTransform(ctm).y;
}

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
    const still = reducedMotion();
    // Geste fluide (2026-10-24) : réécrire le viewBox à chaque image d'un zoom ou d'un déplacement oblige Chrome Android à
    // redessiner toute la scène à la nouvelle échelle ; pendant un geste il n'y arrive pas et montre des images où manquent le
    // voile de pluie (flash clair), les voitures, les passants (mesuré image par image sur S26). Pendant le mouvement, la caméra
    // déplace et agrandit donc l'image DÉJÀ dessinée (transformation CSS du <svg>, que le compositeur applique sans redessiner),
    // et ne recadre la scène (viewBox) qu'à l'arrêt : COMMIT_IDLE_MS sans mouvement, ou quand l'image dessinée ne couvre plus
    // assez l'écran (agrandie ou réduite de plus de COMMIT_SCALE, décalée de plus de COMMIT_SHIFT de l'écran). Le <svg> déborde
    // (overflow visible) : la scène autour du cadrage est déjà dessinée quand on la fait glisser dans l'écran.
    const base = svg.viewBox?.baseVal;
    let committed: Rect | null = base && base.width > 0 ? { x: base.x, y: base.y, w: base.width, h: base.height } : null;
    let pending: Rect | null = null;
    let idle = 0;
    // `xMidYMid slice` : échelle et marges d'un rectangle du monde dans la boîte.
    const fit = (r: Rect, b: { w: number; h: number }): { k: number; ox: number; oy: number } => {
      const k = Math.max(b.w / r.w, b.h / r.h);
      return { k, ox: (b.w - r.w * k) / 2, oy: (b.h - r.h * k) / 2 };
    };
    const commit = (r: Rect): void => {
      if (idle) { clearTimeout(idle); idle = 0; }
      pending = null;
      committed = r;
      svg.setAttribute('viewBox', viewBoxOf(r));
      svg.style.transform = '';
    };
    const flush = (): void => { if (pending) commit(pending); };
    const write = (r: Rect): void => {
      const b = size();
      if (still || !committed || !b.w || !b.h) return commit(r);
      const c = fit(committed, b);
      const t = fit(r, b);
      const a = t.k / c.k;
      const tx = t.ox - c.ox * a + (committed.x - r.x) * t.k;
      const ty = t.oy - c.oy * a + (committed.y - r.y) * t.k;
      if (a > COMMIT_SCALE || a < 1 / COMMIT_SCALE || Math.abs(tx) > COMMIT_SHIFT * b.w || Math.abs(ty) > COMMIT_SHIFT * b.h) return commit(r);
      svg.style.transform = `matrix(${a.toFixed(5)},0,0,${a.toFixed(5)},${tx.toFixed(2)},${ty.toFixed(2)})`;
      pending = r;
      if (idle) clearTimeout(idle);
      idle = window.setTimeout(() => { idle = 0; flush(); }, COMMIT_IDLE_MS);
    };
    svg.style.transformOrigin = '0 0';
    svg.style.overflow = 'visible';
    if (!still) svg.style.willChange = 'transform';
    // Boîte redimensionnée (rotation, plein écran) : l'image transformée ne correspond plus, recadrage tout de suite.
    const show = (): void => { const b = size(); if (!b.w || !b.h || !cam.current) return; cam.current = clampCamera(cam.current, b, world); write(viewRect(cam.current, b, world)); };
    const reframe = (): void => { const b = size(); if (!b.w || !b.h || !cam.current) return; cam.current = clampCamera(cam.current, b, world); commit(viewRect(cam.current, b, world)); };
    const tween = (from: Rect, to: Rect, ms: number, done: () => void): void => {
      const t0 = performance.now();
      const step = (now: number): void => {
        const k = easeInOut(Math.min(1, (now - t0) / ms));
        write(lerpRect(from, to, k));
        if (k < 1) later(step); else done();
      };
      later(step);
    };
    // Fin de transition : cadrage exact écrit avant de rendre la main (la pièce relit son viewBox en rentrant).
    const settle = (p: 'outside' | 'inside'): void => { flush(); queueMicrotask(() => opts.current.onSettled(p)); };

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

    const cleanup: Array<() => void> = [
      () => { for (const id of frames) cancelAnimationFrame(id); frames.clear(); },
      // Sortie de la phase : cadrage en attente écrit, transformation et débordement retirés (la pièce retrouve son <svg>).
      () => { flush(); if (idle) clearTimeout(idle); svg.style.transform = ''; svg.style.transformOrigin = ''; svg.style.overflow = ''; svg.style.willChange = ''; },
    ];
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
          const head = clientToWorld(cam.current, b, world, cx, (headClientY(following, svg) ?? r.top) - b.top);
          cam.current = followStep(cam.current, b, world, centre, dt);
          write(viewRect(cam.current, b, world));
          const m = marker();
          m?.setAttribute('transform', `translate(${head.x.toFixed(1)} ${(head.y - 4 - (still ? 0 : 1.5 * Math.sin(now / 300))).toFixed(1)})`);
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
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        el.setPointerCapture?.(e.pointerId);
        ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
        moved = 0;
        // Deuxième doigt : geste de pincement, jamais un appui (même relevé sans mouvement).
        if (ptrs.size === 2) { stop(); pinch = spread(); moved = Infinity; }
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
        if (!cam.current || e.deltaY === 0) return;
        e.preventDefault();
        const at = local(e);
        cam.current = zoomAt(cam.current, size(), world, e.deltaY < 0 ? WHEEL_STEP : 1 / WHEEL_STEP, at.x, at.y);
        show();
      };
      el.addEventListener('pointerdown', down);
      el.addEventListener('pointermove', move);
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', cancel);
      el.addEventListener('wheel', wheel, { passive: false });
      // La boîte change de taille après l'événement (React applique la taille du conteneur plus tard) : on observe la boîte elle-même ;
      // repli sur resize si ResizeObserver manque (jsdom).
      const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => reframe()) : null;
      if (ro) ro.observe(el); else window.addEventListener('resize', reframe);
      reframe();
      cleanup.push(() => {
        stop();
        el.removeEventListener('pointerdown', down);
        el.removeEventListener('pointermove', move);
        el.removeEventListener('pointerup', up);
        el.removeEventListener('pointercancel', cancel);
        el.removeEventListener('wheel', wheel);
        if (ro) ro.disconnect(); else window.removeEventListener('resize', reframe);
      });
    }
    return () => { for (const f of cleanup) f(); };
  }, [o.phase, o.world.w, o.world.h]);
}
