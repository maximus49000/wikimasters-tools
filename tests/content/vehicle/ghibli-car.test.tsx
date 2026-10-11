// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { useFigureRegistry } from '../../../src/content/figure/figure-host';
import { useCarRegistry } from '../../../src/content/vehicle/car-host';
import { GhibliCar, placeCar } from '../../../src/content/vehicle/ghibli-car';
import { genCar } from '../../../src/core/library/city/traffic/cars';
import { skyAt, sunTimes } from '../../../src/core/library/sky';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const sky = skyAt(12 * 60, sunTimes({ y: 2026, m: 10, d: 9 }, { lat: 48.85, lon: 2.35 }, 120));

let regs: { fig: ReturnType<typeof useFigureRegistry>; car: ReturnType<typeof useCarRegistry> } | null = null;
function Probe(): null {
  regs = { fig: useFigureRegistry(), car: useCarRegistry() };
  return null;
}
async function mount(dir: 1 | -1, arch: Parameters<typeof genCar>[1] = 'berline', seed = 11): Promise<HTMLElement> {
  const host = document.createElement('div');
  await act(async () =>
    createRoot(host).render(
      <svg>
        <Probe />
        <GhibliCar car={genCar(seed, arch, 0.2)} dir={dir} sky={sky} rainy={false} lights={false} />
      </svg>,
    ),
  );
  return host;
}
const tx = (el: Element | null): number => Number(el!.getAttribute('transform')!.match(/translate\(([-\d.]+)/)![1]);

describe('voiture Ghibli', () => {
  it('rend caisse, vitrage, deux roues, un conducteur ; aucun clipPath ni id', async () => {
    const host = await mount(1);
    expect(host.querySelector('[data-layer="body"]')?.getAttribute('href')).toBeTruthy();
    expect(host.querySelector('[data-layer="glazing"]')).not.toBeNull();
    expect(host.querySelector('[data-layer="interior"]')).not.toBeNull();
    expect(host.querySelectorAll('[data-wheel]')).toHaveLength(2);
    expect(host.querySelector('[data-seat="driver"] [data-figure]')).not.toBeNull();
    expect(host.querySelector('[data-cabin]')?.tagName.toLowerCase()).toBe('svg');
    expect(host.querySelector('clipPath')).toBeNull();
    expect(host.querySelector('[id]')).toBeNull();
  });
  it('cabriolet : occupants sans habitacle rogné', async () => {
    const host = await mount(1, 'cabriolet');
    expect(host.querySelector('[data-cabin]')?.tagName.toLowerCase()).toBe('g');
    expect(host.querySelector('[data-seat="driver"] [data-figure]')).not.toBeNull();
  });
  it('voie du fond : positions en miroir, pantins tournés vers la gauche', async () => {
    const right = await mount(1);
    const left = await mount(-1);
    const wr = [...right.querySelectorAll('[data-wheel]')].map(tx);
    const wl = [...left.querySelectorAll('[data-wheel]')].map(tx);
    expect(Math.max(...wr)).toBeGreaterThan(0);
    expect(wl.map((x) => -x).sort()).toEqual(wr.sort());
    expect(left.querySelector('[data-seat="driver"] [data-figure]')!.getAttribute('data-key')).toContain('|8|seated|');
    expect(right.querySelector('[data-seat="driver"] [data-figure]')!.getAttribute('data-key')).toContain('|0|seated|');
  });
  it('placeCar : roues qui tournent avec la distance, rien ne change à distance égale', async () => {
    const host = await mount(1);
    const node = host.querySelector('[data-ghibli-car]')!;
    const car = genCar(11, 'berline', 0.2);
    const wheel = (): string => host.querySelector('[data-wheel]')!.getAttribute('transform')!;
    placeCar(regs!.fig, regs!.car, node, { car, dist: 0, v: 0, lean: 0, seed: 1 }, 1, 10);
    const a = wheel();
    placeCar(regs!.fig, regs!.car, node, { car, dist: 0, v: 0, lean: 0, seed: 1 }, 1, 10);
    expect(wheel()).toBe(a);
    placeCar(regs!.fig, regs!.car, node, { car, dist: 30, v: 50, lean: 0.5, seed: 1 }, 1, 10.1);
    expect(wheel()).not.toBe(a);
    expect(host.querySelector('[data-seat="driver"]')!.getAttribute('transform')).toMatch(/translate\(0\.4/);
  });
});
