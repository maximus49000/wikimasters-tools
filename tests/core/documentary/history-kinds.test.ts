import { describe, expect, it } from 'vitest';
import { hasOwnSection, historyKindOf, mayBeHistory } from '../../../src/core/documentary/history-kinds';

const kinds = (natures: string[]) => ({ natures, occupations: [], genres: [] });
const FILM = 'Q11424';
const VIDEO_GAME = 'Q7889';
const NOVEL = 'Q8261';
const SONG = 'Q7366';

describe('hasOwnSection', () => {
  it('reconnaît film, série, jeu vidéo, livre et morceau', () => {
    for (const nature of [FILM, 'Q5398426', VIDEO_GAME, NOVEL, SONG]) expect(hasOwnSection(kinds([nature])), nature).toBe(true);
    expect(hasOwnSection(kinds(['Q178561']))).toBe(false);
    expect(hasOwnSection(kinds([]))).toBe(false);
  });
});

describe('mayBeHistory', () => {
  it('retient tout sauf les cartes qui ont leur propre fiche', () => {
    expect(mayBeHistory(kinds(['Q178561']))).toBe(true);
    expect(mayBeHistory(kinds(['Q5']))).toBe(true);
    expect(mayBeHistory(kinds([]))).toBe(true);
    expect(mayBeHistory(kinds(['Q515']))).toBe(true);
    expect(mayBeHistory(kinds([FILM]))).toBe(false);
    expect(mayBeHistory(kinds([VIDEO_GAME]))).toBe(false);
    expect(mayBeHistory(undefined)).toBe(false);
  });
});

describe('historyKindOf', () => {
  it('reconnaît une bataille, une guerre, une révolution', () => {
    expect(historyKindOf(kinds(['Q178561']), null)).toBe('event');
    expect(historyKindOf(kinds(['Q198']), null)).toBe('event');
    expect(historyKindOf(kinds(['Q10931']), null)).toBe('event');
  });
  it('reconnaît une œuvre d’art, un monument, une civilisation, une religion', () => {
    expect(historyKindOf(kinds(['Q18609875']), null)).toBe('event');
    expect(historyKindOf(kinds(['Q16970']), null)).toBe('event');
    expect(historyKindOf(kinds(['Q8432']), null)).toBe('event');
    expect(historyKindOf(kinds(['Q9174']), null)).toBe('event');
  });
  it('reconnaît un humain décédé avant 1970, jamais un vivant ni un décès plus récent', () => {
    expect(historyKindOf(kinds(['Q5']), 1821)).toBe('person');
    expect(historyKindOf(kinds(['Q5']), 1950)).toBe('person');
    expect(historyKindOf(kinds(['Q5']), 1969)).toBe('person');
    expect(historyKindOf(kinds(['Q5']), 1970)).toBeNull();
    expect(historyKindOf(kinds(['Q5']), null)).toBeNull();
    expect(historyKindOf(kinds(['Q5']), null, 1800)).toBeNull();
  });
  it('tout autre sujet compte s’il date de 1950 ou avant (cathédrale, épidémie, broderie, culte sans nature)', () => {
    expect(historyKindOf(kinds(['Q56242215']), null, 1163)).toBe('event');
    expect(historyKindOf(kinds(['Q3241045', 'Q12184']), null, 1347)).toBe('event');
    expect(historyKindOf(kinds(['Q44740228', 'Q28966302']), null, 1070)).toBe('event');
    expect(historyKindOf(kinds([]), null, 1794)).toBe('event');
    expect(historyKindOf(kinds([]), null, 1950)).toBe('event');
    expect(historyKindOf(kinds(['Q515']), null, 1794)).toBe('event');
  });
  it('mais pas s’il est récent, sans date, ou s’il a déjà sa propre fiche', () => {
    expect(historyKindOf(kinds([]), null, 1990)).toBeNull();
    expect(historyKindOf(kinds([]), null, null)).toBeNull();
    expect(historyKindOf(kinds(['Q16521']), null, null)).toBeNull();
    expect(historyKindOf(kinds([FILM]), null, 1930)).toBeNull();
    expect(historyKindOf(kinds([NOVEL]), null, 1862)).toBeNull();
    expect(historyKindOf(kinds([SONG]), null, 1900)).toBeNull();
    expect(historyKindOf(kinds([VIDEO_GAME]), null, 1940)).toBeNull();
    expect(historyKindOf(undefined, 1800)).toBeNull();
  });
});
