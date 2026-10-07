// src/core/book/amazon-price.ts
import type { BookFetch } from './book-detail';
import { isbn10Of } from './book-isbn';
import { AMAZON_FR_BASE } from './config';
import { BookError } from './errors';

const PRICE_AMOUNT = /"priceAmount":\s*(\d+(?:\.\d+)?)/;
const OFFSCREEN_PRICE = /<span class="a-offscreen">\s*(\d{1,4}(?:[.,]\d{2}))\s*(?:€|&euro;|EUR)/;
const ROBOT_CHECK = /validateCaptcha|api-services-support@amazon/i;

// Le prix de l'édition sur la page produit d'Amazon.fr : le premier prix structuré de la page, à défaut le premier prix affiché.
// La page doit mentionner l'ISBN-13 demandé (sinon c'est une autre édition) et ne pas être une vérification anti-robot ;
// un prix nul ou absurde est refusé. Garde-fou de concordance : quand le premier prix structuré ET le premier prix affiché existent,
// ils doivent être égaux au centime près (sinon l'un est peut-être celui d'un autre format ou d'un vendeur tiers) : la page est alors illisible.
// Un prix structuré nul ne retombe pas sur le prix affiché. undefined : page illisible.
export function parseAmazonPrice(html: string, isbn13: string): number | undefined {
  if (ROBOT_CHECK.test(html)) return undefined;
  if (!html.includes(isbn13) && !html.includes(`${isbn13.slice(0, 3)}-${isbn13.slice(3)}`)) return undefined;
  const structured = PRICE_AMOUNT.exec(html)?.[1];
  const displayed = OFFSCREEN_PRICE.exec(html)?.[1]?.replace(',', '.');
  if (structured !== undefined && displayed !== undefined && !(Math.abs(Number(structured) - Number(displayed)) < 0.005)) return undefined;
  const raw = structured ?? displayed;
  const amount = raw === undefined ? Number.NaN : Number(raw);
  return Number.isFinite(amount) && amount > 0 && amount < 1000 ? amount : undefined;
}

// Lecture du prix papier d'un livre sur Amazon.fr. Fragile par nature (la page n'est pas une API) : elle lève dès que le prix
// n'est pas lisible, et l'appelant ne mémorise alors rien.
export function createAmazonPrice(deps: { fetch: BookFetch }) {
  return {
    async read(isbn13: string): Promise<number> {
      const isbn10 = isbn10Of(isbn13);
      if (!isbn10) throw new BookError('not-found', 'pas d’ISBN-10');
      let response: Response;
      try {
        response = await deps.fetch(`${AMAZON_FR_BASE}/dp/${isbn10}`);
      } catch {
        throw new BookError('http', 'injoignable');
      }
      if (response.status === 404) throw new BookError('not-found', 'introuvable');
      if (response.status === 429 || response.status === 503) throw new BookError('rate-limited', 'limite atteinte');
      if (!response.ok) throw new BookError('http', `HTTP ${response.status}`);
      let body: string;
      try {
        body = await response.text();
      } catch {
        throw new BookError('http', 'réponse illisible');
      }
      const amount = parseAmazonPrice(body, isbn13);
      if (amount === undefined) throw new BookError('http', 'page illisible');
      return amount;
    },
  };
}
export type AmazonPrice = ReturnType<typeof createAmazonPrice>;
