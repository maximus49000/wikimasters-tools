import { describe, expect, it } from 'vitest';
import type { KnownCard } from '../../../src/core/collection/collection-book';
import { EMPTY_LINKS, setLinks } from '../../../src/core/links/links-book';
import { buildWeb, cardId, hubId, neighborhood } from '../../../src/core/links/web-graph';

const card = (slug: string): KnownCard => ({ slug, title: slug.replace(/_/g, ' ') });
const cards = ['Kamini', 'ChansonB', 'Daft_Punk', 'Isolee'].map(card);
const state = setLinks(
  EMPTY_LINKS,
  {
    Kamini: ['Pop', 'Paris', 'France'],
    ChansonB: ['Pop', 'France', 'Daft_Punk'],
    Daft_Punk: ['France', 'Musique_électronique'],
    Isolee: ['Solo'],
  },
  1,
);

describe('buildWeb', () => {
  it('ne garde que les articles cités par au moins deux cartes', () => {
    const web = buildWeb(cards, state, null);
    expect(web.hubs.map((hub) => [hub.slug, hub.cards])).toEqual([
      ['France', ['Kamini', 'ChansonB', 'Daft_Punk']],
      ['Pop', ['Kamini', 'ChansonB']],
    ]);
    expect(web.hubs[0]?.title).toBe('France');
  });

  it('relie deux cartes quand l’une cite l’autre, une seule fois', () => {
    const both = setLinks(state, { Daft_Punk: ['France', 'ChansonB'] }, 2);
    expect(buildWeb(cards, both, null).cardLinks).toEqual([['ChansonB', 'Daft_Punk']]);
  });

  it('ne dessine que les cartes qui ont au moins un trait', () => {
    expect(buildWeb(cards, state, null).cards.map((c) => c.slug)).toEqual(['Kamini', 'ChansonB', 'Daft_Punk']);
  });

  it('ne compte que les cartes visibles : un point qui ne relie plus deux cartes disparaît', () => {
    const web = buildWeb(cards, state, new Set(['Kamini', 'Daft_Punk', 'Isolee']));
    expect(web.hubs.map((hub) => hub.slug)).toEqual(['France']);
    expect(web.cards.map((c) => c.slug)).toEqual(['Kamini', 'Daft_Punk']);
  });

  it('ignore une carte filtrée : ce n’est ni une carte ni un point', () => {
    const web = buildWeb(cards, state, new Set(['Kamini', 'ChansonB']));
    expect(web.cardLinks).toEqual([]);
    expect(web.hubs.map((hub) => hub.slug)).toEqual(['France', 'Pop']);
    expect(web.hubs.flatMap((hub) => hub.cards)).not.toContain('Daft_Punk');
  });

  it('limite le nombre de points affichés aux plus partagés et compte les autres', () => {
    const web = buildWeb(cards, state, null, { minShared: 2, maxHubs: 1 });
    expect(web.hubs.map((hub) => hub.slug)).toEqual(['France']);
    expect(web.hiddenHubs).toBe(1);
    expect(web.cards.map((c) => c.slug)).toEqual(['Kamini', 'ChansonB', 'Daft_Punk']);
  });

  it('rend un graphe vide sans lien connu', () => {
    expect(buildWeb(cards, EMPTY_LINKS, null)).toEqual({ cards: [], hubs: [], cardLinks: [], hiddenHubs: 0 });
  });
});

describe('neighborhood', () => {
  const web = buildWeb(cards, setLinks(state, { Daft_Punk: ['France', 'ChansonB'] }, 2), null);

  it('met en avant un point et ses cartes', () => {
    const { focusId, lit } = neighborhood(web, { kind: 'hub', slug: 'Pop' });
    expect(focusId).toBe(hubId('Pop'));
    expect([...lit].sort()).toEqual([cardId('ChansonB'), cardId('Kamini'), hubId('Pop')].sort());
  });

  it('met en avant une carte, ses points et les cartes qu’elle relie directement', () => {
    const { focusId, lit } = neighborhood(web, { kind: 'card', slug: 'ChansonB' });
    expect(focusId).toBe(cardId('ChansonB'));
    expect([...lit].sort()).toEqual([cardId('ChansonB'), cardId('Daft_Punk'), hubId('France'), hubId('Pop')].sort());
  });
});
