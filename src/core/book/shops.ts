import { AMAZON_FR_BASE } from './config';
import { isbn10Of } from './book-isbn';

// Un prix lu quelque part, avec sa source et le moment de la lecture.
export type PriceLine = { amount: number; currency: 'EUR'; source: string; readAt: number };

export type ShopLink = {
  shop: 'amazon' | 'fnac' | 'decitre' | 'libraire' | 'google-play';
  label: string;
  kind: 'paper' | 'ebook';
  url: string;
  price?: PriceLine;
};

// Les libraires du papier, dans l'ordre d'affichage. Un ISBN-13 mène à la page du livre (Amazon) ou à une recherche exacte (les autres) ;
// sans ISBN, la recherche se fait par titre et auteur. Aucun appel réseau : ces liens sont toujours là.
export function paperShopLinks(book: { isbn?: string; title: string; author?: string }): ShopLink[] {
  const query = encodeURIComponent(book.isbn ?? [book.title, book.author].filter(Boolean).join(' '));
  const isbn10 = book.isbn ? isbn10Of(book.isbn) : undefined;
  return [
    { shop: 'amazon', label: 'Amazon.fr', kind: 'paper', url: isbn10 ? `${AMAZON_FR_BASE}/dp/${isbn10}` : `${AMAZON_FR_BASE}/s?k=${query}` },
    { shop: 'fnac', label: 'Fnac', kind: 'paper', url: `https://www.fnac.com/SearchResult/ResultList.aspx?Search=${query}` },
    { shop: 'decitre', label: 'Decitre', kind: 'paper', url: `https://www.decitre.fr/rechercher/result?q=${query}` },
    { shop: 'libraire', label: 'Librairie indépendante', kind: 'paper', url: `https://www.placedeslibraires.fr/listeliv.php?base=allbooks&mots_recherche=${query}` },
  ];
}
