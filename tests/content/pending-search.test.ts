import { describe, expect, it } from 'vitest';
import {
  setPendingSearch,
  takePendingSearch,
  type PendingStorage,
} from '../../src/content/pending-search';

function memory(): PendingStorage {
  const data = new Map<string, string>();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  };
}

describe('pending search', () => {
  it('restitue la recherche enregistrée une seule fois', () => {
    const storage = memory();
    setPendingSearch(storage, 'Ted_Lasso', 1_000);
    expect(takePendingSearch(storage, 2_000)).toBe('Ted_Lasso');
    expect(takePendingSearch(storage, 2_000)).toBeNull();
  });

  it('expire au bout d’une minute', () => {
    const storage = memory();
    setPendingSearch(storage, 'Ted_Lasso', 1_000);
    expect(takePendingSearch(storage, 1_000 + 61_000)).toBeNull();
  });

  it('ignore un contenu illisible', () => {
    const storage = memory();
    storage.setItem('wmt:pendingSearch', '{pas du json');
    expect(takePendingSearch(storage, 1_000)).toBeNull();
  });

  it('ne casse pas si le stockage est indisponible', () => {
    const broken: PendingStorage = {
      getItem: () => {
        throw new Error('bloqué');
      },
      setItem: () => {
        throw new Error('bloqué');
      },
      removeItem: () => {
        throw new Error('bloqué');
      },
    };
    expect(() => setPendingSearch(broken, 'x', 1)).not.toThrow();
    expect(takePendingSearch(broken, 1)).toBeNull();
  });
});
