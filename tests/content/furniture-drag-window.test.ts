import { describe, expect, it } from 'vitest';
import type { Layout } from '../../src/core/library/library-types';
import { dropTargetFor } from '../../src/content/furniture-drag';

const layout: Layout = [
  { id: 'w1', kind: 'window', col: 2, row: 1, w: 6, h: 5 },
  { id: 'p1', kind: 'wall', shape: 'poster', col: 14, row: 1, slug: 'a' },
];

describe('dropTargetFor — fenêtre', () => {
  it('la case visée est le coin bas-gauche, la fenêtre garde sa taille', () => {
    const target = dropTargetFor(layout, 24, 'w1', 4, 6);
    expect(target.ok).toBe(true);
    expect(target.ghost).toEqual({ col: 4, row: 2, w: 6, h: 5 });
    expect(target.col).toBe(4);
    expect(target.top).toBe(2);
  });

  it('refuse un chevauchement avec un autre objet mural', () => {
    const target = dropTargetFor(layout, 24, 'w1', 14, 5);
    expect(target.ok).toBe(false);
    expect(target.reason).toBe('taken');
    expect(target.cells.length).toBeGreaterThan(0);
  });

  it('refuse un dépôt dans le sol', () => {
    expect(dropTargetFor(layout, 24, 'w1', 4, 16).ok).toBe(false);
  });
});
