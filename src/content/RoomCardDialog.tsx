import { useEffect } from 'react';
import type { RoomCardData } from '../core/library/library-repo';
import { BookSection } from './BookSection';
import { GameSection } from './GameSection';
import { ListenSection } from './ListenSection';
import { ScreenSection } from './ScreenSection';
import { WriterSection } from './WriterSection';

type Props = {
  slug: string;
  card: RoomCardData;
  // Fiche de marché de la carte.
  onOpenMarket: (slug: string) => void;
  // La carte elle-même, dans la Collection du jeu (ouverture plus longue : recherche, parfois changement de page).
  onOpenCard: (slug: string) => void;
  onClose: () => void;
};

// Fiche d'une carte de « Ma Pièce » : dessinée par nous depuis la copie sauvegardée, sans passer par la grille du site.
// Les sections film, musique, jeu et livre sont celles des fiches natives ; elles s'effacent quand la carte n'en relève pas.
export function RoomCardDialog({ slug, card, onOpenMarket, onOpenCard, onClose }: Props) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      onClose();
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  return (
    <div className="wmt-lib-dialog" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="wmt-lib-dialog-panel" role="dialog" aria-modal="true" aria-label={card.title} data-room-card={slug}>
        <div className="wmt-lib-row" style={{ alignItems: 'flex-start' }}>
          {card.imageUrl && <img src={card.imageUrl} alt="" style={{ width: 76, borderRadius: 6, flex: 'none' }} />}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 16 }}>{card.title}</div>
            {card.rarity && <div style={{ fontSize: 12, opacity: 0.75 }}>{card.rarity}</div>}
            {card.tags && card.tags.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
                {card.tags.map((tag) => (
                  <span key={tag.name} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 999, border: `1px solid ${tag.color ?? 'rgba(148,163,184,.5)'}` }}>{tag.name}</span>
                ))}
              </div>
            )}
            {(card.attack !== undefined || card.defense !== undefined) && (
              <div style={{ fontSize: 12, opacity: 0.75, marginTop: 6 }}>Attaque {card.attack ?? '?'} · Défense {card.defense ?? '?'}</div>
            )}
          </div>
        </div>
        {card.extract && <p style={{ margin: 0, fontSize: 13, lineHeight: 1.4 }}>{card.extract}</p>}
        <ScreenSection slug={slug} title={card.title} onOpenCard={onOpenCard} />
        <ListenSection slug={slug} title={card.title} />
        <GameSection slug={slug} title={card.title} />
        <BookSection slug={slug} title={card.title} />
        <WriterSection slug={slug} title={card.title} onOpenCard={onOpenCard} />
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="wmt-lib-btn" style={{ flex: 1, minHeight: 44, fontSize: 20 }} aria-label="Voir le marché" title="Voir le marché" data-action="market" onClick={() => onOpenMarket(slug)}>📈</button>
          <button type="button" className="wmt-lib-btn" style={{ flex: 1, minHeight: 44, fontSize: 20 }} aria-label="Ouvrir la carte" title="Ouvrir la carte" data-action="card" onClick={() => onOpenCard(slug)}>🃏</button>
          <button type="button" className="wmt-lib-btn" style={{ minHeight: 44, minWidth: 44, fontSize: 20 }} aria-label="Fermer" title="Fermer" data-action="close" onClick={onClose}>✕</button>
        </div>
      </div>
    </div>
  );
}
