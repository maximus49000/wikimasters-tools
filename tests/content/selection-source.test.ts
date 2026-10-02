import { describe, expect, it, vi } from 'vitest';
import { createPathRequestSource, createSelectionSource } from '../../src/content/selection-source';

const ted = { slug: 'Ted_Lasso', title: 'Ted Lasso' };
const ovide = { slug: 'Ovide', title: 'Ovide' };

describe('createSelectionSource', () => {
  it('coche puis décoche une carte, et prévient les abonnés', () => {
    const source = createSelectionSource();
    const listener = vi.fn();
    source.subscribe(listener);
    source.setSelecting(true);
    source.toggle(ted);
    expect([...source.snapshot().cards]).toEqual([['Ted_Lasso', 'Ted Lasso']]);
    source.toggle(ted);
    expect(source.snapshot().cards.size).toBe(0);
    expect(listener).toHaveBeenCalledTimes(3);
  });

  it('vide les cartes cochées en quittant la sélection', () => {
    const source = createSelectionSource();
    source.setSelecting(true);
    source.toggle(ted);
    source.setSelecting(false);
    expect(source.snapshot()).toEqual({ selecting: false, cards: new Map() });
  });

  it("reprend l'état des cases du site pour ses cartes, sans toucher aux autres", () => {
    const source = createSelectionSource();
    source.setSelecting(true);
    source.toggle(ovide);
    source.syncNative(new Map([['Ted_Lasso', { title: 'Ted Lasso', selected: true }]]));
    expect([...source.snapshot().cards.keys()]).toEqual(['Ovide', 'Ted_Lasso']);
    source.syncNative(new Map([['Ted_Lasso', { title: 'Ted Lasso', selected: false }]]));
    expect([...source.snapshot().cards.keys()]).toEqual(['Ovide']);
  });

  it("ne prévient personne quand rien ne change", () => {
    const source = createSelectionSource();
    source.setSelecting(true);
    const listener = vi.fn();
    source.subscribe(listener);
    source.syncNative(new Map([['Ted_Lasso', { title: 'Ted Lasso', selected: false }]]));
    source.setSelecting(true);
    expect(listener).not.toHaveBeenCalled();
  });
});

describe('createPathRequestSource', () => {
  it("rend la demande une seule fois", () => {
    const source = createPathRequestSource();
    expect(source.take()).toBeNull();
    source.set({ from: ted, to: ovide });
    expect(source.take()).toEqual({ from: ted, to: ovide });
    expect(source.take()).toBeNull();
  });
});
