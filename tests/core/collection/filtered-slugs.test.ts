import { describe, expect, it, vi } from 'vitest';
import { loadFilteredSlugs } from '../../../src/core/collection/filtered-slugs';

const page = (...slugs: string[]) => ({
  cards: slugs.map((slug) => ({ slug, title: slug })),
  entries: slugs.length,
  skipped: 0,
});

describe('loadFilteredSlugs', () => {
  it('lit toutes les pages avec le filtre jusqu’à la page vide', async () => {
    const getCollectionPage = vi.fn(async (index: number) =>
      index === 0 ? page('a', 'b') : index === 1 ? page('c') : page(),
    );
    const slugs = await loadFilteredSlugs({ getCollectionPage }, 'rarity=UR');
    expect([...slugs]).toEqual(['a', 'b', 'c']);
    expect(getCollectionPage).toHaveBeenCalledWith(0, 'rarity=UR');
  });

  it('s’arrête quand la lecture est annulée', async () => {
    const getCollectionPage = vi.fn(async () => page('a'));
    await loadFilteredSlugs({ getCollectionPage }, 'x=1', () => true);
    expect(getCollectionPage).not.toHaveBeenCalled();
  });
});
