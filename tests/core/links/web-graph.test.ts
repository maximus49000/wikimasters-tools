import { describe, expect, it } from 'vitest';
import type { KnownCard } from '../../../src/core/collection/collection-book';
import { EMPTY_LINKS, setLinks } from '../../../src/core/links/links-book';
import { GENERIC_MIN, buildWeb, cardId, hubId, hubRadius, neighborhood, webEdges, webNodes } from '../../../src/core/links/web-graph';

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

describe('buildWeb, points génériques et pages ignorées', () => {
  // 40 cartes : « Global » est cité par toutes, trois thèmes (T1 à T3) par trois cartes chacun.
  const many: KnownCard[] = Array.from({ length: GENERIC_MIN + 10 }, (_, i) => ({ slug: `C${i}`, title: `Carte ${i}` }));
  const links = Object.fromEntries(
    many.map((card, i) => [card.slug, ['Global', ...(i < 9 ? [`T${Math.floor(i / 3) + 1}`] : [])]]),
  );
  const crowded = setLinks(EMPTY_LINKS, links, 1);

  it('relègue un point cité par presque toute la Collection derrière les autres', () => {
    const web = buildWeb(many, crowded, null);
    expect(web.hubs.map((hub) => hub.slug)).toEqual(['T1', 'T2', 'T3', 'Global']);
  });

  it('ne l’affiche que s’il reste de la place sous la limite', () => {
    const web = buildWeb(many, crowded, null, { minShared: 2, maxHubs: 3 });
    expect(web.hubs.map((hub) => hub.slug)).toEqual(['T1', 'T2', 'T3']);
    expect(web.hiddenHubs).toBe(1);
  });

  it('garde un grand point dans une petite Collection : rien n’y encombre', () => {
    const few = many.slice(0, 12);
    const web = buildWeb(few, setLinks(EMPTY_LINKS, Object.fromEntries(few.map((card) => [card.slug, ['Global']])), 1), null);
    expect(web.hubs.map((hub) => hub.slug)).toEqual(['Global']);
  });

  it('ignore les pages qui ne disent rien du sujet (identifiants, bibliothèques, archives)', () => {
    const noisy = setLinks(
      EMPTY_LINKS,
      {
        Kamini: ['International_Standard_Book_Number', 'Internet_Archive', 'API_a', 'Pop'],
        ChansonB: ['International_Standard_Book_Number', 'Internet_Archive', 'API_a', 'Pop'],
      },
      1,
    );
    expect(buildWeb(['Kamini', 'ChansonB'].map(card), noisy, null).hubs.map((hub) => hub.slug)).toEqual(['Pop']);
  });
});

describe('webNodes / webEdges', () => {
  const web = buildWeb(cards, setLinks(state, { Daft_Punk: ['France', 'ChansonB'] }, 2), null);

  it('donne un nœud par carte et par point, les points d’autant plus gros qu’ils relient de cartes', () => {
    const nodes = webNodes(web);
    expect(nodes.map((node) => node.id).sort()).toEqual(
      [cardId('Kamini'), cardId('ChansonB'), cardId('Daft_Punk'), hubId('France'), hubId('Pop')].sort(),
    );
    const radius = (id: string) => nodes.find((node) => node.id === id)?.radius ?? 0;
    expect(radius(hubId('France'))).toBeGreaterThan(radius(hubId('Pop')));
    expect(radius(cardId('Kamini'))).toBeGreaterThan(radius(hubId('Pop')));
  });

  it('donne une arête par trait : carte à point, et carte à carte', () => {
    const edges = webEdges(web).map((edge) => [...edge].sort().join(' – ')).sort();
    expect(edges).toEqual(
      [
        [hubId('France'), cardId('Kamini')],
        [hubId('France'), cardId('ChansonB')],
        [hubId('France'), cardId('Daft_Punk')],
        [hubId('Pop'), cardId('Kamini')],
        [hubId('Pop'), cardId('ChansonB')],
        [cardId('ChansonB'), cardId('Daft_Punk')],
      ]
        .map((edge) => [...edge].sort().join(' – '))
        .sort(),
    );
  });

  it('borne la taille d’un point', () => {
    expect(hubRadius(1)).toBeCloseTo(6);
    expect(hubRadius(10_000)).toBe(14);
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
