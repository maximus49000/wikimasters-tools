import { describe, expect, it } from 'vitest';
import { BOOK_NATURES, isBookCard, isWriterCard } from '../../../src/core/book/book-kinds';

const kinds = (natures: string[]) => ({ natures, occupations: [], genres: [] });

describe('isBookCard', () => {
  it('reconnaît une œuvre littéraire (Les Misérables), un roman, une pièce de théâtre, une bande dessinée', () => {
    for (const nature of ['Q7725634', 'Q8261', 'Q25379', 'Q1004']) expect(isBookCard(kinds([nature])), nature).toBe(true);
  });
  it('ne reconnaît ni un film, ni un jeu vidéo, ni une personne, ni une carte sans nature', () => {
    expect(isBookCard(kinds(['Q11424']))).toBe(false);
    expect(isBookCard(kinds(['Q7889']))).toBe(false);
    expect(isBookCard(kinds(['Q5']))).toBe(false);
    expect(isBookCard(undefined)).toBe(false);
  });
  it('liste quinze natures sans doublon', () => {
    expect(new Set(BOOK_NATURES).size).toBe(15);
  });
});

describe('isWriterCard', () => {
  const person = (occupations: string[]) => ({ natures: ['Q5'], occupations, genres: [] });
  it('reconnaît un écrivain, un poète, un dramaturge', () => {
    for (const job of ['Q36180', 'Q49757', 'Q214917']) expect(isWriterCard(person([job])), job).toBe(true);
  });
  it('ni un acteur, ni une œuvre, ni une carte sans nature', () => {
    expect(isWriterCard(person(['Q33999']))).toBe(false);
    expect(isWriterCard({ natures: ['Q8261'], occupations: ['Q36180'], genres: [] })).toBe(false);
    expect(isWriterCard(undefined)).toBe(false);
  });
});
