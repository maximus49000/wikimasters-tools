import { useLayoutEffect, useRef, useState, type ReactElement, type ReactNode } from 'react';

const GAP = 8;

// Bulle d'actions posée au-dessus de l'objet sélectionné (en dessous s'il touche le haut), bornée à la largeur de la scène.
// Recalée à chaque rendu (sélection, pièce modifiée), au défilement de la pièce et au redimensionnement.
export function ActionBubble({ stage, scroll, targetId, children }: { stage: HTMLElement | null; scroll: HTMLElement | null; targetId: string; children: ReactNode }): ReactElement {
  const ref = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number }>({ left: 8, top: 8 });
  useLayoutEffect(() => {
    const place = (): void => {
      const bubble = ref.current;
      const target = Array.from(scroll?.querySelectorAll('[data-id]') ?? []).find((el) => el.getAttribute('data-id') === targetId);
      if (!stage || !bubble || !target) return;
      const s = stage.getBoundingClientRect();
      const t = target.getBoundingClientRect();
      const b = bubble.getBoundingClientRect();
      const above = t.top - s.top - b.height - GAP;
      const top = above >= 0 ? above : t.bottom - s.top + GAP;
      const left = Math.min(Math.max(0, t.left - s.left + t.width / 2 - b.width / 2), Math.max(0, s.width - b.width));
      setPos((p) => (p.left === left && p.top === top ? p : { left, top }));
    };
    place();
    scroll?.addEventListener('scroll', place, { passive: true });
    window.addEventListener('resize', place);
    return () => {
      scroll?.removeEventListener('scroll', place);
      window.removeEventListener('resize', place);
    };
  });
  return (
    <div ref={ref} className="wmt-lib-bubble" data-action-bubble role="toolbar" aria-label="Actions sur l’objet" style={{ left: pos.left, top: pos.top }}>
      {children}
    </div>
  );
}
