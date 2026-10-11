// @vitest-environment jsdom
// tests/content/city-extras-ghibli.test.tsx — signes de fête des passants et figurants des événements en pantins (Ghibli)
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { ART_KEY, writeArt } from '../../src/content/art-setting';
import { CityEventSprite, eventWalkPose, eventWalked, poseEventFigures } from '../../src/content/city-event-sprites';
import { CityLifeLayer } from '../../src/content/city-life';
import { FigureContext, FigureRegistry } from '../../src/content/figure/figure-host';
import { dayContext } from '../../src/core/library/city/calendar';
import { EVENT_DEFS, type CityEvent } from '../../src/core/library/city/events';
import type { CityContext } from '../../src/core/library/city/intensity';
import { cityMetrics } from '../../src/core/library/city/metrics';
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
const sky = skyAt(12 * 60, times);
const metrics = cityMetrics(340);
// data-key = palette # sig|yaw|gait|phase|head|arms|lean
const keyParts = (f: Element): string[] => f.getAttribute('data-key')!.split('#').pop()!.split('|');

const city = (ymd: { y: number; m: number; d: number }): HTMLDivElement => {
  const minutes = 12 * 60;
  const c: CityContext = { minutes, day: dayContext(ymd, []), precip: 0, snow: false, storm: false, daylight: sky.daylight };
  return render(<svg><CityLifeLayer width={720} height={340} sky={sky} seed={1} city={c} rainy={false} /></svg>);
};

describe('signes de fête des passants (Ghibli)', () => {
  it('Saint-Valentin : le ballon est tenu à la main droite (bras hold), les accompagnants ne portent rien', () => {
    writeArt('ghibli');
    const c = city({ y: 2026, m: 2, d: 14 });
    const peds = [...c.querySelectorAll('[data-ped][data-mark="heart-balloon"][data-active="true"]')];
    expect(peds.length).toBeGreaterThan(0);
    for (const p of peds) {
      const fig = p.querySelector(':scope > [data-figure]')!;
      expect(fig.querySelector(':scope > [data-held="handR"] [data-mark-art="heart-balloon"]')).not.toBeNull();
      expect(keyParts(fig)[5]).toBe('hold');
      for (const comp of p.querySelectorAll(':scope > [data-companion] [data-figure]')) expect(comp.querySelector('[data-held]')).toBeNull();
    }
  });
  it('11 novembre : le coquelicot est à l’accroche headTop, bras de marche', () => {
    writeArt('ghibli');
    const c = city({ y: 2026, m: 11, d: 11 });
    const peds = [...c.querySelectorAll('[data-ped][data-mark="poppy"][data-active="true"]')];
    expect(peds.length).toBeGreaterThan(0);
    for (const p of peds) {
      const fig = p.querySelector(':scope > [data-figure]')!;
      expect(fig.querySelector(':scope > [data-held="headTop"] [data-mark-art="poppy"]')).not.toBeNull();
      expect(keyParts(fig)[5]).toBe('swing');
    }
  });
  it('classique : signes dessinés comme avant, aucun objet tenu', () => {
    const c = city({ y: 2026, m: 2, d: 14 });
    expect(c.querySelector('[data-ped] [data-mark-art="heart-balloon"]')).not.toBeNull();
    expect(c.querySelector('[data-held]')).toBeNull();
  });
});

const ev = (id: CityEvent['id'], dir: 1 | -1 = 1): CityEvent => ({ key: `k-${id}`, id, layer: EVENT_DEFS.find((d) => d.id === id)!.layer, start: 0, end: 100, dir, track: id === 'garbage-truck' ? 'near' : null, speed: 9, x0: 0, y: 0.1, pick: 0.4, variant: 0.6, yields: [] });
const draw = (event: CityEvent, ghibli: boolean, opts: { still?: boolean; rainy?: boolean; walked?: number; reg?: FigureRegistry } = {}): SVGSVGElement => {
  const host = render(
    <FigureContext.Provider value={opts.reg ?? new FigureRegistry('t9e', { perFrame: 200 })}>
      <svg>
        <CityEventSprite event={event} sky={sky} still={opts.still ?? false} lights={false} rainy={opts.rainy ?? false} fests={[]} ghibli={ghibli} walked={opts.walked ?? 0} />
      </svg>
    </FigureContext.Provider>,
  );
  return host.querySelector('svg')!;
};

describe('figurants des événements (Ghibli)', () => {
  it('classique : aucun pantin', () => {
    for (const id of ['dog-walker', 'umbrella-group', 'garbage-truck'] as const) expect(draw(ev(id), false).querySelector('[data-figure]')).toBeNull();
  });
  it('promeneur : pantin qui tient la laisse (main droite ; gauche sous la pluie, parapluie à droite), chien gardé', () => {
    const svg = draw(ev('dog-walker'), true);
    const figs = svg.querySelectorAll('[data-figure]');
    expect(figs).toHaveLength(1);
    expect(figs[0]!.querySelector(':scope > [data-held="handR"] [data-leash]')).not.toBeNull();
    expect(keyParts(figs[0]!)[5]).toBe('hold');
    expect(svg.querySelector('[data-dog]')).not.toBeNull();
    const wet = draw(ev('dog-walker'), true, { rainy: true }).querySelector('[data-figure]')!;
    expect(wet.querySelector(':scope > [data-held="handL"] [data-leash]')).not.toBeNull();
    expect(wet.getAttribute('data-sig')!.split('.')[4]).toBe('u');
  });
  it('groupe pressé : trois pantins sous leurs parapluies, phases décalées', () => {
    const figs = [...draw(ev('umbrella-group'), true, { walked: 40 }).querySelectorAll('[data-figure]')];
    expect(figs).toHaveLength(3);
    for (const f of figs) expect(f.getAttribute('data-sig')!.split('.')[4]).toBe('u');
    expect(new Set(figs.map((f) => keyParts(f)[3])).size).toBeGreaterThan(1);
  });
  it('ripeur : pantin en gilet, la main tendue vers la barre du camion', () => {
    const f = draw(ev('garbage-truck'), true).querySelector('[data-figure]')!;
    expect(f.getAttribute('data-sig')!.endsWith('.v')).toBe(true);
    expect(keyParts(f)[5]).toBe('reach');
  });
  it.each([1, -1] as const)('sens %i : jamais en miroir (le retournement du sprite est annulé), profil dans le sens de marche', (dir) => {
    const svg = draw(ev('umbrella-group', dir), true);
    for (const f of svg.querySelectorAll('[data-figure]')) {
      // Produit des signes des scale(x …) entre la figure et le sprite : le sprite est retourné par `dir` (placeEvent).
      let sign = dir as number;
      for (let n: Element | null = f; n && !n.hasAttribute('data-event-sprite'); n = n.parentElement) {
        const m = /scale\((-?[\d.]+)/.exec(n.getAttribute('transform') ?? '');
        if (m) sign *= Math.sign(Number(m[1]));
      }
      expect(sign).toBe(1);
      expect(keyParts(f)[1]).toBe(dir > 0 ? '0' : '8');
    }
  });
  it('pose de marche : la phase suit la distance, debout en mouvement réduit', () => {
    const e = ev('dog-walker');
    expect(eventWalked(e, 10, metrics)).toBeCloseTo((9 * 10) / (metrics.unit * 0.55), 5);
    const a = eventWalkPose(e, 0, false);
    const b = eventWalkPose(e, 6, false);
    expect(a.gait).toBe('walk');
    expect(a.phase).not.toBe(b.phase);
    expect(eventWalkPose(e, 6, true)).toMatchObject({ gait: 'stand', phase: 0 });
    expect(eventWalkPose(ev('dog-walker', -1), 6, false).yaw).toBe(8);
  });
  it('la boucle des événements avance les pas des figurants', () => {
    const reg = new FigureRegistry('t9l', { perFrame: 200 });
    const e = ev('umbrella-group');
    const svg = draw(e, true, { reg });
    const node = svg.querySelector('[data-event-sprite]')!;
    const phases = new Set<string>();
    for (let t = 0; t < 3; t += 0.1) {
      reg.flush();
      poseEventFigures(reg, node, e, t, metrics, false);
      phases.add(keyParts(node.querySelector('[data-figure]')!)[3]!);
    }
    expect(phases.size).toBeGreaterThan(3);
  });
});
