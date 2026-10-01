import { describe, expect, it } from 'vitest';
import { toHistoryBadge } from '../../../src/core/market/history-badge';
import type { CardHistory } from '../../../src/core/market/price-history';

const DAY = 86_400_000;
const NOW = Date.parse('2026-10-01T12:00:00Z');

const card = (over: Partial<CardHistory> = {}): CardHistory => ({
  slug: 'Mad_Max',
  rarity: 'SR',
  hours: {},
  samples: [],
  days: [],
  ...over,
});
const sample = (ageMs: number, avgBid: number) => ({ t: NOW - ageMs, avgBid, bidCount: 1 });
const day = (ageDays: number, avg: number) => ({ day: NOW - ageDays * DAY, sum: avg * 2, n: 2, min: avg - 5, max: avg + 5 });

describe('toHistoryBadge', () => {
  it('affiche la moyenne des 7 derniers jours avec la tendance', () => {
    const model = toHistoryBadge([card({ samples: [sample(2000, 100), sample(1000, 150)] })], NOW, true);
    expect(model).toMatchObject({ kind: 'average', label: '≈ 125', trend: 'up' });
  });

  it('une carte possédée sans aucune enchère observée affiche ???', () => {
    expect(toHistoryBadge([], NOW, true)).toMatchObject({ kind: 'unknown', label: '???', trend: null });
    expect(toHistoryBadge([card()], NOW, true)).toMatchObject({ kind: 'unknown', label: '???' });
  });

  it('ne montre rien pour une carte non possédée sans donnée (page Marché…)', () => {
    expect(toHistoryBadge([], NOW, false)).toBeNull();
    expect(toHistoryBadge([card()], NOW, false)).toBeNull();
  });

  it('sans relevé récent, affiche la dernière valeur connue et son ancienneté', () => {
    const model = toHistoryBadge([card({ days: [day(40, 80), day(12, 120)] })], NOW, true);
    expect(model).toMatchObject({ kind: 'stale', label: '≈ 120', trend: null });
    expect(model?.tooltip).toContain('Dernière valeur connue');
    expect(model?.tooltip).toContain('12 j');
  });

  it('une moyenne récente l’emporte sur une ancienne valeur connue', () => {
    const model = toHistoryBadge([card({ samples: [sample(1000, 50)], days: [day(40, 999)] })], NOW, true);
    expect(model).toMatchObject({ kind: 'average', label: '≈ 50' });
  });

  it('ne tranche pas entre une carte normale et sa variante shiny', () => {
    const a = card({ samples: [sample(1000, 50)] });
    const b = card({ samples: [sample(1000, 70)], isShiny: true });
    expect(toHistoryBadge([a, b], NOW, true)).toBeNull();
  });
});
