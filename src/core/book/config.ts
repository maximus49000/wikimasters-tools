import { RELAY_BASE } from '../documentary/config';

// Open Library (sans clé, CORS ouvert) et Wikipédia FR : l'introduction d'un article sert de synopsis.
export const OPENLIBRARY_BASE = 'https://openlibrary.org';
export const OPENLIBRARY_COVER_BASE = 'https://covers.openlibrary.org/b/id';
export const WIKIPEDIA_API = 'https://fr.wikipedia.org/w/api.php';
export const WIKIPEDIA_ARTICLE_BASE = 'https://fr.wikipedia.org/wiki';

// Google Livres passe par le relais (la clé est côté serveur).
export const GOOGLE_BOOKS_RELAY = `${RELAY_BASE}/books`;
export const AMAZON_FR_BASE = 'https://www.amazon.fr';
// Lecture du prix papier sur la page produit d'Amazon.fr : un seul réglage pour la couper (liens seulement).
export const AMAZON_PRICE_ENABLED = true;
