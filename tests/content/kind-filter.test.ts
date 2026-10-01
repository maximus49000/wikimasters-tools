import { describe, expect, it, vi } from 'vitest';
import { createKindFilterSource } from '../../src/content/kind-filter';
import { NO_KIND_FILTER } from '../../src/core/kinds/kinds-filter';

function memoryStorage() {
  const data = new Map<string, string>();
  return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => void data.set(key, value) };
}

describe('createKindFilterSource', () => {
  it('démarre sans filtre', () => {
    expect(createKindFilterSource(memoryStorage()).current()).toEqual(NO_KIND_FILTER);
  });

  it('mémorise le filtre et le relit à la création suivante', () => {
    const storage = memoryStorage();
    createKindFilterSource(storage).set({ nature: 'group:Album', facet: 'Q11399' });
    expect(createKindFilterSource(storage).current()).toEqual({ nature: 'group:Album', facet: 'Q11399' });
  });

  it('prévient les abonnés seulement quand la valeur change', () => {
    const source = createKindFilterSource(memoryStorage());
    const listener = vi.fn();
    const off = source.subscribe(listener);
    source.set({ nature: 'group:Film', facet: '' });
    source.set({ nature: 'group:Film', facet: '' });
    expect(listener).toHaveBeenCalledTimes(1);
    off();
    source.set(NO_KIND_FILTER);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('ignore une valeur mémorisée illisible', () => {
    const storage = memoryStorage();
    storage.setItem('wmt:kindFilter', '{"nature": 3}');
    expect(createKindFilterSource(storage).current()).toEqual(NO_KIND_FILTER);
    storage.setItem('wmt:kindFilter', 'pas du json');
    expect(createKindFilterSource(storage).current()).toEqual(NO_KIND_FILTER);
  });

  it('absorbe les erreurs de stockage', () => {
    const broken = {
      getItem: () => {
        throw new Error('bloqué');
      },
      setItem: () => {
        throw new Error('bloqué');
      },
    };
    const source = createKindFilterSource(broken);
    expect(source.current()).toEqual(NO_KIND_FILTER);
    expect(() => source.set({ nature: 'x', facet: '' })).not.toThrow();
    expect(source.current()).toEqual({ nature: 'x', facet: '' });
  });
});

describe('catégorie mémorisée', () => {
  it('se garde et se relit, une valeur inconnue étant ignorée', () => {
    const storage = memoryStorage();
    createKindFilterSource(storage).set({ nature: '', facet: '', category: 'film' });
    expect(createKindFilterSource(storage).current()).toEqual({ nature: '', facet: '', category: 'film' });
    storage.setItem('wmt:kindFilter', JSON.stringify({ nature: '', facet: '', category: 'bidon' }));
    expect(createKindFilterSource(storage).current()).toEqual({ nature: '', facet: '' });
  });
});
