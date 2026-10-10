// @vitest-environment jsdom
// tests/content/install-layer.test.tsx
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CityLifeLayer } from '../../src/content/city-life';
import { InstallLayer } from '../../src/content/install-layer';
import { dayContext, type YMD } from '../../src/core/library/city/calendar';
import { doorsFor } from '../../src/core/library/city/doors';
import { absMinute, decorSetsFor, itemPhase } from '../../src/core/library/city/install';
import { lampsFor } from '../../src/core/library/city/lamps';
import { cityMetrics } from '../../src/core/library/city/metrics';
import { dayNumber } from '../../src/core/library/city/shops/hours';
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
const metrics = cityMetrics(H);
const times = sunTimes({ y: 2026, m: 7, d: 14 }, { lat: 48.85, lon: 2.35 }, 120);
const skyOf = (minutes: number) => skyAt(minutes, times);
const D13: YMD = { y: 2026, m: 7, d: 13 };
const D14: YMD = { y: 2026, m: 7, d: 14 };
const D15: YMD = { y: 2026, m: 7, d: 15 };
const ORDINARY: YMD = { y: 2026, m: 10, d: 10 };
const MUSIC: YMD = { y: 2026, m: 6, d: 21 };
const MUSIC_NEXT: YMD = { y: 2026, m: 6, d: 22 };

const layer = (date: YMD, minutes: number, still = false): HTMLDivElement =>
  render(
    <svg>
      <InstallLayer width={W} height={H} seed={SEED} sky={skyOf(minutes)} still={still} date={date} minutes={minutes} metrics={metrics} rainy={false} />
    </svg>,
  );
const count = (c: Element, sel: string): number => c.querySelectorAll(sel).length;
const LAMPS = lampsFor(W, SEED).length;
const FLAG_DOORS = doorsFor(W, H, SEED).filter((d) => d.hallU < 0.5).length;

describe('calque des équipes d’installation', () => {
  it('le banc est utile : il y a des lampadaires et des entrées pavoisables', () => {
    expect(LAMPS).toBeGreaterThan(1);
    expect(FLAG_DOORS).toBeGreaterThan(0);
  });

  it('13/7 à midi : une équipe à l’œuvre, des drapeaux déjà posés, d’autres pas encore', () => {
    const c = layer(D13, 720);
    expect(count(c, '[data-crew]')).toBeGreaterThan(0);
    expect(count(c, '[data-crew] [data-worker]')).toBeGreaterThan(0);
    const flags = count(c, '[data-decor-item][data-decor-kind="lamp-flag"]') + count(c, '[data-decor-item][data-decor-kind="door-flag"]');
    expect(flags).toBeGreaterThan(0);
    expect(flags).toBeLessThan(LAMPS + FLAG_DOORS);
  });

  it('14/7 à midi : tous les drapeaux de lampadaires et d’entrées sont posés, aucune équipe', () => {
    const c = layer(D14, 720);
    expect(count(c, '[data-decor-item][data-decor-kind="lamp-flag"]')).toBe(LAMPS);
    expect(count(c, '[data-decor-item][data-decor-kind="door-flag"]')).toBe(FLAG_DOORS);
    expect(count(c, '[data-decor-item][data-decor-kind="barrier"]')).toBeGreaterThan(0);
    expect(count(c, '[data-crew]')).toBe(0);
    expect(count(c, '[data-van], [data-lift]')).toBe(0);
  });

  it('15/7 à midi : une équipe dépose les drapeaux', () => {
    const c = layer(D15, 720);
    expect(count(c, '[data-crew][data-removing="true"]')).toBeGreaterThan(0);
    const flags = count(c, '[data-decor-item][data-decor-kind="lamp-flag"]') + count(c, '[data-decor-item][data-decor-kind="door-flag"]');
    expect(flags).toBeLessThan(LAMPS + FLAG_DOORS);
  });

  it('15/7 à 18 h : tout est retiré, plus personne', () => {
    const c = layer(D15, 18 * 60);
    expect(count(c, '[data-decor-item]')).toBe(0);
    expect(count(c, '[data-crew]')).toBe(0);
  });

  it('un jour ordinaire : rien', () => {
    const c = layer(ORDINARY, 720);
    expect(count(c, '[data-decor-item]')).toBe(0);
    expect(count(c, '[data-crew], [data-van], [data-lift], [data-ladder]')).toBe(0);
  });

  it('mouvement réduit : seuls les décors posés, aucune équipe ni animation', () => {
    const c = layer(D14, 720, true);
    expect(count(c, '[data-decor-item][data-decor-kind="lamp-flag"]')).toBe(LAMPS);
    expect(count(c, '[data-crew], [data-van], [data-lift], [data-ladder]')).toBe(0);
    expect(count(c, 'animate, animateTransform')).toBe(0);
    // En pleine pose : seuls les éléments « présents » (le décor en cours de pose n'est pas dessiné).
    const busy = layer(D13, 720, true);
    const today = dayNumber(D13);
    const present = decorSetsFor(D13, W, H, SEED)
      .flatMap((set) => set.items.map((item) => itemPhase(set, item, absMinute(today, 720), set.day)))
      .filter((p) => p.phase === 'present').length;
    expect(count(busy, '[data-decor-item]')).toBe(present);
    expect(count(busy, '[data-crew]')).toBe(0);
  });

  it('un élément en hauteur a toujours une échelle ou une nacelle ; à la main, jamais', () => {
    const seen = { high: 0, hand: 0, ladder: 0, lift: 0 };
    const check = (date: YMD, from: number, to: number, step: number): void => {
      for (let m = from; m < to; m += step) {
        const c = layer(date, m);
        for (const crew of c.querySelectorAll('[data-crew]')) {
          const tools = crew.querySelectorAll('[data-ladder], [data-lift]').length;
          if (crew.getAttribute('data-high') === 'true') {
            seen.high++;
            expect(tools, `${date.d}/${date.m} ${m} ${crew.getAttribute('data-crew')}`).toBeGreaterThan(0);
            if (crew.querySelector('[data-ladder]')) seen.ladder++;
            if (crew.querySelector('[data-lift]')) seen.lift++;
          }
          if (crew.getAttribute('data-equipment') === 'hand') {
            seen.hand++;
            expect(crew.getAttribute('data-high')).toBe('false');
            expect(tools).toBe(0);
          }
        }
        for (const { root, host } of mounted.splice(0)) {
          act(() => root.unmount());
          host.remove();
        }
      }
    };
    check(D13, 540, 1020, 11);
    check(D15, 540, 1020, 23);
    check(D14, 420, 480, 4);
    check(D14, 750, 810, 6);
    check(MUSIC, 540, 960, 13);
    check(MUSIC_NEXT, 0, 240, 13);
    expect(seen.high).toBeGreaterThan(0);
    expect(seen.ladder).toBeGreaterThan(0);
    expect(seen.lift).toBeGreaterThan(0);
    expect(seen.hand).toBeGreaterThan(0);
  });

  it('scène de la Fête de la musique : plancher, ossature et projecteurs posés le 21/6 au soir', () => {
    const c = layer(MUSIC, 20 * 60);
    for (const kind of ['stage-floor', 'stage-frame', 'stage-spots']) expect(count(c, `[data-decor-item][data-decor-kind="${kind}"]`)).toBe(1);
    expect(count(c, '[data-stage-spot]')).toBe(3);
  });

  it('aucun id SVG fixe', () => {
    for (const [d, m] of [[D13, 720], [D14, 450], [MUSIC, 700]] as const) expect(layer(d, m).querySelector('[id]')).toBeNull();
  });
});

describe('branchement dans la vie de la ville', () => {
  const mount = (date: YMD, minutes: number): HTMLDivElement => {
    const sky = skyOf(minutes);
    const city = { minutes, day: dayContext(date, []), precip: 0, snow: false, storm: false, daylight: sky.daylight };
    return render(<svg><CityLifeLayer width={W} height={H} sky={sky} seed={SEED} city={city} rainy={false} /></svg>);
  };
  it('13/7 à midi : l’équipe est dans la scène, les drapeaux de lampadaires passent devant les lampadaires', () => {
    const c = mount(D13, 720);
    expect(count(c, '[data-crew]')).toBeGreaterThan(0);
    const lamps = c.querySelector('[data-street-lamps]')!;
    const front = c.querySelector('[data-install-part="front"]')!;
    const back = c.querySelector('[data-install-part="back"]')!;
    expect(lamps.compareDocumentPosition(front) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(back.closest('[data-city-sidewalk]')).not.toBeNull();
  });
  it('14/7 à midi : drapeaux d’entrée posés', () => {
    expect(count(mount(D14, 720), '[data-decor-item][data-decor-kind="door-flag"]')).toBe(FLAG_DOORS);
  });
});
