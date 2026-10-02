import { describe, expect, it, vi } from 'vitest';
import { createPlatformMusicService, type PlatformServiceLike } from '../../src/content/platform-service';
import { createPlatformSetting } from '../../src/core/music/platform';

const memory = () => {
  const data = new Map<string, string>();
  return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => void data.set(key, value) };
};

const fake = (name: string) => {
  const listeners = new Set<() => void>();
  const service = {
    view: vi.fn(async () => ({ status: 'error' as const, message: name })),
    refresh: vi.fn(async () => ({ status: 'error' as const, message: `${name}+` })),
    play: vi.fn(async () => name as string | null),
    link: vi.fn(async () => name as string | null),
    unlink: vi.fn(async () => undefined),
    isLinked: vi.fn(async () => name === 'tidal'),
    playingSlugs: vi.fn(async () => new Set([name])),
    subscribe: vi.fn((listener: () => void) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    }),
  };
  return { service: service as unknown as PlatformServiceLike, mocks: service, listeners };
};

describe('createPlatformMusicService', () => {
  it('délègue à la plateforme choisie, et suit le réglage', async () => {
    const spotify = fake('spotify');
    const tidal = fake('tidal');
    const setting = createPlatformSetting(memory());
    const service = createPlatformMusicService(setting, { spotify: spotify.service, tidal: tidal.service });
    expect(await service.view('S', 'T')).toEqual({ status: 'error', message: 'spotify' });
    expect(await service.isLinked()).toBe(false);
    setting.set('tidal');
    expect(await service.view('S', 'T')).toEqual({ status: 'error', message: 'tidal' });
    expect(await service.refresh('S', 'T')).toEqual({ status: 'error', message: 'tidal+' });
    expect(await service.link()).toBe('tidal');
    expect(await service.isLinked()).toBe(true);
    await service.unlink();
    expect(tidal.mocks.unlink).toHaveBeenCalledTimes(1);
    expect(spotify.mocks.unlink).not.toHaveBeenCalled();
    expect(await service.playingSlugs([], { uri: 'u', title: 't', artist: 'a' })).toEqual(new Set(['tidal']));
  });

  it("retombe sur Spotify quand la plateforme choisie n'est pas disponible", async () => {
    const spotify = fake('spotify');
    const setting = createPlatformSetting(memory());
    setting.set('tidal');
    expect(await createPlatformMusicService(setting, { spotify: spotify.service }).view('S', 'T')).toEqual({ status: 'error', message: 'spotify' });
  });

  it("prévient les abonnés quand le réglage change ou qu'un compte est lié, et se désabonne de tout", () => {
    const spotify = fake('spotify');
    const tidal = fake('tidal');
    const setting = createPlatformSetting(memory());
    const service = createPlatformMusicService(setting, { spotify: spotify.service, tidal: tidal.service });
    const listener = vi.fn();
    const off = service.subscribe(listener);
    setting.set('tidal');
    tidal.listeners.forEach((notify) => notify());
    expect(listener).toHaveBeenCalledTimes(2);
    off();
    expect(spotify.listeners.size + tidal.listeners.size).toBe(0);
    setting.set('spotify');
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
