import { RELAY_BASE } from '../documentary/config';

// TMDB (films et séries) passe par le relais Cloudflare, qui détient la clé API : l'extension et l'APK n'en contiennent aucune.
export const TMDB_RELAY = `${RELAY_BASE}/tmdb`;
export const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/w92';
export const TMDB_POSTER_BASE = 'https://image.tmdb.org/t/p/w500';
