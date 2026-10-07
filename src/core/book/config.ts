// Open Library (sans clé, CORS ouvert) et Wikipédia FR : l'introduction d'un article sert de synopsis.
export const OPENLIBRARY_BASE = 'https://openlibrary.org';
export const OPENLIBRARY_COVER_BASE = 'https://covers.openlibrary.org/b/id';
export const WIKIPEDIA_API = 'https://fr.wikipedia.org/w/api.php';
export const WIKIPEDIA_ARTICLE_BASE = 'https://fr.wikipedia.org/wiki';

// Google Books : clé injectée à la compilation depuis `.env.local` (restreinte à l'API Books) ; vide : l'ebook n'est pas cherché.
export const GOOGLE_BOOKS_API_KEY: string = import.meta.env.WXT_GOOGLE_BOOKS_API_KEY ?? '';
export const GOOGLE_BOOKS_BASE = 'https://www.googleapis.com/books/v1';
export const AMAZON_FR_BASE = 'https://www.amazon.fr';
// Lecture du prix papier sur la page produit d'Amazon.fr : un seul réglage pour la couper (liens seulement).
export const AMAZON_PRICE_ENABLED = true;
