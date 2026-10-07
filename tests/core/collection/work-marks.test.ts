import { describe, expect, it } from 'vitest';
import type { KnownCard } from '../../../src/core/collection/collection-book';
import { EMPTY_OWNERSHIP, ownedCardOf, ownershipSignature, rarityName, screenOwnership } from '../../../src/core/collection/work-marks';

const card = (slug: string, extra: Partial<KnownCard> = {}): KnownCard => ({ slug, title: slug, ...extra });

describe('screenOwnership', () => {
  it('associe chaque identifiant TMDB a la carte qui le porte', () => {
    const cards = [card('Inception', { rarity: 'L', copies: 2 }), card('Breaking_Bad', { rarity: 'SR', copies: 1 }), card('Paris')];
    const screen = { Inception: { movieId: 27205 }, Breaking_Bad: { tvId: 1396 }, Paris: {} };
    const ownership = screenOwnership(cards, screen);
    expect(ownedCardOf(ownership, 'movie', 27205)?.slug).toBe('Inception');
    expect(ownedCardOf(ownership, 'tv', 1396)?.slug).toBe('Breaking_Bad');
    expect(ownedCardOf(ownership, 'movie', 1396)).toBeUndefined();
  });

  it('ignore une carte sans identifiant connu ou absente de screen-v1', () => {
    const ownership = screenOwnership([card('Inconnue'), card('Vide')], { Vide: {} });
    expect(ownership.movie.size + ownership.tv.size).toBe(0);
  });

  it('ignore une carte dont le nombre d\'exemplaires est nul, garde celle dont il est inconnu', () => {
    const cards = [card('Vendue', { copies: 0 }), card('Sans_compte')];
    const ownership = screenOwnership(cards, { Vendue: { movieId: 1 }, Sans_compte: { movieId: 2 } });
    expect(ownedCardOf(ownership, 'movie', 1)).toBeUndefined();
    expect(ownedCardOf(ownership, 'movie', 2)?.slug).toBe('Sans_compte');
  });

  it('garde la premiere carte quand deux cartes portent le meme identifiant', () => {
    const ownership = screenOwnership([card('A'), card('B')], { A: { movieId: 7 }, B: { movieId: 7 } });
    expect(ownedCardOf(ownership, 'movie', 7)?.slug).toBe('A');
  });
});

describe('ownershipSignature', () => {
  it('change quand une rarete ou un nombre d\'exemplaires change, pas autrement', () => {
    const base = screenOwnership([card('A', { rarity: 'R', copies: 1 })], { A: { movieId: 1 } });
    const same = screenOwnership([card('A', { rarity: 'R', copies: 1 })], { A: { movieId: 1 } });
    const more = screenOwnership([card('A', { rarity: 'R', copies: 2 })], { A: { movieId: 1 } });
    expect(ownershipSignature(same)).toBe(ownershipSignature(base));
    expect(ownershipSignature(more)).not.toBe(ownershipSignature(base));
    expect(ownershipSignature(EMPTY_OWNERSHIP)).toBe('');
  });
});

describe('rarityName', () => {
  it('donne le nom francais d\'une rarete, renvoie le code inconnu tel quel, rien sans rarete', () => {
    expect(rarityName('L')).toBe('Legendaire');
    expect(rarityName('PC')).toBe('Peu commune');
    expect(rarityName('XX')).toBe('XX');
    expect(rarityName(undefined)).toBeUndefined();
  });
});
