import { describe, expect, it } from 'vitest';
import type { KnownCard } from '../../../src/core/collection/collection-book';
import type { WebGraph } from '../../../src/core/links/web-graph';
import { BIG_GRAPH, CARDS_MAX, DOTS_MAX, buildScene, clusterCell, clustersFor, levelFor, pickAt } from '../../../src/core/links/web-scene';
import { layoutBig } from '../../../src/core/links/web-place';
import { buildBigModel } from '../../../src/core/links/web-themes';

const card = (slug: string) => ({ slug, title: slug.toUpperCase() }) as KnownCard;
const many = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => `${prefix}${i}`);
const graph = (hubs: Record<string, string[]>): WebGraph => ({
  cards: [...new Set(Object.values(hubs).flat())].map(card),
  hubs: Object.entries(hubs).map(([slug, cards]) => ({ slug, title: slug, cards })),
  cardLinks: [],
  hiddenHubs: 0,
});
const build = (hubs: Record<string, string[]>) => {
  const g = graph(hubs);
  const model = buildBigModel(g);
  return { g, model, scene: buildScene(g, layoutBig(g, {}, model), model) };
};

describe('levelFor', () => {
  it('choisit le niveau d\'après le nombre de cartes à l\'écran', () => {
    expect(BIG_GRAPH).toBe(1500);
    expect(levelFor(CARDS_MAX)).toBe('cards');
    expect(levelFor(CARDS_MAX + 1)).toBe('dots');
    expect(levelFor(DOTS_MAX)).toBe('dots');
    expect(levelFor(DOTS_MAX + 1)).toBe('clusters');
  });
});

describe('buildScene', () => {
  const { scene } = build({ A1: [...many('a', 30), 'x'], A2: many('a', 30), B1: [...many('b', 20), 'x'], B2: many('b', 20) });

  it('range les cartes et les articles avec leur thème', () => {
    expect(scene.slugs).toHaveLength(51);
    expect(scene.hubs).toHaveLength(4);
    expect(scene.themes).toHaveLength(2);
    expect(scene.theme[scene.cardIndex.get('a3')!]).toBe(scene.hubs[scene.hubIndex.get('A1')!]!.theme);
    expect(scene.hub1[scene.cardIndex.get('a3')!]).toBe(scene.hubIndex.get('A1'));
  });

  it('relie deux articles par leurs cartes communes et nomme les territoires', () => {
    expect(scene.hubLinks.length).toBeGreaterThan(0);
    expect(scene.themeCentres.map((c) => c.name).sort()).toEqual(['A1', 'B1']);
  });

  it("ne nomme pas un thème dont aucun article n'est placé (pas de nom égaré à l'origine)", () => {
    const g = graph({ A1: [...many('a', 30), 'x'], A2: many('a', 30), B1: [...many('b', 20), 'x'], B2: many('b', 20) });
    const model = buildBigModel(g);
    // Placement en retard d'un rendu sur le graphe : les articles de B n'y sont pas encore.
    const positions = layoutBig(g, {}, model);
    delete positions['h:B1'];
    delete positions['h:B2'];
    const partial = buildScene(g, positions, model);
    expect(partial.themeCentres.map((c) => c.name)).toEqual(['A1']);
  });

  it('ordonne les articles du plus au moins gros', () => {
    const sizes = scene.hubOrder.map((i) => scene.hubs[i]!.cards);
    expect(sizes).toEqual([...sizes].sort((a, b) => b - a));
  });

  it('donne l\'étendue de la toile', () => {
    expect(scene.bounds!.maxX).toBeGreaterThan(scene.bounds!.minX);
  });
});

describe('clustersFor', () => {
  const { scene } = build({ A1: many('a', 200), A2: many('a', 200) });

  it('une cellule par paquet, le total des paquets est le nombre de cartes', () => {
    const { items } = clustersFor(scene, clusterCell(0.2));
    expect(items.reduce((sum, c) => sum + c.n, 0)).toBe(200);
  });

  it('la cellule garde une taille d\'environ 32 px à l\'écran', () => {
    for (const k of [0.02, 0.1, 0.3, 1]) {
      const px = clusterCell(k) * k;
      expect(px).toBeGreaterThanOrEqual(32);
      expect(px).toBeLessThan(64);
    }
  });

  it("donne pour chaque cellule le nombre de cartes, leur centre et le thème le plus présent", () => {
    const { scene: two } = build({ A1: many('a', 300), A2: many('a', 300), B1: many('b', 300), B2: many('b', 300) });
    for (const cell of [16, 64, 256]) {
      // Calcul de référence, cellule par cellule.
      const cells = new Map<string, { n: number; x: number; y: number; votes: Map<number, number> }>();
      for (let i = 0; i < two.xs.length; i++) {
        const key = `${Math.floor(two.xs[i]! / cell)}:${Math.floor(two.ys[i]! / cell)}`;
        const c = cells.get(key) ?? { n: 0, x: 0, y: 0, votes: new Map<number, number>() };
        c.n += 1;
        c.x += two.xs[i]!;
        c.y += two.ys[i]!;
        c.votes.set(two.theme[i]!, (c.votes.get(two.theme[i]!) ?? 0) + 1);
        cells.set(key, c);
      }
      const expected = [...cells.values()].map((c) => ({ n: c.n, x: c.x / c.n, y: c.y / c.n, votes: c.votes }));
      const { items, max } = clustersFor(two, cell);
      expect(items).toHaveLength(expected.length);
      expect(max).toBe(Math.max(...expected.map((c) => c.n)));
      const sortKey = (c: { x: number; y: number }) => c.x * 1e6 + c.y;
      const got = [...items].sort((p, q) => sortKey(p) - sortKey(q));
      const want = expected.sort((p, q) => sortKey(p) - sortKey(q));
      got.forEach((item, i) => {
        expect(item.n).toBe(want[i]!.n);
        expect(item.x).toBeCloseTo(want[i]!.x, 3);
        expect(item.y).toBeCloseTo(want[i]!.y, 3);
        const best = Math.max(...want[i]!.votes.values());
        expect(want[i]!.votes.get(item.theme)).toBe(best);
      });
    }
  });

  it('réutilise le calcul tant que la cellule ne change pas', () => {
    expect(clustersFor(scene, 64)).toBe(clustersFor(scene, 64));
  });

  it("garde le calcul de chaque cellule : zoomer puis revenir ne recalcule rien", () => {
    const first = clustersFor(scene, 64);
    clustersFor(scene, 128);
    expect(clustersFor(scene, 64)).toBe(first);
  });
});

describe('pickAt', () => {
  const { scene } = build({ A1: many('a', 12), A2: many('a', 12) });
  const t = { x: 300, y: 200, k: 2 };
  const hub = scene.hubs[0]!;

  it('trouve un article proche du doigt', () => {
    const hit = pickAt(scene, t, 'dots', t.x + hub.x * t.k + 5, t.y + hub.y * t.k - 4);
    expect(hit).toEqual({ kind: 'hub', slug: hub.slug });
  });

  it('trouve une carte, sauf en regroupements', () => {
    const i = scene.cardIndex.get('a5')!;
    const px = t.x + scene.xs[i]! * t.k;
    const py = t.y + scene.ys[i]! * t.k;
    expect(pickAt(scene, t, 'cards', px, py)).toEqual({ kind: 'card', slug: 'a5' });
    expect(pickAt(scene, t, 'clusters', px, py)).toBeNull();
  });

  it('touche une carte dans une zone de 44 px (22 px autour de son centre)', () => {
    const far = { x: 300, y: 200, k: 40 };
    const i = scene.cardIndex.get('a5')!;
    const px = far.x + scene.xs[i]! * far.k;
    const py = far.y + scene.ys[i]! * far.k;
    expect(pickAt(scene, far, 'cards', px + 20, py)).toEqual({ kind: 'card', slug: 'a5' });
    expect(pickAt(scene, far, 'cards', px, py - 20)).toEqual({ kind: 'card', slug: 'a5' });
  });

  it('ne trouve rien dans le vide', () => {
    expect(pickAt(scene, t, 'dots', -5000, -5000)).toBeNull();
  });
});
