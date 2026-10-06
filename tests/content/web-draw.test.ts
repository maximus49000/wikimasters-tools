import { describe, expect, it } from 'vitest';
import type { KnownCard } from '../../src/core/collection/collection-book';
import type { WebGraph } from '../../src/core/links/web-graph';
import { layoutBig } from '../../src/core/links/web-place';
import { buildScene, litMask } from '../../src/core/links/web-scene';
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
    // Toutes les cartes mises en avant (18 000 traits) : échantillonnées à 15 000 traits au plus pour tenir le budget d'une image.
    const all = fakeContext();
    drawScene(all.ctx, big, { k, x: size.width / 2 - c.x * k, y: size.height / 2 - c.y * k }, size, { ...options, lit: new Uint8Array(9000).fill(1) });
    const litSegments = all.calls.filter((call) => call === 'lineTo:2').length - big.hubLinks.length;
    expect(litSegments).toBeGreaterThan(7500);
    expect(litSegments).toBeLessThanOrEqual(15000);
  });

  it("écrit le nom des thèmes par-dessus les articles en vue d'ensemble", () => {
    const calls: string[] = [];
    const ctx = new Proxy({}, {
      get: (_, name: string) => (...args: unknown[]) => void calls.push(name === 'fillText' ? `fillText:${String(args[0])}` : name),
      set: () => true,
    }) as unknown as CanvasRenderingContext2D;
    const big = scene({ A1: many('a', 11000), A2: many('a', 11000), B1: many('b', 11000), B2: many('b', 11000) });
    const b = big.bounds!;
    const k = Math.min(size.width / (b.maxX - b.minX), size.height / (b.maxY - b.minY));
    const c = { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
    const result = drawScene(ctx, big, { k, x: size.width / 2 - c.x * k, y: size.height / 2 - c.y * k }, size, options);
    expect(result.level).toBe('clusters');
    const lastArc = calls.lastIndexOf('arc');
    // Le thème porte le nom de son plus gros article : son nom est écrit deux fois, le dernier est celui du thème.
    const theme = calls.lastIndexOf(`fillText:${big.themeCentres[0]!.name}`);
    expect(theme).toBeGreaterThan(lastArc);
    // 44 000 cartes placées : délai large.
  }, 20_000);

  // Un contexte qui compte les points (rect) et les cartes (strokeRect) dessinés à chaque opacité.
  const alphaContext = () => {
    let alpha = 1;
    const counts: Record<string, number> = {};
    const ctx = new Proxy({}, {
      get: (_, name: string) => (...args: unknown[]) => {
        void args;
        const key = `${name}@${alpha}`;
        counts[key] = (counts[key] ?? 0) + 1;
      },
      set: (_, name: string, value: unknown) => {
        if (name === 'globalAlpha') alpha = value as number;
        return true;
      },
    }) as unknown as CanvasRenderingContext2D;
    return { ctx, counts };
  };
  const third = (() => {
    const hubs = { H1: many('c', 400), H2: many('c', 400), S: many('c', 100) };
    const g: WebGraph = {
      cards: many('c', 400).map(card),
      hubs: Object.entries(hubs).map(([slug, cards]) => ({ slug, title: slug, cards })),
      cardLinks: [],
      hiddenHubs: 0,
    };
    const model = buildBigModel(g);
    const sc = buildScene(g, layoutBig(g, {}, model), model);
    const b = sc.bounds!;
    const fit = (k: number) => ({ k, x: size.width / 2 - ((b.minX + b.maxX) / 2) * k, y: size.height / 2 - ((b.minY + b.maxY) / 2) * k });
    const k = Math.min(size.width / (b.maxX - b.minX), size.height / (b.maxY - b.minY)) * 0.9;
    return { g, sc, view: fit(k), zoomed: fit(k * 40) };
  })();

  it("article mis en avant (3e article de ses cartes) : ses 100 cartes en plein, les 300 autres estompées, aucune cachée", () => {
    const { ctx, counts } = alphaContext();
    const focusHub = third.sc.hubIndex.get('S')!;
    const lit = litMask(third.sc, third.g, 'S', null);
    const result = drawScene(ctx, third.sc, third.view, size, { ...options, focusHub, lit });
    expect(result.level).toBe('dots');
    expect(result.visible).toBe(400);
    expect(counts['rect@1']).toBe(100);
    expect(counts['rect@0.25']).toBe(300);
  });

  it('chemin cherché : ses cartes en plein, les autres estompées (pas effacées)', () => {
    const { ctx, counts } = alphaContext();
    const g = { ...third.g, path: { ids: new Set(['c:c1', 'c:c2']), edges: new Set<string>(), added: new Set<string>() } };
    const lit = litMask(third.sc, g, null, null);
    const route = [[{ x: third.sc.xs[1]!, y: third.sc.ys[1]! }, { x: third.sc.xs[2]!, y: third.sc.ys[2]! }]] as const;
    drawScene(ctx, third.sc, third.view, size, { ...options, route, lit });
    expect(counts['rect@1']).toBe(2);
    expect(counts['rect@0.25']).toBe(398);
  });

  it('carte touchée au niveau cartes : les autres cartes restent dessinées, estompées', () => {
    const { ctx, counts } = alphaContext();
    const picked = third.sc.cardIndex.get('c5')!;
    const at = { x: third.sc.xs[picked]!, y: third.sc.ys[picked]! };
    const view = { k: 8, x: size.width / 2 - at.x * 8, y: size.height / 2 - at.y * 8 };
    const lit = litMask(third.sc, third.g, null, 'c5');
    const result = drawScene(ctx, third.sc, view, size, { ...options, pickedCard: picked, lit });
    expect(result.level).toBe('cards');
    expect(counts['strokeRect@1']).toBe(1);
    expect(counts['strokeRect@0.25']).toBe(result.visible - 1);
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
