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

  describe('limite de débit', () => {
    // Heures de l'appareil : les tests ne dépendent pas du fuseau.
    const at = (day: number, hour: number, minute: number, second = 0) => new Date(2026, 9, day, hour, minute, second).getTime();
    const now = at(1, 22, 41);
    const instant = 'Spotify demande de patienter un instant. Réessaie dans quelques secondes.';
    const limited = (retryAt: number) => userMessage(new SpotifyError('rate-limited', 'x', retryAt - now, retryAt), now);

    it("annonce l'heure à laquelle les appels reprennent : aujourd'hui, demain, plus tard", () => {
      expect(limited(at(1, 23, 30))).toBe("Spotify demande de patienter jusqu'à 23 h 30.");
      expect(limited(at(2, 14, 5))).toBe("Spotify demande de patienter jusqu'à demain à 14 h 05.");
      expect(limited(at(3, 9, 0))).toBe("Spotify demande de patienter jusqu'au 03/10 à 9 h 00.");
    });

    it('arrondit à la minute supérieure : jamais une heure avant la reprise réelle', () => {
      expect(limited(at(2, 14, 29, 10))).toBe("Spotify demande de patienter jusqu'à demain à 14 h 30.");
      expect(limited(at(2, 14, 30, 0))).toBe("Spotify demande de patienter jusqu'à demain à 14 h 30.");
    });

    it("moins d'une minute, ou sans durée connue : un instant", () => {
      expect(limited(now + 59_000)).toBe(instant);
      expect(userMessage(new SpotifyError('rate-limited', 'x'), now)).toBe(instant);
    });

    it('sans heure absolue, la durée demandée suffit', () => {
      expect(userMessage(new SpotifyError('rate-limited', 'x', 30 * 60_000), now)).toBe("Spotify demande de patienter jusqu'à 23 h 11.");
    });
  });
});
