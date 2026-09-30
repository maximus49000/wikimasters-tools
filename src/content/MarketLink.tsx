import { useState } from 'react';

// Reprend le gabarit du lien « Voir l'article sur Wikipédia » voisin (text-sm, font-medium,
// couleur d'accent du site). Les variables CSS traversent le shadow DOM.
export function MarketLink({ onOpen }: { onOpen: () => void }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      onClick={onOpen}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'inline-flex',
        padding: 0,
        margin: 0,
        border: 0,
        background: 'none',
        cursor: 'pointer',
        font: '500 14px/20px system-ui, sans-serif',
        fontFamily: 'inherit',
        color: hover
          ? 'var(--color-accent-light, #6ee7b7)'
          : 'var(--color-accent, #34d399)',
        transition: 'color 150ms',
      }}
    >
      Voir l&apos;article sur le marché →
    </button>
  );
}
