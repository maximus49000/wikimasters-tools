import { useEffect, useState } from 'react';
import { getMusicService } from './music-registry';
import type { PlayerCard, PlayerView } from './player-source';

// La carte d'où vient la lecture, tant que le titre en cours (en lecture ou en pause) est bien dans sa liste d'écoute :
// une autre musique lancée depuis Spotify la fait disparaître.
export function usePlayerCard({ card, track }: Pick<PlayerView, 'card' | 'track'>): PlayerCard | null {
  // Le slug vérifié : une autre carte n'est jamais montrée sur la foi de la précédente.
  const [verified, setVerified] = useState<string | null>(null);

  useEffect(() => {
    const service = getMusicService();
    if (!service || !card || !track) {
      setVerified(null);
      return;
    }
    let cancelled = false;
    void service
      .playingSlugs([card], track)
      .then((slugs) => !cancelled && setVerified(slugs.has(card.slug) ? card.slug : null))
      .catch(() => !cancelled && setVerified(null));
    return () => {
      cancelled = true;
    };
    // L'état du lecteur est relu toutes les 5 s : seuls une autre carte ou un autre titre relancent la vérification.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card?.slug, track?.uri]);

  return card && verified === card.slug ? card : null;
}
