// @vitest-environment jsdom
// tests/content/parade-layer.test.tsx
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CityLifeLayer } from '../../src/content/city-life';
import { ParadeUnitSprite } from '../../src/content/parade-sprites';
import { dayContext, type YMD } from '../../src/core/library/city/calendar';
import type { CityContext } from '../../src/core/library/city/intensity';
import type { ParadeKind } from '../../src/core/library/city/parade';
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

const BASTILLE: YMD = { y: 2026, m: 7, d: 14 };
const ORDINARY: YMD = { y: 2026, m: 10, d: 6 };
const times = sunTimes(BASTILLE, { lat: 48.85, lon: 2.35 }, 120);
// Instant de l'horloge murale : début d'une minute + 10 s (la minute de la scène est donnée à part, comme dans la scène).
const T = 1_790_000_040 + 10;

const mount = (hours: number, date: YMD = BASTILLE, still = false): HTMLDivElement => {
  vi.spyOn(Date, 'now').mockReturnValue(T * 1000);
  if (still) vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('reduce'), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false }));
  const minutes = Math.round(hours * 60);
  const sky = skyAt(minutes, times);
  const city: CityContext = { minutes, day: dayContext(date, []), precip: 0, snow: false, storm: false, daylight: sky.daylight };
  return render(<svg><CityLifeLayer width={720} height={340} sky={sky} seed={1} city={city} rainy={false} /></svg>);
};
const count = (c: Element, sel: string): number => c.querySelectorAll(sel).length;
const UNITS = '[data-parade-unit]';
const ACTIVE_CARS = '[data-vehicle][data-active="true"]';

describe('grand défilé du 14 juillet', () => {
  it('à 10 h 30 : le cortège passe sur la route fermée, sans aucune voiture', () => {
    const c = mount(10.5);
    expect(count(c, UNITS)).toBeGreaterThan(0);
    expect(count(c, ACTIVE_CARS)).toBe(0);
    // Aucun autre véhicule d'événement sur les files (bus, tram, ambulance…) : seul le cortège roule.
    expect(count(c, '[data-city-lane] [data-event]')).toBe(0);
    // Sur la file du premier plan : dans le calque du cortège, après la file du premier plan.
    expect(c.querySelector(UNITS)!.closest('[data-parade]')).not.toBeNull();
  });
  it('à 10 h 30 : le cortège occupe les deux files, la file du fond est dessinée derrière celle du premier plan', () => {
    const c = mount(10.5);
    expect(count(c, `${UNITS}[data-lane="far"]`)).toBeGreaterThan(0);
    expect(count(c, `${UNITS}[data-lane="near"]`)).toBeGreaterThan(0);
    const far = c.querySelector('[data-parade][data-lane="far"]')!;
    const near = c.querySelector('[data-parade][data-lane="near"]')!;
    expect(far.compareDocumentPosition(near) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // La file du fond est réduite par rapport à celle du premier plan.
    const scale = (el: Element): number => Number(/scale\(([\d.]+)\)/.exec(el.querySelector('[data-parade-id]')!.getAttribute('transform')!)![1]);
    expect(scale(far)).toBeLessThan(scale(near));
  });
  it('à 9 h : route fermée (aucune voiture), barrières posées, pas encore de cortège', () => {
    const c = mount(9);
    expect(count(c, UNITS)).toBe(0);
    expect(count(c, ACTIVE_CARS)).toBe(0);
    expect(count(c, '[data-decor-kind="barrier"]')).toBeGreaterThan(0);
  });
  it('à 13 h 30 : route rouverte, plus de cortège', () => {
    const c = mount(13.5);
    expect(count(c, UNITS)).toBe(0);
    expect(count(c, ACTIVE_CARS)).toBeGreaterThan(0);
  });
  it('mouvement réduit : le cortège ne part pas', () => {
    expect(count(mount(10.5, BASTILLE, true), UNITS)).toBe(0);
  });
  it('jour ordinaire : aucun cortège', () => {
    expect(count(mount(10.5, ORDINARY), UNITS)).toBe(0);
  });
  it('les figurants du cortège comptent dans le plafond (data-worker)', () => {
    const c = mount(10.5);
    expect(count(c, '[data-parade] [data-worker]')).toBeGreaterThan(0);
  });
});

describe('foule de spectateurs', () => {
  const CROWD = '[data-parade-crowd] [data-spectator][data-mode="standing"]';
  const WALKING = '[data-parade-crowd] [data-spectator][data-mode="walking"]';
  it('à 11 h : une vraie foule (au moins 50 spectateurs), derrière les barrières', () => {
    const c = mount(11);
    expect(count(c, CROWD)).toBeGreaterThanOrEqual(50);
    // Sur le trottoir, avant les barrières dans l ordre de dessin.
    const crowd = c.querySelector('[data-parade-crowd]')!;
    expect(crowd.closest('[data-city-sidewalk]')).not.toBeNull();
    const barrier = c.querySelector('[data-decor-kind="barrier"]')!;
    expect(crowd.compareDocumentPosition(barrier) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // Drapeaux et téléphones levés, enfants sur les épaules, bras animés.
    expect(count(c, '[data-parade-crowd] [data-prop="flag"]')).toBeGreaterThan(0);
    expect(count(c, '[data-parade-crowd] [data-prop="phone"]')).toBeGreaterThan(0);
    expect(count(c, '[data-parade-crowd] [data-shoulders]')).toBeGreaterThan(0);
    expect(count(c, '[data-parade-crowd] animateTransform')).toBeGreaterThan(0);
  });
  it('à 8 h 15 aucun spectateur, à 9 h quelques-uns (moins qu à 11 h), à 13 h 30 aucun', () => {
    expect(count(mount(8.25), CROWD)).toBe(0);
    const nine = count(mount(9), CROWD);
    expect(nine).toBeGreaterThan(0);
    expect(nine).toBeLessThan(count(mount(11), CROWD));
    expect(count(mount(13.5), CROWD)).toBe(0);
    expect(count(mount(13.5), '[data-parade-crowd]')).toBe(0);
  });
  it('jour ordinaire : aucun spectateur', () => {
    expect(count(mount(11, ORDINARY), '[data-parade-crowd]')).toBe(0);
  });
  // Opacité intermédiaire : seulement pour qui passe l'encadrement d'une porte d'immeuble.
  const fadingAwayFromDoor = (c: Element): number =>
    [...c.querySelectorAll('[data-parade-crowd] [data-spectator]')].filter((e) => {
      const o = e.getAttribute('opacity');
      return o !== null && Number(o) > 0 && Number(o) < 1 && e.getAttribute('data-door') !== 'true';
    }).length;
  it('à 9 h : des spectateurs arrivent à pied (pas animé), aucun fondu sur place', () => {
    const c = mount(9);
    expect(count(c, WALKING)).toBeGreaterThan(0);
    expect(count(c, `${WALKING} [data-stride]`)).toBeGreaterThan(0);
    expect(fadingAwayFromDoor(c)).toBe(0);
    for (const e of c.querySelectorAll('[data-parade-crowd] [data-spectator]')) expect(e.getAttribute('style') ?? '').not.toContain('transition');
  });
  it('à 12 h 55 : des spectateurs repartent à pied', () => {
    const c = mount(775 / 60);
    expect(count(c, WALKING)).toBeGreaterThan(0);
    expect(fadingAwayFromDoor(c)).toBe(0);
  });
  it('à 11 h : aucun marcheur, au moins 50 debout', () => {
    const c = mount(11);
    expect(count(c, WALKING)).toBe(0);
    expect(count(c, CROWD)).toBeGreaterThanOrEqual(50);
  });
  it('mouvement réduit : la foule est là, immobile, seulement des spectateurs debout', () => {
    const c = mount(11, BASTILLE, true);
    expect(count(c, CROWD)).toBeGreaterThanOrEqual(50);
    expect(count(c, '[data-parade-crowd] animate, [data-parade-crowd] animateTransform')).toBe(0);
    const nine = mount(9, BASTILLE, true);
    expect(count(nine, WALKING)).toBe(0);
    expect(count(nine, CROWD)).toBeGreaterThan(0);
  });
  it('les marcheurs ordinaires se font rares pendant la fermeture', () => {
    const peds = (c: Element): number => count(c, '[data-ped][data-role="general"][data-active="true"]');
    expect(peds(mount(11))).toBeLessThan(peds(mount(14)));
  });
});

describe('défilé aérien', () => {
  it('présent à 10 h le 14 juillet, absent à 11 h', () => {
    expect(count(mount(10), '[data-flypast]')).toBe(1);
    expect(count(mount(10), '[data-flypast] [data-jet]')).toBe(7);
    expect(count(mount(11), '[data-flypast]')).toBe(0);
  });
  it('dans le calque du ciel, jamais en mouvement réduit', () => {
    expect(mount(10).querySelector('[data-flypast]')!.closest('[data-city-events-back]')).not.toBeNull();
    expect(count(mount(10, BASTILLE, true), '[data-flypast]')).toBe(0);
  });
});

describe('sprites du cortège', () => {
  const sky = skyAt(630, times);
  const KINDS: ParadeKind[] = ['band', 'motorbikes', 'flags', 'infantry', 'cavalry', 'jeeps', 'trucks', 'tanks', 'firetruck'];
  it.each(KINDS)('%s se dessine', (kind) => {
    const c = render(<svg><ParadeUnitSprite unit={{ id: `u-${kind}`, kind, variant: 0.4, half: 80, start: 0, lane: 'near' as const }} sky={sky} still={false} /></svg>);
    const node = c.querySelector(`[data-parade-unit="${kind}"]`)!;
    expect(node).not.toBeNull();
    expect(node.querySelectorAll('rect, path, circle, ellipse, line, polygon').length).toBeGreaterThan(5);
  });
  const unitOf = (kind: ParadeKind, still = false): HTMLDivElement =>
    render(<svg><ParadeUnitSprite unit={{ id: `u-${kind}`, kind, variant: 0.4, half: 80, start: 0, lane: 'near' as const }} sky={sky} still={still} /></svg>);
  it('cavaliers : quatre jambes par cheval, bottes contre le flanc (au-dessus du ventre)', () => {
    const c = unitOf('cavalry');
    expect(count(c, '[data-horse-leg]')).toBe(4 * 3);
    for (const boot of c.querySelectorAll('[data-boot]')) expect(Number(boot.getAttribute('y')) + Number(boot.getAttribute('height'))).toBeLessThanOrEqual(-12);
  });
  it('infanterie : jambes animées au pas, figées en mouvement réduit', () => {
    expect(count(unitOf('infantry'), '[data-legs] animateTransform')).toBeGreaterThan(0);
    expect(count(unitOf('infantry', true), '[data-legs] animateTransform')).toBe(0);
  });
  it('sans animation en mouvement réduit, mêmes dessins à variante égale', () => {
    const draw = (still: boolean): string =>
      render(<svg><ParadeUnitSprite unit={{ id: 'u', kind: 'infantry', variant: 0.7, half: 70, start: 0, lane: 'near' as const }} sky={sky} still={still} /></svg>).innerHTML;
    const a = render(<svg><ParadeUnitSprite unit={{ id: 'u', kind: 'cavalry', variant: 0.2, half: 80, start: 0, lane: 'near' as const }} sky={sky} still /></svg>);
    expect(count(a, 'animate, animateTransform')).toBe(0);
    expect(draw(false)).toBe(draw(false));
    expect(count(render(<svg><ParadeUnitSprite unit={{ id: 'u', kind: 'infantry', variant: 0.7, half: 70, start: 0, lane: 'near' as const }} sky={sky} still={false} /></svg>), 'animate, animateTransform')).toBeGreaterThan(0);
  });
});
