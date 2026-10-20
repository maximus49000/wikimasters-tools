// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { FigureContext, FigureRegistry, useFigureRegistry, type Citizen3D } from '../../../src/content/figure/figure-host';
import { useCarRegistry } from '../../../src/content/vehicle/car-host';
import { GhibliCar, placeCar } from '../../../src/content/vehicle/ghibli-car';
import { EnterWait3D } from '../../../src/content/figure/ghibli-figure';
import { genCar } from '../../../src/core/library/city/traffic/cars';
import { carArt } from '../../../src/core/library/city/traffic/car-art';
import { lookOfCar, type VehicleLook } from '../../../src/core/library/city/traffic/look';
import { specialLook } from '../../../src/core/library/city/traffic/special-art';
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
        <GhibliCar look={lookOfCar(genCar(seed, arch, 0.2))} dir={dir} sky={sky} rainy={false} lights={false} />
      </svg>,
    ),
  );
  return host;
}
const night = skyAt(23 * 60, sunTimes({ y: 2026, m: 10, d: 9 }, { lat: 48.85, lon: 2.35 }, 120));
const tx = (el: Element | null): number => Number(el!.getAttribute('transform')!.match(/translate\(([-\d.]+)/)![1]);

describe('voiture Ghibli', () => {
  it('jupes et ailes PAR-DESSUS les roues', async () => {
    // Limousine : toujours des jupes.
    const host = await mount(1, 'limousine', 3);
    const order = [...host.querySelectorAll('[data-wheel], [data-layer="over"]')].map((e) => (e.hasAttribute('data-wheel') ? 'wheel' : 'over'));
    expect(order).toEqual(['wheel', 'wheel', 'over']);
  });
  it('jour → nuit : l’image affichée reste tant que la nouvelle n’est pas peinte, puis la boucle la pose', async () => {
    const car = genCar(12, 'break', 0.3);
    const host = document.createElement('div');
    const root = createRoot(host);
    const draw = async (s: typeof sky, still = false): Promise<void> =>
      act(async () =>
        root.render(
          <svg>
            <Probe />
            <GhibliCar look={lookOfCar(car)} dir={1} sky={s} rainy={false} lights={false} still={still} />
          </svg>,
        ),
      );
    await draw(sky);
    const body = (): Element => host.querySelector('[data-layer="body"]')!;
    const dayKey = body().getAttribute('data-shown');
    await draw(night);
    const want = body().getAttribute('data-want');
    expect(want).not.toBe(dayKey);
    expect(body().getAttribute('data-shown')).toBe(dayKey);
    regs!.car.flush();
    placeCar(regs!.fig, regs!.car, host.querySelector('[data-ghibli-car]')!, { look: lookOfCar(car), dist: 0, v: 0, lean: 0, seed: 1 }, 1, 1);
    expect(body().getAttribute('data-shown')).toBe(want);
  });
  it('mouvement réduit : la nouvelle palette est posée tout de suite (aucune boucle ne la poserait)', async () => {
    const car = genCar(13, 'citadine', 0.6);
    const host = document.createElement('div');
    const root = createRoot(host);
    for (const s of [sky, night])
      await act(async () =>
        root.render(
          <svg>
            <GhibliCar look={lookOfCar(car)} dir={1} sky={s} rainy={false} lights={false} still />
          </svg>,
        ),
      );
    const b = host.querySelector('[data-layer="body"]')!;
    expect(b.getAttribute('data-shown')).toBe(b.getAttribute('data-want'));
  });
  it('rend caisse, vitrage, deux roues, un conducteur ; aucun clipPath ni id', async () => {
    const host = await mount(1);
    expect(host.querySelector('[data-layer="body"]')?.getAttribute('href')).toBeTruthy();
    expect(host.querySelector('[data-layer="glazing"]')).not.toBeNull();
    expect(host.querySelector('[data-layer="interior"]')).not.toBeNull();
    expect(host.querySelectorAll('[data-wheel]')).toHaveLength(2);
    expect(host.querySelector('[data-role="driver"] [data-figure]')).not.toBeNull();
    expect(host.querySelector('[data-cabin]')?.tagName.toLowerCase()).toBe('svg');
    expect(host.querySelector('clipPath')).toBeNull();
    expect(host.querySelector('[id]')).toBeNull();
  });
  it('cabriolet : occupants sans habitacle rogné', async () => {
    const host = await mount(1, 'cabriolet');
    expect(host.querySelector('[data-cabin]')?.tagName.toLowerCase()).toBe('g');
    // Occupants SOUS la caisse : elle cache leurs jambes sous la ceinture.
    const order = [...host.querySelectorAll('[data-cabin], [data-layer="body"]')].map((e) => (e.hasAttribute('data-cabin') ? 'cabin' : 'body'));
    expect(order).toEqual(['cabin', 'body']);
    expect(host.querySelector('[data-role="driver"] [data-figure]')).not.toBeNull();
  });
  it('voie du fond : positions en miroir, pantins tournés vers la gauche', async () => {
    const right = await mount(1);
    const left = await mount(-1);
    const wr = [...right.querySelectorAll('[data-wheel]')].map(tx);
    const wl = [...left.querySelectorAll('[data-wheel]')].map(tx);
    expect(Math.max(...wr)).toBeGreaterThan(0);
    expect(wl.map((x) => -x).sort()).toEqual(wr.sort());
    expect(left.querySelector('[data-role="driver"] [data-figure]')!.getAttribute('data-key')).toContain('|8|seated|');
    expect(right.querySelector('[data-role="driver"] [data-figure]')!.getAttribute('data-key')).toContain('|0|seated|');
  });
  it('placeCar : roues qui tournent avec la distance, rien ne change à distance égale', async () => {
    const host = await mount(1);
    const node = host.querySelector('[data-ghibli-car]')!;
    const car = genCar(11, 'berline', 0.2);
    const wheel = (): string => host.querySelector('[data-wheel]')!.getAttribute('transform')!;
    placeCar(regs!.fig, regs!.car, node, { look: lookOfCar(car), dist: 0, v: 0, lean: 0, seed: 1 }, 1, 10);
    const a = wheel();
    placeCar(regs!.fig, regs!.car, node, { look: lookOfCar(car), dist: 0, v: 0, lean: 0, seed: 1 }, 1, 10);
    expect(wheel()).toBe(a);
    placeCar(regs!.fig, regs!.car, node, { look: lookOfCar(car), dist: 30, v: 50, lean: 0.5, seed: 1 }, 1, 10.1);
    expect(wheel()).not.toBe(a);
    expect(host.querySelector('[data-role="driver"]')!.getAttribute('transform')).toMatch(/translate\(0\.4/);
  });
  it('texte peint redressé sur la voie du fond, gyrophares qui clignotent, sièges multiples posés', async () => {
    const art = { ...carArt(genCar(11, 'berline', 0.2)) };
    art.seats = [...art.seats, { ...art.seats[0]!, role: 'rear', x: art.seats[0]!.x - 9 }, { ...art.seats[0]!, role: 'rear', x: art.seats[0]!.x - 15 }];
    art.beacons = [{ x: 0, y: -24, w: 4, h: 2.4, on: '#4f7bff', off: '#22305a' }];
    const look: VehicleLook = { key: 'test|multi', arch: 'test', art, rim: 'tôle', rimColor: '#d9d6cf' };
    const host = document.createElement('div');
    await act(async () =>
      createRoot(host).render(
        <svg>
          <Probe />
          <GhibliCar look={look} dir={-1} sky={sky} rainy={false} lights={false} />
        </svg>,
      ),
    );
    const node = host.querySelector('[data-ghibli-car]')!;
    expect(host.querySelectorAll('[data-role="rear"]')).toHaveLength(2);
    placeCar(regs!.fig, regs!.car, node, { look, dist: 10, v: 40, lean: 0.5, seed: 1 }, -1, 1);
    for (const s of host.querySelectorAll('[data-role="rear"]')) expect(s.getAttribute('transform')).toMatch(/translate\(-0\.4/);
    const b = (): string => host.querySelector('[data-beacon]')!.getAttribute('fill')!;
    placeCar(regs!.fig, regs!.car, node, { look, dist: 10, v: 40, lean: 0, seed: 1 }, -1, 1.0);
    const a = b();
    placeCar(regs!.fig, regs!.car, node, { look, dist: 10, v: 40, lean: 0, seed: 1 }, -1, 1.34);
    expect(b()).not.toBe(a);
  });
});

describe('voiture Ghibli sans boucle (V5)', () => {
  const look = specialLook({ id: 'crew-van', seed: 1 });
  const render = async (el: React.ReactElement): Promise<HTMLElement> => {
    const host = document.createElement('div');
    await act(async () => createRoot(host).render(<svg><Probe />{el}</svg>));
    return host;
  };
  it('roll : angle = x / r, transition des roues = celle du véhicule', async () => {
    const host = await render(<GhibliCar look={look} dir={1} sky={sky} rainy={false} lights={false} roll={{ x: 40, move: 'transform 60s linear' }} paintNow />);
    const spin = host.querySelectorAll<SVGGElement>('[data-wheel-spin]');
    expect(spin).toHaveLength(2);
    expect(spin[0]!.style.transform).toBe(`rotate(${(((40 / 4) * 180) / Math.PI).toFixed(2)}deg)`);
    expect(spin[0]!.style.transition).toBe('transform 60s linear');
  });
  it('paintNow : au rendu suivant (nuit) la nouvelle image est posée sans boucle', async () => {
    const host = document.createElement('div');
    const root = createRoot(host);
    for (const s of [sky, night]) await act(async () => root.render(<svg><GhibliCar look={look} dir={-1} sky={s} rainy={false} lights={false} roll={{ x: 0 }} paintNow /></svg>));
    const b = host.querySelector('[data-layer="body"]')!;
    expect(b.getAttribute('data-shown')).toBe(b.getAttribute('data-want'));
    for (const img of host.querySelectorAll('image')) expect(img.getAttribute('href')).toBeTruthy();
  });
  it('occupied faux : aucun siège ni volant', async () => {
    const host = await render(<GhibliCar look={look} dir={1} sky={sky} rainy={false} lights={false} occupied={false} />);
    expect(host.querySelectorAll('[data-seat]')).toHaveLength(0);
    expect(host.querySelector('[data-steer]')).toBeNull();
  });
  it('tenue imposée par le siège (uniforme)', async () => {
    const host = await render(<GhibliCar look={specialLook({ id: 'army-truck', seed: 2 })} dir={1} sky={sky} rainy={false} lights={false} />);
    expect(host.querySelector('[data-role="driver"] [data-figure]')!.getAttribute('data-key')).toBeTruthy();
  });
  it('blink : <animate> sur les gyrophares, aucun en mouvement réduit', async () => {
    const lift = specialLook({ id: 'lift', seed: 1 });
    expect((await render(<GhibliCar look={lift} dir={1} sky={sky} rainy={false} lights={false} blink />)).querySelectorAll('[data-beacon] animate')).toHaveLength(1);
    expect((await render(<GhibliCar look={lift} dir={1} sky={sky} rainy={false} lights={false} blink still />)).querySelectorAll('[data-beacon] animate')).toHaveLength(0);
  });
  it('mouvement réduit : pas de transition sur les roues', async () => {
    const host = await render(<GhibliCar look={look} dir={1} sky={sky} rainy={false} lights={false} roll={{ x: 10, move: 'transform 60s linear' }} still />);
    expect(host.querySelector<SVGGElement>('[data-wheel-spin]')!.style.transition).toBe('');
  });
});

describe('voiture Ghibli : occupants 3D', () => {
  it('occupant d’une voiture qui arrive (EnterWait3D, circulation) : rien tant que sa 3D se rend (voiture encore hors champ), puis directement en 3D, jamais le pantin', async () => {
    const anchors = { handR: [9, -23], handL: [-9, -23], hands: [0, -23], head: [0, -42], headTop: [0, -50], nape: [0, -36], seat: [0, -20] } as const;
    const fake: Citizen3D = { ready: () => true, prepare() {}, render: () => ({ url: 'data:image/png;base64,3D', anchors }), dispose() {} };
    const fig = new FigureRegistry('tcar', { citizens: () => fake, now: () => 0 });
    const host = document.createElement('div');
    await act(async () =>
      createRoot(host).render(
        <FigureContext.Provider value={fig}>
          <svg>
            <EnterWait3D.Provider value>
              <GhibliCar look={lookOfCar(genCar(11, 'berline', 0.2))} dir={1} sky={sky} rainy={false} lights={false} />
            </EnterWait3D.Provider>
          </svg>
        </FigureContext.Provider>,
      ),
    );
    const driver = host.querySelector('[data-seat] [data-figure]')!;
    const keys: (string | null)[] = [driver.getAttribute('data-key')];
    for (let i = 0; i < 3; i++) {
      fig.flush();
      keys.push(driver.getAttribute('data-key'));
    }
    expect(keys.filter((k) => k !== null && !k.includes('@3d'))).toEqual([]);
    expect(keys.at(-1)).toMatch(/@3d$/);
  });
});

// En dernier : ces voitures de nuit peignent des couches dans le cache commun des sprites.
describe('voiture Ghibli : phares', () => {
  it('phares de nuit en dégradés (lueur, faisceau abaissé jusqu’au sol, tache sur la chaussée), plus vifs sous la pluie', async () => {
    const draw = async (dir: 1 | -1, rainy: boolean): Promise<HTMLElement> => {
      const host = document.createElement('div');
      await act(async () => createRoot(host).render(<svg><Probe /><GhibliCar look={lookOfCar(genCar(11, 'berline', 0.2))} dir={dir} sky={night} rainy={rainy} lights /></svg>));
      return host;
    };
    const host = await draw(1, false);
    const hl = host.querySelector('[data-headlight]')!;
    // aucune forme à aplat : tout est peint par des dégradés propres à la voiture
    for (const shape of hl.querySelectorAll('circle, path, ellipse')) expect(shape.getAttribute('fill')).toMatch(/^url\(#beam/);
    const beam = hl.querySelector('linearGradient')!;
    expect(Number(beam.getAttribute('x2'))).toBeGreaterThan(Number(beam.getAttribute('x1'))); // vers l'avant (sens 1)
    const ys = hl.querySelector('path')!.getAttribute('d')!.match(/-?[\d.]+/g)!.map(Number).filter((_, i) => i % 2 === 1);
    expect(Math.max(...ys)).toBeCloseTo(-0.2, 5); // le bas du faisceau touche le sol
    const back = (await draw(-1, false)).querySelector('[data-headlight] linearGradient')!;
    expect(Number(back.getAttribute('x2'))).toBeLessThan(Number(back.getAttribute('x1')));
    const op = (h: HTMLElement): number => Number(h.querySelector('[data-headlight] linearGradient stop')!.getAttribute('stop-opacity'));
    expect(op(await draw(1, true))).toBeGreaterThan(op(host));
    // deux voitures : identifiants de dégradés distincts
    const two = document.createElement('div');
    await act(async () => createRoot(two).render(<svg><Probe /><GhibliCar look={lookOfCar(genCar(11, 'berline', 0.2))} dir={1} sky={night} rainy={false} lights /><GhibliCar look={lookOfCar(genCar(12, 'break', 0.2))} dir={1} sky={night} rainy={false} lights /></svg>));
    const ids = [...two.querySelectorAll('[data-headlight] linearGradient')].map((g) => g.id);
    expect(new Set(ids).size).toBe(2);
  });
});
