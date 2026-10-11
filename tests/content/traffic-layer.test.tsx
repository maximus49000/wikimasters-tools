// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { BusStopRiders, TrafficFixtures, TrafficLane, type TrafficHandle } from '../../src/content/traffic-layer';
import { cityMetrics } from '../../src/core/library/city/metrics';
import { advance, warmTraffic, type TrafficEnv } from '../../src/core/library/city/traffic/engine';
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

describe('véhicules à part dans la circulation', () => {
  // Monde large et avancé jusqu'à avoir une camionnette et un deux-roues sur la voie du premier plan.
  const busy = (e: TrafficEnv): TrafficHandle => {
    const world = warmTraffic({ width: 3000, seed: 7, unit: m.unit, startS: T0 }, e);
    for (let t = T0; !(world.agents.some((a) => a.kind === 'van' && a.track === 'near') && world.agents.some((a) => a.kind === 'moto' && a.track === 'near')) && t < T0 + 1200; t += 1) advance(world, t, e);
    return { world, env: e };
  };
  const render = async (handle: TrafficHandle, ghibli: boolean, still: boolean): Promise<HTMLElement> => {
    const host = document.createElement('div');
    await act(async () =>
      createRoot(host).render(
        <svg>
          <TrafficLane handle={handle} lane="near" metrics={m} sky={sky} lights={false} rainy={false} still={still} ghibli={ghibli} fests={[]} eventsByKey={new Map()} frozenT={handle.world.t} />
        </svg>,
      ),
    );
    return host;
  };
  it('Ghibli : camionnettes et deux-roues peints', async () => {
    const handle = busy(env);
    const host = await render(handle, true, true);
    for (const v of host.querySelectorAll('[data-kind="van"], [data-kind="moto"], [data-kind="bus"]')) expect(v.querySelector('[data-ghibli-car]')).not.toBeNull();
    expect(host.querySelector('[data-kind="moto"] [data-ghibli-car]')).not.toBeNull();
  });
  it('ambulance peinte, gyrophares figés en mouvement réduit', async () => {
    const e: TrafficEnv = { ...env, demand: { near: 0, far: 0, bike: 0 }, arrivals: [{ key: 'ev-a', kind: 'ambulance', track: 'near', start: T0 - 3 }] };
    const host = await render({ world: warmTraffic({ width: 3000, seed: 7, unit: m.unit, startS: T0 }, e), env: e }, true, true);
    const amb = host.querySelector('[data-kind="ambulance"] [data-ghibli-car][data-arch="ambulance"]')!;
    expect(amb).not.toBeNull();
    const fills = [...amb.querySelectorAll('[data-beacon]')].map((b) => b.getAttribute('fill'));
    expect(fills).toHaveLength(2);
    await act(async () => new Promise((r) => setTimeout(r, 400)));
    expect([...amb.querySelectorAll('[data-beacon]')].map((b) => b.getAttribute('fill'))).toEqual(fills);
  });
  it('classique : deux-roues motorisé en sprite de vélo avec pilote, aucune apparence peinte', async () => {
    const host = await render(busy(env), false, true);
    const moto = host.querySelector('[data-kind="moto"]')!;
    expect(moto).not.toBeNull();
    expect(moto.querySelector('[data-ghibli-car]')).toBeNull();
    expect(host.querySelector('[data-ghibli-car]')).toBeNull();
  });
});

describe('lignes de bus et arrêts (V4)', () => {
  const line = { ref: '30', from: 'Hôtel de Ville', to: 'Louise Michel', colour: '#e6007e', stops: ['Hôtel de Ville', 'Lutin', 'Brisepotière', 'Louise Michel'] };
  const busEnv: TrafficEnv = { ...env, busLines: [line], arrivals: [{ key: 'b1', kind: 'bus', track: 'near', start: T0 - 3 }] };
  async function render(ghibli: boolean): Promise<{ host: HTMLElement; handle: TrafficHandle }> {
    const handle: TrafficHandle = { world: warmTraffic({ width: 1080, seed: 4, unit: m.unit, startS: T0 }, busEnv), env: busEnv };
    const host = document.createElement('div');
    await act(async () =>
      createRoot(host).render(
        <svg>
          <TrafficFixtures handle={handle} metrics={m} sky={sky} still={false} frozenT={T0} side="far" />
          <TrafficLane handle={handle} lane="near" metrics={m} sky={sky} lights={false} rainy={false} still={false} ghibli={ghibli} fests={[]} eventsByKey={new Map()} frozenT={T0} />
          <BusStopRiders handle={handle} metrics={m} sky={sky} rainy={false} still={false} ghibli={ghibli} frozenT={T0} part="near" />
        </svg>,
      ),
    );
    return { host, handle };
  }
  it('Ghibli : bus à la ligne réelle, girouette latérale qui annonce l’arrêt de la scène, sans clipPath ni id', async () => {
    const { host, handle } = await render(true);
    const bus = host.querySelector('[data-kind="bus"]')!;
    expect(bus).not.toBeNull();
    const text = bus.querySelector('[data-marquee] text')!.textContent!;
    expect(text).toContain('30');
    expect(text).toContain(handle.world.stopNames.near);
    expect(host.querySelector('clipPath')).toBeNull();
    expect(host.querySelector('[id]')).toBeNull();
    expect(host.querySelector('[data-bus-stop="near"]')!.getAttribute('data-stop-name')).toBe(handle.world.stopNames.near);
  });
  it('voyageurs : pantins en Ghibli, sprites classiques sinon ; la girouette latérale est réservée au Ghibli', async () => {
    const g = await render(true);
    advance(g.handle.world, T0 + 200, busEnv);
    for (const n of g.host.querySelectorAll('[data-rider]')) expect(n.querySelector('[data-figure]')).not.toBeNull();
    const c = await render(false);
    expect(c.host.querySelector('[data-marquee]')).toBeNull();
  });
});
