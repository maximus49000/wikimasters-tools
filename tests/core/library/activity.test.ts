import { describe, expect, it } from 'vitest';
import { activityAt, actorActive, lampLit } from '../../../src/core/library/activity';

const h = (hours: number): number => hours * 60;

describe('activityAt', () => {
  it('reste entre 0 et 1 et boucle sur 24 h', () => {
    for (let m = 0; m < 1440; m += 15) {
      const a = activityAt(m);
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThanOrEqual(1);
    }
    expect(activityAt(0)).toBeCloseTo(activityAt(1440), 5);
  });

  it('est maximale en début de soirée et minimale vers 4 h', () => {
    expect(activityAt(h(21))).toBeGreaterThan(activityAt(h(0)));
    expect(activityAt(h(0))).toBeGreaterThan(activityAt(h(3.5)));
    expect(activityAt(h(21))).toBeGreaterThan(0.9);
    expect(activityAt(h(4))).toBeLessThan(0.1);
  });

  it('est faible en journée', () => {
    expect(activityAt(h(13))).toBeLessThan(0.2);
  });
});

describe('lampLit et actorActive', () => {
  it('beaucoup de fenêtres allumées à 21 h, presque aucune à 4 h', () => {
    const us = Array.from({ length: 100 }, (_, i) => i / 100);
    const count = (m: number): number => us.filter((u) => lampLit(u, m)).length;
    expect(count(h(21))).toBeGreaterThan(80);
    expect(count(h(4))).toBeLessThan(8);
    expect(count(h(21))).toBeGreaterThan(count(h(1)));
    expect(count(h(1))).toBeGreaterThan(count(h(4)));
  });

  it('une fenêtre insomniaque reste allumée toute la nuit', () => {
    expect(lampLit(0.01, h(4))).toBe(true);
  });

  it('les passants suivent la même courbe, un acteur à u négatif est toujours actif', () => {
    expect(actorActive(0.5, h(21))).toBe(true);
    expect(actorActive(0.5, h(3))).toBe(false);
    expect(actorActive(-1, h(3))).toBe(true);
  });
});
