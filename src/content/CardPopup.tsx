import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CardPreview } from '../core/collection/card-preview';
import { buildCardPreview } from './card-preview-dom';
import { placePopup, type Rect } from './card-popup-position';
import { ListenSection } from './ListenSection';
import { ScreenSection } from './ScreenSection';

type Props = {
  preview: CardPreview;
  anchor: Rect;
  // Slug de l'article : active les sections « Écouter » (musique) et film / série des cartes de la collection.
  slug?: string;
  // Fiche de marché de la carte.
  onOpen: () => void;
  // La carte elle-même, dans la Collection du jeu.
  onOpenCard: () => void;
  onClose: () => void;
};

const EDGE = 8; // marge minimale avec le bord de la fenêtre (comme card-popup-position)
const PADDING = 8;
const ROW_GAP = 8;
const BUTTON_SIZE = 44;
const ROW_HEIGHT = BUTTON_SIZE + ROW_GAP;
const MIN_WIDTH = 3 * BUTTON_SIZE + 2 * ROW_GAP;

// Fenêtre réellement visible : sur mobile, `innerHeight` ignore le zoom et la barre d'adresse.
function visibleViewport() {
  const visual = window.visualViewport;
  return { width: visual?.width ?? window.innerWidth, height: visual?.height ?? window.innerHeight };
}

// Boutons à glyphe seul (le texte tient mal sur mobile) : zone tactile de 44 px.
const buttonStyle = {
  flex: 1,
  minWidth: BUTTON_SIZE,
  minHeight: BUTTON_SIZE,
  cursor: 'pointer',
  font: '600 20px/1 system-ui, sans-serif',
  color: 'inherit',
  background: 'none',
  border: '1px solid var(--color-border, rgba(148,163,184,0.5))',
  borderRadius: 8,
} as const;

// Aperçu d'une carte posé contre un point de la map ou une case de la frise : toujours entier à l'écran,
// avec ses boutons (marché, carte, fermer). Seule la carte est réduite pour tenir : les boutons gardent leur taille. Il se ferme au clic ailleurs, avec Échap, au défilement ou au redimensionnement.
export function CardPopup({ preview, anchor, slug, onOpen, onOpenCard, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  // Hauteur des sections « Écouter » et film / série : réservée dans le calcul de l'échelle de la carte.
  const [listenHeight, setListenHeight] = useState(0);
  const [screenHeight, setScreenHeight] = useState(0);
  const extraHeight = listenHeight + screenHeight;

  useLayoutEffect(() => {
    cardRef.current?.replaceChildren(buildCardPreview(preview));
  }, [preview]);

  // La position est mesurée depuis l'origine réelle de l'élément : un ancêtre transformé du site ne la décale pas.
  useLayoutEffect(() => {
    const el = ref.current;
    const frame = frameRef.current;
    const card = cardRef.current;
    if (!el || !frame || !card) return;
    const viewport = visibleViewport();
    // Taille naturelle de la carte, mesurée sans réduction.
    card.style.transform = 'none';
    frame.style.width = '';
    frame.style.height = '';
    const natural = { width: card.offsetWidth, height: card.offsetHeight };
    const cardScale = Math.min(
      1,
      (viewport.height - 2 * EDGE - 2 * PADDING - ROW_HEIGHT - extraHeight) / natural.height,
      (viewport.width - 2 * EDGE - 2 * PADDING) / natural.width,
    );
    const scaled = { width: natural.width * cardScale, height: natural.height * cardScale };
    card.style.transformOrigin = '0 0';
    card.style.transform = cardScale < 1 ? `scale(${cardScale})` : 'none';
    frame.style.width = `${Math.max(scaled.width, MIN_WIDTH)}px`;
    frame.style.height = `${scaled.height}px`;

    // La position est mesurée depuis l'origine réelle de l'élément : un ancêtre transformé du site ne la décale pas.
    el.style.left = '0px';
    el.style.top = '0px';
    const origin = el.getBoundingClientRect();
    const { left, top } = placePopup(anchor, { width: el.offsetWidth, height: el.offsetHeight }, viewport);
    el.style.left = `${left - origin.left}px`;
    el.style.top = `${top - origin.top}px`;
  }, [anchor, preview, extraHeight]);

  useEffect(() => {
    const close = () => closeRef.current();
    const onPointerDown = (event: Event) => {
      const el = ref.current;
      if (el && !event.composedPath().includes(el)) close();
    };
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && close();
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKey);
    const onScroll = (event: Event) => {
      const el = ref.current;
      if (!el || !event.composedPath().includes(el)) close();
    };
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
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
        padding: PADDING,
        borderRadius: 12,
        border: '1px solid var(--color-border, rgba(148,163,184,0.5))',
        background: 'var(--color-surface, #0d1117)',
        color: 'var(--color-foreground, #e6edf3)',
        boxSizing: 'content-box',
      }}
    >
      <div ref={frameRef} style={{ overflow: 'hidden' }}>
        <div ref={cardRef} style={{ width: 'max-content' }} />
      </div>
      <div style={{ display: 'flex', gap: ROW_GAP, marginTop: ROW_GAP }}>
        <button
          type="button"
          onClick={onOpen}
          aria-label="Voir le marché"
          title="Voir le marché"
          style={{ ...buttonStyle, background: 'var(--color-accent, #34d399)', color: '#0d1117', borderColor: 'transparent' }}
        >
          📈
        </button>
        <button type="button" onClick={onOpenCard} aria-label="Ouvrir la carte" title="Ouvrir la carte" style={buttonStyle}>
          🃏
        </button>
        <button type="button" onClick={onClose} aria-label="Fermer" title="Fermer" style={{ ...buttonStyle, flex: '0 0 auto' }}>
          ✕
        </button>
      </div>
      {slug && <ListenSection slug={slug} title={preview.title} onHeight={setListenHeight} />}
      {slug && <ScreenSection slug={slug} title={preview.title} onHeight={setScreenHeight} />}
    </div>
  );
}
