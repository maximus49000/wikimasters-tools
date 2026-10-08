import { describe, expect, it } from 'vitest';
import { hasOwnSection, historyKindOf, mayBeHistory } from '../../../src/core/documentary/history-kinds';

const kinds = (natures: string[]) => ({ natures, occupations: [], genres: [] });
const FILM = 'Q11424';
const VIDEO_GAME = 'Q7889';
const NOVEL = 'Q8261';
const SONG = 'Q7366';
const DISAMBIGUATION = 'Q4167410';

describe('hasOwnSection', () => {
  it('reconnaît film, série, jeu vidéo, livre et morceau', () => {
    for (const nature of [FILM, 'Q5398426', VIDEO_GAME, NOVEL, SONG]) expect(hasOwnSection(kinds([nature])), nature).toBe(true);
    expect(hasOwnSection(kinds(['Q178561']))).toBe(false);
    expect(hasOwnSection(kinds([]))).toBe(false);
  });
});

describe('mayBeHistory', () => {
  it('retient tout sauf les cartes qui ont leur propre fiche et les pages d’homonymie', () => {
    for (const nature of ['Q178561', 'Q5', 'Q515', 'Q16521', 'Q381885', 'Q21484471']) expect(mayBeHistory(kinds([nature])), nature).toBe(true);
    expect(mayBeHistory(kinds([]))).toBe(true);
    expect(mayBeHistory(kinds([FILM]))).toBe(false);
    expect(mayBeHistory(kinds([VIDEO_GAME]))).toBe(false);
    expect(mayBeHistory(kinds([DISAMBIGUATION]))).toBe(false);
    expect(mayBeHistory(undefined)).toBe(false);
  });
});

describe('historyKindOf', () => {
  it('tout sujet qui n’est pas une personne est retenu, sans date ni nature connue (menhir, mausolée, monolithe, peste, espèce)', () => {
    for (const nature of ['Q178561', 'Q56242215', 'Q3241045', 'Q381885', 'Q21484471', 'Q515', 'Q16521']) expect(historyKindOf(kinds([nature]), null), nature).toBe('event');
    expect(historyKindOf(kinds([]), null)).toBe('event');
  });
  it('une personne n’est retenue qu’une fois décédée, quelle que soit l’année (Goya, Picasso, Miró)', () => {
    expect(historyKindOf(kinds(['Q5']), 1828)).toBe('person');
    expect(historyKindOf(kinds(['Q5']), 1973)).toBe('person');
    expect(historyKindOf(kinds(['Q5']), 2012)).toBe('person');
    expect(historyKindOf(kinds(['Q5']), null)).toBeNull();
  });
  it('jamais une carte qui a déjà sa propre fiche, une page d’homonymie ou une carte inconnue', () => {
    for (const nature of [FILM, NOVEL, SONG, VIDEO_GAME, DISAMBIGUATION]) expect(historyKindOf(kinds([nature]), null), nature).toBeNull();
    expect(historyKindOf(undefined, 1800)).toBeNull();
  });
});
