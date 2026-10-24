// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { forgetShownForTests, resetPaintedCacheForTests, safeAlphaProfile, setTilePainterForTests, usePaintedCity, usePaintedSkyline } from '../../src/content/painted-city';
import { skylinePath, skylinePathFromProfile } from '../../src/core/library/paint/sky-clip';
import { TILE, tileCount } from '../../src/core/library/paint/city-painter';
import { cityPaintPlan, type CityPaintPlan } from '../../src/core/library/paint/city-plan';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Profil alpha du haut de la ville (découpe des nuages au pixel) : assemblé à partir des tranches affichées par usePaintedCity,
// lu par un autre composant (le calque météo) avec son propre plan de la même ville.
let container: HTMLDivElement;
let root: Root;
const settle = () => act(async () => { for (let i = 0; i < 8; i++) await new Promise((r) => setTimeout(r, 0)); });
let seen: (Float32Array | null)[] = [];

function City({ plan }: { plan: CityPaintPlan }): null {
  usePaintedCity(plan);
  return null;
}
function Sky({ plan }: { plan: CityPaintPlan }): null {
  seen.push(usePaintedSkyline(plan));
  return null;
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  vi.stubGlobal('requestIdleCallback', (fn: () => void) => { fn(); return 1; });
  vi.stubGlobal('cancelIdleCallback', () => undefined);
  resetPaintedCacheForTests();
  seen = [];
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  setTilePainterForTests(null);
  vi.unstubAllGlobals();
});

describe('profil du haut de la ville peinte', () => {
  const W = 1000;
  it('assemble les profils de toutes les tranches affichées, null tant qu’une manque', async () => {
    const n = tileCount(W);
    let release: (() => void) | null = null;
    const gate = new Promise<void>((r) => (release = r));
    setTilePainterForTests(async (plan, t) => {
      if (t === n - 1) await gate;
      const w = Math.min(TILE, plan.width - t * TILE);
      return { url: `data:fake-${t}`, profile: new Float32Array(w).fill(50 + t) };
    });
    const a = cityPaintPlan(W, 340, 7);
    const b = cityPaintPlan(W, 340, 7);
    await act(async () => root.render(<><City plan={a} /><Sky plan={b} /></>));
    await settle();
    expect(seen.at(-1)).toBeNull();
    release!();
    await settle();
    const p = seen.at(-1)!;
    expect(p).not.toBeNull();
    expect(p.length).toBe(W);
    for (let t = 0; t < n; t++) expect(p[t * TILE]).toBe(50 + t);
    expect(p[W - 1]).toBe(50 + n - 1);
  });

  it('peintre sans profil (URL seule) : null, découpe de repli', async () => {
    setTilePainterForTests(async (_p, t) => `data:fake-${t}`);
    const a = cityPaintPlan(W, 340, 7);
    await act(async () => root.render(<><City plan={a} /><Sky plan={a} /></>));
    await settle();
    expect(seen.at(-1)).toBeNull();
  });

  // Peintre de test : profil = 50 + n° de tranche, sur toute la largeur de la tranche (w + 1 colonnes au bord d'un dpr non
  // entier : le surplus est rogné à l'assemblage).
  const profiled = (extra = 0) => async (plan: CityPaintPlan, t: number) => ({ url: `data:fake-${t}`, profile: new Float32Array(Math.min(TILE, plan.width - t * TILE) + extra).fill(50 + t) });

  it('cache chaud : un abonné monté après la publication lit le profil sans attendre de repeinte', async () => {
    setTilePainterForTests(profiled());
    const a = cityPaintPlan(W, 340, 7);
    await act(async () => root.render(<City plan={a} />));
    await settle();
    // Cache des tranches chaud, plus rien de publié : la ville (avant le ciel dans l'arbre) publie dans son effet, avant que
    // le ciel ne s'abonne.
    forgetShownForTests();
    act(() => root.unmount());
    root = createRoot(container);
    await act(async () => root.render(<><City plan={a} /><Sky plan={cityPaintPlan(W, 340, 7)} /></>));
    await settle();
    expect(seen.at(-1)).not.toBeNull();
    expect(seen.at(-1)!.length).toBe(W);
  });

  for (const width of [300, 2880]) {
    it(`largeur ${width} px : chaque colonne mesurée, chemin continu d'un bord à l'autre`, async () => {
      setTilePainterForTests(profiled(1));
      const a = cityPaintPlan(width, 340, 7);
      await act(async () => root.render(<><City plan={a} /><Sky plan={a} /></>));
      await settle();
      const p = seen.at(-1)!;
      expect(p).not.toBeNull();
      expect(p.length).toBe(width);
      for (let x = 0; x < width; x++) expect(p[x]).toBe(50 + Math.floor(x / TILE));
      const d = skylinePathFromProfile(a, p);
      expect(d.startsWith('M0 0L0 ')).toBe(true);
      expect(d.endsWith(`L${width} 0Z`)).toBe(true);
      const xs = [...d.matchAll(/L(-?[\d.]+) /g)].map((m) => Number(m[1]));
      for (let i = 1; i < xs.length; i++) expect(xs[i]!).toBeGreaterThanOrEqual(xs[i - 1]!);
      expect(xs.at(-2)).toBe(width);
    });
  }

  it('une tranche en échec parmi plusieurs : null, toute la découpe retombe sur les boîtes (jamais sans découpe)', async () => {
    const good = profiled();
    setTilePainterForTests(async (plan, t) => (t === 1 ? null : good(plan, t)));
    const a = cityPaintPlan(W, 340, 7);
    await act(async () => root.render(<><City plan={a} /><Sky plan={a} /></>));
    await settle();
    expect(seen.at(-1)).toBeNull();
    const d = skylinePathFromProfile(a, seen.at(-1)!);
    expect(d).toBe(skylinePath(a));
    expect(d.length).toBeGreaterThan(20);
  });

  it('lecture des pixels en échec : profil null, la tranche reste affichable', () => {
    const boom = { getImageData: () => { throw new DOMException('mémoire', 'SecurityError'); } } as unknown as CanvasRenderingContext2D;
    expect(safeAlphaProfile(boom, 4, 6, 2)).toBeNull();
    const ok = { getImageData: () => ({ data: new Uint8ClampedArray(4 * 6 * 4) }) } as unknown as CanvasRenderingContext2D;
    expect([...safeAlphaProfile(ok, 4, 6, 2)!]).toEqual([3, 3]);
  });
});
