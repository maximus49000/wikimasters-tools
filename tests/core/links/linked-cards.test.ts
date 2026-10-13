import { describe, expect, it } from 'vitest';
import type { KnownCard } from '../../../src/core/collection/collection-book';
import { CONCEPTS, EMPTY_LINKS, setLinks, type FetchedLinks } from '../../../src/core/links/links-book';
import { formatViews, linkedCards, linkedCardsViaArticle } from '../../../src/core/links/linked-cards';

const card = (slug: string, pageviews?: number): KnownCard => ({ slug, title: slug.replace(/_/g, ' '), ...(pageviews !== undefined ? { pageviews } : {}) });

describe('linkedCards', () => {
  const cards = [card('Paris', 5), card('Tour_Eiffel', 900), card('Seine', 300), card('Louvre', 300), card('Londres'), card('Inconnue', 9999)];

  it('rend les cartes que la carte cite et celles qui la citent, sans les articles hors Collection ni la carte elle-même', () => {
    const links = setLinks(EMPTY_LINKS, { Paris: ['Tour_Eiffel', 'France', 'Paris'], Seine: ['Paris'], Londres: ['Tamise'] }, 1);
    expect(linkedCards(cards, links, 'Paris').map((c) => c.slug)).toEqual(['Seine', 'Tour_Eiffel']);
  });

  it('trie par consultations décroissantes, les cartes sans chiffre en dernier, à égalité par titre', () => {
    const links = setLinks(EMPTY_LINKS, { Paris: ['Londres', 'Louvre', 'Seine', 'Tour_Eiffel'] }, 1);
    expect(linkedCards(cards, links, 'Paris').map((c) => c.slug)).toEqual(['Tour_Eiffel', 'Louvre', 'Seine', 'Londres']);
  });

  it('ne compte une carte qu’une fois quand les deux se citent', () => {
    const links = setLinks(EMPTY_LINKS, { Paris: ['Seine'], Seine: ['Paris'] }, 1);
    expect(linkedCards(cards, links, 'Paris').map((c) => c.slug)).toEqual(['Seine']);
  });

  it('écarte les cartes passe-partout, citées par une grande part de la Collection, sauf si les deux articles se citent', () => {
    // 40 albums citent tous « France » et « Musique » ; seul « Scandale » cite « Thiefaine », qui le cite en retour ; « Musique » cite « Scandale ».
    const albums = Array.from({ length: 40 }, (_, i) => `Album_${i}`);
    const all = [card('Scandale', 10), card('Thiefaine', 50), card('France', 99_999), card('Musique', 88_888), ...albums.map((slug) => card(slug))];
    const links = setLinks(
      EMPTY_LINKS,
      { Scandale: ['France', 'Musique', 'Thiefaine'], Thiefaine: ['Scandale'], Musique: ['Scandale'], ...Object.fromEntries(albums.map((slug) => [slug, ['France', 'Musique']])) },
      1,
    );
    expect(linkedCards(all, links, 'Scandale').map((c) => c.slug)).toEqual(['Thiefaine', 'Musique']);
  });

  it('range les cartes les moins citées ailleurs avant les plus consultées', () => {
    const all = [card('A'), card('Rare', 1), card('Courante', 1_000_000), card('X'), card('Y'), card('Z')];
    const links = setLinks(EMPTY_LINKS, { A: ['Courante', 'Rare'], X: ['Courante'], Y: ['Courante'], Z: ['Courante'] }, 1);
    expect(linkedCards(all, links, 'A').map((c) => c.slug)).toEqual(['Rare', 'Courante']);
  });

  it('place d’abord les cartes qui se citent l’une l’autre', () => {
    const all = [card('A'), card('Seule', 1), card('Mutuelle', 1)];
    const links = setLinks(EMPTY_LINKS, { A: ['Seule', 'Mutuelle'], Mutuelle: ['A'], Seule: [] }, 1);
    expect(linkedCards(all, links, 'A').map((c) => c.slug)).toEqual(['Mutuelle', 'Seule']);
  });

  it('écarte toujours les articles trop vagues : notion générale, date, pays, même liés dans les deux sens', () => {
    const all = [card('Mourinho'), card('Football', 9), card('2000_en_football', 9), card('Portugal', 9), card('FC_Porto', 1)];
    const fetched: FetchedLinks = { Mourinho: ['Football', '2000_en_football', 'Portugal', 'FC_Porto'], Portugal: ['Mourinho'], FC_Porto: ['Mourinho'] };
    fetched[CONCEPTS] = ['Football'];
    expect(linkedCards(all, setLinks(EMPTY_LINKS, fetched, 1), 'Mourinho').map((c) => c.slug)).toEqual(['FC_Porto']);
  });

  it('rend une liste vide quand rien n’est lu ou que la carte est inconnue', () => {
    expect(linkedCards(cards, EMPTY_LINKS, 'Paris')).toEqual([]);
    expect(linkedCards(cards, setLinks(EMPTY_LINKS, { Seine: ['Paris'] }, 1), 'Absente')).toEqual([]);
  });
});

describe('linkedCardsViaArticle', () => {
  const cards = [card('Paris', 5), card('Louvre', 300), card('Seine', 900), card('Londres', 50), card('Tamise', 40)];
  const via = (links: ReturnType<typeof setLinks>) => linkedCardsViaArticle(cards, links, 'Paris').map((v) => [v.card.slug, v.via]);

  it('relie par un article hors Collection que les deux cartes citent', () => {
    const links = setLinks(EMPTY_LINKS, { Paris: ['Gothique'], Louvre: ['Gothique', 'Musee'], Londres: ['Angleterre'] }, 1);
    expect(via(links)).toEqual([['Louvre', ['Gothique']]]);
  });

  it('relie par une carte lue : elle cite la cible, ou la cible la cite', () => {
    const links = setLinks(EMPTY_LINKS, { Paris: ['Seine'], Seine: ['Louvre'], Londres: ['Seine'] }, 1);
    expect(via(links)).toEqual([['Louvre', ['Seine']], ['Londres', ['Seine']]]);
  });

  it('ne reprend pas les cartes déjà liées directement, ni la carte elle-même', () => {
    const links = setLinks(EMPTY_LINKS, { Paris: ['Seine', 'Louvre'], Seine: ['Louvre', 'Paris'] }, 1);
    expect(via(links)).toEqual([]);
  });

  it('range d’abord les cartes qui passent par le plus d’articles, avec leurs intermédiaires', () => {
    const links = setLinks(EMPTY_LINKS, { Paris: ['Gothique', 'Fleuve'], Louvre: ['Gothique'], Londres: ['Gothique', 'Fleuve'] }, 1);
    expect(via(links)).toEqual([['Londres', ['Fleuve', 'Gothique']], ['Louvre', ['Gothique']]]);
  });

  it('ne passe jamais par un article passe-partout', () => {
    const fillers = Array.from({ length: 40 }, (_, i) => `Carte_${i}`);
    const all = [...cards, ...fillers.map((slug) => card(slug))];
    const links = setLinks(
      EMPTY_LINKS,
      { Paris: ['Gothique', 'Fleuve'], Louvre: ['Gothique'], Londres: ['Fleuve'], ...Object.fromEntries(fillers.map((slug) => [slug, ['Gothique']])) },
      1,
    );
    expect(linkedCardsViaArticle(all, links, 'Paris').map((v) => [v.card.slug, v.via])).toEqual([['Londres', ['Fleuve']]]);
  });

  it('ne passe jamais par une date, un pays ou une notion générale, même cartes non possédées', () => {
    const fetched: FetchedLinks = {
      Paris: ['2000_en_football', '2004_en_football', 'France', 'Entraîneur', 'Seine_(fleuve)'],
      Louvre: ['2000_en_football', '2004_en_football', 'France', 'Entraîneur'],
      Londres: ['Seine_(fleuve)'],
    };
    fetched[CONCEPTS] = ['Entraîneur'];
    expect(via(setLinks(EMPTY_LINKS, fetched, 1))).toEqual([['Londres', ['Seine (fleuve)']]]);
  });

  it('garde une grande ville comme carte liée, jamais comme intermédiaire', () => {
    const all = [card('Paris'), card('Tour_Eiffel'), card('Louvre')];
    const links = setLinks(EMPTY_LINKS, { Tour_Eiffel: ['Paris'], Louvre: ['Paris'] }, 1);
    expect(linkedCards(all, links, 'Tour_Eiffel').map((c) => c.slug)).toEqual(['Paris']);
    expect(linkedCardsViaArticle(all, links, 'Tour_Eiffel')).toEqual([]);
  });

  it('classe par le meilleur intermédiaire, pas par leur nombre, et le montre en premier', () => {
    const fillers = Array.from({ length: 6 }, (_, i) => `Carte_${i}`);
    // « Courant » est cité par 8 cartes, « Rare » par 2 : Londres (un lien rare) passe devant Louvre (deux liens courants).
    const links = setLinks(
      EMPTY_LINKS,
      { Paris: ['Courant', 'Banal', 'Rare'], Louvre: ['Courant', 'Banal'], Londres: ['Rare', 'Courant'], ...Object.fromEntries(fillers.map((slug) => [slug, ['Courant', 'Banal']])) },
      1,
    );
    expect(via(links)).toEqual([
      ['Londres', ['Rare', 'Courant']],
      ['Louvre', ['Banal', 'Courant']],
    ]);
  });

  it('rend une liste vide sans lien lu ou pour une carte inconnue', () => {
    expect(via(EMPTY_LINKS)).toEqual([]);
    expect(linkedCardsViaArticle(cards, setLinks(EMPTY_LINKS, { Louvre: ['Gothique'] }, 1), 'Absente')).toEqual([]);
  });
});

describe('formatViews', () => {
  it('abrège les milliers et les millions, et ne dit rien d’un chiffre inconnu', () => {
    expect(formatViews(undefined)).toBe('');
    expect(formatViews(842)).toBe('842');
    expect(formatViews(412_400)).toBe('412 k');
    expect(formatViews(1_250_000)).toBe('1,3 M');
    expect(formatViews(2_000_000)).toBe('2 M');
  });
});
