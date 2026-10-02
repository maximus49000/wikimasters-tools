import { describe, expect, it } from 'vitest';
import { EMPTY_LINKS, LINKS_MAX_AGE_MS, MAX_LINKS_PER_CARD, linksOf, needsLinksLookup, setLinks } from '../../../src/core/links/links-book';

describe('setLinks / linksOf', () => {
  it('partage les titres entre les cartes et rend les liens dans l’ordre reçu, sans doublon', () => {
    const state = setLinks(EMPTY_LINKS, { Kamini: ['Pop', 'Paris', 'Pop'], ChansonB: ['Pop'] }, 1000);
    expect(state.titles).toEqual(['Pop', 'Paris']);
    expect(linksOf(state, 'Kamini')).toEqual(['Pop', 'Paris']);
    expect(linksOf(state, 'ChansonB')).toEqual(['Pop']);
    expect(state.cards.Kamini?.at).toBe(1000);
  });

  it('ignore un lien de la carte vers elle-même', () => {
    expect(linksOf(setLinks(EMPTY_LINKS, { Kamini: ['Kamini', 'Pop'] }, 1), 'Kamini')).toEqual(['Pop']);
  });

  it('garde les entrées déjà connues et remplace celle d’une carte relue', () => {
    const first = setLinks(EMPTY_LINKS, { A: ['X'], B: ['Y'] }, 1);
    const second = setLinks(first, { A: ['Z'] }, 2);
    expect(linksOf(second, 'A')).toEqual(['Z']);
    expect(linksOf(second, 'B')).toEqual(['Y']);
    expect(second.cards.A?.at).toBe(2);
    expect(first.cards.A?.at).toBe(1);
  });

  it('plafonne les liens d’une carte', () => {
    const many = Array.from({ length: MAX_LINKS_PER_CARD + 50 }, (_, i) => `L${i}`);
    expect(linksOf(setLinks(EMPTY_LINKS, { A: many }, 1), 'A')).toHaveLength(MAX_LINKS_PER_CARD);
  });

  it('rend une liste vide pour une carte inconnue, même nommée comme une propriété d’objet', () => {
    expect(linksOf(EMPTY_LINKS, 'constructor')).toEqual([]);
    expect(linksOf(EMPTY_LINKS, 'Inconnue')).toEqual([]);
  });
});

describe('needsLinksLookup', () => {
  it('demande une carte jamais lue, mais pas une carte lue sans aucun lien', () => {
    const state = setLinks(EMPTY_LINKS, { Vide: [] }, 1000);
    expect(needsLinksLookup(state, 'Autre', 1000)).toBe(true);
    expect(needsLinksLookup(state, 'Vide', 1000)).toBe(false);
  });

  it('redemande une carte après 30 jours', () => {
    const state = setLinks(EMPTY_LINKS, { A: ['X'] }, 0);
    expect(needsLinksLookup(state, 'A', LINKS_MAX_AGE_MS - 1)).toBe(false);
    expect(needsLinksLookup(state, 'A', LINKS_MAX_AGE_MS)).toBe(true);
  });

  it('ne confond pas une carte nommée « constructor » avec une propriété d’objet', () => {
    expect(needsLinksLookup(EMPTY_LINKS, 'constructor', 0)).toBe(true);
  });
});
