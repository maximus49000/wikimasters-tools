import { describe, expect, it } from 'vitest';
import { setLinks, EMPTY_LINKS } from '../../../src/core/links/links-book';
import { buildWeb, cardId, hubId, webEdges } from '../../../src/core/links/web-graph';
import { withPath } from '../../../src/core/links/web-path-graph';

const card = (slug: string) => ({ slug, title: slug });
const cards = ['A', 'B', 'C'].map(card);

describe('withPath', () => {
  it('ajoute les articles du chemin, reliés entre eux et aux cartes', () => {
    const links = setLinks(EMPTY_LINKS, { A: ['X'], C: ['Y'], Y: ['B'] }, 0);
    const web = withPath(buildWeb(cards, links, null), cards, links, ['A', 'X', 'Y', 'B']);
    expect(web.cards.map((c) => c.slug).sort()).toEqual(['A', 'B', 'C']);
    expect(web.hubs.map((h) => h.slug).sort()).toEqual(['X', 'Y']);
    expect(web.hubLinks).toEqual([['X', 'Y']]);
    // C cite Y, Y cite B : liaisons nouvelles avec des cartes déjà là.
    expect(web.hubs.find((h) => h.slug === 'Y')?.cards.sort()).toEqual(['B', 'C']);
    expect(web.path?.added).toEqual(new Set([hubId('X'), hubId('Y')]));
    expect(web.path?.ids).toEqual(new Set([cardId('A'), hubId('X'), hubId('Y'), cardId('B')]));
    expect(webEdges(web)).toContainEqual([hubId('X'), hubId('Y')]);
  });

  it('relie directement deux cartes qui se suivent', () => {
    const web = withPath(buildWeb(cards, EMPTY_LINKS, null), cards, EMPTY_LINKS, ['A', 'B']);
    expect(web.cardLinks).toEqual([['A', 'B']]);
    expect(web.hubs).toEqual([]);
  });

  it('ne change rien sans chemin', () => {
    const web = buildWeb(cards, EMPTY_LINKS, null);
    expect(withPath(web, cards, EMPTY_LINKS, [])).toBe(web);
  });
});
