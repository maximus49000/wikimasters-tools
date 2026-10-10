// @vitest-environment jsdom
// tests/content/city-shops-layer.test.tsx
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CityLifeLayer } from '../../src/content/city-life';
import { CityScene } from '../../src/content/scene-city';
import { dayContext } from '../../src/core/library/city/calendar';
import type { CityContext } from '../../src/core/library/city/intensity';
import { cityMetrics } from '../../src/core/library/city/metrics';
import { SHOP_DEFS } from '../../src/core/library/city/shops/catalog';
import { visitsFor } from '../../src/core/library/city/shops/customers';
import { dayNumber, ymdOfDay } from '../../src/core/library/city/shops/hours';
import { streetOn } from '../../src/core/library/city/shops/lifecycle';
import { shopFrame, shopSlotsFor } from '../../src/core/library/city/shops/slots';
import { changePlans } from '../../src/core/library/city/shops/view';
import { skyAt, sunTimes } from '../../src/core/library/sky';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Rendu minimal (le dépôt n'a pas @testing-library/react) : un conteneur par appel, démonté après chaque test.
const mounted: { root: Root; host: HTMLDivElement }[] = [];
const render = (node: ReactNode): HTMLDivElement => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  act(() => root.render(node));
  mounted.push({ root, host });
  return host;
};
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  for (const { root, host } of mounted.splice(0)) {
    act(() => root.unmount());
    host.remove();
  }
});

const W = 720;
const H = 340;
const SEED = 1;
const TUESDAY = { y: 2026, m: 10, d: 6 };
const EPOCH = dayNumber(TUESDAY);
const times = sunTimes({ y: 2026, m: 10, d: 9 }, { lat: 48.85, lon: 2.35 }, 120);
const slots = shopSlotsFor(W, H, SEED);

const contextAt = (minutes: number, ymd = TUESDAY, shops: CityContext['shops'] | null = { epochDay: EPOCH, names: {} }) => {
  const sky = skyAt(minutes, times);
  const city: CityContext = { minutes, day: dayContext(ymd, []), precip: 0, snow: false, storm: false, daylight: sky.daylight, ...(shops ? { shops } : {}) };
  return { sky, city };
};
const scene = (minutes: number, ymd = TUESDAY, shops?: CityContext['shops'] | null): HTMLDivElement => {
  const { sky, city } = contextAt(minutes, ymd, shops === null ? null : (shops ?? { epochDay: EPOCH, names: {} }));
  return render(<svg><CityScene width={W} height={H} sky={sky} minutes={minutes} seed={SEED} city={city} /></svg>);
};
const life = (minutes: number, ymd = TUESDAY): HTMLDivElement => {
  const { sky, city } = contextAt(minutes, ymd);
  return render(<svg><CityLifeLayer width={W} height={H} sky={sky} seed={SEED} city={city} rainy={false} /></svg>);
};
const reduceMotion = (): void => {
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('reduce'), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false }));
};

// Premier jour de chantier après le départ, et un instant au milieu de l'étape « install ».
const worksDay = (() => {
  for (let day = EPOCH + 1; day < EPOCH + 200; day++) {
    const k = streetOn(slots, SEED, EPOCH, day, {}).findIndex((s) => s.change !== null);
    if (k < 0) continue;
    const kind = streetOn(slots, SEED, EPOCH, day, {})[k]!.change!.kind;
    const step = changePlans(SEED, slots[k]!.id, day, kind).works.steps.find((s) => s.step === 'install')!;
    return { day, k, minutes: Math.round((step.from + step.to) / 2) };
  }
  throw new Error('aucun chantier en 200 jours');
})();

describe('CityScene : locaux commerciaux', () => {
  it('le jour de départ à 10 h un mardi : un local par emplacement, intérieur ou écriteau, aucun À vendre', () => {
    expect(slots.length).toBeGreaterThan(0);
    const c = scene(600);
    const shops = c.querySelectorAll('[data-shop]');
    expect(shops).toHaveLength(slots.length);
    for (const shop of shops) expect(shop.querySelector('[data-interior], [data-placard]')).not.toBeNull();
    expect(c.querySelectorAll('[data-shop-phase="for-sale"]')).toHaveLength(0);
  });
  it('à 3 h du matin : rideau baissé sur tous les commerces qui ne sont pas de nuit', () => {
    const c = scene(180);
    const types = streetOn(slots, SEED, EPOCH, EPOCH, {}).map((s) => s.tenant!.type);
    slots.forEach((slot, i) => {
      if (SHOP_DEFS[types[i]!].crowd === 'night') return;
      const shop = c.querySelector(`[data-shop="${slot.id}"]`)!;
      expect(shop.getAttribute('data-shop-phase')).toBe('closed');
      expect(shop.querySelector('[data-shutter]')).not.toBeNull();
    });
  });
  it('sans commerces dans le contexte : aucun local dessiné', () => {
    expect(scene(600, TUESDAY, null).querySelectorAll('[data-shop]')).toHaveLength(0);
  });
  it('le décor des locaux ne porte aucun id', () => {
    expect(scene(600).querySelectorAll('[data-shop] [id]')).toHaveLength(0);
  });
});

describe('CityLifeLayer : clients et équipe du matin', () => {
  it('à 8 h un mardi : un nœud de client par visite', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_790_000_000_000);
    const frames = new Map(slots.map((s) => [s.id, shopFrame(s, cityMetrics(H).ground)]));
    const visits = visitsFor(slots, frames, SEED, () => null);
    const c = life(480);
    expect(c.querySelectorAll('[data-customer]')).toHaveLength(visits.length);
    expect(c.querySelectorAll('[data-customer-inside]')).toHaveLength(visits.length);
  });
  it('en mouvement réduit : aucun client actif', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_790_000_000_000);
    reduceMotion();
    const c = life(480);
    const nodes = c.querySelectorAll('[data-customer], [data-customer-inside]');
    expect(nodes.length).toBeGreaterThan(0);
    for (const node of nodes) expect(node.getAttribute('data-active')).toBe('false');
  });
  it('jour de chantier, au milieu de « install » : échelle et deux ouvriers devant le local, phase works', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_790_000_000_000);
    const ymd = ymdOfDay(worksDay.day);
    const id = `shop-${worksDay.k}`;
    const c = life(worksDay.minutes, ymd);
    const works = c.querySelector(`[data-works="${id}"]`);
    expect(works).not.toBeNull();
    expect(works!.querySelectorAll('[data-ladder]')).toHaveLength(1);
    expect(works!.querySelectorAll('[data-worker]')).toHaveLength(2);
    expect(scene(worksDay.minutes, ymd).querySelector(`[data-shop="${id}"]`)!.getAttribute('data-shop-phase')).toBe('works');
  });
  it('en mouvement réduit, l’équipe est figée en pose « install » (échelle visible) sans transition', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_790_000_000_000);
    reduceMotion();
    const plan = changePlans(SEED, slots[worksDay.k]!.id, worksDay.day, streetOn(slots, SEED, EPOCH, worksDay.day, {})[worksDay.k]!.change!.kind).works;
    const arrive = plan.steps.find((s) => s.step === 'arrive')!;
    const c = life(Math.ceil(arrive.from + 1), ymdOfDay(worksDay.day));
    const works = c.querySelector(`[data-works="shop-${worksDay.k}"]`)!;
    expect(works.querySelectorAll('[data-ladder]')).toHaveLength(1);
    for (const w of works.querySelectorAll<SVGGElement>('[data-worker]')) expect(w.style.transition).toBe('');
  });
});
