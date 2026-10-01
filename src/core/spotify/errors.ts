export type SpotifyErrorCode = 'not-linked' | 'no-device' | 'not-premium' | 'rate-limited' | 'auth-cancelled' | 'http';

export class SpotifyError extends Error {
  constructor(
    readonly code: SpotifyErrorCode,
    message: string,
    // Pour `rate-limited` : durée demandée par Spotify (Retry-After).
    readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = 'SpotifyError';
  }
}

const MESSAGES: Record<SpotifyErrorCode, string> = {
  'no-device': 'Ouvre Spotify sur un de tes appareils, puis réessaie.',
  'not-premium': 'Spotify Premium est nécessaire pour lancer la lecture.',
  'not-linked': 'Lie ton compte Spotify pour écouter.',
  'rate-limited': 'Spotify demande de patienter un instant. Réessaie dans quelques secondes.',
  'auth-cancelled': 'Liaison Spotify annulée.',
  http: 'Spotify est indisponible pour le moment.',
};

// La limite de Spotify peut durer des minutes, voire des heures : on annonce l'attente réelle quand on la connaît.
function rateLimitedMessage(retryAfterMs: number | undefined): string {
  if (retryAfterMs === undefined || retryAfterMs < 60_000) return MESSAGES['rate-limited'];
  const minutes = Math.ceil(retryAfterMs / 60_000);
  return `Spotify demande de patienter. Réessaie dans environ ${minutes < 120 ? `${minutes} min` : `${Math.ceil(minutes / 60)} h`}.`;
}

export function userMessage(error: unknown): string {
  if (!(error instanceof SpotifyError)) return MESSAGES.http;
  return error.code === 'rate-limited' ? rateLimitedMessage(error.retryAfterMs) : MESSAGES[error.code];
}
