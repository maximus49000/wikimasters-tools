// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { BusStopRiders, Crosswalk, TrafficFixtures, TrafficLane, type TrafficHandle } from '../../src/content/traffic-layer';
import { PropContext, PropRegistry } from '../../src/content/prop/prop-host';
import { cityMetrics } from '../../src/core/library/city/metrics';
import { HOLD_MAX_S, MARGIN, advance, agentView, warmTraffic, type Agent, type TrafficEnv } from '../../src/core/library/city/traffic/engine';
import { FigureContext, FigureRegistry, type Citizen3D } from '../../src/content/figure/figure-host';
import { EnterWait3D, GhibliFigure, gateEntering } from '../../src/content/figure/ghibli-figure';
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

describe('mobilier de rue peint (G5)', () => {
  // Registre d'accessoires à cuisson manuelle : les images ne sont cuites que lorsque `jobs` est vidé.
  async function render(ghibli: boolean): Promise<{ host: HTMLElement; handle: TrafficHandle; jobs: (() => void)[] }> {
    const handle: TrafficHandle = { world: warmTraffic({ width: 1080, seed: 4, unit: m.unit, startS: T0 }, env), env };
    const jobs: (() => void)[] = [];
    const reg = new PropRegistry('t', { schedule: (cb) => jobs.push(cb) });
    const host = document.createElement('div');
    await act(async () =>
      createRoot(host).render(
        <PropContext.Provider value={reg}>
          <svg>
            <Crosswalk handle={handle} metrics={m} sky={sky} ghibli={ghibli} />
            <TrafficFixtures handle={handle} metrics={m} sky={sky} still={false} frozenT={T0} side="far" ghibli={ghibli} />
            <TrafficFixtures handle={handle} metrics={m} sky={sky} still={false} frozenT={T0} side="near" ghibli={ghibli} />
          </svg>
        </PropContext.Provider>,
      ),
    );
    return { host, handle, jobs };
  }
  const bake = async (jobs: (() => void)[]): Promise<void> => {
    while (jobs.length) await act(async () => jobs.shift()!());
  };
  it('Ghibli : feu, arrêts et bandes en sprite classique avant cuisson, puis en <image> ; couleur du feu et appel lisibles sur le <g>', async () => {
    const { host, handle, jobs } = await render(true);
    expect(handle.world.light).not.toBeNull();
    expect(host.querySelector('image')).toBeNull();
    // Un feu par trottoir (côté `far` : poteau du trottoir des immeubles ; côté `near` : poteau d'en face), 3 lampes chacun.
    expect(host.querySelectorAll('circle[data-light-lamp]').length).toBe(6);
    expect(host.querySelectorAll('[data-crosswalk] rect').length).toBeGreaterThan(0);
    await bake(jobs);
    const poles = host.querySelectorAll('g[data-light-lamp]');
    expect(poles.length).toBe(2);
    for (const pole of poles) {
      expect(pole.getAttribute('data-light-lamp')).toBe(handle.world.light.color);
      expect(pole.getAttribute('data-call')).toBe(handle.world.light.pressedAt !== null ? 'true' : 'false');
      expect(pole.querySelector('image')).not.toBeNull();
      expect(pole.querySelector('circle')).toBeNull();
    }
    for (const stop of host.querySelectorAll('[data-bus-stop]')) expect(stop.querySelector('image')).not.toBeNull();
    expect(host.querySelectorAll('[data-crosswalk] image').length).toBeGreaterThan(0);
    expect(host.querySelectorAll('[data-crosswalk] rect').length).toBe(0);
  });
  it('Ghibli : le feu est posé sans miroir (scale positif), le classique garde son miroir', async () => {
    const g = await render(true);
    expect(scaleX(g.host.querySelector('g[data-light-lamp]')!)).toBeGreaterThan(0);
    const c = await render(false);
    expect(c.host.querySelector('image')).toBeNull();
    expect(c.jobs.length).toBe(0);
    // Classique : poteau d'en face retourné (scale négatif), lampes à leur opacité d'origine.
    const flipped = [...c.host.querySelectorAll('[data-traffic-fixtures="near"] g[transform]')].find((n) => scaleX(n) < 0);
    expect(flipped).toBeDefined();
    expect(c.host.querySelector('circle[data-light-lamp]')!.getAttribute('opacity')).toBe('0.18');
  });
});

// Retour du téléphone (pré-prod 1729) : un voyageur qui descend du bus apparaît en place, à la porte ; avec waitFor3D il restait
// caché jusqu'à 4 s (pendant sa descente) et surgissait sur le trottoir.
describe('voyageurs du bus et habitants 3D', () => {
  it('Ghibli : seul celui qui arrive par un bord attend sa 3D ; celui qui descend du bus est visible tout de suite', async () => {
    const line = { ref: '30', from: 'Hôtel de Ville', to: 'Louise Michel', colour: '#e6007e', stops: ['Hôtel de Ville', 'Lutin', 'Brisepotière', 'Louise Michel'] };
    const busEnv: TrafficEnv = { ...env, busLines: [line], arrivals: [{ key: 'b1', kind: 'bus', track: 'near', start: T0 - 3 }] };
    const world = warmTraffic({ width: 1080, seed: 4, unit: m.unit, startS: T0 }, busEnv);
    let t = T0;
    while (t < T0 + 600 && !world.stopCrowd.riders.some((p) => p.stage === 'alight')) advance(world, (t += 0.1), busEnv);
    const alight = world.stopCrowd.riders.find((p) => p.stage === 'alight');
    expect(alight).toBeDefined();
    const part = alight!.side === 'far' ? 'far' : 'near-step';
    const host = document.createElement('div');
    await act(async () => createRoot(host).render(<svg><BusStopRiders handle={{ world, env: busEnv }} metrics={m} sky={sky} rainy={false} still={false} ghibli frozenT={t} part={part} /></svg>));
    const fig = host.querySelector(`[data-rider="${alight!.id}"] [data-figure]`)!;
    expect(fig).not.toBeNull();
    expect(fig.hasAttribute('data-wait3d')).toBe(false);
    expect(fig.firstElementChild!.getAttribute('href')).not.toBeNull();
  });
});

// Retours S26 : les cyclistes (et pilotes, occupants) apparaissaient en pantin puis passaient en 3D sous les yeux. Le véhicule
// entre par un bord (MARGIN hors champ) : son personnage y attend sa 3D, véhicule caché ; entré dans le champ sans 3D, il prend
// le pantin de repli (jamais un vélo sans cycliste, jamais un cycliste qui surgit en place).
describe('cyclistes et habitants 3D', () => {
  it('vélo encore hors champ : caché, cycliste en attente de sa 3D (pas de pantin) ; dans le champ : toujours un cycliste', async () => {
    const bikeEnv: TrafficEnv = { ...env, demand: { near: 0.2, far: 0.2, bike: 3 } };
    const world = warmTraffic({ width: 1080, seed: 9, unit: m.unit, startS: T0 }, bikeEnv);
    const off = (a: Agent): boolean => { const x = agentView(world, a, world.t).x; return x < -12 * m.unit || x > 1080 + 12 * m.unit; };
    // Retenu au ras du bord (habitants 3D) : entre les deux, ni l'un ni l'autre n'est exigé (un pas de moteur près).
    const near = (a: Agent): boolean => { const x = agentView(world, a, world.t).x; return x < -4 * m.unit && x > -12 * m.unit; };
    let t = T0;
    while (t < T0 + 600 && !world.agents.some((a) => a.kind === 'bike' && off(a))) advance(world, (t += 0.1), bikeEnv);
    expect(world.agents.some((a) => a.kind === 'bike' && off(a))).toBe(true);
    const anchors = { handR: [9, -23], handL: [-9, -23], hands: [0, -23], head: [0, -42], headTop: [0, -50], nape: [0, -36], seat: [0, -20] } as const;
    // Rendu 3D dont la base n'est jamais prête : rien ne passe en 3D pendant le test.
    const fake: Citizen3D = { ready: () => false, prepare() {}, render: () => ({ url: 'data:image/png;base64,3D', anchors }), dispose() {} };
    const figures = new FigureRegistry('tbike', { citizens: () => fake, now: () => 0 });
    const host = document.createElement('div');
    await act(async () =>
      createRoot(host).render(
        <FigureContext.Provider value={figures}>
          <svg>
            <TrafficLane handle={{ world, env: bikeEnv }} lane="near" metrics={m} sky={sky} lights={false} rainy={false} still={false} ghibli fests={[]} eventsByKey={new Map()} frozenT={world.t} />
          </svg>
        </FigureContext.Provider>,
      ),
    );
    let offSeen = 0;
    for (const node of host.querySelectorAll('[data-kind="bike"]')) {
      const a = world.agents.find((x) => x.id === node.getAttribute('data-life-id'))!;
      const rider = node.querySelector('[data-bike-rider] [data-figure]')!;
      const drawn = rider.firstElementChild!.getAttribute('href') !== null;
      if (off(a)) {
        offSeen++;
        expect(drawn).toBe(false);
        expect(node.getAttribute('visibility')).toBe('hidden');
      } else if (!near(a)) expect(drawn).toBe(true);
    }
    expect(offSeen).toBeGreaterThan(0);
  });
  it('véhicule hors champ en attente : relevé pour le moteur, retenu avant le bord (HOLD_MAX_S au plus), puis entre', async () => {
    const bikeEnv: TrafficEnv = { ...env, demand: { near: 0.2, far: 0.2, bike: 3 } };
    const world = warmTraffic({ width: 1080, seed: 9, unit: m.unit, startS: T0 }, bikeEnv);
    let t = T0;
    while (t < T0 + 600 && !world.agents.some((a) => a.kind === 'bike' && a.s + a.half < 40 * m.unit)) advance(world, (t += 0.1), bikeEnv);
    const anchors = { handR: [9, -23], handL: [-9, -23], hands: [0, -23], head: [0, -42], headTop: [0, -50], nape: [0, -36], seat: [0, -20] } as const;
    const fake: Citizen3D = { ready: () => false, prepare() {}, render: () => ({ url: 'data:image/png;base64,3D', anchors }), dispose() {} };
    const figures = new FigureRegistry('thold', { citizens: () => fake, now: () => 0 });
    const handle: TrafficHandle = { world, env: bikeEnv };
    const host = document.createElement('div');
    await act(async () =>
      createRoot(host).render(
        <FigureContext.Provider value={figures}>
          <svg>
            <TrafficLane handle={handle} lane="near" metrics={m} sky={sky} lights={false} rainy={false} still={false} ghibli fests={[]} eventsByKey={new Map()} frozenT={world.t} />
          </svg>
        </FigureContext.Provider>,
      ),
    );
    const waiting = world.agents.filter((a) => a.kind === 'bike' && a.s + a.half <= MARGIN * m.unit && handle.wait3D?.has(a.id));
    expect(waiting.length).toBeGreaterThan(0);
    const bike = waiting[0]!;
    const t0 = world.t;
    let entered = 0;
    for (let k = 1; k <= 60 && !entered; k++) {
      advance(world, t0 + k * 0.1, bikeEnv, handle.wait3D);
      if (bike.s + bike.half > MARGIN * m.unit) entered = world.t;
    }
    expect(entered - t0).toBeGreaterThanOrEqual(HOLD_MAX_S - 0.2);
    expect(entered).toBeGreaterThan(0); // puis entre (au ralenti hors champ, il passe le bord après la retenue)
  });
  it('gateEntering : hors champ, attend la 3D ; la 3D arrive : figure en 3D, groupe montrable ; dans le champ sans 3D : pantin', async () => {
    const anchors = { handR: [9, -23], handL: [-9, -23], hands: [0, -23], head: [0, -42], headTop: [0, -50], nape: [0, -36], seat: [0, -20] } as const;
    let ready = false;
    const fake: Citizen3D = { ready: () => ready, prepare() {}, render: () => ({ url: 'data:image/png;base64,3D', anchors }), dispose() {} };
    const figures = new FigureRegistry('tgate', { citizens: () => fake, now: () => 0 });
    const host = document.createElement('div');
    const o = { skin: '#F2C9A5', hair: 'short', hairColor: '#4a2e1e', hatColor: '#000000', top: 'sweater', topColor: '#C0463A', bottom: 'jeans', bottomColor: '#243044', accessory: 'none', accessoryColor: '#5A6B7A' } as const;
    await act(async () =>
      createRoot(host).render(
        <FigureContext.Provider value={figures}>
          <svg>
            <EnterWait3D.Provider value>
              <g data-a=""><GhibliFigure outfit={o} sky={sky} rainy={false} umbrella={false} initial={{ yaw: 1, gait: 'pedal', phase: 0, head: 0 }} citizen={1} /></g>
              <g data-b=""><GhibliFigure outfit={o} sky={sky} rainy={false} umbrella={false} initial={{ yaw: 1, gait: 'pedal', phase: 0, head: 0 }} citizen={2} /></g>
            </EnterWait3D.Provider>
          </svg>
        </FigureContext.Provider>,
      ),
    );
    const a = host.querySelector('[data-a]')!;
    const b = host.querySelector('[data-b]')!;
    expect(gateEntering(figures, a, false)).toBe(false);
    expect(a.querySelector('[data-figure]')!.hasAttribute('data-key')).toBe(false);
    ready = true;
    for (let i = 0; i < 4; i++) figures.flush();
    expect(gateEntering(figures, a, false)).toBe(true);
    expect(a.querySelector('[data-figure]')!.getAttribute('data-key')).toMatch(/@3d$/);
    ready = false;
    const fb = b.querySelector('[data-figure]')!;
    // Figure b : son habitant pas encore rendu, dans le champ → pantin de repli tout de suite.
    expect(gateEntering(figures, b, true)).toBe(true);
    expect(fb.getAttribute('data-key')).not.toBeNull();
  });
});
