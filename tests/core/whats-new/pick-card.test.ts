import { describe, expect, it, vi } from 'vitest';
import type { KnownCard } from '../../../src/core/collection/collection-book';
import { PICK_LIMIT, pickCard } from '../../../src/core/whats-new/pick-card';

const card = (slug: string): KnownCard => ({ slug, title: slug });

describe('pickCard', () => {
  it('« any » prend la première carte', async () => {
    const slugsOf = vi.fn();
    expect((await pickCard('any', [card('a'), card('b')], slugsOf))?.slug).toBe('a');
    expect(slugsOf).not.toHaveBeenCalled();
  });

  it('prend la première carte, dans l’ordre de la liste, dont la nature convient', async () => {
    const found = await pickCard('game', [card('a'), card('b'), card('c')], async () => new Set(['c', 'b']));
    expect(found?.slug).toBe('b');
  });

  it('rend null quand aucune carte ne convient ou que la liste est vide', async () => {
    expect(await pickCard('game', [card('a')], async () => new Set())).toBeNull();
    expect(await pickCard('game', [], async () => new Set(['a']))).toBeNull();
    expect(await pickCard('any', [], async () => new Set())).toBeNull();
  });

  it('ne propose que les premières cartes (plafond)', async () => {
    const cards = Array.from({ length: PICK_LIMIT + 50 }, (_, i) => card(`c${i}`));
    const slugsOf = vi.fn(async (_kind: string, _cards: KnownCard[]) => new Set<string>());
    await pickCard('music', cards, slugsOf);
    expect(slugsOf.mock.calls[0]![1]).toHaveLength(PICK_LIMIT);
  });
});
