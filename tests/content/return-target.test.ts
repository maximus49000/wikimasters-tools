import { describe, expect, it } from 'vitest';
import type { PendingStorage } from '../../src/content/pending-search';
import {
  clearReturnTarget,
  getReturnTarget,
  setPendingReopen,
  setReturnTarget,
  takePendingReopen,
} from '../../src/content/return-target';

function memory(): PendingStorage {
  const data = new Map<string, string>();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  };
}

const HOUR = 3_600_000;

describe('return target', () => {
  it('se relit plusieurs fois jusqu’à ce qu’on l’efface', () => {
    const storage = memory();
    setReturnTarget(storage, { slug: 'Ted_Lasso', path: '/collection' }, 1_000);
    expect(getReturnTarget(storage, 2_000)).toEqual({ slug: 'Ted_Lasso', path: '/collection' });
    expect(getReturnTarget(storage, 3_000)).toEqual({ slug: 'Ted_Lasso', path: '/collection' });
    clearReturnTarget(storage);
    expect(getReturnTarget(storage, 3_000)).toBeNull();
  });

  it('expire au bout d’une heure', () => {
    const storage = memory();
    setReturnTarget(storage, { slug: 'Ted_Lasso', path: '/collection' }, 1_000);
    expect(getReturnTarget(storage, 1_000 + HOUR + 1)).toBeNull();
  });

  it('refuse un chemin qui ne reste pas sur le site', () => {
    const storage = memory();
    setReturnTarget(storage, { slug: 'x', path: 'https://autre-site.example/' }, 1_000);
    expect(getReturnTarget(storage, 1_000)).toBeNull();
    setReturnTarget(storage, { slug: 'x', path: '//autre-site.example/' }, 1_000);
    expect(getReturnTarget(storage, 1_000)).toBeNull();
  });

  it('ignore un contenu illisible et un stockage indisponible', () => {
    const storage = memory();
    storage.setItem('wmt:returnTarget', 'pas du json');
    expect(getReturnTarget(storage, 1_000)).toBeNull();

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
    expect(() => setReturnTarget(broken, { slug: 'x', path: '/a' }, 1)).not.toThrow();
    expect(getReturnTarget(broken, 1)).toBeNull();
    expect(() => clearReturnTarget(broken)).not.toThrow();
  });
});

describe('pending reopen', () => {
  it('restitue la carte à rouvrir une seule fois, pendant une minute', () => {
    const storage = memory();
    setPendingReopen(storage, 'Ted_Lasso', 1_000);
    expect(takePendingReopen(storage, 2_000)).toBe('Ted_Lasso');
    expect(takePendingReopen(storage, 2_000)).toBeNull();

    setPendingReopen(storage, 'Ted_Lasso', 1_000);
    expect(takePendingReopen(storage, 1_000 + 61_000)).toBeNull();
  });
});
