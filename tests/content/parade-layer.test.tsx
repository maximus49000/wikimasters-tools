// @vitest-environment jsdom
// tests/content/parade-layer.test.tsx
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CityLifeLayer } from '../../src/content/city-life';
import { ParadeUnitSprite } from '../../src/content/parade-sprites';
import { ParadeLayer } from '../../src/content/parade-layer';
import { collectCycles, placeCycles, PropContext, PropRegistry, propKey, type PropSpec } from '../../src/content/prop/prop-host';
import { HORSE_CYCLE_S } from '../../src/core/library/paint/props/parade';
import { cityMetrics } from '../../src/core/library/city/metrics';
import { dayContext, type YMD } from '../../src/core/library/city/calendar';
import type { CityContext } from '../../src/core/library/city/intensity';
import { paradeUnits, paradeX, type ParadeKind } from '../../src/core/library/city/parade';
import { FigureContext, FigureRegistry, type Citizen3D } from '../../src/content/figure/figure-host';
import { skyAt, sunTimes } from '../../src/core/library/sky';

// Ces tests couvrent le rendu 3D : interrupteur forcé à vrai (il est coupé dans le code depuis le 2026-10-19, style à retravailler).
vi.mock('../../src/content/figure/citizen-config', async (orig) => ({ ...(await orig<object>()), CITIZENS_3D: true }));

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
  // Aucun fondu de groupe : on entre et on sort par le seuil d'une porte (<svg> rogné) ou par un bord du monde.
  const fadingAwayFromDoor = (c: Element): number => [...c.querySelectorAll('[data-parade-crowd] [data-spectator]')].filter((e) => e.getAttribute('opacity') !== null).length;
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

describe('véhicules du défilé en Ghibli (V5)', () => {
  const sky = skyAt(630, times);
  const VEHICLES: readonly [ParadeKind, string][] = [['jeeps', 'army-jeep'], ['trucks', 'army-truck'], ['tanks', 'tank'], ['firetruck', 'fire-truck'], ['motorbikes', 'garde-moto']];
  it.each(VEHICLES)('%s : peints (%s), classique sans véhicule peint', (kind, sid) => {
    const unit = { id: `u-${kind}`, kind, variant: 0.4, half: 80, start: 0, lane: 'near' as const };
    const g = render(<svg><ParadeUnitSprite unit={unit} sky={sky} still={false} ghibli /></svg>);
    expect(count(g, `[data-scripted-car][data-sid="${sid}"]`)).toBeGreaterThan(0);
    expect(count(render(<svg><ParadeUnitSprite unit={unit} sky={sky} still={false} /></svg>), '[data-scripted-car]')).toBe(0);
  });
  it('jeeps : drapeaux des antennes conservés ; chars : chenilles qui défilent', () => {
    const jeeps = render(<svg><ParadeUnitSprite unit={{ id: 'j', kind: 'jeeps', variant: 0.4, half: 60, start: 0, lane: 'near' as const }} sky={sky} still={false} ghibli /></svg>);
    expect(jeeps.querySelectorAll('[data-scripted-car]')).toHaveLength(2);
    expect(count(jeeps, 'line')).toBeGreaterThanOrEqual(4);
    const tanks = render(<svg><ParadeUnitSprite unit={{ id: 't', kind: 'tanks', variant: 0.4, half: 90, start: 0, lane: 'near' as const }} sky={sky} still={false} ghibli /></svg>);
    expect(count(tanks, '[data-track] animate')).toBe(2);
  });
  it('la boucle du cortège fait tourner les roues des véhicules peints', () => {
    vi.spyOn(Date, 'now').mockReturnValue(T * 1000);
    let host: HTMLDivElement | null = null;
    for (let m = 600; m < 720 && !host; m++) {
      const c = render(<svg><ParadeLayer width={720} seed={1} sky={skyAt(m, times)} still={false} dayFests={['bastille']} minutes={m} metrics={cityMetrics(340)} lane="near" ghibli /></svg>);
      if (c.querySelector('[data-scripted-car] [data-wheel]')) host = c;
    }
    expect(host).not.toBeNull();
    const turned = [...host!.querySelectorAll('[data-scripted-car] [data-wheel]')].some((w) => !/rotate\(0(\.00)?\)/.test(w.getAttribute('transform')!));
    expect(turned).toBe(true);
  });
});

// G5 (tâche 8) : cheval, drapeaux, instruments, fusils et coiffes en images cellulo du registre d'accessoires ; le dessin SVG
// reste le repli tant que l'image n'est pas cuite ; les poses cycliques sont choisies par la boucle (placeCycles).
describe('cortège du 14 juillet en cellulo (G5)', () => {
  const sky = skyAt(630, times);
  const day = sky.daylight;
  // Registre à cuisson manuelle dont l'« image » est la clé (jsdom n'a pas de canvas) : les href disent quelle pose est posée.
  class KeyedRegistry extends PropRegistry {
    override want(k: string, _paint: () => string, done: () => void): () => void {
      return super.want(k, () => `url:${k}`, done);
    }
  }
  const unit = (kind: ParadeKind, half = 80) => ({ id: `u-${kind}`, kind, variant: 0.4, half, start: 0, lane: 'near' as const });
  const gUnit = (kind: ParadeKind, still = false): { host: HTMLDivElement; jobs: (() => void)[]; reg: PropRegistry } => {
    const jobs: (() => void)[] = [];
    const reg = new KeyedRegistry('t', { schedule: (cb) => jobs.push(cb) });
    const host = render(
      <PropContext.Provider value={reg}>
        <svg><ParadeUnitSprite unit={unit(kind)} sky={sky} still={still} ghibli /></svg>
      </PropContext.Provider>,
    );
    return { host, jobs, reg };
  };
  const bake = async (jobs: (() => void)[]): Promise<void> => {
    while (jobs.length) await act(async () => jobs.shift()!());
  };
  const specOf = (node: Element): PropSpec => JSON.parse(node.getAttribute('data-cycle-spec')!) as PropSpec;
  const href = (node: Element): string => node.querySelector(':scope > image')!.getAttribute('href')!;
  const key = (spec: PropSpec, frame: number): string => `url:${propKey({ ...spec, frame })}`;

  it('cavalerie : trois chevaux en image `horse` cyclique (1,2 s, phases 0 / ¼ / ½), repli SVG avant cuisson, cavalier pantin par-dessus ; la boucle pose la pose de l’instant', async () => {
    const { host, jobs, reg } = gUnit('cavalry');
    const horses = [...host.querySelectorAll('[data-horse] > [data-prop-cycle]')];
    expect(horses).toHaveLength(3);
    expect(horses.map((h) => h.getAttribute('data-prop-cycle'))).toEqual(Array<string>(3).fill(String(HORSE_CYCLE_S)));
    expect(horses.map((h) => Number(h.getAttribute('data-cycle-phase')))).toEqual([0, 0.25, 0.5]);
    for (const h of horses) expect(specOf(h)).toMatchObject({ id: 'horse', day });
    // Avant cuisson : le cheval SVG (quatre jambes) ; le cavalier est un pantin monté, avec son casque à l'accroche de la tête.
    expect(count(host, '[data-horse] [data-horse-leg]')).toBe(12);
    expect(count(host, '[data-horse] image')).toBe(0);
    expect(count(host, '[data-parade-figure] [data-figure]')).toBe(3);
    expect(count(host, '[data-parade-figure] [data-held="head"]')).toBe(3);
    await bake(jobs);
    expect(count(host, '[data-horse] image')).toBe(3);
    expect(count(host, '[data-horse] [data-horse-leg]')).toBe(0);
    expect(count(host, '[data-horse] animateTransform')).toBe(0);
    for (const h of horses) expect(href(h)).toBe(key(specOf(h), 0));
    // Boucle : à t = 0,6 s (demi-cycle), pose 4 pour la phase 0, 6 pour ¼, 0 pour ½ ; la pose est demandée puis posée.
    const cycles = collectCycles(host);
    expect(cycles).toHaveLength(3);
    placeCycles(cycles, 0.6, reg);
    await bake(jobs);
    placeCycles(cycles, 0.6, reg);
    expect(horses.map(href)).toEqual([key(specOf(horses[0]!), 4), key(specOf(horses[1]!), 6), key(specOf(horses[2]!), 0)]);
    // Même instant : rien ne change ; l'image ne porte jamais de miroir.
    placeCycles(cycles, 0.6, reg);
    expect(horses.map(href)).toEqual([key(specOf(horses[0]!), 4), key(specOf(horses[1]!), 6), key(specOf(horses[2]!), 0)]);
    expect(host.innerHTML).not.toMatch(/scale\(-1/);
  });
  it('fanfare : six instruments en image au repère de leur dessin ; grosse caisse (1 s) et caisse claire (0,5 s) cycliques, cuivres et canne fixes ; coiffes en image à la tête', async () => {
    const { host, jobs } = gUnit('band');
    expect(count(host, '[data-instrument="bass-drum"] > [data-prop-cycle="1"]')).toBe(1);
    expect(count(host, '[data-instrument="snare"] > [data-prop-cycle="0.5"]')).toBe(1);
    for (const k of ['tuba', 'trumpet', 'bugle', 'baton']) expect(count(host, `[data-instrument="${k}"] [data-prop-cycle]`), k).toBe(0);
    expect(count(host, '[data-instrument] image')).toBe(0);
    await bake(jobs);
    expect(count(host, '[data-instrument] image')).toBe(6);
    expect(count(host, '[data-instrument] path, [data-instrument] circle, [data-instrument] ellipse')).toBe(0);
    expect(count(host, '[data-held="head"] image')).toBe(6);
    // Les instruments restent accrochés aux mains du pantin, avec le décalage du dessin.
    expect(host.querySelector('[data-instrument="bass-drum"]')!.getAttribute('transform')).toBe('translate(-4 19)');
    expect(host.querySelector('[data-held="hands"] [data-instrument="tuba"]')).not.toBeNull();
  });
  it('infanterie : fusils et coiffes en image ; porte-drapeaux : hampe et tissu `parade-flag` (27 × 18, hampe 51) cycliques, une phase par porteur', async () => {
    const inf = gUnit('infantry');
    await bake(inf.jobs);
    expect(count(inf.host, '[data-rifle] image')).toBe(8);
    expect(count(inf.host, '[data-rifle] line')).toBe(0);
    expect(count(inf.host, '[data-held="head"] image')).toBe(8);
    const fl = gUnit('flags');
    const bearers = [...fl.host.querySelectorAll('[data-flag-bearer] [data-prop-cycle]')];
    expect(bearers).toHaveLength(3);
    expect(new Set(bearers.map((b) => b.getAttribute('data-cycle-phase'))).size).toBe(3);
    for (const b of bearers) expect(specOf(b)).toMatchObject({ id: 'parade-flag', args: { w: 27, h: 18, pole: 51 } });
    await bake(fl.jobs);
    expect(count(fl.host, '[data-flag-bearer] image')).toBe(3);
    expect(count(fl.host, '[data-flag-bearer] rect, [data-flag-bearer] line')).toBe(0);
  });
  it('jeeps et chars : tissu des drapeaux d’antenne en image cyclique posée à `top`, hampe SVG conservée', async () => {
    const { host, jobs } = gUnit('jeeps');
    expect(count(host, '[data-tricolore] > [data-prop-cycle]')).toBe(4);
    await bake(jobs);
    expect(count(host, '[data-tricolore] image')).toBe(4);
    expect(count(host, '[data-tricolore] rect')).toBe(0);
    expect(count(host, 'line')).toBeGreaterThanOrEqual(4);
    expect(host.querySelector('[data-tricolore]')!.getAttribute('transform')).toBe('translate(0 -34)');
    const tanks = gUnit('tanks');
    expect(count(tanks.host, '[data-tricolore] > [data-prop-cycle]')).toBe(2);
  });
  it('mouvement réduit : aucun nœud cyclique ; images en pose 0, drapeaux plats (args still)', async () => {
    for (const kind of ['cavalry', 'flags', 'band', 'jeeps'] as const) {
      const { host, jobs, reg } = gUnit(kind, true);
      expect(count(host, '[data-prop-cycle]'), kind).toBe(0);
      await bake(jobs);
      expect(count(host, 'image'), kind).toBeGreaterThan(0);
      if (kind === 'flags') expect(reg.get(propKey({ id: 'parade-flag', args: { w: 27, h: 18, pole: 51, still: true }, day }))).not.toBeNull();
      if (kind === 'cavalry') expect(count(host, '[data-horse] image')).toBe(3);
    }
  });
  it('classique : aucune image, aucun nœud cyclique', () => {
    for (const kind of ['cavalry', 'band', 'flags', 'infantry', 'jeeps'] as const) {
      const c = render(<svg><ParadeUnitSprite unit={unit(kind)} sky={sky} still={false} /></svg>);
      expect(count(c, 'image, [data-prop-cycle], [data-horse]'), kind).toBe(0);
    }
  });
});

// Habitants 3D : une unité du défilé est montée avant d'entrer dans le champ ; hors champ, cachée tant qu'un de ses personnages
// attend sa 3D (pas de pantin qui change de modèle sous les yeux) ; dans le champ, toujours entière (pantin de repli).
describe('défilé et habitants 3D', () => {
  it('unité qui va entrer : montée hors champ, cachée, personnages en attente de leur 3D ; unités dans le champ : personnages dessinés', () => {
    const minutes = 630;
    const base = 1_790_000_040;
    const dayStart = Math.floor(base / 60) * 60 - minutes * 60;
    const units = paradeUnits(1, 720, dayStart).filter((u) => u.lane === 'near');
    // Instant (dans la minute de `base`) où une unité est à moins de 6 s de son entrée.
    let t = base;
    while (t < base + 59 && !units.some((u) => paradeX(u, 720, t) === null && paradeX(u, 720, t + 4) !== null)) t += 0.5;
    const coming = units.find((u) => paradeX(u, 720, t) === null && paradeX(u, 720, t + 4) !== null);
    expect(coming).toBeDefined();
    vi.spyOn(Date, 'now').mockReturnValue(t * 1000);
    const anchors = { handR: [9, -23], handL: [-9, -23], hands: [0, -23], head: [0, -42], headTop: [0, -50], nape: [0, -36], seat: [0, -20] } as const;
    const fake: Citizen3D = { ready: () => false, prepare() {}, render: () => ({ url: 'data:image/png;base64,3D', anchors }), dispose() {} };
    const figures = new FigureRegistry('tparade', { citizens: () => fake, now: () => 0 });
    const sky = skyAt(minutes, times);
    const c = render(<FigureContext.Provider value={figures}><svg><ParadeLayer width={720} seed={1} sky={sky} still={false} dayFests={['bastille']} minutes={minutes} metrics={cityMetrics(340)} lane="near" ghibli /></svg></FigureContext.Provider>);
    const node = c.querySelector(`[data-parade-id="${coming!.id}"]`);
    expect(node).not.toBeNull();
    expect(node!.getAttribute('visibility')).toBe('hidden');
    const figs = [...node!.querySelectorAll('[data-figure]')];
    expect(figs.length).toBeGreaterThan(0);
    for (const f of figs) expect(f.firstElementChild!.getAttribute('href')).toBeNull();
    for (const u of units) {
      if (paradeX(u, 720, t) === null) continue;
      const n = c.querySelector(`[data-parade-id="${u.id}"]`);
      if (!n) continue;
      expect(n.getAttribute('visibility')).not.toBe('hidden');
      for (const f of n.querySelectorAll('[data-figure]')) expect(f.firstElementChild!.getAttribute('href')).not.toBeNull();
    }
  });
});
