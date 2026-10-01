import { describe, expect, it } from 'vitest';
import {
  EMPTY_KINDS,
  PERSON_NATURE,
  UNKNOWN_NATURE,
  facetLabel,
  facetsOf,
  natureKeys,
  natureLabel,
  needsKindsLookup,
  setKinds,
} from '../../../src/core/kinds/kinds-book';

const kinds = (natures: string[], occupations: string[] = [], genres: string[] = []) => ({ natures, occupations, genres });

describe('état', () => {
  it('mémorise chaque article interrogé, y compris sans valeur', () => {
    const state = setKinds(EMPTY_KINDS, { A: kinds([]) }, { Q5: 'être humain' });
    expect(needsKindsLookup(state, 'A')).toBe(false);
    expect(needsKindsLookup(state, 'B')).toBe(true);
    expect(state.labels).toEqual({ Q5: 'être humain' });
  });

  it('fusionne sans perdre l\'existant', () => {
    const first = setKinds(EMPTY_KINDS, { A: kinds(['Q5']) }, { Q5: 'être humain' });
    const second = setKinds(first, { B: kinds(['Q482994']) }, { Q482994: 'album' });
    expect(Object.keys(second.cards).sort()).toEqual(['A', 'B']);
    expect(second.labels).toEqual({ Q5: 'être humain', Q482994: 'album' });
  });
});

describe('natureKeys', () => {
  it('regroupe les natures voisines sous une même clé', () => {
    expect(natureKeys(kinds(['Q208569', 'Q482994']))).toEqual(['group:Album']);
    expect(natureKeys(kinds(['Q5']))).toEqual([PERSON_NATURE]);
  });

  it('garde toutes les natures d\'une carte, non regroupées comprises', () => {
    expect(natureKeys(kinds(['Q5', 'Q99999']))).toEqual([PERSON_NATURE, 'Q99999']);
  });

  it('rend "inconnue" sans nature ou sans entrée', () => {
    expect(natureKeys(kinds([]))).toEqual([UNKNOWN_NATURE]);
    expect(natureKeys(undefined)).toEqual([UNKNOWN_NATURE]);
  });
});

describe('libellés', () => {
  const state = setKinds(EMPTY_KINDS, {}, { Q99999: 'bâtiment', Q177220: 'chanteur' });

  it('nomme les groupes, l\'inconnu, et met une majuscule aux libellés Wikidata', () => {
    expect(natureLabel(state, PERSON_NATURE)).toBe('Personne');
    expect(natureLabel(state, UNKNOWN_NATURE)).toBe('Inconnu');
    expect(natureLabel(state, 'Q99999')).toBe('Bâtiment');
    expect(facetLabel(state, 'Q177220')).toBe('Chanteur');
  });

  it('retombe sur l\'identifiant sans libellé', () => {
    expect(natureLabel(state, 'Q1')).toBe('Q1');
    expect(facetLabel(state, 'Q2')).toBe('Q2');
  });
});

describe('facetsOf', () => {
  it('donne les occupations d\'une personne et les genres des autres', () => {
    expect(facetsOf(kinds(['Q5'], ['Q177220'], ['Q11399']))).toEqual(['Q177220']);
    expect(facetsOf(kinds(['Q482994'], [], ['Q11399']))).toEqual(['Q11399']);
    expect(facetsOf(undefined)).toEqual([]);
  });
});
