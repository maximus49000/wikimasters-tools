import { describe, expect, it } from 'vitest';
import { matchCards } from '../../../src/core/links/card-match';

const card = (title: string) => ({ slug: title.replace(/ /g, '_'), title });
const cards = ['Daft Punk', 'Punk rock', 'Élève', 'Marie Curie', 'Les Punk'].map(card);

describe('matchCards', () => {
  it('ignore la casse et les accents, et classe ceux qui commencent par le texte d’abord', () => {
    expect(matchCards(cards, 'punk').map((c) => c.title)).toEqual(['Punk rock', 'Daft Punk', 'Les Punk']);
    expect(matchCards(cards, 'eleve').map((c) => c.title)).toEqual(['Élève']);
  });
  it('ne propose rien pour un texte vide et plafonne la liste', () => {
    expect(matchCards(cards, '  ')).toEqual([]);
    expect(matchCards(cards, 'u', 2)).toHaveLength(2);
  });
});
