// src/content/CardThumb.tsx
import { useSyncExternalStore } from 'react';
import type { KnownCard } from '../core/collection/collection-book';
import { rarityKey } from './card-rarity';
import { getImageService } from './image-registry';

const noSubscribe = () => () => undefined;

// Miniature : couleur de rareté en cadre et en fond, image en haut (celle du jeu, sinon l'image de remplacement déjà trouvée).
export function CardThumb({ card, width = 34, height = 48 }: { card: KnownCard; width?: number; height?: number }) {
  const images = getImageService();
  // S'abonne aux images qui arrivent (affiche du jeu vidéo, couverture, image de remplacement).
  const url = useSyncExternalStore(images?.subscribe ?? noSubscribe, () => (images ? images.displayUrl(card.slug, card.imageUrl) : card.imageUrl));
  const color = card.rarity ? `var(--color-rarity-${rarityKey(card.rarity)}, #94a3b8)` : '#94a3b8';
  return (
    <span
      aria-hidden="true"
      style={{
        flex: 'none',
        width,
        height,
        position: 'relative',
        overflow: 'hidden',
        borderRadius: 5,
        border: `1.5px solid ${color}`,
        boxShadow: `0 0 6px color-mix(in srgb, ${color} 60%, transparent)`,
        background: `linear-gradient(160deg, ${color}, #0d1117 140%)`,
      }}
    >
      {url ? <img src={url} alt="" referrerPolicy="no-referrer" style={{ position: 'absolute', inset: '0 0 50% 0', width: '100%', height: '50%', objectFit: 'cover' }} /> : null}
    </span>
  );
}
