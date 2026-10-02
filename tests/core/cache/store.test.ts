import { describe, expect, it } from 'vitest';
import { createChromeLocalStore, createMemoryStore } from '../../../src/core/cache/store';

describe('createMemoryStore', () => {
  it('relit ce qui a été écrit et renvoie undefined pour une clé absente', async () => {
    const store = createMemoryStore();
    expect(await store.get('x')).toBeUndefined();
    await store.set('x', { a: 1 });
    expect(await store.get('x')).toEqual({ a: 1 });
  });

  it('se comporte comme un stockage JSON (copie, pas de référence partagée)', async () => {
    const store = createMemoryStore();
    const value = { list: [1] };
    await store.set('x', value);
    value.list.push(2);
    expect(await store.get('x')).toEqual({ list: [1] });
  });
});

describe('createChromeLocalStore', () => {
  it('préfixe les clés et délègue à la zone de stockage', async () => {
    const backing: Record<string, unknown> = {};
    const area = {
      get: async (key: string) => (key in backing ? { [key]: backing[key] } : {}),
      set: async (items: Record<string, unknown>) => { Object.assign(backing, items); },
    };
    const store = createChromeLocalStore(area);
    expect(await store.get('prices')).toBeUndefined();
    await store.set('prices', [1, 2]);
    expect(backing).toEqual({ 'wmt:prices': [1, 2] });
    expect(await store.get('prices')).toEqual([1, 2]);
  });
});

describe('createIndexedDbStore', () => {
  const fresh = async () => {
    const { IDBFactory } = await import('fake-indexeddb');
    const { createIndexedDbStore } = await import('../../../src/core/cache/store');
    return { factory: new IDBFactory(), createIndexedDbStore };
  };
  const legacyStorage = (items: Record<string, string> = {}) => {
    const map = new Map(Object.entries(items));
    return {
      getItem: (key: string) => map.get(key) ?? null,
      setItem: (key: string, value: string) => void map.set(key, value),
      removeItem: (key: string) => void map.delete(key),
      has: (key: string) => map.has(key),
    } as unknown as Storage & { has: (key: string) => boolean };
  };

  it('écrit et relit sans passer par localStorage', async () => {
    const { factory, createIndexedDbStore } = await fresh();
    const legacy = legacyStorage();
    const store = createIndexedDbStore(factory, legacy);
    await store.set('links-v2', { titles: ['A'] });
    expect(await store.get('links-v2')).toEqual({ titles: ['A'] });
    expect(await store.get('absent')).toBeUndefined();
  });

  it('reprend une clé de localStorage au premier accès, puis la supprime de là', async () => {
    const { factory, createIndexedDbStore } = await fresh();
    const legacy = legacyStorage({ 'wmt:links-v2': JSON.stringify({ titles: ['Ancien'] }), 'wmt:imageReplace': 'on' });
    const store = createIndexedDbStore(factory, legacy);
    expect(await store.get('links-v2')).toEqual({ titles: ['Ancien'] });
    expect(legacy.has('wmt:links-v2')).toBe(false);
    // Une autre session relit la même base : la valeur est restée.
    expect(await createIndexedDbStore(factory, legacy).get('links-v2')).toEqual({ titles: ['Ancien'] });
    // Un réglage lu directement dans localStorage n'est jamais touché.
    expect(legacy.has('wmt:imageReplace')).toBe(true);
  });

  it('une valeur déjà écrite dans IndexedDB l’emporte sur l’ancienne copie', async () => {
    const { factory, createIndexedDbStore } = await fresh();
    const legacy = legacyStorage({ 'wmt:market': JSON.stringify({ v: 'ancien' }) });
    const store = createIndexedDbStore(factory, legacy);
    await store.set('market', { v: 'neuf' });
    expect(await store.get('market')).toEqual({ v: 'neuf' });
    expect(legacy.has('wmt:market')).toBe(false);
  });

  it('retombe sur localStorage quand IndexedDB est absente', async () => {
    const { createIndexedDbStore } = await fresh();
    const legacy = legacyStorage();
    const store = createIndexedDbStore(undefined, legacy);
    await store.set('k', 1);
    expect(legacy.getItem('wmt:k')).toBe('1');
    expect(await store.get('k')).toBe(1);
  });
});
