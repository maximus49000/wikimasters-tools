import { describe, expect, it } from 'vitest';
import type { KnownCard } from '../../../src/core/collection/collection-book';
import { PERSON_NATURE, setKinds, EMPTY_KINDS } from '../../../src/core/kinds/kinds-book';
import {
  NO_KIND_FILTER,
  applyKindFilter,
  buildKindOptions,
  intersectSlugs,
  isKindFilterActive,
  kindSlugs,
  selectCategory,
  selectNature,
} from '../../../src/core/kinds/kinds-filter';

const card = (slug: string): KnownCard => ({ slug, title: slug });
const cards = ['Piaf', 'OmarSy', 'Hugo', 'Thriller', 'AbbeyRoad', 'Nouvelle'].map(card);
const k = (natures: string[], occupations: string[] = [], genres: string[] = []) => ({ natures, occupations, genres });

const state = setKinds(
  EMPTY_KINDS,
  {
    Piaf: k(['Q5'], ['chanteur']),
    OmarSy: k(['Q5'], ['acteur', 'humoriste']),
    Hugo: k(['Q5'], ['ecrivain', 'chanteur']),
    Thriller: k(['Q482994'], [], ['pop']),
    AbbeyRoad: k(['Q208569'], [], ['rock', 'pop']),
  },
  { chanteur: 'chanteur', acteur: 'acteur', humoriste: 'humoriste', ecrivain: 'écrivain', pop: 'pop', rock: 'rock' },
);

const ids = (options: { id: string }[]) => options.map((o) => o.id);

describe('buildKindOptions', () => {
  it('sans filtre : natures avec nombre, y compris « inconnue » pour les cartes pas encore classées', () => {
    const { natures } = buildKindOptions(cards, state, NO_KIND_FILTER);
    expect(natures.map((o) => [o.id, o.count])).toEqual([
      [PERSON_NATURE, 3],
      ['group:Album', 2],
      ['unknown', 1],
    ]);
  });

  it('nature personne : seulement les occupations des personnes, comptées par carte', () => {
    const { facets, facetPlaceholder } = buildKindOptions(cards, state, { nature: PERSON_NATURE, facet: '' });
    expect(facets.map((o) => [o.id, o.count])).toEqual([['chanteur', 2], ['acteur', 1], ['ecrivain', 1], ['humoriste', 1]]);
    expect(facetPlaceholder).toBe('Occupation');
  });

  it('nature album : seulement des genres, jamais les occupations des personnes', () => {
    const { facets, facetPlaceholder } = buildKindOptions(cards, state, { nature: 'group:Album', facet: '' });
    expect(ids(facets)).toEqual(['pop', 'rock']);
    expect(facets.find((o) => o.id === 'pop')?.count).toBe(2);
    expect(facetPlaceholder).toBe('Genre');
  });

  it('sans nature : occupations et genres ensemble', () => {
    const { facets, facetPlaceholder } = buildKindOptions(cards, state, NO_KIND_FILTER);
    expect(ids(facets).sort()).toEqual(['acteur', 'chanteur', 'ecrivain', 'humoriste', 'pop', 'rock']);
    expect(facetPlaceholder).toBe('Occupation / genre');
  });

  it('nature sans aucune valeur : pas de choix', () => {
    const { facets, facetPlaceholder } = buildKindOptions(cards, state, { nature: 'unknown', facet: '' });
    expect(facets).toEqual([]);
    expect(facetPlaceholder).toBe('Aucun choix');
  });

  it('garde une valeur choisie même si plus aucune carte ne la porte (count 0)', () => {
    const { natures } = buildKindOptions([card('Piaf')], state, { nature: 'group:Album', facet: '' });
    expect(natures.find((o) => o.id === 'group:Album')?.count).toBe(0);
  });
});

describe('applyKindFilter', () => {
  it('rend les cartes telles quelles sans filtre', () => {
    expect(applyKindFilter(cards, state, NO_KIND_FILTER)).toBe(cards);
    expect(isKindFilterActive(NO_KIND_FILTER)).toBe(false);
  });

  it('filtre par nature, puis par occupation (au moins une valeur)', () => {
    expect(applyKindFilter(cards, state, { nature: PERSON_NATURE, facet: '' }).map((c) => c.slug)).toEqual(['Piaf', 'OmarSy', 'Hugo']);
    expect(applyKindFilter(cards, state, { nature: PERSON_NATURE, facet: 'chanteur' }).map((c) => c.slug)).toEqual(['Piaf', 'Hugo']);
  });

  it('filtre par genre sur les albums regroupés, sans nature', () => {
    expect(applyKindFilter(cards, state, { nature: '', facet: 'pop' }).map((c) => c.slug)).toEqual(['Thriller', 'AbbeyRoad']);
  });

  it('écarte les cartes pas encore classées dès qu\'un filtre est actif', () => {
    expect(applyKindFilter(cards, state, { nature: 'group:Album', facet: '' }).map((c) => c.slug)).not.toContain('Nouvelle');
  });
});

describe('kindSlugs / intersectSlugs', () => {
  it('kindSlugs vaut null sans filtre', () => {
    expect(kindSlugs(cards, state, NO_KIND_FILTER)).toBeNull();
    expect([...kindSlugs(cards, state, { nature: 'group:Album', facet: '' })!]).toEqual(['Thriller', 'AbbeyRoad']);
  });

  it('intersectSlugs : null = pas de contrainte', () => {
    const a = new Set(['x', 'y']);
    expect(intersectSlugs(null, null)).toBeNull();
    expect(intersectSlugs(a, null)).toBe(a);
    expect(intersectSlugs(null, a)).toBe(a);
    expect([...intersectSlugs(a, new Set(['y', 'z']))!]).toEqual(['y']);
  });
});

describe('selectNature', () => {
  it('garde la facette si elle existe encore pour la nouvelle nature', () => {
    expect(selectNature(cards, state, { nature: '', facet: 'pop' }, 'group:Album')).toEqual({ nature: 'group:Album', facet: 'pop' });
  });

  it('réinitialise la facette si elle n\'existe plus (occupation vers album)', () => {
    expect(selectNature(cards, state, { nature: PERSON_NATURE, facet: 'chanteur' }, 'group:Album')).toEqual({ nature: 'group:Album', facet: '' });
  });

  it('revenir à « toutes les natures » garde la facette', () => {
    expect(selectNature(cards, state, { nature: PERSON_NATURE, facet: 'chanteur' }, '')).toEqual({ nature: '', facet: 'chanteur' });
  });
});

describe('filtre des doubles', () => {
  const cards = [
    { slug: 'a', title: 'A', copies: 2 },
    { slug: 'b', title: 'B', copies: 1 },
    { slug: 'c', title: 'C' },
  ];
  const empty = { cards: {}, occupations: {}, genres: {} } as unknown as Parameters<typeof applyKindFilter>[1];

  it('ne garde que les cartes en 2 exemplaires ou plus', () => {
    expect(applyKindFilter(cards, empty, { nature: '', facet: '', duplicates: true }).map((c) => c.slug)).toEqual(['a']);
    expect(applyKindFilter(cards, empty, { nature: '', facet: '' })).toHaveLength(3);
  });
});

describe('catégories', () => {
  const mixed = ['Piaf', 'Thriller', 'Film', 'Serie', 'Jeu', 'Plateau', 'Roman', 'Nouvelle'].map(card);
  const kinds = setKinds(
    EMPTY_KINDS,
    {
      Piaf: k(['Q5'], ['Q177220']),
      Thriller: k(['Q482994'], [], ['pop']),
      Film: k(['Q11424'], [], ['drame']),
      Serie: k(['Q5398426'], [], ['comédie']),
      Jeu: k(['Q7889'], [], ['rpg']),
      Plateau: k(['Q131436']),
      Roman: k(['Q8261']),
    },
    {},
  );

  it('compte les cartes de chaque catégorie, les cartes pas classées allant dans « Autre »', () => {
    const { categories } = buildKindOptions(mixed, kinds, NO_KIND_FILTER);
    expect(categories.map((o) => [o.id, o.count])).toEqual([
      ['music', 2],
      ['film', 2],
      ['games', 2],
      ['books', 1],
      ['other', 1],
    ]);
  });

  it('limite les natures et les facettes à la catégorie choisie', () => {
    const { natures, facets } = buildKindOptions(mixed, kinds, { nature: '', facet: '', category: 'film' });
    expect(ids(natures).sort()).toEqual(['group:Film', 'group:Série télévisée']);
    expect(ids(facets).sort()).toEqual(['comédie', 'drame']);
  });

  it('filtre les cartes par catégorie', () => {
    const filter = { nature: '', facet: '', category: 'music' };
    expect(isKindFilterActive(filter)).toBe(true);
    expect(applyKindFilter(mixed, kinds, filter).map((c) => c.slug)).toEqual(['Piaf', 'Thriller']);
    expect(applyKindFilter(mixed, kinds, { nature: '', facet: '', category: 'other' }).map((c) => c.slug)).toEqual(['Nouvelle']);
  });

  it('la catégorie « Jeux » réunit jeux vidéo et jeux de société, regroupés par nature', () => {
    const filter = { nature: '', facet: '', category: 'games' };
    expect(applyKindFilter(mixed, kinds, filter).map((c) => c.slug)).toEqual(['Jeu', 'Plateau']);
    const { natures } = buildKindOptions(mixed, kinds, filter);
    expect(ids(natures).sort()).toEqual(['group:Jeu de société', 'group:Jeu vidéo']);
  });

  it('la catégorie « Livres » réunit les œuvres écrites', () => {
    expect(applyKindFilter(mixed, kinds, { nature: '', facet: '', category: 'books' }).map((c) => c.slug)).toEqual(['Roman']);
  });

  it('changer de catégorie garde la nature seulement si elle y existe', () => {
    const current = { nature: 'group:Film', facet: 'drame', category: 'film' };
    expect(selectCategory(mixed, kinds, current, 'music')).toEqual({ category: 'music', nature: '', facet: '' });
    expect(selectCategory(mixed, kinds, { nature: 'group:Film', facet: 'drame' }, 'film')).toEqual({ category: 'film', nature: 'group:Film', facet: 'drame' });
    expect(selectCategory(mixed, kinds, current, '')).toEqual({ nature: 'group:Film', facet: 'drame' });
  });
});
