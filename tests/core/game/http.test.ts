import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { GameError, gameErrorMessage } from '../../../src/core/game/errors';
import { requestJson } from '../../../src/core/game/http';

const schema = z.object({ ok: z.boolean() });
const answer = (status: number, body: unknown = { ok: true }) => async () => new Response(JSON.stringify(body), { status });

describe('requestJson', () => {
  it('rend le JSON validé', async () => {
    expect(await requestJson('steam', answer(200), 'https://x', schema)).toEqual({ ok: true });
  });

  it.each([
    [401, 'auth'],
    [403, 'auth'],
    [404, 'not-found'],
    [429, 'rate-limited'],
    [500, 'http'],
  ] as const)('le statut %i devient %s', async (status, code) => {
    await expect(requestJson('igdb', answer(status), 'https://x', schema)).rejects.toMatchObject({ name: 'GameError', source: 'igdb', code });
  });

  it('un format inattendu ou un réseau en panne lève une erreur http', async () => {
    await expect(requestJson('steam', answer(200, { pas: 'ça' }), 'https://x', schema)).rejects.toMatchObject({ code: 'http' });
    await expect(requestJson('steam', async () => Promise.reject(new Error('réseau')), 'https://x', schema)).rejects.toMatchObject({ code: 'http' });
  });
});

describe('gameErrorMessage', () => {
  it('nomme la source et reste lisible', () => {
    expect(gameErrorMessage(new GameError('steam', 'rate-limited', 'x'))).toBe('Steam demande de patienter un instant. Réessaie dans quelques secondes.');
    expect(gameErrorMessage(new GameError('igdb', 'auth', 'x'))).toBe("L'accès à IGDB est refusé.");
    expect(gameErrorMessage(new GameError('igdb', 'http', 'x'))).toBe('IGDB est indisponible pour le moment.');
    expect(gameErrorMessage(new Error('autre'))).toBe('Les informations du jeu sont indisponibles pour le moment.');
  });
});
