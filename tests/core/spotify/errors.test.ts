import { describe, expect, it } from 'vitest';
import { SpotifyError, userMessage } from '../../../src/core/spotify/errors';

describe('userMessage', () => {
  it('donne un message clair par cas', () => {
    expect(userMessage(new SpotifyError('no-device', 'x'))).toBe("Ouvre Spotify sur un de tes appareils, puis réessaie.");
    expect(userMessage(new SpotifyError('not-premium', 'x'))).toBe('Spotify Premium est nécessaire pour lancer la lecture.');
    expect(userMessage(new SpotifyError('not-linked', 'x'))).toBe('Lie ton compte Spotify pour écouter.');
    expect(userMessage(new SpotifyError('rate-limited', 'x', 3000))).toBe('Spotify demande de patienter un instant. Réessaie dans quelques secondes.');
    expect(userMessage(new SpotifyError('auth-cancelled', 'x'))).toBe('Liaison Spotify annulée.');
    expect(userMessage(new SpotifyError('http', 'x'))).toBe('Spotify est indisponible pour le moment.');
    expect(userMessage(new Error('boom'))).toBe('Spotify est indisponible pour le moment.');
  });

  it("annonce l'attente réelle d'une limite : quelques secondes, puis des minutes, puis des heures", () => {
    const limited = (ms?: number) => userMessage(new SpotifyError('rate-limited', 'x', ms));
    const seconds = 'Spotify demande de patienter un instant. Réessaie dans quelques secondes.';
    expect(limited()).toBe(seconds);
    expect(limited(59_000)).toBe(seconds);
    expect(limited(60_000)).toBe('Spotify demande de patienter. Réessaie dans environ 1 min.');
    expect(limited(90_000)).toBe('Spotify demande de patienter. Réessaie dans environ 2 min.');
    expect(limited(119 * 60_000)).toBe('Spotify demande de patienter. Réessaie dans environ 119 min.');
    expect(limited(3 * 3_600_000)).toBe('Spotify demande de patienter. Réessaie dans environ 3 h.');
  });
});
