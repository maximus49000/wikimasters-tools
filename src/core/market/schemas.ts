import { z } from 'zod';

// Enchères actives du marché, telles que le site les charge lui-même
// (`auctions` dans les réponses de /api/marketplace). On ne déclare que les
// champs utiles : ni vendeur ni enchérisseur, donc aucun pseudo n'est conservé.
const marketAuctionSchema = z.object({
  id: z.string(),
  card_id: z.string(),
  status: z.string(),
  end_at: z.string(),
  effective_bid: z.number(),
  current_bidder_id: z.string().nullable(),
  is_shiny: z.boolean(),
  snapshot_rarity: z.string(),
  card: z.object({
    wikipedia_title: z.string(),
    wikipedia_url: z.string(),
  }),
});

export type MarketAuction = z.infer<typeof marketAuctionSchema>;

export type ParsedMarket = { auctions: MarketAuction[]; skipped: number };

// Tolérant : une entrée invalide est écartée sans faire échouer les autres.
export function parseMarketAuctions(json: unknown): ParsedMarket {
  const raw = (json as { auctions?: unknown } | null)?.auctions;
  if (!Array.isArray(raw)) return { auctions: [], skipped: 0 };

  const auctions: MarketAuction[] = [];
  let skipped = 0;
  for (const item of raw) {
    const result = marketAuctionSchema.safeParse(item);
    if (result.success) auctions.push(result.data);
    else skipped += 1;
  }
  return { auctions, skipped };
}
