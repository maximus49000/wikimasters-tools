import { useEffect } from 'react';
import type { KnownCard } from '../core/collection/collection-book';

// Une carte n'est relevée que si elle a été vue récemment (10 min) : on la redemande avant.
const REWANT_MS = 4 * 60_000;

// Les cartes affichées par une vue (toutes celles du filtre, pas seulement la page de la liste) sont demandées
// au collecteur du marché, qui les relève au fil des passes (une fois par 30 min chacune). Tant que la vue est
// affichée, la demande est renouvelée pour que la file ne s'éteigne pas avant d'avoir tout parcouru.
export function useWantPrices(cards: KnownCard[], want: (cards: KnownCard[]) => void): void {
  useEffect(() => {
    if (cards.length === 0) return;
    const request = () => want(cards);
    request();
    const timer = window.setInterval(request, REWANT_MS);
    return () => window.clearInterval(timer);
    // `want` est stable (fourni une fois) ; seule la liste de cartes relance la demande.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cards]);
}
