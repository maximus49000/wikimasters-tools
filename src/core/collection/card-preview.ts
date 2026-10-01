import { toHistoryBadge, type HistoryBadgeModel } from '../market/history-badge';
import { cardsForSlug, type HistoryState } from '../market/price-history';
import { toPurchaseModel, type PurchaseModel } from '../pricing/badge';
import type { PriceBookEntry } from '../pricing/price-book';
import type { CardTag, KnownCard } from './collection-book';

// Les prix du marché d'une carte, comme sur la liste : moyenne des enchères, et relevé en attente.
export type CardMarket = { history: HistoryBadgeModel | null; loading: boolean };

export type CardPreview = {
  title: string;
  rarity: string | null;
  imageUrl: string | null;
  extract: string | null;
  attack: number | null;
  defense: number | null;
  tags: CardTag[];
  purchase: PurchaseModel | null;
  market: CardMarket;
  // Nombre d'exemplaires possédés, seulement s'il dépasse 1.
  copies: number | null;
  // Carte musique dont un titre joue en ce moment sur Spotify ; absent sinon.
  playing?: boolean;
};

const NO_MARKET: CardMarket = { history: null, loading: false };

// Une carte de la Collection affiche sa case de prix même sans donnée (« ??? »), comme sur la liste.
export function cardMarket(state: HistoryState, pending: ReadonlySet<string>, slug: string, now: number): CardMarket {
  return { history: toHistoryBadge(cardsForSlug(state, slug), now, true), loading: pending.has(slug) };
}

// Ce qu'affiche l'aperçu d'une carte : la carte du jeu, avec nos pastilles de prix (achat, marché).
export function toCardPreview(
  card: KnownCard,
  entry: Pick<PriceBookEntry, 'rarity' | 'purchase'> | null,
  market: CardMarket = NO_MARKET,
  playing = false,
): CardPreview {
  return {
    title: card.title,
    rarity: card.rarity ?? entry?.rarity ?? null,
    imageUrl: card.imageUrl ?? null,
    extract: card.extract ?? null,
    attack: card.attack ?? null,
    defense: card.defense ?? null,
    tags: card.tags ?? [],
    purchase: toPurchaseModel(entry?.purchase ?? null),
    market,
    copies: card.copies !== undefined && card.copies > 1 ? card.copies : null,
    ...(playing ? { playing: true } : {}),
  };
}
