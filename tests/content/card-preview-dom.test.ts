// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { buildCardPreview } from '../../src/content/card-preview-dom';
import type { CardPreview } from '../../src/core/collection/card-preview';

const base: CardPreview = { title: 'Paris', rarity: 'SR', imageUrl: null, extract: null, attack: null, defense: null, tags: [], purchase: null };

describe('buildCardPreview : étiquettes', () => {
  it('affiche chaque étiquette avec sa couleur', () => {
    const card = buildCardPreview({ ...base, tags: [{ name: '#CVIDEUH', color: '#818cf8' }, { name: '#SANS' }] });
    const chips = [...card.querySelectorAll<HTMLElement>('.wmt-card-tag')];
    expect(chips.map((chip) => chip.textContent)).toEqual(['#CVIDEUH', '#SANS']);
    expect(chips[0]?.style.getPropertyValue('--wmt-tag')).toBe('#818cf8');
    expect(chips[1]?.style.getPropertyValue('--wmt-tag')).toBe('');
  });

  it('n’ajoute rien sans étiquette', () => {
    expect(buildCardPreview(base).querySelector('.wmt-card-tags')).toBeNull();
  });
});
