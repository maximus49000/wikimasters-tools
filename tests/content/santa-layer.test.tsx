// @vitest-environment jsdom
// tests/content/santa-layer.test.tsx
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SantaLayer } from '../../src/content/santa-layer';
import { cityFacades } from '../../src/core/library/city/facades';
import { cityMetrics } from '../../src/core/library/city/metrics';
import { SANTA_WINDOW_S, santaPassFor, santaRoof } from '../../src/core/library/city/santa';
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
  vi.unstubAllGlobals();
  for (const { root, host } of mounted.splice(0)) {
    act(() => root.unmount());
    host.remove();
  }
});

const W = 720;
const H = 340;
const SEED = 1;
const facades = cityFacades(W, H, SEED);
const ground = cityMetrics(H).ground;
const times = sunTimes({ y: 2026, m: 12, d: 24 }, { lat: 48.85, lon: 2.35 }, 60);
const night = skyAt(0, times);
const EVE = ['christmas-eve'];
const T0 = 1_790_000_000 / 900;

// Première tranche (à partir d'un instant fixe) qui livre sur un toit, ou qui ne livre pas.
const findPass = (deliverOnRoof: boolean) => {
  for (let n = Math.floor(T0); ; n++) {
    const pass = santaPassFor(n, SEED);
    const roof = pass.deliver ? santaRoof(pass, facades, ground, W) : null;
    if (deliverOnRoof ? roof !== null : !pass.deliver) return { pass, roof };
  }
};
const stubReduced = (): void => {
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('reduce'), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false }));
};
const mount = (T: number, fests: string[] = EVE, daylight = 0, still = false): HTMLDivElement => {
  vi.spyOn(Date, 'now').mockReturnValue(T * 1000);
  if (still) stubReduced();
  return render(
    <svg>
      <SantaLayer width={W} height={H} seed={SEED} sky={night} facades={facades} ground={ground} fests={fests} daylight={daylight} still={still} frozenT={T} />
    </svg>,
  );
};
const sleigh = (c: HTMLElement): SVGGElement => c.querySelector<SVGGElement>('[data-santa] > g')!;

describe('calque du père Noël', () => {
  const { pass, roof } = findPass(true);
  const at = (p: number): number => pass.start + p * SANTA_WINDOW_S;

  it('ne dessine rien hors du 24 décembre de nuit', () => {
    expect(mount(at(0.27), []).querySelector('[data-santa]')).toBeNull();
    expect(mount(at(0.27), EVE, 0.5).querySelector('[data-santa]')).toBeNull();
  });
  it('le 24 décembre de nuit, le calque existe', () => {
    expect(mount(at(0.27)).querySelector('[data-santa]')).not.toBeNull();
  });
  it('hors d’une fenêtre de passage, le traîneau est caché', () => {
    expect(sleigh(mount(pass.end + 1)).getAttribute('display')).toBe('none');
  });
  it('posé sur le toit pendant une livraison', () => {
    const g = sleigh(mount(at(0.27)));
    expect(g.getAttribute('display')).toBe('inline');
    expect(g.getAttribute('transform')).toBe(`translate(${roof!.cx.toFixed(1)} ${roof!.y.toFixed(1)}) scale(${pass.dir} 1)`);
  });
  it('caché derrière la cheminée : plus de personnage, fenêtre allumée', () => {
    const c = mount(at(0.5));
    expect(c.querySelector('[data-santa-figure]')).toBeNull();
    const w = c.querySelector('[data-santa-window]')!;
    expect(w.getAttribute('data-x')).toBe(String(roof!.lamp!.x));
    expect(w.getAttribute('data-y')).toBe(String(roof!.lamp!.y));
  });
  it('en vol, le père Noël est à bord et la fenêtre éteinte', () => {
    const c = mount(at(0.1));
    expect(c.querySelector('[data-santa-figure]')?.getAttribute('data-santa-where')).toBe('aboard');
    expect(c.querySelector('[data-santa-window]')).toBeNull();
  });
  it('mouvement réduit : seulement le traîneau posé sur son toit quand la tranche livre', () => {
    const c = mount(at(0.1), EVE, 0, true);
    const g = sleigh(c);
    expect(g.getAttribute('display')).toBe('inline');
    expect(g.getAttribute('transform')).toBe(`translate(${roof!.cx.toFixed(1)} ${roof!.y.toFixed(1)}) scale(${pass.dir} 1)`);
    expect(c.querySelector('animate')).toBeNull();
  });
  it('mouvement réduit : rien quand la tranche ne livre pas', () => {
    const simple = findPass(false);
    expect(sleigh(mount(simple.pass.start + 10, EVE, 0, true)).getAttribute('display')).toBe('none');
  });
});
