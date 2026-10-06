import { useState } from 'react';

// Même gabarit que le lien « Voir l'article sur le marché » (text-sm, font-medium, couleur d'accent du site).
export function AuctionLink({ onOpen }: { onOpen: () => void }) {
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
        margin: '12px 0',
        border: 0,
        background: 'none',
        cursor: 'pointer',
        font: '500 14px/20px system-ui, sans-serif',
        fontFamily: 'inherit',
        color: hover ? 'var(--color-accent-light, #6ee7b7)' : 'var(--color-accent, #34d399)',
        transition: 'color 150ms',
      }}
    >
      Voir toutes les enchères pour cette carte →
    </button>
  );
}
