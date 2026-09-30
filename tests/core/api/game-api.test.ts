import { describe, expect, it } from 'vitest';
import fixture from '../../fixtures/mine-response.json';
import { ApiFormatError, ApiHttpError, NotAuthenticatedError } from '../../../src/core/api/errors';
import { createGameApi, type FetchLike } from '../../../src/core/api/game-api';

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers });
}

function setup(responses: Response[], options: { minIntervalMs?: number } = {}) {
  const calls: string[] = [];
  const sleeps: number[] = [];
  const queue = [...responses];
  const fetch: FetchLike = async (input) => {
    calls.push(input);
    const next = queue.shift();
    if (!next) throw new Error('plus de réponse simulée');
    return next;
  };
  const api = createGameApi({
    fetch,
    sleep: async (ms) => { sleeps.push(ms); },
    now: () => 0,
    minIntervalMs: options.minIntervalMs ?? 0,
  });
  return { api, calls, sleeps };
}

describe('createGameApi.getMine', () => {
  it("appelle l'endpoint mine=1 et renvoie la réponse validée", async () => {
    const { api, calls } = setup([json(fixture)]);
    const mine = await api.getMine();
    expect(calls).toEqual(['/api/marketplace?page=1&limit=1&mine=1']);
    expect(mine.history).toHaveLength(2);
  });

  it("attend puis réessaie après un 429 (backoff)", async () => {
    const { api, calls, sleeps } = setup([json({}, 429), json(fixture)]);
    await api.getMine();
    expect(calls).toHaveLength(2);
    expect(sleeps).toEqual([2000]);
  });

  it("respecte Retry-After", async () => {
    const { api, sleeps } = setup([json({}, 429, { 'Retry-After': '3' }), json(fixture)]);
    await api.getMine();
    expect(sleeps).toEqual([3000]);
  });

  it("abandonne après 3 nouvelles tentatives avec un backoff exponentiel", async () => {
    const { api, calls, sleeps } = setup([json({}, 429), json({}, 429), json({}, 429), json({}, 429)]);
    await expect(api.getMine()).rejects.toMatchObject({ name: 'ApiHttpError', status: 429 });
    expect(calls).toHaveLength(4);
    expect(sleeps).toEqual([2000, 4000, 8000]);
  });

  it("signale un utilisateur non connecté (401/403)", async () => {
    const { api } = setup([json({}, 401)]);
    await expect(api.getMine()).rejects.toBeInstanceOf(NotAuthenticatedError);
  });

  it("remonte les autres erreurs HTTP", async () => {
    const { api } = setup([json({}, 500)]);
    await expect(api.getMine()).rejects.toBeInstanceOf(ApiHttpError);
  });

  it("rejette une réponse au format inattendu", async () => {
    const { api } = setup([json({ nope: true })]);
    await expect(api.getMine()).rejects.toBeInstanceOf(ApiFormatError);
  });

  it("rejette une réponse qui n'est pas du JSON", async () => {
    const { api } = setup([new Response('<html>', { status: 200 })]);
    await expect(api.getMine()).rejects.toBeInstanceOf(ApiFormatError);
  });

  it("espace deux requêtes consécutives d'au moins minIntervalMs", async () => {
    const { api, sleeps } = setup([json(fixture), json(fixture)], { minIntervalMs: 1000 });
    await api.getMine();
    await api.getMine();
    expect(sleeps).toEqual([1000]);
  });
});
