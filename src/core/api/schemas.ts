import { z } from 'zod';
import { ApiFormatError } from './errors';

export const MINE_ENDPOINT = '/api/marketplace?page=1&limit=1&mine=1';

// On ne déclare que les champs utilisés. Les champs inconnus sont ignorés,
// et la rareté reste une chaîne libre pour ne pas casser si le jeu en ajoute.
const cardSchema = z.object({
  id: z.string(),
  wikipedia_title: z.string(),
  rarity: z.string(),
  is_shiny: z.boolean(),
});

const auctionSchema = z.object({
  id: z.string(),
  card_id: z.string(),
  status: z.string(),
  snapshot_rarity: z.string(),
  is_shiny: z.boolean(),
  base_amount: z.number(),
  final_price: z.number().nullable(),
  created_at: z.string(),
  end_at: z.string(),
  settled_at: z.string().nullable(),
  seller_id: z.string(),
  winner_id: z.string().nullable(),
  card: cardSchema,
});

const mineResponseSchema = z.object({
  selling: z.array(auctionSchema),
  bidding: z.array(auctionSchema),
  history: z.array(auctionSchema),
  won: z.array(auctionSchema),
  maxConcurrentAuctions: z.number(),
});

export type MineResponse = z.infer<typeof mineResponseSchema>;
export type Auction = MineResponse['history'][number];

export function parseMineResponse(json: unknown): MineResponse {
  const result = mineResponseSchema.safeParse(json);
  if (!result.success) {
    const detail = result.error.issues
      .slice(0, 5)
      .map((issue) => `${issue.path.map(String).join('.') || '(racine)'} : ${issue.message}`)
      .join(' ; ');
    throw new ApiFormatError(MINE_ENDPOINT, detail);
  }
  return result.data;
}
