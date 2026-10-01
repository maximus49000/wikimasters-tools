import { describe, expect, it, vi } from 'vitest';
import { openCollectionCard } from '../../src/content/open-card';
import type { PendingStorage } from '../../src/content/pending-search';
import { takePendingReopen } from '../../src/content/return-target';

function memory(): PendingStorage {
  const data = new Map<string, string>();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  };
}

function setup(pathname: string) {
  const storage = memory();
  const reopen = vi.fn();
  const assign = vi.fn();
  const open = (slug: string) => openCollectionCard(slug, { pathname, storage, now: () => 1_000, reopen, assign });
  return { storage, reopen, assign, open };
}

describe('openCollectionCard', () => {
  it('sur la Collection, rouvre la fiche sur place sans changer de page', () => {
    const { open, reopen, assign, storage } = setup('/collection');
    open('Queen_(band)');
    expect(reopen).toHaveBeenCalledWith('Queen_(band)');
    expect(assign).not.toHaveBeenCalled();
    expect(takePendingReopen(storage, 2_000)).toBeNull();
  });

  it('ailleurs, laisse la carte à rouvrir puis ouvre la Collection', () => {
    const { open, reopen, assign, storage } = setup('/marketplace');
    open('Queen_(band)');
    expect(assign).toHaveBeenCalledWith('/collection');
    expect(reopen).not.toHaveBeenCalled();
    expect(takePendingReopen(storage, 2_000)).toBe('Queen_(band)');
  });

  it('une sous-page de la Collection compte comme la Collection', () => {
    const { open, reopen, assign } = setup('/collection/page/2');
    open('Queen_(band)');
    expect(reopen).toHaveBeenCalledWith('Queen_(band)');
    expect(assign).not.toHaveBeenCalled();
  });
});
