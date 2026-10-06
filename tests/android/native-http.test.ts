import { describe, expect, it, vi } from 'vitest';
import { createNativeFetch, type NativeHttpWindow } from '../../src/android/native-http';

function setup(hasBridge = true) {
  const win: NativeHttpWindow = {};
  const fallback = vi.fn(async () => new Response('repli')) as unknown as typeof fetch;
  if (hasBridge) {
    win.WmtHttp = {
      request: vi.fn((id: string) => {
        queueMicrotask(() => win.__wmtHttpDone?.(id, 200, '', '{"ok":true}'));
      }),
    };
  }
  return { win, fallback, nativeFetch: createNativeFetch(win, fallback) };
}

describe('createNativeFetch', () => {
  it('passe par le pont natif pour Steam et IGDB, et rend une Response', async () => {
    const { win, nativeFetch, fallback } = setup();
    const response = await nativeFetch('https://store.steampowered.com/api/appdetails?appids=1');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(win.WmtHttp?.request).toHaveBeenCalledWith(expect.any(String), 'https://store.steampowered.com/api/appdetails?appids=1', 'GET', '{}', '');
    expect(fallback).not.toHaveBeenCalled();
  });

  it("transmet la méthode, les en-têtes et le corps d'une requête IGDB", async () => {
    const { win, nativeFetch } = setup();
    await nativeFetch('https://api.igdb.com/v4/games', { method: 'POST', headers: { 'Client-ID': 'x' }, body: 'fields id;' });
    expect(win.WmtHttp?.request).toHaveBeenCalledWith(expect.any(String), 'https://api.igdb.com/v4/games', 'POST', '{"Client-ID":"x"}', 'fields id;');
  });

  it('les autres adresses, ou sans pont, gardent le fetch normal', async () => {
    const withBridge = setup();
    await withBridge.nativeFetch('https://api.themoviedb.org/3/movie/1');
    expect(withBridge.fallback).toHaveBeenCalledTimes(1);
    const without = setup(false);
    await without.nativeFetch('https://store.steampowered.com/api/appdetails?appids=1');
    expect(without.fallback).toHaveBeenCalledTimes(1);
  });

  it('une réponse 429 garde son délai Retry-After', async () => {
    const win: NativeHttpWindow = {};
    win.WmtHttp = { request: (id: string) => queueMicrotask(() => win.__wmtHttpDone?.(id, 429, '30', '')) };
    const response = await createNativeFetch(win, vi.fn() as unknown as typeof fetch)('https://api.igdb.com/v4/games');
    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('30');
  });
});
