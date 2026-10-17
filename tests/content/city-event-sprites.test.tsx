// @vitest-environment jsdom
// tests/content/city-event-sprites.test.tsx
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { poseEventArt } from '../../src/content/city-event-art';
import { CityEventSprite } from '../../src/content/city-event-sprites';
import { FigureContext, FigureRegistry } from '../../src/content/figure/figure-host';
import { PropContext, PropRegistry } from '../../src/content/prop/prop-host';
import type { FestivityId } from '../../src/core/library/city/calendar';
import { EVENT_DEFS, type CityEvent } from '../../src/core/library/city/events';
import { outfitFor } from '../../src/core/library/city/people';
import { anchorsOf } from '../../src/core/library/figure/bake';
import { shapeOf, signatureOf } from '../../src/core/library/figure/dress';
import { facingYaw } from '../../src/core/library/figure/gait';
import { DOG_CYCLE_S, collarOf, dogOf } from '../../src/core/library/paint/props/dog';
import { hashString, mulberry32 } from '../../src/core/library/scene-world';
import { skyAt, sunTimes } from '../../src/core/library/sky';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const times = sunTimes({ y: 2026, m: 10, d: 9 }, { lat: 48.85, lon: 2.35 }, 120);
const sky = skyAt(12 * 60, times);
const ALL_FESTS: readonly FestivityId[] = ['bastille', 'music', 'easter', 'valentine'];
const draw = (event: CityEvent, still: boolean, opts: { lights?: boolean; fests?: readonly FestivityId[] } = {}): SVGSVGElement => {
  const host = document.createElement('div');
  act(() => createRoot(host).render(<svg><CityEventSprite event={event} sky={sky} still={still} lights={opts.lights ?? true} rainy={false} fests={opts.fests ?? ALL_FESTS} /></svg>));
  return host.querySelector('svg')!;
};
const ev = (id: CityEvent['id']): CityEvent => ({ key: `k-${id}`, id, layer: EVENT_DEFS.find((d) => d.id === id)!.layer, start: 0, end: 10, dir: 1, track: null, speed: 1, x0: 0, y: 0.1, pick: 0.4, variant: 0.6, yields: [] });

describe('CityEventSprite', () => {
  it.each(EVENT_DEFS.map((d) => d.id))('dessine %s sans id fixe', (id) => {
    const svg = draw(ev(id), false);
    expect(svg.querySelector(`[data-event-sprite="${id}"]`)).not.toBeNull();
    expect(svg.querySelector(`[data-event-sprite="${id}"]`)!.childElementCount).toBeGreaterThan(0);
    expect(svg.querySelector('[id]')).toBeNull();
  });
  it.each(EVENT_DEFS.map((d) => d.id))('%s : aucune animation en mouvement réduit', (id) => {
    expect(draw(ev(id), true).querySelectorAll('animate, animateTransform')).toHaveLength(0);
  });
  it('l’hélicoptère, l’ambulance et le feu d’artifice sont animés hors mouvement réduit', () => {
    for (const id of ['helicopter', 'ambulance', 'fireworks'] as const) expect(draw(ev(id), false).querySelectorAll('animate, animateTransform').length).toBeGreaterThan(0);
  });
  it('le groupe pressé porte des parapluies, le promeneur tient un chien', () => {
    expect(draw(ev('umbrella-group'), false).querySelectorAll('[data-umbrella]').length).toBe(3);
    expect(draw(ev('dog-walker'), false).querySelector('[data-dog]')).not.toBeNull();
  });
  it('ballons-lapins à Pâques, en cœur à la Saint-Valentin', () => {
    expect(draw(ev('fest-balloons'), false, { fests: ['easter'] }).querySelector('[data-balloon-kind="bunny"]')).not.toBeNull();
    expect(draw(ev('fest-balloons'), false, { fests: ['valentine'] }).querySelector('[data-balloon-kind="heart"]')).not.toBeNull();
    expect(draw(ev('fest-balloons'), false, { fests: ['valentine'] }).querySelector('[data-balloon-kind="bunny"]')).toBeNull();
  });
  it('les ballons et les cloches bougent hors mouvement réduit', () => {
    for (const id of ['fest-balloons', 'bells'] as const) expect(draw(ev(id), false).querySelectorAll('animate, animateTransform').length).toBeGreaterThan(0);
  });
});

// Ghibli (G5) : engins, grue, lueur, ballons, cloches, caisse du camion et vélo en images d'accessoires (registre cuit à la
// demande : repli classique sans SMIL, puis <image>) ; poses cycliques réglées sur le temps de l'événement ; feux d'artifice
// vectoriels en cellulo posés par la couche ; livreur en pantin.
describe('CityEventSprite Ghibli', () => {
  const IMAGED = ['plane', 'helicopter', 'drone', 'balloon', 'banner-plane', 'kite', 'crane', 'apartment', 'fest-balloons', 'bells', 'garbage-truck', 'delivery-bike'] as const;
  const CYCLED = ['helicopter', 'drone', 'balloon', 'banner-plane', 'kite', 'fest-balloons', 'bells'] as const;
  const mount = (event: CityEvent, still: boolean, now = 0, daylight = sky): { svg: SVGSVGElement; flush: () => Promise<void> } => {
    const jobs: (() => void)[] = [];
    const reg = new PropRegistry('t12', { schedule: (cb) => jobs.push(cb) });
    const host = document.createElement('div');
    act(() =>
      createRoot(host).render(
        <PropContext.Provider value={reg}>
          <FigureContext.Provider value={new FigureRegistry('t12f', { perFrame: 200 })}>
            <svg>
              <CityEventSprite event={event} sky={daylight} still={still} lights rainy={false} fests={ALL_FESTS} ghibli now={now} />
            </svg>
          </FigureContext.Provider>
        </PropContext.Provider>,
      ),
    );
    const flush = async (): Promise<void> => {
      for (let n = 0; jobs.length && n < 50; n++) await act(async () => jobs.shift()!());
    };
    return { svg: host.querySelector('svg')!, flush };
  };
  it.each(IMAGED)('%s : image d’accessoire après cuisson, repli classique avant, jamais de SMIL', async (id) => {
    const { svg, flush } = mount(ev(id), false);
    // Images d'accessoires seulement (les pantins du ripeur et du livreur posent aussi une <image>).
    const images = (): number => [...svg.querySelectorAll('image')].filter((i) => !i.closest('[data-figure]')).length;
    expect(images()).toBe(0);
    expect(svg.querySelector(`[data-event-sprite="${id}"]`)!.childElementCount).toBeGreaterThan(0);
    expect(svg.querySelectorAll('animate, animateTransform')).toHaveLength(0);
    await flush();
    expect(images()).toBeGreaterThan(0);
    expect(svg.querySelector('[id]')).toBeNull();
  });
  it('poses cycliques (hélicoptère, drone, montgolfière, banderole, cerf-volant, ballons, cloches) réglées sur le début de l’événement ; pose 0 en mouvement réduit', () => {
    for (const id of CYCLED) {
      const e = { ...ev(id), start: 1_000_000 };
      const c = mount(e, false).svg.querySelector('[data-prop-cycle]')!;
      expect(c, id).not.toBeNull();
      const period = Number(c.getAttribute('data-prop-cycle'));
      expect(period).toBeGreaterThan(0);
      // u = t/période + phase ≡ (t − start)/période : la phase vaut frac(−start/période).
      const phase = Number(c.getAttribute('data-cycle-phase'));
      const u = 1_000_000 / period + phase;
      expect(Math.abs(u - Math.round(u))).toBeLessThan(1e-6);
      expect(mount(e, true).svg.querySelector('[data-prop-cycle]'), `${id} still`).toBeNull();
    }
    for (const id of ['plane', 'crane', 'apartment', 'garbage-truck', 'delivery-bike'] as const) expect(mount(ev(id), false).svg.querySelector('[data-prop-cycle]'), id).toBeNull();
  });
  it('avion : traînée de condensation en 84 particules de jour, aucune la nuit ; la boucle la fait onduler', () => {
    const { svg } = mount(ev('plane'), false, 3);
    const trail = svg.querySelector('[data-contrail]')!;
    expect(trail.querySelectorAll('circle')).toHaveLength(84);
    const before = [...trail.querySelectorAll('circle')].map((c) => c.getAttribute('cy'));
    poseEventArt(svg.querySelector('[data-event-sprite]')!, ev('plane'), 5, false);
    expect([...trail.querySelectorAll('circle')].map((c) => c.getAttribute('cy'))).not.toEqual(before);
    expect(trail.querySelectorAll('circle')).toHaveLength(84);
    expect(mount(ev('plane'), false, 3, skyAt(23 * 60, times)).svg.querySelector('[data-contrail]')).toBeNull();
  });
  it('feux d’artifice : à u = 0,3 d’une fusée, 12 brins ; à u = 0,8, aucun ; mouvement réduit → 12 brins par fusée ; aucun SMIL', () => {
    const e = ev('fireworks');
    const sparks = (svg: Element, k: number): number => svg.querySelectorAll(`[data-rocket="${k}"] [data-spark]`).length;
    const at03 = mount(e, false, 1.8).svg; // fusée 0 : u = 1,8 / 6 = 0,3
    expect(sparks(at03, 0)).toBe(12);
    expect(at03.querySelectorAll('animate, animateTransform')).toHaveLength(0);
    expect(sparks(mount(e, false, 4.8).svg, 0)).toBe(0); // u = 0,8
    const still = mount(e, true, 4.8).svg;
    for (let k = 0; k < 5; k++) expect(sparks(still, k)).toBe(12);
    // La boucle rejoue la description : montée (u = 0,05), gerbe, puis rien.
    const node = at03.querySelector('[data-event-sprite]')!;
    poseEventArt(node, e, 0.3, false);
    expect(sparks(at03, 0)).toBe(0);
    expect(at03.querySelector('[data-rocket="0"] [data-rise]')).not.toBeNull();
    poseEventArt(node, e, 2.4, false);
    expect(sparks(at03, 0)).toBe(12);
    poseEventArt(node, e, 4.8, false);
    expect(at03.querySelector('[data-rocket="0"]')!.childElementCount).toBe(0);
  });
  it('re-rendu React après que la boucle a changé la structure (montée → gerbe, traînée) : aucune erreur, éléments SVG', () => {
    const e = ev('fireworks');
    const host = document.createElement('div');
    const root = createRoot(host);
    const render = (now: number, id: CityEvent['id'] = 'fireworks'): void =>
      act(() => root.render(<svg><CityEventSprite event={id === 'fireworks' ? e : ev(id)} sky={sky} still={false} lights rainy={false} fests={ALL_FESTS} ghibli now={now} /></svg>));
    render(1.8);
    const node = host.querySelector('[data-event-sprite]')!;
    // La boucle passe la fusée 0 en montée (3 nœuds au lieu d'une gerbe), puis React re-rend à un autre instant.
    poseEventArt(node, e, 0.3, false);
    expect(() => render(4.8)).not.toThrow();
    expect(() => render(2.4)).not.toThrow();
    expect(host.querySelectorAll('[data-rocket="0"] [data-spark]')).toHaveLength(12);
    for (const el of host.querySelectorAll('[data-rocket] *')) expect(el.namespaceURI).toBe('http://www.w3.org/2000/svg');
    // Traînée : la boucle peut changer le nombre de particules, puis React re-rend.
    render(3, 'plane');
    const plane = host.querySelector('[data-event-sprite]')!;
    for (let t = 0; t < 40; t += 0.37) poseEventArt(plane, ev('plane'), t, false);
    expect(() => render(17, 'plane')).not.toThrow();
    for (const el of host.querySelectorAll('[data-contrail] *')) expect(el.namespaceURI).toBe('http://www.w3.org/2000/svg');
    act(() => root.unmount());
  });
  it('grue : une image par côté de flèche, la boucle montre celle de l’instant (côté 1 au départ et en mouvement réduit, −1 après 20 s)', () => {
    const e = { ...ev('crane'), start: 100 };
    const { svg } = mount(e, false, 100);
    const sides = svg.querySelectorAll('[data-crane-side]');
    expect(sides).toHaveLength(2);
    const shown = (): string[] => [...svg.querySelectorAll('[data-crane-side]')].filter((g) => g.getAttribute('display') !== 'none').map((g) => g.getAttribute('data-crane-side')!);
    expect(shown()).toEqual(['1']);
    poseEventArt(svg.querySelector('[data-event-sprite]')!, e, 130, false);
    expect(shown()).toEqual(['-1']);
    poseEventArt(svg.querySelector('[data-event-sprite]')!, e, 130, true);
    expect(shown()).toEqual(['1']);
  });
  it('promeneur : chien en image `dog` à poses cycliques dans le repère translate(26 0), cuite dans le sens de marche ; pose 0 en mouvement réduit', async () => {
    for (const dir of [1, -1] as const) {
      const e = { ...ev('dog-walker'), dir, start: 1_000_000 };
      const { svg, flush } = mount(e, false);
      const dog = svg.querySelector('[data-dog]')!;
      expect(dog.getAttribute('transform')).toBe('translate(26 0)');
      const c = dog.querySelector('[data-prop-cycle]')!;
      expect(c, `dir ${dir}`).not.toBeNull();
      expect(Number(c.getAttribute('data-prop-cycle'))).toBe(DOG_CYCLE_S);
      const spec = JSON.parse(c.getAttribute('data-cycle-spec')!) as { id: string; args: { breed: number; coat: number }; dir: number };
      expect(spec.id).toBe('dog');
      expect(spec.dir).toBe(dir);
      expect(spec.args).toEqual(dogOf(hashString(`${e.key}|dog`)));
      // u = t/période + phase ≡ (t − start)/période.
      const u = 1_000_000 / DOG_CYCLE_S + Number(c.getAttribute('data-cycle-phase'));
      expect(Math.abs(u - Math.round(u))).toBeLessThan(1e-6);
      // Repli classique (sans SMIL) puis image ; dir = −1 : miroir de l'hôte annulé autour de l'image, jamais d'image retournée.
      expect(dog.querySelector('image')).toBeNull();
      expect(dog.querySelector('rect')).not.toBeNull();
      expect(svg.querySelectorAll('animate, animateTransform')).toHaveLength(0);
      await flush();
      const img = dog.querySelector('image')!;
      expect(img).not.toBeNull();
      expect(dog.querySelector('rect')).toBeNull();
      expect(img.closest('[transform="scale(-1 1)"]') !== null).toBe(dir === -1);
      const still = mount(e, true).svg.querySelector('[data-dog]')!;
      expect(still.querySelector('[data-prop-cycle]')).toBeNull();
    }
  });
  it('promeneur : la laisse du pantin finit au collier `collarOf` du chien posé à translate(26 0)', () => {
    for (const dir of [1, -1] as const) {
      const e = { ...ev('dog-walker'), dir };
      const leash = mount(e, false).svg.querySelector('[data-leash]')!;
      const end = leash.getAttribute('d')!.split(' ').slice(-2).map(Number);
      // Main (pose debout, bras « hold ») + bout de la laisse = collier, dans le repère du pantin (x multiplié par dir).
      const walker = outfitFor('stroller', mulberry32(hashString(e.key)));
      const hand = anchorsOf({ sig: signatureOf(shapeOf(walker, false)), yaw: facingYaw(dir), gait: 'stand', phase: 0, head: 0, arms: 'hold', lean: 0 }).handR;
      const [cx, cy] = collarOf(dogOf(hashString(`${e.key}|dog`)).breed);
      expect(end[0]! + hand[0]).toBeCloseTo((26 + cx) * dir, 0);
      expect(end[1]! + hand[1]).toBeCloseTo(cy, 0);
    }
  });
  it('promeneur classique inchangé : chien vectoriel animé, laisse au collier (22, −9), aucune image', () => {
    const svg = draw(ev('dog-walker'), false);
    const dog = svg.querySelector('[data-dog]')!;
    expect(dog.getAttribute('transform')).toBe('translate(26 0)');
    expect(dog.querySelectorAll('rect')).toHaveLength(3);
    expect(dog.querySelectorAll('animateTransform')).toHaveLength(2);
    expect(svg.querySelector('[data-prop-cycle]')).toBeNull();
    expect(svg.querySelector('image')).toBeNull();
    expect(svg.querySelector('path[d="M4 -20 Q14 -12 22 -9"]')).not.toBeNull();
  });
  it('vélo de livraison : livreur en pantin à la selle ; camion-poubelle : ripeur pantin et cône des phares conservés', () => {
    expect(mount(ev('delivery-bike'), false).svg.querySelector('[data-bike-rider] [data-figure]')).not.toBeNull();
    const truck = mount(ev('garbage-truck'), false).svg;
    expect(truck.querySelector('[data-figure]')).not.toBeNull();
    expect(truck.querySelector('path[fill="#FFE9A0"]')).not.toBeNull();
  });
});
