// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetPaintedCacheForTests, setTilePainterForTests, usePaintedCity, usePaintedSkyline } from '../../src/content/painted-city';
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
});
