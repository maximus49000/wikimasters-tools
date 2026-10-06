import { extractCards } from '../api/collection-schemas';
import { titleToSlug } from '../market/market-book';
import type { KnownCard } from './collection-book';

// Ce que l'extension a déjà appliqué des listes « mes enchères » du site (`/api/marketplace?mine=1`).
// `sold` : enchères de vente → la carte a-t-elle déjà été décomptée ? `won` : enchères gagnées déjà vues.
export type MineLedger = { ready: boolean; sold: Record<string, { slug: string; removed: boolean }>; won: string[] };

export const EMPTY_LEDGER: MineLedger = { ready: false, sold: {}, won: [] };

const MAX_TRACKED = 500;

type Row = { id?: unknown; status?: unknown; owned?: unknown; card?: { wikipedia_title?: unknown } | null };

const rows = (value: unknown): Row[] => (Array.isArray(value) ? (value as Row[]).filter((row) => typeof row?.id === 'string') : []);
const slugOf = (row: Row): string | null => (typeof row.card?.wikipedia_title === 'string' ? titleToSlug(row.card.wikipedia_title) : null);

// La carte d'une de mes ventes a quitté ma Collection : le site dit ne plus la posséder (`owned: false`), ou la vente est conclue.
const hasLeft = (row: Row): boolean => row.owned === false || row.status === 'settled_sold';

export type MinePlan = {
  ledger: MineLedger;
  // Variation du nombre d'exemplaires par carte (−1 : vendue, +1 : vente sans acheteur, la carte est revenue).
  deltas: Record<string, number>;
  // Cartes gagnées aux enchères, avec toutes les données de la carte (rareté, image…).
  gained: KnownCard[];
};

// La première lecture ne fait que mémoriser l'existant : la Collection scannée en tient déjà compte.
export function planMineEvents(ledger: MineLedger, mine: { selling?: unknown; history?: unknown; won?: unknown }): MinePlan {
  const deltas: Record<string, number> = {};
  const sold = { ...ledger.sold };
  for (const row of [...rows(mine.selling), ...rows(mine.history)]) {
    const id = row.id as string;
    const slug = slugOf(row);
    if (slug === null) continue;
    const removed = hasLeft(row);
    const known = sold[id];
    if (ledger.ready && (known ? known.removed !== removed : removed)) deltas[slug] = (deltas[slug] ?? 0) + (removed ? -1 : 1);
    sold[id] = { slug, removed };
  }

  const wonRows = rows(mine.won);
  const seen = new Set(ledger.won);
  const fresh = wonRows.filter((row) => !seen.has(row.id as string));
  const gained = ledger.ready ? extractCards(fresh) : [];
  const won = [...ledger.won, ...fresh.map((row) => row.id as string)].slice(-MAX_TRACKED);

  const soldIds = Object.keys(sold);
  const trimmed = soldIds.length > MAX_TRACKED ? Object.fromEntries(soldIds.slice(-MAX_TRACKED).map((id) => [id, sold[id]!])) : sold;
  return { ledger: { ready: true, sold: trimmed, won }, deltas, gained };
}
