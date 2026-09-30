import type { Auction, MineResponse } from '../api/schemas';

export type PriceObservation = {
  auctionId: string;
  cardId: string;
  title: string;
  rarity: string;
  isShiny: boolean;
  price: number;
  at: string;
  kind: 'sold' | 'bought';
};

function toObservation(auction: Auction, kind: 'sold' | 'bought'): PriceObservation | null {
  if (auction.status !== 'settled_sold' || auction.final_price === null) return null;
  return {
    auctionId: auction.id,
    cardId: auction.card_id,
    title: auction.card.wikipedia_title,
    rarity: auction.snapshot_rarity,
    isShiny: auction.is_shiny,
    price: auction.final_price,
    at: auction.settled_at ?? auction.end_at,
    kind,
  };
}

export function extractObservations(mine: MineResponse): PriceObservation[] {
  const seen = new Set<string>();
  const observations: PriceObservation[] = [];
  const collect = (auctions: Auction[], kind: 'sold' | 'bought') => {
    for (const auction of auctions) {
      const observation = toObservation(auction, kind);
      if (observation && !seen.has(observation.auctionId)) {
        seen.add(observation.auctionId);
        observations.push(observation);
      }
    }
  };
  collect(mine.history, 'sold');
  collect(mine.won, 'bought');
  return observations;
}
