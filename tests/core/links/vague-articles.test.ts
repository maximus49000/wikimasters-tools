import { describe, expect, it } from 'vitest';
import { isBroadPlaceArticle, isDateArticle, isPlaceArticle } from '../../../src/core/links/vague-articles';

describe('isDateArticle', () => {
  it('reconnaît les pages de date', () => {
    for (const slug of ['1998', '2000_en_football', '1975_en_musique', '26_janvier', '1er_mai', '14_juillet_1789', 'Janvier_2000', 'XXe_siècle', 'Années_1990', 'Saison_2003-2004', '44_av._J.-C.']) {
      expect(isDateArticle(slug), slug).toBe(true);
    }
  });

  it('laisse les compétitions datées, les œuvres et les noms propres', () => {
    for (const slug of ['Coupe_du_monde_de_football_2006', 'Mai_68', '2001,_l\'Odyssée_de_l\'espace', 'Championnat_du_Portugal_de_football_2003-2004', 'Hubert-Félix_Thiéfaine', '1984_(roman)']) {
      expect(isDateArticle(slug), slug).toBe(false);
    }
  });
});

describe('isPlaceArticle', () => {
  it('reconnaît les pays et les continents, pas les villes', () => {
    expect(isPlaceArticle('France')).toBe(true);
    expect(isPlaceArticle('États-Unis')).toBe(true);
    expect(isPlaceArticle('Europe')).toBe(true);
    expect(isPlaceArticle('Paris')).toBe(false);
    expect(isPlaceArticle('FC_Porto')).toBe(false);
  });
});

describe('isBroadPlaceArticle', () => {
  it('reconnaît les régions et les grandes villes, pas les lieux précis', () => {
    expect(isBroadPlaceArticle('Californie')).toBe(true);
    expect(isBroadPlaceArticle('Paris')).toBe(true);
    expect(isBroadPlaceArticle('Tour_Eiffel')).toBe(false);
    expect(isBroadPlaceArticle('Stade_du_Dragon')).toBe(false);
  });
});
