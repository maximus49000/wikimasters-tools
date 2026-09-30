import { describe, expect, it } from 'vitest';
import {
  clearManual,
  EMPTY_GEO,
  needsLookup,
  partitionCards,
  resolvePosition,
  setManual,
  setWiki,
} from '../../../src/core/geo/geo-book';

const PARIS = { lat: 48.85, lon: 2.35 };
const HOME = { lat: 1, lon: 2 };

describe('resolvePosition', () => {
  it('renvoie null quand rien n\'est connu', () => {
    expect(resolvePosition(EMPTY_GEO, 'Paris')).toBeNull();
  });

  it('utilise la position Wikipédia', () => {
    expect(resolvePosition(setWiki(EMPTY_GEO, 'Paris', PARIS), 'Paris')).toEqual({ ...PARIS, source: 'wiki' });
  });

  it('préfère la position manuelle, et revient à Wikipédia quand on la retire', () => {
    const state = setManual(setWiki(EMPTY_GEO, 'Paris', PARIS), 'Paris', HOME);
    expect(resolvePosition(state, 'Paris')).toEqual({ ...HOME, source: 'manual' });
    expect(resolvePosition(clearManual(state, 'Paris'), 'Paris')).toEqual({ ...PARIS, source: 'wiki' });
  });

  it('traite « aucune coordonnée » Wikipédia comme non positionnée', () => {
    expect(resolvePosition(setWiki(EMPTY_GEO, 'Ted_Lasso', null), 'Ted_Lasso')).toBeNull();
  });

  it('ne confond pas un slug avec une propriété d\'Object', () => {
    expect(resolvePosition(EMPTY_GEO, 'constructor')).toBeNull();
    expect(needsLookup(EMPTY_GEO, 'constructor')).toBe(true);
  });
});

describe('needsLookup', () => {
  it('ne redemande jamais un article déjà interrogé, même sans coordonnées', () => {
    expect(needsLookup(EMPTY_GEO, 'Paris')).toBe(true);
    expect(needsLookup(setWiki(EMPTY_GEO, 'Paris', null), 'Paris')).toBe(false);
  });
});

describe('état immuable', () => {
  it('ne modifie pas l\'état d\'origine', () => {
    setManual(EMPTY_GEO, 'Paris', HOME);
    setWiki(EMPTY_GEO, 'Paris', PARIS);
    expect(EMPTY_GEO).toEqual({ wiki: {}, manual: {} });
  });
});

describe('partitionCards', () => {
  it('sépare les cartes placées et à placer, triées par titre', () => {
    const cards = [
      { slug: 'Tour_Eiffel', title: 'Tour Eiffel' },
      { slug: 'Ted_Lasso', title: 'Ted Lasso' },
      { slug: 'Berlin', title: 'Berlin' },
    ];
    let state = setWiki(EMPTY_GEO, 'Tour_Eiffel', PARIS);
    state = setWiki(state, 'Berlin', { lat: 52.5, lon: 13.4 });

    const { placed, unplaced } = partitionCards(cards, state);
    expect(placed.map((p) => p.card.title)).toEqual(['Berlin', 'Tour Eiffel']);
    expect(unplaced.map((c) => c.title)).toEqual(['Ted Lasso']);
  });
});
