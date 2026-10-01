import { describe, expect, it, vi } from 'vitest';
import { createMemoryStore } from '../../../src/core/cache/store';
import { createImageService, type ImageSearch } from '../../../src/core/images/image-service';

const settings = (initial?: string) => {
  const data = new Map<string, string>(initial ? [['wmt:imageReplace', initial]] : []);
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
};
const make = (search: ImageSearch = vi.fn(async () => ['u1', 'u2']), initial?: string) => ({
  service: createImageService({ store: createMemoryStore(), search, settings: settings(initial) }),
  search,
});

describe('createImageService', () => {
  it('cherche une carte une seule fois, même demandée plusieurs fois', async () => {
    const { service, search } = make();
    expect(await service.resolve('A', 'A')).toBe('u1');
    await service.request('A', 'A');
    await Promise.all([service.request('B', 'B'), service.request('B', 'B')]);
    expect(search).toHaveBeenCalledTimes(2);
    expect(service.peek('A')).toBe('u1');
  });
  it('inactif : aucune recherche ni image', async () => {
    const { service, search } = make(undefined, 'off');
    expect(service.enabled()).toBe(false);
    expect(await service.resolve('A', 'A')).toBeNull();
    expect(search).not.toHaveBeenCalled();
  });
  it('actif par défaut', () => {
    expect(make().service.enabled()).toBe(true);
  });
  it('mémorise le réglage et prévient les abonnés', () => {
    const store = settings();
    const service = createImageService({ store: createMemoryStore(), search: async () => [], settings: store });
    const listener = vi.fn();
    service.subscribe(listener);
    service.setEnabled(false);
    expect(store.getItem('wmt:imageReplace')).toBe('off');
    expect(listener).toHaveBeenCalledTimes(1);
  });
  it('« Mauvaise image » passe au candidat suivant sans nouvelle recherche', async () => {
    const { service, search } = make();
    await service.resolve('A', 'A');
    await service.reject('A', 'A');
    expect(service.peek('A')).toBe('u2');
    expect(search).toHaveBeenCalledTimes(1);
  });
  it('relance une recherche (résultats suivants) quand tous les candidats sont écartés', async () => {
    const search = vi.fn(async (_title: string, skip: number) => (skip === 0 ? ['u1'] : ['u9']));
    const { service } = make(search);
    await service.resolve('A', 'A');
    await service.reject('A', 'A');
    expect(search).toHaveBeenLastCalledWith('A', 1);
    expect(service.peek('A')).toBe('u9');
  });
  it('un échec n’est pas enregistré comme « sans image » et laisse un temps de repos', async () => {
    let now = 0;
    const search = vi.fn<ImageSearch>().mockRejectedValueOnce(new Error('429')).mockResolvedValue(['u1']);
    const service = createImageService({ store: createMemoryStore(), search, settings: settings(), now: () => now });
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await service.resolve('A', 'A');
    expect(service.peek('A')).toBeUndefined();
    await service.request('A', 'A');
    expect(search).toHaveBeenCalledTimes(1);
    now = 61_000;
    await service.request('A', 'A');
    expect(service.peek('A')).toBe('u1');
  });
  it('recharge ce qui a été enregistré', async () => {
    const store = createMemoryStore();
    await store.set('card-images', { A: { url: 'u7', candidates: ['u7'], rejected: [] } });
    const service = createImageService({ store, search: vi.fn(async () => []), settings: settings() });
    expect(await service.resolve('A', 'A')).toBe('u7');
  });
});
