// @vitest-environment jsdom
// tests/content/gulls-layer.test.tsx — calque des mouettes (G5) : Ghibli seulement, images peintes `gull` posées par oiseau
// (échelle s, opacité 1 − far), pose 0 en mouvement réduit, cheminées de la colline.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GULL_POOL, GullsLayer, gullPerches } from '../../src/content/gulls-layer';
import { PropContext, PropRegistry, propKey } from '../../src/content/prop/prop-host';
import { flocksAt } from '../../src/core/library/city/gulls';
import { cityPaintPlan } from '../../src/core/library/paint/city-plan';
import { skyAt, sunTimes } from '../../src/core/library/sky';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const sky = skyAt(8 * 60, sunTimes({ y: 2026, m: 6, d: 10 }, { lat: 48.85, lon: 2.35 }, 120));
const W = 1000;
const H = 400;
const SEED = 3;
const ctx = { minutes: 8 * 60, daylight: sky.daylight, rain: 0 };
const perches = gullPerches(cityPaintPlan(W, H, SEED).hill.houses, [], H * 0.7, W);
// Instant avec des oiseaux en vol.
const T = ((): number => {
  for (let t = 1_800_000_000; ; t += 3) if (flocksAt(t, SEED, W, H, ctx, perches).length >= 2) return t;
})();

const mounted: { root: Root; host: HTMLDivElement }[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const { root, host } of mounted.splice(0)) {
    act(() => root.unmount());
    host.remove();
  }
});
const mount = (ghibli: boolean): { svg: SVGSVGElement; reg: PropRegistry; flush: () => Promise<void> } => {
  vi.spyOn(Date, 'now').mockReturnValue(T * 1000);
  const jobs: (() => void)[] = [];
  const reg = new PropRegistry('t14gl', { schedule: (cb) => jobs.push(cb) });
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  mounted.push({ root, host });
  act(() =>
    root.render(
      <PropContext.Provider value={reg}>
        <svg>
          <GullsLayer width={W} height={H} seed={SEED} sky={sky} facades={[]} ground={H * 0.7} minutes={8 * 60} rain={0} still frozenT={T} ghibli={ghibli} />
        </svg>
      </PropContext.Provider>,
    ),
  );
  const flush = async (): Promise<void> => {
    for (let n = 0; jobs.length && n < 50; n++) await act(async () => jobs.shift()!());
  };
  return { svg: host.querySelector('svg')!, reg, flush };
};

describe('calque des mouettes', () => {
  it('classique : rien (le décor classique n\'a jamais eu ces mouettes)', () => {
    const { svg } = mount(false);
    expect(svg.querySelector('[data-gulls], image')).toBeNull();
  });
  it('Ghibli, mouvement réduit : un oiseau par pose de l\'instant figé, à son échelle et sa pâleur, pose 0, aucun SMIL', async () => {
    const { svg, reg, flush } = mount(true);
    expect(svg.querySelectorAll('[data-gull]')).toHaveLength(GULL_POOL);
    expect(svg.querySelectorAll('animate, animateTransform, animateMotion')).toHaveLength(0);
    await flush();
    const poses = flocksAt(T, SEED, W, H, ctx, perches).slice(0, GULL_POOL);
    const shown = [...svg.querySelectorAll('[data-gull]')].filter((g) => g.getAttribute('display') === 'inline');
    expect(shown).toHaveLength(poses.length);
    shown.forEach((g, i) => {
      const p = poses[i]!;
      expect(g.getAttribute('transform')).toBe(`translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) scale(${p.s.toFixed(3)})`);
      expect(g.getAttribute('opacity')).toBe((1 - p.far).toFixed(2));
      const img = g.querySelector('image')!;
      expect(img.getAttribute('href')).toBe(reg.get(propKey({ id: 'gull', args: { wing: p.wing }, day: sky.daylight, dir: p.dir, frame: 0 })));
      expect([img.getAttribute('x'), img.getAttribute('y'), img.getAttribute('width'), img.getAttribute('height')]).toEqual(['-8', '-6', '16', '11']);
    });
  });
  it('cheminées : maisons visibles des rangs 1 et 2, au haut de la brique peinte', () => {
    const plan = cityPaintPlan(W, H, SEED);
    expect(perches.length).toBeGreaterThan(0);
    for (const p of perches) {
      const h = plan.hill.houses.find((o) => o.chimney !== null && Math.abs(o.x + o.w * o.chimney + 1.5 * o.s - p.x) < 1e-9)!;
      expect(h).toBeDefined();
      expect(h.row).toBeGreaterThan(0);
      expect(p.y).toBeCloseTo(h.top - 4 * h.s + 0.4 * h.h * 0.32, 9);
      expect(p.s).toBe(h.s);
    }
  });
});
