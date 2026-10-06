import { describe, expect, it } from 'vitest';
import type { KnownCard } from '../../../src/core/collection/collection-book';
import type { WebGraph } from '../../../src/core/links/web-graph';
import { NO_THEME, assignThemes, buildBigModel, cardHubs, hubEdges } from '../../../src/core/links/web-themes';

const card = (slug: string) => ({ slug, title: slug }) as KnownCard;
const graph = (hubs: Record<string, string[]>): WebGraph => ({
  cards: [...new Set(Object.values(hubs).flat())].map(card),
  hubs: Object.entries(hubs).map(([slug, cards]) => ({ slug, title: slug, cards })),
  cardLinks: [],
  hiddenHubs: 0,
});

describe('cardHubs', () => {
  it('garde les trois premiers articles de chaque carte, dans l\'ordre des articles', () => {
    const g = graph({ A: ['c1'], B: ['c1'], C: ['c1'], D: ['c1', 'c2'] });
    expect(cardHubs(g).get('c1')).toEqual(['A', 'B', 'C']);
    expect(cardHubs(g).get('c2')).toEqual(['D']);
  });
});

describe('hubEdges', () => {
  it('relie deux articles par le nombre de cartes qu\'ils ont en commun', () => {
    const edges = hubEdges(graph({ A: ['c1', 'c2'], B: ['c1', 'c2', 'c3'], C: ['c3'] }));
    expect(edges).toEqual([
      { a: 'A', b: 'B', weight: 2 },
      { a: 'B', b: 'C', weight: 1 },
    ]);
  });

  it('ne garde que les quatre liens les plus forts de chaque article', () => {
    const hubs: Record<string, string[]> = { H: ['c1', 'c2', 'c3', 'c4', 'c5', 'c6'] };
    for (let i = 0; i < 6; i++) hubs[`S${i}`] = [`c${i + 1}`];
    const edges = hubEdges(graph(hubs));
    expect(edges.filter((e) => e.a === 'H' || e.b === 'H').length).toBeLessThanOrEqual(4);
  });
});

describe('assignThemes', () => {
  const two = graph({
    A1: ['a1', 'a2', 'a3'],
    A2: ['a1', 'a2', 'a3'],
    B1: ['b1', 'b2', 'b3', 'b4'],
    B2: ['b1', 'b2', 'b3', 'b4'],
  });

  it('sépare deux groupes d\'articles sans carte en commun', () => {
    const themes = assignThemes(two, hubEdges(two));
    expect(themes.list).toHaveLength(2);
    expect(themes.ofHub.get('A1')).toBe(themes.ofHub.get('A2'));
    expect(themes.ofHub.get('B1')).toBe(themes.ofHub.get('B2'));
    expect(themes.ofHub.get('A1')).not.toBe(themes.ofHub.get('B1'));
  });

  it('nomme chaque thème d\'après son article le plus partagé et lui donne une couleur', () => {
    const themes = assignThemes(two, hubEdges(two));
    expect(themes.list.map((t) => t.name).sort()).toEqual(['A1', 'B1']);
    expect(new Set(themes.list.map((t) => t.color)).size).toBe(2);
  });

  it('donne à chaque carte le thème de son article principal', () => {
    const themes = assignThemes(two, hubEdges(two));
    expect(themes.ofCard.get('a1')).toBe(themes.ofHub.get('A1'));
    expect(themes.ofCard.get('b4')).toBe(themes.ofHub.get('B1'));
  });

  it('est déterministe', () => {
    expect(assignThemes(two, hubEdges(two))).toEqual(assignThemes(two, hubEdges(two)));
  });

  it('plafonne à huit thèmes et rattache les petits groupes au plus lié', () => {
    const hubs: Record<string, string[]> = {};
    for (let g = 0; g < 12; g++) for (let h = 0; h < 2; h++) hubs[`G${g}H${h}`] = [`g${g}c1`, `g${g}c2`, `g${g}c3`];
    const g = graph(hubs);
    const themes = assignThemes(g, hubEdges(g));
    expect(themes.list.length).toBeLessThanOrEqual(8);
    for (const index of themes.ofHub.values()) expect(index).toBeLessThan(themes.list.length);
  });

  it('sans article, aucun thème', () => {
    const none = assignThemes({ cards: [card('x')], hubs: [], cardLinks: [], hiddenHubs: 0 }, []);
    expect(none.list).toEqual([]);
    expect(none.ofCard.get('x') ?? NO_THEME).toBe(NO_THEME);
  });
});

describe('buildBigModel', () => {
  it('réunit liens, thèmes et articles de chaque carte', () => {
    const g = graph({ A1: ['a1', 'a2'], A2: ['a1', 'a2'] });
    const model = buildBigModel(g);
    expect(model.edges).toHaveLength(1);
    expect(model.themes.list).toHaveLength(1);
    expect(model.hubsOf.get('a1')).toEqual(['A1', 'A2']);
  });
});
