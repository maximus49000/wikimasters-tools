// Clé API TMDB (v3, lecture seule) injectée à la compilation depuis `.env.local` ; vide : la fonction est désactivée.
export const TMDB_API_KEY: string = import.meta.env.WXT_TMDB_API_KEY ?? '';
export const TMDB_BASE = 'https://api.themoviedb.org/3';
export const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/w92';
export const TMDB_POSTER_BASE = 'https://image.tmdb.org/t/p/w500';
