import { describe, expect, it } from 'vitest';
import { CATEGORIES, categoryOf } from '../../../src/core/kinds/kinds-category';
import { natureKeys } from '../../../src/core/kinds/kinds-book';

const kinds = (natures: string[]) => ({ natures, occupations: [], genres: [] });

describe('catégorie « Jeux »', () => {
  it('est proposée entre « Films / Série » et « Autre »', () => {
    expect(CATEGORIES.map((category) => category.id)).toEqual(['music', 'film', 'games', 'other']);
    expect(CATEGORIES.find((category) => category.id === 'games')?.label).toBe('Jeux');
  });

  it.each([
    ['jeu vidéo', 'Q7889'],
    ['jeu de société', 'Q131436'],
    ['jeu de cartes', 'Q142714'],
    ['jeu de cartes à collectionner', 'Q734698'],
    ['jeu de rôle sur table', 'Q1643932'],
    ['jeu de plateau (tabletop game)', 'Q3244175'],
    ['jeu de figurines', 'Q532716'],
    ['wargame', 'Q1501543'],
    ['jeu de stratégie abstrait', 'Q573573'],
    ['jeu de dés', 'Q1515156'],
    ['jeu traditionnel', 'Q676977'],
    ['jeu de fête', 'Q839864'],
  ])('classe %s dans « Jeux »', (_label, nature) => {
    expect(categoryOf(kinds([nature]))).toBe('games');
  });

  it("la musique et le cinéma l'emportent ; le reste tombe dans « Autre »", () => {
    expect(categoryOf(kinds(['Q482994', 'Q7889']))).toBe('music');
    expect(categoryOf(kinds(['Q11424', 'Q7889']))).toBe('film');
    expect(categoryOf(kinds(['Q5']))).toBe('other');
    expect(categoryOf(undefined)).toBe('other');
  });
});

describe('natures de jeux regroupées', () => {
  it.each([
    ['Q131436', 'group:Jeu de société'],
    ['Q573573', 'group:Jeu de société'],
    ['Q676977', 'group:Jeu de société'],
    ['Q3244175', 'group:Jeu de société'],
    ['Q839864', 'group:Jeu de société'],
    ['Q142714', 'group:Jeu de cartes'],
    ['Q734698', 'group:Jeu de cartes'],
    ['Q1515156', 'group:Jeu de dés'],
    ['Q1643932', 'group:Jeu de rôle'],
    ['Q532716', 'group:Jeu de figurines'],
    ['Q1501543', 'group:Jeu de figurines'],
    ['Q7889', 'group:Jeu vidéo'],
  ])('%s → %s', (nature, key) => {
    expect(natureKeys(kinds([nature]))).toEqual([key]);
  });
});
