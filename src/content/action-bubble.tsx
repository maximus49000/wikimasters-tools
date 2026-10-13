import { useLayoutEffect, useRef, useState, type ReactElement, type ReactNode } from 'react';

const GAP = 8;

// Position d'un élément flottant sur l'objet `targetId`, dans le repère de la scène : au-dessus (en dessous s'il touche le haut),
// ou centré sur l'objet. Bornée à la largeur de la scène ; recalée à chaque rendu, au défilement de la pièce et au redimensionnement.
export function useAnchor(stage: HTMLElement | null, scroll: HTMLElement | null, targetId: string, mode: 'above' | 'center') {
  const ref = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number }>({ left: 8, top: 8 });
  const placeRef = useRef<() => void>(() => undefined);
  placeRef.current = (): void => {
    const box = ref.current;
    const target = Array.from(scroll?.querySelectorAll('[data-id]') ?? []).find((el) => el.getAttribute('data-id') === targetId);
    if (!stage || !box || !target) return;
    const s = stage.getBoundingClientRect();
    const t = target.getBoundingClientRect();
    const b = box.getBoundingClientRect();
    const centerX = t.left - s.left + t.width / 2;
    const above = t.top - s.top - b.height - GAP;
    const top = mode === 'center' ? t.top - s.top + t.height / 2 - b.height / 2 : above >= 0 ? above : t.bottom - s.top + GAP;
    const left = Math.min(Math.max(0, centerX - b.width / 2), Math.max(0, s.width - b.width));
    setPos((p) => (p.left === left && p.top === top ? p : { left, top }));
  };
  // Recalée à chaque rendu (sélection, pièce modifiée).
  useLayoutEffect(() => placeRef.current());
  // … et au défilement, au redimensionnement, et quand la scène change de taille sans nouveau rendu (tiroir qui apparaît ou se cache).
  useLayoutEffect(() => {
    const place = (): void => placeRef.current();
    scroll?.addEventListener('scroll', place, { passive: true });
    window.addEventListener('resize', place);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(place);
    if (stage) observer?.observe(stage);
    if (scroll) observer?.observe(scroll);
    return () => {
      scroll?.removeEventListener('scroll', place);
      window.removeEventListener('resize', place);
      observer?.disconnect();
    };
  }, [stage, scroll]);
  return { ref, pos };
}

// Bulle d'actions posée au-dessus de l'objet sélectionné.
export function ActionBubble({ stage, scroll, targetId, children }: { stage: HTMLElement | null; scroll: HTMLElement | null; targetId: string; children: ReactNode }): ReactElement {
  const { ref, pos } = useAnchor(stage, scroll, targetId, 'above');
  return (
    <div ref={ref} className="wmt-lib-bubble" data-action-bubble role="toolbar" aria-label="Actions sur l’objet" style={{ left: pos.left, top: pos.top }}>
      {children}
    </div>
  );
}
