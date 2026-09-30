import type { MarketAuction } from './schemas';

export type Offer = { id: string; price: number; endAt: number; hasBid: boolean };

export type CardMarket = {
  cardId: string;
  isShiny: boolean;
  rarity: string;
  title: string;
  slug: string;
  offers: Offer[];
  seenAt: number;
};

// Clé : `${cardId}|${shiny}`, pour ne pas mélanger une carte et sa variante shiny.
export type MarketState = Record<string, CardMarket>;

export type MarketSummary = {
  offerCount: number;
  bidCount: number;
  avgPrice: number;
  minPrice: number;
  seenAt: number;
};

// Une carte sans offre reste connue un jour : « plus d'offre » ≠ « jamais vue ».
const EMPTY_CARD_TTL_MS = 24 * 3_600_000;

export function wikipediaSlug(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (!/(^|\.)wikipedia\.org$/.test(parsed.hostname)) return null;
  const match = /^\/wiki\/(.+)$/.exec(parsed.pathname);
  if (!match?.[1]) return null;
  let title = match[1];
  try {
    title = decodeURIComponent(title);
  } catch {
    // séquence % invalide : on garde le texte tel quel
  }
  return title.replace(/ /g, '_').normalize('NFC');
}

export function slugToTitle(slug: string): string {
  return slug.replace(/_/g, ' ');
}

export function titleToSlug(title: string): string {
  return title.trim().replace(/\s+/g, '_').normalize('NFC');
}

function cardKey(cardId: string, isShiny: boolean): string {
  return `${cardId}|${isShiny ? 1 : 0}`;
}

export function mergeObservation(
  state: MarketState,
  auctions: MarketAuction[],
  now: number,
): MarketState {
  const next: MarketState = {};
  for (const [key, card] of Object.entries(state)) {
    next[key] = { ...card, offers: [...card.offers] };
  }

  for (const auction of auctions) {
    const endAt = Date.parse(auction.end_at);
    const slug = wikipediaSlug(auction.card.wikipedia_url);
    if (Number.isNaN(endAt) || slug === null) continue;

    const key = cardKey(auction.card_id, auction.is_shiny);
    const card: CardMarket = next[key] ?? {
      cardId: auction.card_id,
      isShiny: auction.is_shiny,
      rarity: auction.snapshot_rarity,
      title: auction.card.wikipedia_title,
      slug,
      offers: [],
      seenAt: now,
    };
    card.seenAt = now;
    card.offers = card.offers.filter((offer) => offer.id !== auction.id);
    if (auction.status === 'active') {
      card.offers.push({
        id: auction.id,
        price: auction.effective_bid,
        endAt,
        hasBid: auction.current_bidder_id !== null,
      });
    }
    next[key] = card;
  }

  for (const [key, card] of Object.entries(next)) {
    card.offers = card.offers.filter((offer) => offer.endAt > now);
    if (card.offers.length === 0 && now - card.seenAt > EMPTY_CARD_TTL_MS) delete next[key];
  }
  return next;
}

export function activeOffers(card: CardMarket, now: number): Offer[] {
  return card.offers.filter((offer) => offer.endAt > now);
}

export function summarize(card: CardMarket, now: number): MarketSummary | null {
  const offers = activeOffers(card, now);
  if (offers.length === 0) return null;
  const total = offers.reduce((sum, offer) => sum + offer.price, 0);
  return {
    offerCount: offers.length,
    bidCount: offers.filter((offer) => offer.hasBid).length,
    avgPrice: Math.round(total / offers.length),
    minPrice: Math.min(...offers.map((offer) => offer.price)),
    seenAt: card.seenAt,
  };
}

export function findBySlug(state: MarketState, slug: string, now: number): CardMarket[] {
  return Object.values(state)
    .filter((card) => card.slug === slug)
    .map((card) => ({ ...card, offers: activeOffers(card, now) }))
    .sort((a, b) => Number(a.isShiny) - Number(b.isShiny));
}
