// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { TrafficLane, type TrafficHandle } from '../../src/content/traffic-layer';
import { cityMetrics } from '../../src/core/library/city/metrics';
import { warmTraffic, type TrafficEnv } from '../../src/core/library/city/traffic/engine';
import { skyAt, sunTimes } from '../../src/core/library/sky';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const sky = skyAt(12 * 60, sunTimes({ y: 2026, m: 10, d: 9 }, { lat: 48.85, lon: 2.35 }, 120));
const env: TrafficEnv = { demand: { near: 1, far: 1, bike: 0.3 }, closed: false, arrivals: [], deliveries: [], crowd: 0.5, crossPx: 90 };
const T0 = Date.now() / 1000;
const m = cityMetrics(340);

async function lane(which: 'near' | 'far', ghibli: boolean, still = false): Promise<{ host: HTMLElement; handle: TrafficHandle }> {
  const handle: TrafficHandle = { world: warmTraffic({ width: 1080, seed: 4, unit: m.unit, startS: T0 }, env), env };
  const host = document.createElement('div');
  await act(async () =>
    createRoot(host).render(
      <svg>
        <TrafficLane handle={handle} lane={which} metrics={m} sky={sky} lights={false} rainy={false} still={still} ghibli={ghibli} fests={[]} eventsByKey={new Map()} frozenT={T0} />
      </svg>,
    ),
  );
  return { host, handle };
}
const scaleX = (el: Element): number => Number(el.getAttribute('transform')!.match(/scale\(([-\d.]+)/)![1]);

describe('voitures dans la circulation', () => {
  it('Ghibli : les voitures sont des GhibliCar, jamais retournées, y compris sur la voie du fond', async () => {
    for (const which of ['near', 'far'] as const) {
      const { host } = await lane(which, true);
      const cars = [...host.querySelectorAll('[data-kind="car"]')];
      expect(cars.length).toBeGreaterThan(0);
      for (const c of cars) {
        expect(c.querySelector('[data-ghibli-car]')).not.toBeNull();
        expect(scaleX(c)).toBeGreaterThan(0);
        expect(c.querySelector('[data-ghibli-car]')!.getAttribute('data-dir')).toBe(which === 'far' ? '-1' : '1');
      }
    }
  });
  it('classique : sprite actuel à la longueur de la fiche', async () => {
    const { host, handle } = await lane('near', false);
    const node = host.querySelector('[data-kind="car"]')!;
    const a = handle.world.agents.find((x) => x.id === node.getAttribute('data-life-id'))!;
    expect(node.querySelector('[data-ghibli-car]')).toBeNull();
    expect(Number(node.querySelector('rect')!.getAttribute('width'))).toBeCloseTo(a.car!.L, 1);
  });
  it('fumée : un pool fixe de cercles en Ghibli ; aucune bouffée visible en mouvement réduit ; aucune en classique', async () => {
    const g = await lane('near', true);
    const puffs = g.host.querySelectorAll('[data-exhaust] circle');
    expect(puffs.length).toBe(96);
    // Premier placement : chaque voiture lâche sa première bouffée au pot.
    expect([...puffs].some((c) => Number(c.getAttribute('opacity')) > 0)).toBe(true);
    const s = await lane('near', true, true);
    for (const c of s.host.querySelectorAll('[data-exhaust] circle')) expect(c.getAttribute('opacity') ?? '0').toBe('0');
    const k = await lane('near', false);
    expect(k.host.querySelector('[data-exhaust]')).toBeNull();
  });
});
