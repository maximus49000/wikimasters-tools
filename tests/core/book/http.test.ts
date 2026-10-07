import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { BookError, bookErrorMessage } from '../../../src/core/book/errors';
import { requestJson } from '../../../src/core/book/http';

const schema = z.object({ docs: z.array(z.object({ title: z.string() })) });
const reply = (status: number, body: unknown = {}) => async () => new Response(JSON.stringify(body), { status });

describe('requestJson', () => {
  it('rend le JSON valide', async () => {
    expect(await requestJson(reply(200, { docs: [{ title: 'L’étranger' }] }), 'https://x/y', schema)).toEqual({ docs: [{ title: 'L’étranger' }] });
  });

  it.each([
    [404, 'not-found'],
    [429, 'rate-limited'],
    [500, 'http'],
  ])('le statut %i devient une BookError « %s »', async (status, code) => {
    await expect(requestJson(reply(status), 'https://x/y', schema)).rejects.toMatchObject({ name: 'BookError', code });
  });

  it('un réseau en panne devient une BookError « http »', async () => {
    const down = async () => {
      throw new TypeError('Failed to fetch');
    };
    await expect(requestJson(down, 'https://x/y', schema)).rejects.toMatchObject({ code: 'http' });
  });

  it('une réponse au format inattendu lève', async () => {
    await expect(requestJson(reply(200, { pas: 'open library' }), 'https://x/y', schema)).rejects.toBeInstanceOf(BookError);
  });
});

describe('bookErrorMessage', () => {
  it('parle français et nomme Open Library', () => {
    expect(bookErrorMessage(new BookError('rate-limited', 'x'))).toContain('patienter');
    expect(bookErrorMessage(new BookError('not-found', 'x'))).toBe('Introuvable sur Open Library.');
    expect(bookErrorMessage(new BookError('http', 'x'))).toContain('Open Library');
    expect(bookErrorMessage(new Error('autre'))).toContain('indisponibles');
  });
});
