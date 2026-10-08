// src/core/book/google-books-api.ts
import { z } from 'zod';
import type { BookFetch } from './book-detail';
import { normalizeTitle } from './book-format';
import { GOOGLE_BOOKS_RELAY } from './config';
import { requestJson } from './http';

const priceSchema = z.object({ amount: z.number(), currencyCode: z.string() });
const volumeSchema = z.object({
  volumeInfo: z.object({ title: z.string(), authors: z.array(z.string()).optional() }),
  saleInfo: z.object({ saleability: z.string(), isEbook: z.boolean().optional(), listPrice: priceSchema.optional(), retailPrice: priceSchema.optional(), buyLink: z.string().optional() }),
});
const responseSchema = z.object({ items: z.array(volumeSchema).optional() });

// L'offre d'ebook retenue : prix en euros et lien d'achat (Google Play Livres).
export type EbookOffer = { amount: number; url: string };

// Prix de l'ebook d'un livre par Google Books (seul à donner un prix en France : jamais pour le papier).
// La recherche est « titre auteur » en texte simple (les opérateurs intitle/inauthor ne renvoient rien) ; les résultats sont bruyants
// (essais, résumés, éditions scolaires) : on ne garde que le titre égal, l'auteur concordant, un ebook en vente, en euros, avec un lien https ; le moins cher.
export function createGoogleBooksApi(deps: { fetch: BookFetch }) {
  return {
    async findEbook(book: { title: string; author?: string }): Promise<EbookOffer | null> {
      const wantedTitle = normalizeTitle(book.title);
      if (wantedTitle === '') return null;
      const query = [book.title, book.author].filter(Boolean).join(' ');
      const params = new URLSearchParams({ q: query, country: 'FR', maxResults: '10' });
      const data = await requestJson(deps.fetch, `${GOOGLE_BOOKS_RELAY}/volumes?${params}`, responseSchema);
      const wantedAuthor = book.author ? normalizeTitle(book.author) : '';
      const offers: EbookOffer[] = [];
      for (const item of data.items ?? []) {
        if (normalizeTitle(item.volumeInfo.title) !== wantedTitle) continue;
        if (wantedAuthor !== '' && !normalizeTitle((item.volumeInfo.authors ?? []).join(' ')).includes(wantedAuthor)) continue;
        const sale = item.saleInfo;
        const price = sale.retailPrice ?? sale.listPrice;
        if (sale.saleability !== 'FOR_SALE' || sale.isEbook === false || !price || price.currencyCode !== 'EUR' || price.amount <= 0) continue;
        if (!sale.buyLink?.startsWith('https://')) continue;
        offers.push({ amount: price.amount, url: sale.buyLink });
      }
      return offers.sort((a, b) => a.amount - b.amount)[0] ?? null;
    },
  };
}
export type GoogleBooksApi = ReturnType<typeof createGoogleBooksApi>;
