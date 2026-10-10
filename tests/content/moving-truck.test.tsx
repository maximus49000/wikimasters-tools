// @vitest-environment jsdom
// tests/content/moving-truck.test.tsx — camion de déménagement, déménageurs et vitrine par tranches (vague 1b-iv-b)
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CityLifeLayer } from '../../src/content/city-life';
import { dayShifts } from '../../src/content/city-shops-life';
import { CARRY_CYCLE, collectMovers, crewFrame, movingLayout, placeMovers, truckAt, type CrewGeom } from '../../src/content/moving-truck';
import { CityScene } from '../../src/content/scene-city';
import { dayContext, type YMD } from '../../src/core/library/city/calendar';
import type { CityContext } from '../../src/core/library/city/intensity';
import { cityMetrics } from '../../src/core/library/city/metrics';
import { dayNumber, ymdOfDay } from '../../src/core/library/city/shops/hours';
import { streetOn, type Change, type SlotDay } from '../../src/core/library/city/shops/lifecycle';
import { shopSlotsFor } from '../../src/core/library/city/shops/slots';
import { TRUCK_SHIFT_MIN, changePlans, movingOffsets, shopViewAt } from '../../src/core/library/city/shops/view';
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
const EPOCH = dayNumber({ y: 2026, m: 10, d: 6 });
const times = sunTimes({ y: 2026, m: 10, d: 9 }, { lat: 48.85, lon: 2.35 }, 120);
const NOW = 1_790_000_000_000;

const contextAt = (minutes: number, ymd: YMD) => {
  const sky = skyAt(minutes, times);
  const city: CityContext = { minutes, day: dayContext(ymd, []), precip: 0, snow: false, storm: false, daylight: sky.daylight, shops: { epochDay: EPOCH, names: {} } };
  return { sky, city };
};
const life = (seed: number, minutes: number, ymd: YMD): HTMLDivElement => {
  const { sky, city } = contextAt(minutes, ymd);
  return render(<svg><CityLifeLayer width={W} height={H} sky={sky} seed={seed} city={city} rainy={false} /></svg>);
};
const scene = (seed: number, minutes: number, ymd: YMD): HTMLDivElement => {
  const { sky, city } = contextAt(minutes, ymd);
  return render(<svg><CityScene width={W} height={H} sky={sky} minutes={minutes} seed={seed} city={city} /></svg>);
};
const reduceMotion = (): void => {
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('reduce'), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false }));
};

// Jours de changement trouvés en parcourant la rue (graines 1 à 4, 300 jours) : le premier de chaque sorte, et un jour à deux changements.
type Found = { seed: number; day: number; s: SlotDay; offset: number; street: SlotDay[] };
const found = (() => {
  const byKind: Partial<Record<Change['kind'], Found>> = {};
  let twice: Found[] | null = null;
  for (const seed of [1, 2, 3, 4]) {
    const slots = shopSlotsFor(W, H, seed);
    for (let day = EPOCH + 1; day < EPOCH + 300; day++) {
      const street = streetOn(slots, seed, EPOCH, day, {});
      const changes = street.filter((s) => s.change);
      if (changes.length === 0) continue;
      const offsets = movingOffsets(street, seed, day);
      for (const s of changes) byKind[s.change!.kind] ??= { seed, day, s, offset: offsets.get(s.slot.id)!, street };
      if (!twice && changes.length >= 2) twice = changes.map((s) => ({ seed, day, s, offset: offsets.get(s.slot.id)!, street }));
    }
    if (byKind.relet && byKind['to-sale'] && byKind['from-sale'] && twice) break;
  }
  if (!byKind.relet || !byKind['to-sale'] || !byKind['from-sale'] || !twice) throw new Error('jours de changement introuvables');
  return { relet: byKind.relet, toSale: byKind['to-sale'], fromSale: byKind['from-sale'], twice };
})();

const planOf = (f: Found) => changePlans(f.seed, f.s.slot.id, f.day, f.s.change!.kind, f.offset);
const stepOf = (f: Found, name: string) => planOf(f).moving.steps.find((x) => x.step === name)!;
// Minute entière au milieu d'une étape.
const mid = (step: { from: number; to: number }): number => Math.round((step.from + step.to) / 2);
const truckOf = (c: Element, f: Found): Element | null => c.querySelector(`[data-moving-truck="${f.s.slot.id}"]`);
const crewOf = (c: Element, f: Found): Element | null => c.querySelector(`[data-moving-crew="${f.s.slot.id}"]`);
const translateX = (el: Element): number => Number(/translate\(([-\d.]+)px/.exec((el as SVGGElement).style.transform)![1]);

describe('camion (truckAt)', () => {
  it('hors champ pendant l’arrivée, garé à la dernière minute, hayon qui s’ouvre puis se ferme, reparti au départ', () => {
    expect(truckAt('truck-arrives', 482, 480, 486.5, false)).toEqual({ at: 'in', open: 0 });
    expect(truckAt('truck-arrives', 486, 480, 486.5, false)).toEqual({ at: 'park', open: 0 });
    expect(truckAt('open-back', 487, 486.5, 490.5, false).open).toBeCloseTo(1.5 / 4);
    expect(truckAt('carry-out', 500, 490, 520, false)).toEqual({ at: 'park', open: 1 });
    expect(truckAt('close-back', 590, 589, 593, false).open).toBeCloseTo(0.5);
    expect(truckAt('leave', 595, 593, 599, false)).toEqual({ at: 'out', open: 0 });
    // Mouvement réduit : toujours garé, hayon ouvert.
    for (const step of ['truck-arrives', 'leave', 'pause'] as const) expect(truckAt(step, 500, 490, 510, true)).toEqual({ at: 'park', open: 1 });
  });
});

describe('camion garé (movingLayout)', () => {
  it('près d’un bord, le camion reste entier dans la scène et l’arrière (où vont les porteurs) le suit', () => {
    const m = cityMetrics(H);
    const r = (x: number, w: number) => ({ x, y: 200, w, h: 20 });
    // Porte collée au bord droit, vitrine à sa gauche : le camion regarde vers la droite, il recule pour rester dans la scène.
    const right = movingLayout({ sign: r(W - 40, 40), window: r(W - 40, 28), door: r(W - 12, 10) }, m, W);
    expect(right.away).toBe(1);
    const half = 32 * right.kv;
    expect(right.parkX + half).toBeLessThanOrEqual(W + 1e-6);
    expect(right.b.x).toBeLessThan(right.parkX);
    // Au bord gauche, symétrique.
    const left = movingLayout({ sign: r(0, 40), window: r(12, 28), door: r(2, 10) }, m, W);
    expect(left.away).toBe(-1);
    expect(left.parkX - half).toBeGreaterThanOrEqual(-1e-6);
    expect(left.b.x).toBeGreaterThan(left.parkX);
    // Loin des bords : rien ne change (l'arrière est à REAR_GAP du bord de la porte, plus la profondeur d'entrée).
    const mid = movingLayout({ sign: r(300, 40), window: r(300, 28), door: r(328, 10) }, m, W);
    expect(mid.b.x).toBeCloseTo(338 + 14 + 5);
  });
});

describe('porteurs (crewFrame)', () => {
  const geom: CrewGeom = { a: { x: 100, y: 240 }, b: { x: 130, y: 256 }, n: 3, gap: 0.25, phase: 0, carry: 'out', kindSeed: 0 };
  it('aller chargé en file indienne, de la porte au camion ; retour à vide ; cachés au dépôt', () => {
    const f = crewFrame(geom, 3, 0.55);
    expect(f.movers.every((m) => m.dir === 1)).toBe(true);
    // Le premier ouvre la marche : il est plus loin sur le trajet que les suivants.
    expect(f.movers[0]!.x).toBeGreaterThan(f.movers[1]!.x);
    expect(f.movers[1]!.x).toBeGreaterThan(f.movers[2]!.x);
    expect(f.movers.some((m) => m.loaded)).toBe(true);
    // Dépôt (9 à 12 s) : personne de visible.
    expect(crewFrame(geom, 10, 0.55).movers.every((m) => m.opacity === 0)).toBe(true);
    // Retour : vers la porte, rien en main.
    const back = crewFrame(geom, 16, 0.55);
    expect(back.movers.every((m) => m.dir === -1 && !m.loaded)).toBe(true);
    expect(back.heavy).toBeNull();
  });
  it('meuble lourd : un seul meuble entre le premier et le dernier porteur ; la sorte change à chaque aller', () => {
    const kinds = new Set<string>();
    let heavySeen = 0;
    for (let trip = 0; trip < 14; trip++) {
      const f = crewFrame(geom, trip * CARRY_CYCLE + 4.5, 0.55);
      kinds.add(f.kind);
      if (f.heavy) {
        heavySeen++;
        expect(f.heavy.x).toBeGreaterThan(Math.min(f.movers[2]!.x, f.movers[0]!.x) - 1e-9);
        expect(f.heavy.x).toBeLessThan(Math.max(f.movers[2]!.x, f.movers[0]!.x) + 1e-9);
        expect(f.heavy.opacity).toBeGreaterThan(0);
      } else expect(f.kind).toBe('carton');
    }
    expect(heavySeen).toBeGreaterThan(0);
    expect(kinds.size).toBeGreaterThanOrEqual(4);
  });
  it('rentrée : chargés du camion vers la porte', () => {
    const f = crewFrame({ ...geom, carry: 'in' }, 3, 0.55);
    expect(f.movers.every((m) => m.dir === -1)).toBe(true);
    expect(f.movers[0]!.x).toBeLessThan(f.movers[1]!.x);
  });
});

describe('CityLifeLayer : déménagement', () => {
  it('« truck-arrives » : camion présent (hors champ, puis garé à la dernière minute)', () => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW);
    const f = found.relet;
    const arrive = stepOf(f, 'truck-arrives');
    const early = life(f.seed, Math.ceil(arrive.from), ymdOfDay(f.day));
    const truck = truckOf(early, f)!;
    expect(truck).not.toBeNull();
    expect(truck.getAttribute('data-mover')).toBe('truck');
    expect(truck.getAttribute('data-truck-at')).toBe('in');
    const x = translateX(truck);
    expect(x < 0 || x > W).toBe(true);
    // Dans la cabine : pas encore de porteurs.
    expect(crewOf(early, f)).toBeNull();
    const last = life(f.seed, Math.ceil(arrive.to - 1), ymdOfDay(f.day));
    expect(truckOf(last, f)!.getAttribute('data-truck-at')).toBe('park');
    expect((truckOf(last, f) as SVGGElement).style.transition).toContain('60s');
  });
  it('« carry-out » : deux ou trois porteurs, un meuble ou des cartons portés au fil de la navette ; local fermé, sans personnel', () => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW);
    const f = found.relet;
    const c = life(f.seed, mid(stepOf(f, 'carry-out')), ymdOfDay(f.day));
    const crew = crewOf(c, f)!;
    expect(crew.getAttribute('data-carry')).toBe('out');
    const porters = crew.querySelectorAll('[data-mover="porter"]');
    expect(porters.length).toBeGreaterThanOrEqual(2);
    expect(porters.length).toBeLessThanOrEqual(3);
    expect(crew.querySelector('[data-mover="piece"]')).not.toBeNull();
    expect(truckOf(c, f)!.getAttribute('data-truck-at')).toBe('park');
    expect(truckOf(c, f)!.getAttribute('data-tailgate')).toBe('1.00');
    // La boucle : sur un tour de navette, on voit un meuble lourd et des cartons portés.
    const crews = collectMovers(c);
    expect(crews).toHaveLength(1);
    let heavy = false;
    let box = false;
    for (let t = NOW / 1000; t < NOW / 1000 + 7 * CARRY_CYCLE; t += 1) {
      placeMovers(crews, t);
      if (Number(crew.querySelector('[data-mover="piece"]')!.getAttribute('opacity')) > 0) heavy = true;
      if (crew.querySelector('[data-mover-box][visibility="visible"]')) box = true;
    }
    expect(heavy).toBe(true);
    expect(box).toBe(true);
    // Local fermé pendant le déménagement : ni personnel, ni client, ni terrasse, ni file.
    const id = f.s.slot.id;
    expect(c.querySelector(`[data-shop-staff="${id}"]`)).toBeNull();
    expect(c.querySelectorAll(`[data-life-id^="${id}-v"][data-active="true"]`)).toHaveLength(0);
    expect(c.querySelector(`[data-shop-terrace="${id}"], [data-nightclub="${id}"]`)).toBeNull();
    expect(c.querySelector('[id]')).toBeNull();
  });
  it('de « carry-out » à « pause » (même calque re-rendu) : aucun carton ni bras chargé laissé par la boucle', () => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW);
    const f = found.relet;
    const ymd = ymdOfDay(f.day);
    const node = (minutes: number): ReactNode => {
      const { sky, city } = contextAt(minutes, ymd);
      return <svg><CityLifeLayer width={W} height={H} sky={sky} seed={f.seed} city={city} rainy={false} /></svg>;
    };
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    mounted.push({ root, host });
    const out = stepOf(f, 'carry-out');
    act(() => root.render(node(Math.floor(out.to - 1))));
    // La boucle écrit un carton visible sur un porteur (pose « hold »).
    const crews = collectMovers(host);
    let t = NOW / 1000;
    for (; t < NOW / 1000 + 7 * CARRY_CYCLE; t += 0.5) {
      placeMovers(crews, t);
      if (host.querySelector('[data-mover-box][visibility="visible"]')) break;
    }
    expect(host.querySelector('[data-mover-box][visibility="visible"]')).not.toBeNull();
    act(() => root.render(node(mid(stepOf(f, 'pause')))));
    const crew = crewOf(host, f)!;
    expect(crew.getAttribute('data-moving-step')).toBe('pause');
    expect(crew.querySelectorAll('[data-mover-box][visibility="visible"]')).toHaveLength(0);
    for (const p of crew.querySelectorAll('[data-mover="porter"]')) expect(p.getAttribute('opacity')).toBeNull();
  });
  it('« leave » : le camion repart hors du champ, sans porteurs', () => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW);
    const f = found.relet;
    const c = life(f.seed, mid(stepOf(f, 'leave')), ymdOfDay(f.day));
    const truck = truckOf(c, f)!;
    expect(truck.getAttribute('data-truck-at')).toBe('out');
    const x = translateX(truck);
    expect(x < 0 || x > W).toBe(true);
    expect(crewOf(c, f)).toBeNull();
    // Après le déménagement : plus de camion.
    expect(truckOf(life(f.seed, Math.ceil(planOf(f).moving.end + 1), ymdOfDay(f.day)), f)).toBeNull();
  });
  it('mouvement réduit : camion garé hayon ouvert, aucune transition ; un porteur figé selon l’étape', () => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW);
    reduceMotion();
    const f = found.relet;
    // Porteur attendu : aucun (dans la cabine), chargé d'un carton (portage), mains vides (pause).
    const expected = { 'truck-arrives': null, 'carry-out': 'visible', 'carry-in': 'visible', pause: 'hidden', leave: null } as const;
    for (const [name, box] of Object.entries(expected)) {
      const c = life(f.seed, mid(stepOf(f, name)), ymdOfDay(f.day));
      const truck = truckOf(c, f)!;
      expect(truck.getAttribute('data-truck-at')).toBe('park');
      expect(truck.getAttribute('data-tailgate')).toBe('1.00');
      expect((truck as SVGGElement).style.transition).toBe('');
      const porters = c.querySelectorAll(`[data-moving-crew="${f.s.slot.id}"] [data-mover="porter"]`);
      if (box === null) {
        expect(porters, name).toHaveLength(0);
        continue;
      }
      expect(porters, name).toHaveLength(1);
      expect(porters[0]!.querySelector('[data-mover-box]')!.getAttribute('visibility'), name).toBe(box);
      expect(crewOf(c, f)!.hasAttribute('data-carry')).toBe(false); // pas de navette pour la boucle
    }
  });
  it('déménageurs en bonnet, pas en casquette comme l’équipe d’enseigne', () => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW);
    const f = found.relet;
    const c = life(f.seed, mid(stepOf(f, 'pause')), ymdOfDay(f.day));
    const porters = crewOf(c, f)!.querySelectorAll('[data-mover="porter"]');
    expect(porters.length).toBeGreaterThanOrEqual(2);
    // Bonnet : demi-disque et pompon (circle de rayon 1,4 en haut de la tête).
    for (const p of porters) expect(p.querySelector('[data-head] circle[r="1.4"]')).not.toBeNull();
  });
  it('« to-sale » : jamais de « carry-in », personne ne rapporte de meubles', () => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW);
    const f = found.toSale;
    const ymd = ymdOfDay(f.day);
    const { moving } = planOf(f);
    for (let m = Math.floor(moving.start); m <= moving.end; m++) expect(shopViewAt(f.s, f.seed, ymd, m, f.offset).moving?.step).not.toBe('carry-in');
    const c = life(f.seed, mid(stepOf(f, 'close-back')), ymd);
    expect(crewOf(c, f)!.hasAttribute('data-carry')).toBe(false);
    expect(scene(f.seed, mid(stepOf(f, 'close-back')), ymd).querySelector(`[data-shop="${f.s.slot.id}"] [data-interior]`)).toBeNull();
  });
  it('« from-sale » : on ne sort rien, on rentre le nouveau mobilier', () => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW);
    const f = found.fromSale;
    expect(planOf(f).moving.steps.some((s) => s.step === 'carry-out')).toBe(false);
    const c = life(f.seed, mid(stepOf(f, 'carry-in')), ymdOfDay(f.day));
    expect(crewOf(c, f)!.getAttribute('data-carry')).toBe('in');
  });
});

describe('vitrine : l’ancien mobilier sort par tranches, le nouveau rentre', () => {
  it('relocation : ancien type tranche par tranche, vide pendant la pause, nouveau type ensuite, sans id', () => {
    const f = found.relet;
    const ymd = ymdOfDay(f.day);
    const id = f.s.slot.id;
    const interior = (m: number): Element | null => scene(f.seed, m, ymd).querySelector(`[data-shop="${id}"] [data-interior]`);
    const out = stepOf(f, 'carry-out');
    const start = interior(Math.ceil(out.from));
    expect(start!.getAttribute('data-interior')).toBe(f.s.change!.before!.type);
    const late = interior(Math.floor(out.from + 0.45 * (out.to - out.from)))!;
    expect(late.getAttribute('data-interior')).toBe(f.s.change!.before!.type);
    const [shown, n] = late.getAttribute('data-slices')!.split('/').map(Number);
    expect(shown).toBeLessThan(n!);
    expect(late.querySelector('[data-slices-cover]')).not.toBeNull();
    expect(interior(mid(stepOf(f, 'pause')))).toBeNull();
    const inn = stepOf(f, 'carry-in');
    const filling = interior(Math.ceil(inn.from + 0.55 * (inn.to - inn.from)))!;
    expect(filling.getAttribute('data-interior')).toBe(f.s.change!.after!.type);
    const done = interior(mid(stepOf(f, 'leave')))!;
    expect(done.getAttribute('data-slices')).toBe(`${n}/${n}`);
    // Pendant le chantier d'enseigne, le nouveau mobilier reste en place.
    const works = planOf(f).works;
    expect(interior(mid({ from: works.start, to: works.end }))!.getAttribute('data-interior')).toBe(f.s.change!.after!.type);
    expect(scene(f.seed, Math.ceil(out.from + 3), ymd).querySelectorAll('[data-shop] [id]')).toHaveLength(0);
  });
});

describe('un seul camion à la fois', () => {
  it('deux locaux le même jour : le second est décalé de 2 h (movingOffsets → changePlans), jamais deux camions garés ensemble', () => {
    const [first, second] = found.twice as [Found, Found];
    expect(first.offset).toBe(0);
    expect(second.offset).toBeGreaterThanOrEqual(TRUCK_SHIFT_MIN);
    const ymd = ymdOfDay(first.day);
    for (let m = 420; m < 1080; m++) {
      const moving = found.twice.filter((x) => shopViewAt(x.s, x.seed, ymd, m, x.offset).moving !== null);
      expect(moving.length, `minute ${m}`).toBeLessThanOrEqual(1);
    }
    // La couche applique le décalage : pendant le déménagement du second, seul son camion est là.
    vi.spyOn(Date, 'now').mockReturnValue(NOW);
    // Portage du second : il ne fait que sortir le mobilier s'il est mis en vente, sinon il en rentre.
    const c = life(second.seed, mid(stepOf(second, second.s.change!.kind === 'to-sale' ? 'carry-out' : 'carry-in')), ymd);
    const trucks = c.querySelectorAll('[data-moving-truck]');
    expect(trucks).toHaveLength(1);
    expect(trucks[0]!.getAttribute('data-moving-truck')).toBe(second.s.slot.id);
    // Le personnel du second suit le chantier décalé : personne n'arrive avant sa fin.
    const end = planOf(second).works.end;
    const shifts = dayShifts(second.s, second.seed, ymd, second.offset);
    expect(shifts.length).toBeGreaterThan(0);
    for (const sh of shifts) expect(sh.arriveAt).toBeGreaterThanOrEqual(end);
  });
});
