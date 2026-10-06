import { describe, expect, it } from 'vitest';
import type { KnownCard } from '../../src/core/collection/collection-book';
import type { WebGraph } from '../../src/core/links/web-graph';
import { layoutBig } from '../../src/core/links/web-place';
import { buildScene } from '../../src/core/links/web-scene';
import { buildBigModel } from '../../src/core/links/web-themes';
import { drawScene, type DrawOptions } from '../../src/content/web-draw';

const card = (slug: string) => ({ slug, title: slug }) as KnownCard;
const many = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => `${prefix}${i}`);
const scene = (hubs: Record<string, string[]>) => {
  const g: WebGraph = {
    cards: [...new Set(Object.values(hubs).flat())].map(card),
    hubs: Object.entries(hubs).map(([slug, cards]) => ({ slug, title: slug, cards })),
    cardLinks: [],
    hiddenHubs: 0,
  };
  const model = buildBigModel(g);
  return buildScene(g, layoutBig(g, {}, model), model);
};

// Un contexte qui enregistre les appels : de quoi vérifier ce qui est dessiné sans navigateur.
function fakeContext() {
  const calls: string[] = [];
  const ctx = new Proxy({}, {
    get: (_, name: string) => (...args: unknown[]) => void calls.push(`${name}:${args.length}`),
    set: () => true,
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, calls };
}
const options: DrawOptions = { focusHub: -1, pickedCard: -1, route: [], ink: '#fff', paper: '#000', image: () => null };
const size = { width: 800, height: 500 };

describe('drawScene', () => {
  const s = scene({ A1: many('a', 40), A2: many('a', 40), B1: many('b', 30), B2: many('b', 30) });
  const centre = { x: s.bounds!.minX + (s.bounds!.maxX - s.bounds!.minX) / 2, y: s.bounds!.minY + (s.bounds!.maxY - s.bounds!.minY) / 2 };
  const view = (k: number) => ({ k, x: size.width / 2 - centre.x * k, y: size.height / 2 - centre.y * k });

  it('affiche des cartes quand il y en a peu à l\'écran', () => {
    const { ctx } = fakeContext();
    const result = drawScene(ctx, s, view(40), size, options);
    expect(result.level).toBe('cards');
    expect(result.visible).toBeLessThanOrEqual(350);
  });

  it('efface la zone avant de dessiner', () => {
    const { ctx, calls } = fakeContext();
    drawScene(ctx, s, view(1), size, options);
    expect(calls[0]).toBe('clearRect:4');
  });

  it('dessine des points quand il y en a plus de 350 à l\'écran', () => {
    const big = scene({ A1: many('a', 600), A2: many('a', 600), B1: many('b', 600), B2: many('b', 600) });
    const { ctx } = fakeContext();
    const c = { x: (big.bounds!.minX + big.bounds!.maxX) / 2, y: (big.bounds!.minY + big.bounds!.maxY) / 2 };
    const result = drawScene(ctx, big, { k: 0.5, x: size.width / 2 - c.x * 0.5, y: size.height / 2 - c.y * 0.5 }, size, options);
    expect(result.level).toBe('dots');
    expect(result.visible).toBeGreaterThan(350);
  });

  it('dessine les petits points en carrés (un cercle coûte quatre fois plus cher au canvas)', () => {
    const big = scene({ A1: many('a', 600), A2: many('a', 600), B1: many('b', 600), B2: many('b', 600) });
    const { ctx, calls } = fakeContext();
    const c = { x: (big.bounds!.minX + big.bounds!.maxX) / 2, y: (big.bounds!.minY + big.bounds!.maxY) / 2 };
    const result = drawScene(ctx, big, { k: 0.5, x: size.width / 2 - c.x * 0.5, y: size.height / 2 - c.y * 0.5 }, size, options);
    expect(calls.filter((call) => call === 'rect:4')).toHaveLength(result.visible);
  });

  it('trace au plus 5 000 traits cartes → articles en points, même quand chaque carte en a deux', () => {
    const big = scene({ A1: many('a', 4500), A2: many('a', 4500), B1: many('b', 4500), B2: many('b', 4500) });
    const { ctx, calls } = fakeContext();
    const b = big.bounds!;
    const k = Math.min(size.width / (b.maxX - b.minX), size.height / (b.maxY - b.minY));
    const c = { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
    const result = drawScene(ctx, big, { k, x: size.width / 2 - c.x * k, y: size.height / 2 - c.y * k }, size, options);
    expect(result.level).toBe('dots');
    expect(result.visible).toBe(9000);
    const segments = calls.filter((call) => call === 'lineTo:2').length - big.hubLinks.length;
    expect(segments).toBeGreaterThan(2500);
    expect(segments).toBeLessThanOrEqual(5000);
  });

  it('met un article en avant sans planter, route comprise', () => {
    const { ctx } = fakeContext();
    const route = [[{ x: 0, y: 0 }, { x: 50, y: 50 }]] as const;
    expect(() => drawScene(ctx, s, view(8), size, { ...options, focusHub: 0, route })).not.toThrow();
    expect(() => drawScene(ctx, s, view(8), size, { ...options, pickedCard: 3 })).not.toThrow();
  });

  it('ne dessine rien d\'étrange hors de la toile', () => {
    const { ctx } = fakeContext();
    const result = drawScene(ctx, s, { k: 4, x: 1e7, y: 1e7 }, size, options);
    expect(result.visible).toBe(0);
  });
});
