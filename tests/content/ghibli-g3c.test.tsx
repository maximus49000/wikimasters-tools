// @vitest-environment jsdom
// tests/content/ghibli-g3c.test.tsx
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ART_KEY, writeArt } from '../../src/content/art-setting';
import { CityLifeLayer } from '../../src/content/city-life';
import { CRANK_TURN, crankPhase } from '../../src/content/figure/ghibli-cyclist';
import { ParadeUnitSprite, paradeArms } from '../../src/content/parade-sprites';
import { dayContext, type YMD } from '../../src/core/library/city/calendar';
import type { CityContext } from '../../src/core/library/city/intensity';
import type { ParadeKind } from '../../src/core/library/city/parade';
import { skyAt, sunTimes } from '../../src/core/library/sky';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
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
  for (const { root, host } of mounted.splice(0)) {
    act(() => root.unmount());
    host.remove();
  }
  localStorage.removeItem(ART_KEY);
});
const sky = skyAt(630, sunTimes({ y: 2026, m: 7, d: 14 }, { lat: 48.85, lon: 2.35 }, 120));
const unit = (kind: ParadeKind) => ({ id: `u-${kind}`, kind, variant: 0.3, half: 60, start: 0, lane: 'near' as const });
const KINDS: ParadeKind[] = ['band', 'infantry', 'flags', 'motorbikes', 'cavalry', 'jeeps', 'tanks', 'firetruck'];

describe('cortège Ghibli', () => {
  it('chaque unité avec des humains rend des pantins en Ghibli, son dessin en classique', () => {
    for (const kind of KINDS) {
      const g = render(<svg><ParadeUnitSprite unit={unit(kind)} sky={sky} still={false} ghibli /></svg>);
      const c = render(<svg><ParadeUnitSprite unit={unit(kind)} sky={sky} still={false} /></svg>);
      expect(g.querySelectorAll('[data-figure]').length, kind).toBeGreaterThan(0);
      expect(c.querySelectorAll('[data-figure]').length, kind).toBe(0);
      // Classique : les pompiers en cabine ne sont que des têtes, sans data-parade-figure.
      if (kind !== 'firetruck') expect(c.querySelectorAll('[data-parade-figure]').length, kind).toBeGreaterThan(0);
    }
  });
  it('marcheurs posés par la boucle (data-arms), objets tenus accrochés', () => {
    const g = render(<svg><ParadeUnitSprite unit={unit('band')} sky={sky} still={false} ghibli /></svg>);
    expect(g.querySelectorAll('[data-arms]').length).toBe(6);
    expect(g.querySelectorAll('[data-held] [data-instrument]').length).toBe(6);
    const inf = render(<svg><ParadeUnitSprite unit={unit('infantry')} sky={sky} still={false} ghibli /></svg>);
    expect(inf.querySelectorAll('[data-held] [data-rifle]').length).toBe(8);
  });
  it('pompiers rognés à la vitre par un <svg> imbriqué, sans clipPath', () => {
    const g = render(<svg><ParadeUnitSprite unit={unit('firetruck')} sky={sky} still={false} ghibli /></svg>);
    expect(g.querySelector('svg svg [data-figure]')).not.toBeNull();
    expect(g.querySelector('clipPath')).toBeNull();
  });
  it('tambour-major : bras levé puis haut, deux secondes chacun', () => {
    expect(paradeArms('baton', 0.5)).toBe('raise');
    expect(paradeArms('baton', 2.5)).toBe('up');
    expect(paradeArms('rifle', 2.5)).toBe('rifle');
  });
});

describe('cyclistes Ghibli', () => {
  const ORDINARY: YMD = { y: 2026, m: 10, d: 6 };
  const mount = (): HTMLDivElement => {
    vi.spyOn(Date, 'now').mockReturnValue(1_790_000_050_000);
    const minutes = 8 * 60 + 30;
    const s = skyAt(minutes, sunTimes(ORDINARY, { lat: 48.85, lon: 2.35 }, 120));
    const city: CityContext = { minutes, day: dayContext(ORDINARY, []), precip: 0, snow: false, storm: false, daylight: s.daylight };
    return render(<svg><CityLifeLayer width={720} height={340} sky={s} seed={1} city={city} rainy={false} /></svg>);
  };
  it('vélo de la rue : pantin à vélo en Ghibli, dessin classique sinon', () => {
    writeArt('ghibli');
    const g = mount();
    const bikes = g.querySelectorAll('[data-vehicle][data-kind="bike"]');
    expect(bikes.length).toBeGreaterThan(0);
    for (const b of bikes) expect(b.querySelector('[data-ghibli-bike] [data-bike-rider] [data-figure]')).not.toBeNull();
    localStorage.removeItem(ART_KEY);
    const c = mount();
    for (const b of c.querySelectorAll('[data-vehicle][data-kind="bike"]')) expect(b.querySelector('[data-figure]')).toBeNull();
  });
  it('les vélos ne se fondent plus (pas de transition d’opacité)', () => {
    const c = mount();
    for (const b of c.querySelectorAll<SVGGElement>('[data-vehicle][data-kind="bike"]')) {
      expect(b.style.transition).toBe('');
      expect(b.getAttribute('opacity')).toBeNull();
    }
  });
  it('pédalier : un tour (12 images) par CRANK_TURN unités', () => {
    expect(crankPhase(0)).toBe(0);
    expect(crankPhase(CRANK_TURN / 2)).toBe(6);
    expect(crankPhase(CRANK_TURN * 3 + 1)).toBe(0);
  });
});
