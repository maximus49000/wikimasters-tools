// @vitest-environment jsdom
// tests/content/shop/shop-scene.test.tsx — rendu Ghibli des partitions des commerces (G4b, tâche 10)
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ART_KEY, writeArt } from '../../../src/content/art-setting';
import { CityLifeLayer } from '../../../src/content/city-life';
import { FigureContext, FigureRegistry } from '../../../src/content/figure/figure-host';
import { ShopScene, collectScene, placeScene } from '../../../src/content/shop/shop-scene';
import { makeScore, planOf, type SceneShop } from '../../../src/content/shop/scene-scores';
import { dayContext } from '../../../src/core/library/city/calendar';
import type { CityContext } from '../../../src/core/library/city/intensity';
import { cityMetrics } from '../../../src/core/library/city/metrics';
import { outfitFor } from '../../../src/core/library/city/people';
import { dayNumber } from '../../../src/core/library/city/shops/hours';
import { actorsAt } from '../../../src/core/library/city/shops/scene/score';
import { SLOT_S, slotIndexAt, slotStart } from '../../../src/core/library/city/shops/scene/slots';
import { shopFrame, shopSlotsFor } from '../../../src/core/library/city/shops/slots';
import type { ShopView } from '../../../src/core/library/city/shops/view';
import { mulberry32 } from '../../../src/core/library/scene-world';
import { skyAt, sunTimes } from '../../../src/core/library/sky';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mounted: { root: Root; host: HTMLDivElement }[] = [];
const mount = (): { host: HTMLDivElement; draw: (node: ReactNode) => void } => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  mounted.push({ root, host });
  return { host, draw: (node) => act(() => root.render(node)) };
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
const DAY = dayNumber(TUESDAY);
const times = sunTimes(TUESDAY, { lat: 48.85, lon: 2.35 }, 120);
const metrics = cityMetrics(H);
const slot = shopSlotsFor(W, H, SEED)[0]!;
const frame = shopFrame(slot, metrics.ground);
const view: ShopView = { slot, phase: 'open', sign: { type: 'bakery', name: 'X' }, placard: false, interior: 'bakery', works: null, moving: null, interiorStage: null };
const rng = mulberry32(3);
const shop: SceneShop = { view, frame, open: true, staff: [{ id: 'emp-0', outfit: outfitFor('ordinary', rng), spans: [[0, 86400]] }] };
const NO_STREET = () => ({ rainFrom: null, paradeFrom: null, busAt: [] });
const env = { seed: SEED, day: DAY, street: NO_STREET };
const T0 = 1_790_000_000;

// Premier instant (s du jour) après 10 h où la partition a un client à l'intérieur.
function busyMoment(): number {
  const plan = planOf(shop, env);
  const from = slotIndexAt('bakery', 10 * 3600);
  for (let i = from; i < from + 30; i++) {
    const sc = makeScore(plan, i, 1);
    for (let t = 5; t < SLOT_S('bakery'); t += 1) if (actorsAt(sc, t).some((a) => a.role === 'customer' && a.where === 'inside')) return slotStart('bakery', i) + t;
  }
  throw new Error('aucun client');
}

// Instant où l'employé est libre (bras le long du corps, tête droite) : la surcouche du klaxon peut jouer.
function freeStaffMoment(): number {
  const plan = planOf(shop, env);
  const from = slotIndexAt('bakery', 10 * 3600);
  for (let i = from; i < from + 30; i++) {
    const sc = makeScore(plan, i, 1);
    for (let t = 5; t < SLOT_S('bakery') - 5; t += 1) {
      const st = actorsAt(sc, t).find((a) => a.role === 'staff' && a.where === 'inside');
      const later = actorsAt(sc, t + 2).find((a) => a.role === 'staff');
      if (st && later && st.arms === 'down' && st.headYaw === 0 && later.arms === 'down' && later.headYaw === 0 && st.gait === 'stand' && later.gait === 'stand') return slotStart('bakery', i) + t;
    }
  }
  throw new Error('employé jamais libre');
}

const scene = (secondsOfDay: number, still = false, figures = new FigureRegistry('ts', { perFrame: 50 })): ReactNode => {
  const sky = skyAt(Math.floor(secondsOfDay / 60), times);
  return (
    <FigureContext.Provider value={figures}>
      <svg>
        <ShopScene
          shops={[shop]}
          seed={SEED}
          day={DAY}
          secondsOfDay={secondsOfDay}
          t0={T0}
          width={W}
          metrics={metrics}
          sky={sky}
          rainy={false}
          umbrella={false}
          gates={new Map([[slot.id, 1]])}
          street={NO_STREET}
          doorXs={[]}
          still={still}
        />
      </svg>
    </FigureContext.Provider>
  );
};
const activeActors = (c: Element): Element[] => [...c.querySelectorAll('[data-scene-actor][data-active="true"]')];
const activeStaff = (c: Element): Element[] => [...c.querySelectorAll('[data-scene-staff][data-active="true"]')];
const transforms = (c: Element): string[] => [...c.querySelectorAll('[data-scene-actor], [data-scene-staff] > [data-scene-fig], [data-scene-street]')].map((n) => `${n.getAttribute('transform')}|${n.getAttribute('display')}`);

describe('ShopScene (Ghibli)', () => {
  it('rend un employé intérieur et, quand la partition a un client à l’intérieur, un client actif', () => {
    const s = busyMoment();
    const { host, draw } = mount();
    draw(scene(s));
    expect(host.querySelector('svg[data-shop-window][data-scene]')).not.toBeNull();
    expect(activeStaff(host).length).toBeGreaterThan(0);
    expect(activeActors(host).length).toBeGreaterThan(0);
    // Le client actif est un pantin posé (sprite présent).
    expect(activeActors(host)[0]!.querySelector('[data-figure]')).not.toBeNull();
  });
  it('deux rendus à la même heure : mêmes transforms', () => {
    const s = busyMoment();
    const { host, draw } = mount();
    draw(scene(s));
    const a = transforms(host);
    draw(scene(s));
    expect(transforms(host)).toEqual(a);
    expect(a.length).toBeGreaterThan(0);
  });
  it('la boucle déplace les acteurs avec le temps, sans re-rendu', () => {
    const s = busyMoment();
    const { host, draw } = mount();
    const figures = new FigureRegistry('tl', { perFrame: 50 });
    draw(scene(s, false, figures));
    const before = transforms(host).join();
    const nodes = collectScene(host);
    let changed = false;
    for (let dt = 1; dt <= 20 && !changed; dt++) {
      placeScene(nodes, T0 + dt, figures, []);
      changed = transforms(host).join() !== before;
    }
    expect(changed).toBe(true);
  });
  it('mouvement réduit : aucun client, l’employé posé à son poste', () => {
    const s = busyMoment();
    const { host, draw } = mount();
    draw(scene(s, true));
    expect(activeActors(host)).toHaveLength(0);
    expect(activeStaff(host).length).toBeGreaterThan(0);
    const fig = activeStaff(host)[0]!.querySelector('[data-figure]')!;
    expect(fig.getAttribute('data-key')).not.toBeNull();
  });
  it('un klaxon proche fait tourner la tête d’un acteur libre (surcouche, 1 s)', () => {
    const s = freeStaffMoment();
    const { host, draw } = mount();
    const figures = new FigureRegistry('th', { perFrame: 50 });
    draw(scene(s, false, figures));
    const nodes = collectScene(host);
    const fig = activeStaff(host)[0]!.querySelector('[data-figure]')!;
    const head = (): string => (fig.getAttribute('data-key') ?? '').split('|')[4]!;
    // Sprite d'une nouvelle pose : demandé, peint par flush, posé à l'image suivante.
    const place = (t: number, horns: Parameters<typeof placeScene>[3]): void => {
      placeScene(nodes, t, figures, horns);
      figures.flush();
      placeScene(nodes, t, figures, horns);
    };
    const horn = [{ t: T0 - 0.2, x: frame.window.x + frame.window.w / 2 + 50, by: 'v1' }];
    place(T0, []);
    expect(head()).toBe('0');
    place(T0, horn);
    expect(head()).not.toBe('0');
    // Plus d'une seconde après le coup : tête droite ; trop loin (> 120 px) : rien.
    place(T0 + 2, horn);
    expect(head()).toBe('0');
    place(T0, [{ ...horn[0]!, x: frame.window.x + frame.window.w + 400 }]);
    expect(head()).toBe('0');
  });
});

describe('branchement dans la Ville', () => {
  const life = (ghibli: boolean): HTMLDivElement => {
    vi.spyOn(Date, 'now').mockReturnValue(T0 * 1000);
    if (ghibli) writeArt('ghibli');
    try {
      const minutes = 600;
      const sky = skyAt(minutes, times);
      const city: CityContext = { minutes, day: dayContext(TUESDAY, []), precip: 0, snow: false, storm: false, daylight: sky.daylight, shops: { epochDay: DAY, names: {} } };
      const { host, draw } = mount();
      draw(<svg><CityLifeLayer width={W} height={H} sky={sky} seed={SEED} city={city} rainy={false} /></svg>);
      return host;
    } finally {
      localStorage.removeItem(ART_KEY);
    }
  };
  it('classique : aucun nœud de la scène G4b', () => {
    const c = life(false);
    expect(c.querySelector('[data-scene], [data-scene-actor], [data-scene-staff]')).toBeNull();
  });
  it('Ghibli : les commerces G4b passent par la scène, sans clients intérieurs ni vendeur posé de l’ancien rendu', () => {
    const c = life(true);
    const windows = [...c.querySelectorAll('svg[data-shop-window][data-scene]')];
    expect(windows.length).toBeGreaterThan(0);
    for (const w of windows) {
      const id = w.getAttribute('data-shop-window')!;
      expect(c.querySelector(`svg[data-shop-window="${id}"]:not([data-scene]) [data-customer-inside]`)).toBeNull();
      expect(c.querySelector(`[data-shop-staff="${id}"] [data-posed="staff"]`)).toBeNull();
    }
  });
});
