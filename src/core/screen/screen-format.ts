import { TMDB_IMAGE_BASE } from './config';

// Clé de vidéo YouTube : lettres, chiffres, tiret, souligné. Autre chose : on n'en fait pas une adresse.
const VIDEO_KEY = /^[\w-]{3,32}$/;

export const embedUrl = (key: string): string | null =>
  VIDEO_KEY.test(key) ? `https://www.youtube-nocookie.com/embed/${key}?autoplay=1&rel=0` : null;
export const thumbnailUrl = (key: string): string | null => (VIDEO_KEY.test(key) ? `https://img.youtube.com/vi/${key}/hqdefault.jpg` : null);
export const watchUrl = (key: string): string | null => (VIDEO_KEY.test(key) ? `https://www.youtube.com/watch?v=${key}` : null);

export const posterUrl = (path: string | undefined): string | null => (path ? `${TMDB_IMAGE_BASE}${path}` : null);

export const formatRating = (average: number): string => average.toFixed(1).replace('.', ',');
export const formatVotes = (votes: number): string => String(votes).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
