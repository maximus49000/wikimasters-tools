export type SpotifyErrorCode = 'not-linked' | 'no-device' | 'not-premium' | 'rate-limited' | 'auth-cancelled' | 'http';

export class SpotifyError extends Error {
  constructor(
    readonly code: SpotifyErrorCode,
    message: string,
    // Pour `rate-limited` : durée demandée par Spotify (Retry-After), restante au moment de l'erreur.
    readonly retryAfterMs?: number,
    // Pour `rate-limited` : heure (ms, absolue) à laquelle les appels pourront reprendre.
    readonly retryAt?: number,
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

const pad = (value: number): string => String(value).padStart(2, '0');
const startOfDay = (date: Date): number => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

// « jusqu'à 14 h 30 », « jusqu'à demain à 14 h 30 », « jusqu'au 03/10 à 14 h 30 » : l'heure de l'appareil, arrondie à la minute supérieure.
function resumeTime(retryAt: number, now: number): string {
  const resume = new Date(Math.ceil(retryAt / 60_000) * 60_000);
  const time = `${resume.getHours()} h ${pad(resume.getMinutes())}`;
  const days = Math.round((startOfDay(resume) - startOfDay(new Date(now))) / 86_400_000);
  if (days <= 0) return `jusqu'à ${time}`;
  if (days === 1) return `jusqu'à demain à ${time}`;
  return `jusqu'au ${pad(resume.getDate())}/${pad(resume.getMonth() + 1)} à ${time}`;
}

// La limite de Spotify peut durer des heures : on annonce l'heure à laquelle les appels reprendront, quand on la connaît.
function rateLimitedMessage(error: SpotifyError, now: number): string {
  const retryAt = error.retryAt ?? (error.retryAfterMs === undefined ? undefined : now + error.retryAfterMs);
  if (retryAt === undefined || retryAt - now < 60_000) return MESSAGES['rate-limited'];
  return `Spotify demande de patienter ${resumeTime(retryAt, now)}.`;
}

export function userMessage(error: unknown, now: number = Date.now()): string {
  if (!(error instanceof SpotifyError)) return MESSAGES.http;
  return error.code === 'rate-limited' ? rateLimitedMessage(error, now) : MESSAGES[error.code];
}
