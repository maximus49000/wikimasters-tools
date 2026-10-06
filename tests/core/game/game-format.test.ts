import { describe, expect, it } from 'vitest';
import { formatCount, formatPrice, normalizeTitle, parseGameLink, steamPageUrl, verdictFr, yearOfText } from '../../../src/core/game/game-format';

const flat = (text: string) => text.replace(/\s/g, ' ');

describe('game-format', () => {
  it('sépare les milliers et met en forme un prix en euros', () => {
    expect(flat(formatCount(1157783))).toBe('1 157 783');
    expect(flat(formatPrice('EUR', 5999))).toBe('59,99 €');
  });

  it('traduit le verdict Steam, et garde un verdict inconnu tel quel', () => {
    expect(verdictFr('Very Positive')).toBe('Très positives');
    expect(verdictFr('Mixed')).toBe('Mitigées');
    expect(verdictFr('Quelque chose')).toBe('Quelque chose');
    expect(verdictFr(undefined)).toBeUndefined();
  });

  it("lit l'année d'une date en texte", () => {
    expect(yearOfText('24 févr. 2022')).toBe(2022);
    expect(yearOfText('Bientôt')).toBeUndefined();
    expect(yearOfText(undefined)).toBeUndefined();
  });

  it('normalise les titres : accents, casse, ponctuation, espaces', () => {
    expect(normalizeTitle('  ELDEN  RING ')).toBe('elden ring');
    expect(normalizeTitle('Pokémon: Rouge')).toBe('pokemon rouge');
  });

  it("construit l'adresse de la page Steam", () => {
    expect(steamPageUrl(1245620)).toBe('https://store.steampowered.com/app/1245620');
  });

  it('lit un lien Steam ou IGDB, rien sinon', () => {
    expect(parseGameLink('https://store.steampowered.com/app/1245620/ELDEN_RING/')).toEqual({ source: 'steam', id: 1245620 });
    expect(parseGameLink(' https://www.igdb.com/games/super-metroid ')).toEqual({ source: 'igdb', slug: 'super-metroid' });
    expect(parseGameLink('https://exemple.test/app/12')).toBeNull();
    expect(parseGameLink('super metroid')).toBeNull();
  });
});
