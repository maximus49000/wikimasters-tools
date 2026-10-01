// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { buildCardPreview } from '../../src/content/card-preview-dom';
import type { CardPreview } from '../../src/core/collection/card-preview';

const base: CardPreview = { title: 'Paris', rarity: 'SR', imageUrl: null, extract: null, attack: null, defense: null, tags: [], purchase: null, market: { history: null, loading: false } };

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

describe('buildCardPreview : prix du marché', () => {
  const history = { kind: 'average', label: '≈ 40', trend: 'up', rarity: 'SR', tooltip: 'Moyenne' } as const;

  it('affiche la moyenne, la tendance et l’infobulle de la liste', () => {
    const chip = buildCardPreview({ ...base, market: { history, loading: false } }).querySelector<HTMLElement>('.wmt-card-market');
    expect(chip?.textContent).toBe('≈ 40▲');
    expect(chip?.title).toBe('Moyenne');
    expect(chip?.querySelector('.wmt-card-trend-up')).not.toBeNull();
  });

  it('affiche le glyphe de chargement quand le relevé est en attente', () => {
    expect(buildCardPreview({ ...base, market: { history: null, loading: true } }).querySelector('.wmt-card-loading')).not.toBeNull();
  });

  it('n’ajoute rien sans prix ni relevé en attente', () => {
    const card = buildCardPreview(base);
    expect(card.querySelector('.wmt-card-market')).toBeNull();
    expect(card.querySelector('.wmt-card-loading')).toBeNull();
  });
});
