import { describe, expect, it } from 'vitest';
import worker from '../../relay/src/index';
import { memoryKv } from './memory-kv';

const get = (path: string, env: Parameters<typeof worker.fetch>[1]) => worker.fetch(new Request(`https://relais.test${path}`), env);

describe('/status', () => {
  it('indique la présence des réglages sans jamais en montrer la valeur', async () => {
    const response = await get('/status', { YOUTUBE_API_KEY: 'SECRET-VALUE', DOC_CACHE: memoryKv() });
    const text = await response.text();
    expect(JSON.parse(text)).toMatchObject({ ok: true, config: { youtubeKey: true, kv: true, debugToken: false } });
    expect(text).not.toContain('SECRET-VALUE');
  });
  it('signale une clé absente', async () => {
    const body = await (await get('/status', { DOC_CACHE: memoryKv() })).json();
    expect(body).toMatchObject({ config: { youtubeKey: false, kv: true } });
  });
  it('sans KV, répond quand même avec une liste vide', async () => {
    expect(await (await get('/status', {})).json()).toMatchObject({ ok: true, config: { kv: false }, channels: [] });
  });
});

describe('/search sans réglages', () => {
  it('répond 503 quand la clé manque', async () => {
    const response = await get('/search?qid=Q1&kind=event&names=Verdun', { DOC_CACHE: memoryKv() });
    expect(response.status).toBe(503);
  });
});
