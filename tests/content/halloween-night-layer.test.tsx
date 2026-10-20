// @vitest-environment jsdom
// tests/content/halloween-night-layer.test.tsx — nuit d'Halloween dans la scène Ville (spec Halloween §5.4)
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ART_KEY, writeArt } from '../../src/content/art-setting';
import { CityLifeLayer } from '../../src/content/city-life';
import { dayContext } from '../../src/core/library/city/calendar';
import type { CityContext } from '../../src/core/library/city/intensity';
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
  for (const { root, host } of mounted.splice(0)) {
    act(() => root.unmount());
    host.remove();
  }
  localStorage.removeItem(ART_KEY);
  vi.unstubAllGlobals();
});
const make = (d: number, minutes: number, precip = 0): HTMLDivElement => {
  const date = { y: 2026, m: 10, d };
  const sky = skyAt(minutes, sunTimes(date, { lat: 48.85, lon: 2.35 }, 60));
  const city: CityContext = { minutes, day: dayContext(date, []), precip, snow: false, storm: false, daylight: sky.daylight };
  return render(<svg><CityLifeLayer width={1440} height={600} sky={sky} seed={3} city={city} rainy={precip > 0} /></svg>);
};

describe('nuit d’Halloween (Ghibli)', () => {
  it('le 31 à 19 h : groupes déguisés, enfants avec seau, passants déguisés', () => {
    writeArt('ghibli');
    const c = make(31, 19 * 60);
    expect(c.querySelector('[data-halloween-night]')).not.toBeNull();
    const groups = [...c.querySelectorAll('[data-hn-group]')];
    expect(groups.length).toBeGreaterThan(2);
    expect(c.querySelectorAll('[data-hn-kind="family"]').length).toBeGreaterThan(0);
    expect(c.querySelectorAll('[data-hn-fig][data-guise] [data-figure]').length).toBeGreaterThan(0);
    expect(c.querySelectorAll('[data-hn-held="bucket"], [data-hn-held="bag"]').length).toBeGreaterThan(0);
    expect(c.querySelectorAll('[data-ped][data-guise]').length).toBeGreaterThan(0);
    // un déguisé est un pantin 2D à signature de déguisement
    const sig = c.querySelector('[data-hn-fig][data-guise] [data-figure]')!.getAttribute('data-sig')!;
    expect(sig).toMatch(/\.g:/);
  });
  it('la veille et en classique : rien', () => {
    writeArt('ghibli');
    expect(make(30, 19 * 60).querySelector('[data-halloween-night]')).toBeNull();
    localStorage.removeItem(ART_KEY);
    expect(make(31, 19 * 60).querySelector('[data-halloween-night]')).toBeNull();
  });
  it('mouvement réduit : groupes debout, aucune porte ni farce', () => {
    writeArt('ghibli');
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('reduce'), addEventListener() {}, removeEventListener() {} }));
    const c = make(31, 21 * 60 + 30);
    expect(c.querySelectorAll('[data-hn-door]').length).toBe(0);
    expect(c.querySelectorAll('[data-hn-scare]').length).toBe(0);
  });
});
