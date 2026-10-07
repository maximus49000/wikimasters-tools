import { describe, expect, it } from 'vitest';
import { pagesOf, stepsOf } from '../../../src/core/whats-new/pages';
import type { Entry, TourStep } from '../../../src/core/whats-new/types';

describe('pagesOf', () => {
  it('une étape sans paragraphes titrés tient sur une page, avec l’encart', () => {
    const step: TourStep = { target: null, title: 'T', text: 'Sert à ceci.' };
    expect(pagesOf(step)).toEqual([{ label: 'À quoi ça sert', text: 'Sert à ceci.', encart: true }]);
  });

  it('découpe : une page « à quoi ça sert », puis une page par paragraphe titré, l’encart seulement sur la première', () => {
    const step: TourStep = { target: '#a', title: 'T', text: 'Sert à ceci.', details: [{ label: 'D’où', text: 'Du marché.' }, { label: 'À savoir', text: 'Délai.' }] };
    const pages = pagesOf(step);
    expect(pages.map((p) => p.label)).toEqual(['À quoi ça sert', 'D’où', 'À savoir']);
    expect(pages.map((p) => p.encart)).toEqual([true, false, false]);
    expect(pages[2]!.text).toBe('Délai.');
  });
});

describe('stepsOf', () => {
  it('rend les étapes d’une fiche avec le glyphe de la fiche (utile à l’encart de secours)', () => {
    const entry: Entry = { id: 'x', theme: 'app', glyph: '🎮', title: 'X', summary: 's', steps: [{ target: null, title: 'a', text: 'b' }] };
    expect(stepsOf(entry)).toEqual([{ target: null, title: 'a', text: 'b', glyph: '🎮' }]);
  });
});
