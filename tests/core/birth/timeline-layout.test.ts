import { describe, expect, it } from 'vitest';
import {
  MAX_PX_PER_YEAR,
  clampScale,
  fitScale,
  formatYear,
  layoutTimeline,
  tickStep,
} from '../../../src/core/birth/timeline-layout';

const card = (slug: string) => ({ slug, title: slug });
const dated = [
  { card: card('A'), year: 1900 },
  { card: card('B'), year: 1901 },
  { card: card('C'), year: 2000 },
];

describe('layoutTimeline', () => {
  it('place les cartes proportionnellement à leur date et évite les chevauchements', () => {
    const { items, lanes } = layoutTimeline(dated, 3);
    expect(items.map((item) => item.lane)).toEqual([0, 1, 0]);
    expect((items[2]?.x ?? 0) - (items[0]?.x ?? 0)).toBeCloseTo(300);
    expect(lanes).toBe(2);
  });

  it('zoomer écarte les cartes et rend les repères plus fins', () => {
    const far = layoutTimeline(dated, 3);
    const close = layoutTimeline(dated, MAX_PX_PER_YEAR);
    expect(close.width).toBeGreaterThan(far.width);
    expect(close.ticks.length).toBeGreaterThan(far.ticks.length);
    expect((close.items[1]?.x ?? 0) - (close.items[0]?.x ?? 0)).toBeCloseTo(MAX_PX_PER_YEAR);
  });

  it("descend jusqu'à un repère par année au zoom maximal, jamais en dessous", () => {
    expect(tickStep(MAX_PX_PER_YEAR)).toBe(1);
    expect(tickStep(1000)).toBe(1);
    expect(tickStep(3)).toBe(50);
    expect(tickStep(0.01)).toBeGreaterThan(100);
  });

  it('gère une liste vide et une seule carte', () => {
    expect(layoutTimeline([], 3).items).toEqual([]);
    expect(layoutTimeline([{ card: card('A'), year: 1500 }], 3).items).toHaveLength(1);
  });
});

describe('zoom', () => {
  it('le dézoom minimal fait tenir toute la frise, le zoom maximal est borné', () => {
    const fit = fitScale(dated, 1000);
    expect(layoutTimeline(dated, fit).width).toBeLessThanOrEqual(1000 + 1);
    expect(clampScale(0.0001, dated, 1000)).toBe(fit);
    expect(clampScale(1e6, dated, 1000)).toBe(MAX_PX_PER_YEAR);
  });
});

describe('formatYear', () => {
  it('formate les années', () => {
    expect(formatYear(1889.25)).toBe('1889');
    expect(formatYear(-384)).toBe('384 av. J.-C.');
  });
});

describe('layoutTimeline — évènements', () => {
  const events = [
    { card: card('War'), year: 1939, end: 1945 },
    { card: card('Party'), year: 1950 },
  ];

  it("étire la case d'un évènement jusqu'à sa fin, sans jamais la rendre plus étroite qu'une pastille", () => {
    const { items } = layoutTimeline(events, 30);
    expect(items[0]?.span).toBe(true);
    expect(items[0]?.width).toBeCloseTo(6 * 30);
    expect(items[1]?.span).toBe(false);
    expect(layoutTimeline(events, 3).items[0]?.width).toBe(140);
  });

  it('une case longue occupe sa ligne jusqu’à sa fin', () => {
    const overlapping = [
      { card: card('Long'), year: 1900, end: 2000 },
      { card: card('Inside'), year: 1950 },
    ];
    expect(layoutTimeline(overlapping, 3).items.map((item) => item.lane)).toEqual([0, 1]);
  });
});
