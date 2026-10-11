// @vitest-environment jsdom
// tests/content/city-life-ghibli.test.tsx
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { ART_KEY, writeArt } from '../../src/content/art-setting';
import { CityLifeLayer, pedPose } from '../../src/content/city-life';
import { dayContext } from '../../src/core/library/city/calendar';
import type { CityContext } from '../../src/core/library/city/intensity';
import { cityMetrics } from '../../src/core/library/city/metrics';
import { pedestriansFor } from '../../src/core/library/city/people';
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
});
const times = sunTimes({ y: 2026, m: 10, d: 9 }, { lat: 48.85, lon: 2.35 }, 120);
const make = (): HTMLDivElement => {
  const minutes = 12 * 60;
  const sky = skyAt(minutes, times);
  const city: CityContext = { minutes, day: dayContext({ y: 2026, m: 10, d: 9 }, []), precip: 0, snow: false, storm: false, daylight: sky.daylight };
  return render(<svg><CityLifeLayer width={720} height={340} sky={sky} seed={1} city={city} rainy={false} /></svg>);
};

describe('passants Ghibli', () => {
  it('classique : aucun pantin', () => {
    const c = make();
    expect(c.querySelectorAll('[data-ped] [data-figure]').length).toBe(0);
  });
  it('Ghibli : chaque passant est un pantin, sans miroir', () => {
    writeArt('ghibli');
    const c = make();
    const peds = [...c.querySelectorAll('[data-ped]')];
    expect(peds.length).toBeGreaterThan(0);
    for (const p of peds) {
      expect(p.querySelector(':scope > [data-figure]')).not.toBeNull();
      expect(p.getAttribute('transform')).not.toMatch(/scale\(-/);
    }
  });
  it('Ghibli : un nœud inactif (passant, habitant chez lui, seuil vide) n’a pas de href ; un nœud actif en a un', () => {
    writeArt('ghibli');
    const c = make();
    const nodes = [...c.querySelectorAll('[data-ped], [data-resident], svg[data-resident-door]')];
    const off = nodes.filter((n) => n.getAttribute('data-active') === 'false');
    const on = nodes.filter((n) => n.getAttribute('data-active') === 'true');
    expect(off.length).toBeGreaterThan(0);
    expect(on.length).toBeGreaterThan(0);
    for (const n of off) for (const u of n.querySelectorAll('[data-figure] > image')) expect(u.hasAttribute('href')).toBe(false);
    const lit = on.flatMap((n) => [...n.querySelectorAll('[data-figure] > image')]);
    expect(lit.length).toBeGreaterThan(0);
    for (const u of lit) expect(u.getAttribute('href')).toMatch(/^data:image\/png/);
  });
  it('bascule classique → Ghibli pendant que la scène tourne', () => {
    const c = make();
    act(() => writeArt('ghibli'));
    expect(c.querySelectorAll('[data-ped] [data-figure]').length).toBeGreaterThan(0);
  });
  it('pose : profil selon le sens, phase liée à la distance', () => {
    const m = cityMetrics(340);
    const p = pedestriansFor(720, 1)[0]!;
    const a = pedPose(p, m, 100);
    expect(a.yaw).toBe(p.dir > 0 ? 0 : 8);
    expect(a.gait).toBe('walk');
    expect(a.phase).toBeGreaterThanOrEqual(0);
    expect(a.phase).toBeLessThan(12);
  });
});
