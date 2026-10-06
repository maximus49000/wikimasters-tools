import { describe, expect, it, vi } from 'vitest';
import type { KnownCard } from '../../src/core/collection/collection-book';
import { EMPTY_LINKS, setLinks, type LinksState } from '../../src/core/links/links-book';
import { createLinkedSource } from '../../src/content/linked-source';

const card = (slug: string, pageviews: number): KnownCard => ({ slug, title: slug, pageviews });

function setup(cards: KnownCard[], state: LinksState) {
  const resolveMissing = vi.fn(() => Promise.resolve());
  const source = createLinkedSource({
    collection: { list: () => Promise.resolve(cards), subscribe: () => () => undefined },
    links: { load: () => Promise.resolve(state), subscribe: () => () => undefined, resolveMissing },
    now: () => 10,
  });
  return { source, resolveMissing };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('createLinkedSource', () => {
  it('rend les cartes liées triées une fois la Collection et les liens lus, et prévient les abonnés', async () => {
    const { source } = setup([card('A', 1), card('B', 50), card('C', 20)], setLinks(EMPTY_LINKS, { A: ['B', 'C'] }, 1));
    const seen = vi.fn();
    source.subscribe(seen);
    expect(source.linked('A')).toEqual([]);
    await flush();
    expect(seen).toHaveBeenCalled();
    expect(source.linked('A').map((c) => c.slug)).toEqual(['B', 'C']);
  });

  it('rend le même tableau tant que rien ne change', async () => {
    const { source } = setup([card('A', 1), card('B', 2)], setLinks(EMPTY_LINKS, { A: ['B'] }, 1));
    source.subscribe(() => undefined);
    await flush();
    expect(source.linked('A')).toBe(source.linked('A'));
  });

  it('demande la lecture des liens manquants, la carte d’abord, sans relire ce qui l’est déjà', async () => {
    const { source, resolveMissing } = setup([card('A', 1), card('B', 2), card('C', 3)], setLinks(EMPTY_LINKS, { B: ['A'] }, 5));
    source.subscribe(() => undefined);
    await flush();
    source.ensure('C');
    expect(resolveMissing).toHaveBeenCalledWith(['C', 'A']);
  });
});
