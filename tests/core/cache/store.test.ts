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
