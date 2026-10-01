import { useEffect, useLayoutEffect, useRef } from 'react';
import type { CardPreview } from '../core/collection/card-preview';
import { buildCardPreview } from './card-preview-dom';
import { placePopup, type Rect } from './card-popup-position';

type Props = {
  preview: CardPreview;
  anchor: Rect;
  onOpen: () => void;
  onClose: () => void;
};

const buttonStyle = {
  flex: 1,
  minHeight: 36,
  cursor: 'pointer',
  font: '600 13px/1 system-ui, sans-serif',
  color: 'inherit',
  background: 'none',
  border: '1px solid var(--color-border, rgba(148,163,184,0.5))',
  borderRadius: 8,
} as const;

// Aperçu d'une carte posé contre un point de la map ou une case de la frise : toujours entier à l'écran,
// avec un bouton pour ouvrir sa fiche de marché. Il se ferme au clic ailleurs, avec Échap, au défilement ou au redimensionnement.
export function CardPopup({ preview, anchor, onOpen, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useLayoutEffect(() => {
    cardRef.current?.replaceChildren(buildCardPreview(preview));
  }, [preview]);

  // La position est mesurée depuis l'origine réelle de l'élément : un ancêtre transformé du site ne la décale pas.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.transform = 'none';
    el.style.left = '0px';
    el.style.top = '0px';
    const origin = el.getBoundingClientRect();
    const { left, top, scale } = placePopup(
      anchor,
      { width: el.offsetWidth, height: el.offsetHeight },
      { width: window.innerWidth, height: window.innerHeight },
    );
    el.style.left = `${left - origin.left}px`;
    el.style.top = `${top - origin.top}px`;
    el.style.transform = scale < 1 ? `scale(${scale})` : 'none';
  }, [anchor, preview]);

  useEffect(() => {
    const close = () => closeRef.current();
    const onPointerDown = (event: Event) => {
      const el = ref.current;
      if (el && !event.composedPath().includes(el)) close();
    };
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && close();
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, []);

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={preview.title}
      style={{
        position: 'fixed',
        zIndex: 2147483647,
        transformOrigin: '0 0',
        padding: 8,
        borderRadius: 12,
        border: '1px solid var(--color-border, rgba(148,163,184,0.5))',
        background: 'var(--color-surface, #0d1117)',
        color: 'var(--color-foreground, #e6edf3)',
        boxSizing: 'content-box',
      }}
    >
      <div ref={cardRef} />
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button type="button" onClick={onOpen} style={{ ...buttonStyle, background: 'var(--color-accent, #34d399)', color: '#0d1117', borderColor: 'transparent' }}>
          Voir le marché
        </button>
        <button type="button" onClick={onClose} aria-label="Fermer" style={{ ...buttonStyle, flex: '0 0 40px' }}>
          ✕
        </button>
      </div>
    </div>
  );
}
