import { afterEach, describe, expect, it, vi } from 'vitest';
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
  it('passe par le pont natif pour Steam, et rend une Response', async () => {
    const { win, nativeFetch, fallback } = setup();
    const response = await nativeFetch('https://store.steampowered.com/api/appdetails?appids=1');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(win.WmtHttp?.request).toHaveBeenCalledWith(expect.any(String), 'https://store.steampowered.com/api/appdetails?appids=1', 'GET', '{}', '');
    expect(fallback).not.toHaveBeenCalled();
  });

  it("transmet la méthode, les en-têtes et le corps d'une requête Steam", async () => {
    const { win, nativeFetch } = setup();
    await nativeFetch('https://api.steampowered.com/ISteamApps/GetAppList/v2/', { method: 'POST', headers: { Accept: 'application/json' }, body: 'appids=1' });
    expect(win.WmtHttp?.request).toHaveBeenCalledWith(expect.any(String), 'https://api.steampowered.com/ISteamApps/GetAppList/v2/', 'POST', '{"Accept":"application/json"}', 'appids=1');
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
    const response = await createNativeFetch(win, vi.fn() as unknown as typeof fetch)('https://api.steampowered.com/ISteamApps/GetAppList/v2/');
    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('30');
  });

  afterEach(() => vi.useRealTimers());

  const answering = (status: number, retryAfter = '', body = 'x') => {
    const win: NativeHttpWindow = {};
    win.WmtHttp = { request: vi.fn((id: string) => queueMicrotask(() => win.__wmtHttpDone?.(id, status, retryAfter, body))) };
    return { win, nativeFetch: createNativeFetch(win, vi.fn() as unknown as typeof fetch) };
  };

  it('rejette après le délai, et un rappel tardif est sans effet', async () => {
    vi.useFakeTimers();
    const win: NativeHttpWindow = {};
    let lastId = '';
    win.WmtHttp = { request: (id: string) => void (lastId = id) };
    const promise = createNativeFetch(win, vi.fn() as unknown as typeof fetch)('https://api.steampowered.com/ISteamApps/GetAppList/v2/');
    const rejected = expect(promise).rejects.toThrow('délai dépassé');
    await vi.advanceTimersByTimeAsync(20_001);
    await rejected;
    expect(() => win.__wmtHttpDone?.(lastId, 200, '', 'tard')).not.toThrow();
  });

  it('statut 0 ou négatif : rejet', async () => {
    await expect(answering(0).nativeFetch('https://api.steampowered.com/ISteamApps/GetAppList/v2/')).rejects.toThrow('réseau indisponible');
    await expect(answering(-1).nativeFetch('https://api.steampowered.com/ISteamApps/GetAppList/v2/')).rejects.toThrow('réseau indisponible');
  });

  it('statut invalide pour Response : rejet au lieu de pendre', async () => {
    await expect(answering(1000).nativeFetch('https://api.steampowered.com/ISteamApps/GetAppList/v2/')).rejects.toThrow('réponse invalide');
  });

  it('204 : Response sans corps', async () => {
    const response = await answering(204, '', 'ignoré').nativeFetch('https://api.steampowered.com/ISteamApps/GetAppList/v2/');
    expect(response.status).toBe(204);
    expect(await response.text()).toBe('');
  });

  it('la méthode est passée en majuscules', async () => {
    const { win, nativeFetch } = setup();
    await nativeFetch('https://api.steampowered.com/ISteamApps/GetAppList/v2/', { method: 'post', body: 'a' });
    expect(win.WmtHttp?.request).toHaveBeenCalledWith(expect.any(String), expect.any(String), 'POST', '{}', 'a');
  });

  it("les en-têtes d'un Headers sont transmis", async () => {
    const { win, nativeFetch } = setup();
    await nativeFetch('https://api.steampowered.com/ISteamApps/GetAppList/v2/', { headers: new Headers({ 'Client-ID': 'x' }) });
    expect(win.WmtHttp?.request).toHaveBeenCalledWith(expect.any(String), expect.any(String), 'GET', '{"client-id":"x"}', '');
  });

  it('un Request fournit méthode et en-têtes quand init est absent', async () => {
    const { win, nativeFetch } = setup();
    await nativeFetch(new Request('https://api.steampowered.com/ISteamApps/GetAppList/v2/', { method: 'POST', headers: { 'Client-ID': 'y' } }));
    expect(win.WmtHttp?.request).toHaveBeenCalledWith(expect.any(String), 'https://api.steampowered.com/ISteamApps/GetAppList/v2/', 'POST', '{"client-id":"y"}', '');
  });
});
