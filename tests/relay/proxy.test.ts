import { describe, expect, it } from 'vitest';
import { failure, forward } from '../../relay/src/proxy';

describe('forward', () => {
  it('transmet statut et corps d’une réponse normale', async () => {
    const result = await forward(async () => new Response('{"a":1}', { status: 200 }), 'https://x.test/');
    expect(result).toEqual({ status: 200, body: '{"a":1}' });
  });
  it('transmet un 404 et un 429 avec Retry-After', async () => {
    expect((await forward(async () => new Response('{}', { status: 404 }), 'https://x.test/')).status).toBe(404);
    const limited = await forward(async () => new Response('{}', { status: 429, headers: { 'retry-after': '7' } }), 'https://x.test/');
    expect(limited).toEqual({ status: 429, body: '{}', retryAfter: '7' });
  });
  it('cache les refus de clé et les pannes amont sous un 502 neutre', async () => {
    for (const status of [401, 403, 500, 503]) {
      expect(await forward(async () => new Response('secret-detail', { status }), 'https://x.test/')).toEqual(failure(502, 'upstream'));
    }
    expect(await forward(async () => Promise.reject(new Error('réseau')), 'https://x.test/')).toEqual(failure(502, 'upstream'));
  });
});
