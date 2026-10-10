// @vitest-environment jsdom
// tests/content/shop-terrace.test.tsx — terrasses, cordon, videurs et file de la boîte de nuit (rendu, vague 1b-iv-b)
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CityLifeLayer } from '../../src/content/city-life';
import { NightclubDoor, queueFrame } from '../../src/content/shop-queue';
import { ShopTerrace, terraceTables, waiterAt, weatherHistory } from '../../src/content/shop-terrace';
import { dayContext, type YMD } from '../../src/core/library/city/calendar';
import type { CityContext } from '../../src/core/library/city/intensity';
import { cityMetrics } from '../../src/core/library/city/metrics';
import { outfitFor } from '../../src/core/library/city/people';
import { SHOP_DEFS, type ShopTypeId } from '../../src/core/library/city/shops/catalog';
import { dayNumber, isOpenAt, openRangeAt } from '../../src/core/library/city/shops/hours';
import { streetOn } from '../../src/core/library/city/shops/lifecycle';
import { shopFrame, shopSlotsFor } from '../../src/core/library/city/shops/slots';
import type { TerraceWeather } from '../../src/core/library/city/shops/terrace';
import { shopViewAt, type ShopView } from '../../src/core/library/city/shops/view';
import { mulberry32 } from '../../src/core/library/scene-world';
import { skyAt, sunTimes } from '../../src/core/library/sky';
import { targetOf, type Weather } from '../../src/core/library/weather/weather-types';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mounted: { root: Root; host: HTMLDivElement }[] = [];
const render = (node: ReactNode): { host: HTMLDivElement; root: Root } => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  act(() => root.render(node));
  mounted.push({ root, host });
  return { host, root };
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
const SAT = { y: 2026, m: 10, d: 10 };
const MON = { y: 2026, m: 10, d: 12 };
const THU = { y: 2026, m: 10, d: 8 };
const times = sunTimes(SAT, { lat: 48.85, lon: 2.35 }, 120);
const slots = shopSlotsFor(W, H, SEED);
const metrics = cityMetrics(H);
const frame = shopFrame(slots[0]!, metrics.ground);
const NOW = 1_790_000_000_000;

const FINE: TerraceWeather = { rain: false, snow: false, storm: false, wind: false, sunny: false };
const SUN: TerraceWeather = { ...FINE, sunny: true };
const RAIN: TerraceWeather = { ...FINE, rain: true };
const waiter = outfitFor('ordinary', mulberry32(3));

const viewOf = (type: ShopTypeId, date: YMD, minutes: number): ShopView => ({
  slot: slots[0]!,
  phase: isOpenAt(SHOP_DEFS[type], date, minutes) ? 'open' : 'closed',
  sign: { type, name: 'X' },
  placard: false,
  interior: type,
  works: null,
  moving: null,
  interiorStage: null,
});
const reduceMotion = (): void => {
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('reduce'), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false }));
};

const terrace = (type: ShopTypeId, minutes: number, now: TerraceWeather, before: TerraceWeather = now, reduced = false, crowd = 1): ReactNode => (
  <svg>
    <ShopTerrace view={viewOf(type, SAT, minutes)} frame={frame} metrics={metrics} minutes={minutes} date={SAT} weather={{ now, before }} crowd={crowd} reduced={reduced} sky={skyAt(minutes, times)} seed={SEED} waiterOutfit={waiter} />
  </svg>
);
const tables = (c: Element): NodeListOf<Element> => c.querySelectorAll('[data-terrace-table]');

describe('terrasse : rendu (ShopTerrace)', () => {
  it('sous la pluie (ou juste après), aucune table', () => {
    expect(tables(render(terrace('bar', 18 * 60, RAIN)).host)).toHaveLength(0);
    // Pluie dans les 10 dernières minutes : toujours rien (hystérésis).
    expect(tables(render(terrace('bar', 18 * 60, FINE, RAIN)).host)).toHaveLength(0);
  });
  it('ouverte : 3 tables rondes et 2 chaises chacune, sur le trottoir devant la vitrine, sans parasol par temps couvert', () => {
    const { host } = render(terrace('bar', 18 * 60, FINE));
    expect(host.querySelector('[data-shop-terrace]')!.getAttribute('data-terrace-state')).toBe('open');
    expect(tables(host)).toHaveLength(3);
    expect(host.querySelectorAll('[data-terrace-chair]')).toHaveLength(6);
    expect(host.querySelectorAll('[data-parasol]')).toHaveLength(0);
    for (const t of terraceTables(frame, metrics, 3)) {
      expect(t.y).toBeGreaterThan(metrics.doorY);
      expect(t.y).toBeLessThan(metrics.walkY);
    }
    expect(host.querySelector('[id]')).toBeNull();
  });
  it('plein soleil : un parasol par table', () => {
    const { host } = render(terrace('cafe', 12 * 60, SUN));
    const n = tables(host).length;
    expect(n).toBeGreaterThanOrEqual(2);
    expect(host.querySelectorAll('[data-parasol]')).toHaveLength(n);
  });
  it('rien pour un commerce sans terrasse, ni local fermé, ni de nuit (22 h)', () => {
    expect(render(terrace('bakery', 12 * 60, SUN)).host.querySelector('[data-shop-terrace]')).toBeNull();
    expect(tables(render(terrace('restaurant', 16 * 60, SUN)).host)).toHaveLength(0);
    expect(tables(render(terrace('bar', 22 * 60, SUN)).host)).toHaveLength(0);
  });
  it('montage : les tables partent de la porte, un employé les sort ; convives seulement une fois montée', () => {
    const open = openRangeAt(SHOP_DEFS.cafe, SAT, 9 * 60)![0];
    const { host } = render(terrace('cafe', open + 3, SUN));
    expect(host.querySelector('[data-shop-terrace]')!.getAttribute('data-terrace-state')).toBe('setting-up');
    expect(host.querySelector('[data-terrace-carrier]')).not.toBeNull();
    expect(host.querySelectorAll('[data-terrace-guest]')).toHaveLength(0);
  });
  it('après la pluie, la terrasse revient directement en place (pas de montage)', () => {
    const { host, root } = render(terrace('cafe', 12 * 60, FINE, RAIN));
    expect(tables(host)).toHaveLength(0);
    act(() => root.render(terrace('cafe', 12 * 60 + 1, FINE, FINE)));
    expect(host.querySelector('[data-shop-terrace]')!.getAttribute('data-terrace-state')).toBe('open');
    expect(host.querySelector('[data-terrace-carrier]')).toBeNull();
    const targets = terraceTables(frame, metrics, tables(host).length);
    for (const t of tables(host)) {
      const i = Number(t.getAttribute('data-terrace-table'));
      expect((t as SVGGElement).style.transform).toContain(`${targets[i]!.x.toFixed(1)}px`);
    }
  });
  it('convives : 4 au plus, un serveur sort servir', () => {
    let seen = 0;
    for (let m = 8 * 60; m < 20 * 60; m += 17) {
      const { host } = render(terrace('cafe', m, FINE));
      const guests = host.querySelectorAll('[data-terrace-guest]').length;
      expect(guests).toBeLessThanOrEqual(4);
      if (guests > 0) {
        seen++;
        expect(host.querySelector('[data-terrace-waiter]')).not.toBeNull();
      }
    }
    expect(seen).toBeGreaterThan(3);
  });
  it('mouvement réduit : tables selon l’état, au plus une personne par table, personne en route', () => {
    let seated = 0;
    for (let m = 8 * 60; m < 20 * 60; m += 11) {
      const { host } = render(terrace('cafe', m, SUN, SUN, true));
      const perTable = new Map<string, number>();
      for (const g of host.querySelectorAll('[data-terrace-guest]')) {
        const t = g.getAttribute('data-table')!;
        perTable.set(t, (perTable.get(t) ?? 0) + 1);
        seated++;
      }
      for (const n of perTable.values()) expect(n).toBe(1);
      expect(host.querySelectorAll('[data-terrace-waiter], [data-terrace-carrier]')).toHaveLength(0);
    }
    expect(seated).toBeGreaterThan(0);
  });
});

describe('terrasse : serveur et météo', () => {
  it('le serveur va de la porte à une table et revient, caché le reste du temps', () => {
    const door = 100;
    const targets = [80, 70];
    let shown = 0;
    for (let t = 0; t < 200; t += 0.5) {
      const w = waiterAt(t, 7, door, targets);
      if (w.opacity > 0) {
        shown++;
        expect(w.x).toBeGreaterThanOrEqual(70 - 1e-6);
        expect(w.x).toBeLessThanOrEqual(door + 1e-6);
      }
    }
    expect(shown).toBeGreaterThan(50);
    expect(shown).toBeLessThan(400);
  });
  it('historique : une pluie relevée garde la terrasse rentrée 10 minutes', () => {
    const h = weatherHistory();
    const at = (min: number): number => NOW + min * 60_000;
    const rainUntil = at(5);
    const read = (ms: number): Weather => targetOf(ms < rainUntil ? 'rain' : 'sun');
    // Premier relevé : les 10 minutes passées sont relues (pluie).
    expect(h.sample(read, at(5))).toMatchObject({ now: { rain: false }, before: { rain: true } });
    expect(h.sample(read, at(14)).before.rain).toBe(true);
    const later = h.sample(read, at(16));
    expect(later.before.rain).toBe(false);
    expect(later.now.sunny).toBe(true);
  });
});

describe('boîte de nuit : cordon, videurs et file (NightclubDoor)', () => {
  const club = (date: YMD, minutes: number, reduced = false): HTMLDivElement =>
    render(
      <svg>
        <NightclubDoor view={viewOf('nightclub', date, minutes)} frame={frame} metrics={metrics} minutes={minutes} date={date} reduced={reduced} sky={skyAt(minutes, times)} seed={SEED} sessionT0={NOW / 1000 - 600} />
      </svg>,
    ).host;
  it('ouverte (samedi 0 h 30) : cordon, 2 videurs en costume, file de 1 à 6 personnes', () => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW);
    const c = club(SAT, 30);
    expect(c.querySelector('[data-cordon]')).not.toBeNull();
    expect(c.querySelectorAll('[data-bouncer]')).toHaveLength(2);
    const n = c.querySelectorAll('[data-queue-member]').length;
    expect(n).toBeGreaterThanOrEqual(1);
    expect(n).toBeLessThanOrEqual(6);
    expect(c.querySelector('[id]')).toBeNull();
  });
  it('mouvement réduit : cordon, videurs et 3 personnes immobiles', () => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW);
    reduceMotion();
    const c = club(SAT, 30, true);
    expect(c.querySelector('[data-cordon]')).not.toBeNull();
    expect(c.querySelectorAll('[data-bouncer]')).toHaveLength(2);
    expect(c.querySelectorAll('[data-queue-member]')).toHaveLength(3);
    expect(c.querySelector('[data-queue-entering]')).toBeNull();
  });
  it('avant l’ouverture d’un soir d’ouverture (jeudi 22 h 45) : cordon et videurs, pas de file', () => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW);
    const c = club(THU, 22 * 60 + 45);
    expect(c.querySelectorAll('[data-bouncer]')).toHaveLength(2);
    expect(c.querySelectorAll('[data-queue-member]')).toHaveLength(0);
  });
  it('hors ouverture : rien (lundi 22 h 45, samedi 14 h)', () => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW);
    expect(club(MON, 22 * 60 + 45).querySelector('[data-nightclub]')).toBeNull();
    expect(club(SAT, 14 * 60).querySelector('[data-nightclub]')).toBeNull();
  });
  it('queueFrame : la tête qui vient d’entrer s’efface dans la porte, les autres avancent', () => {
    let ghosts = 0;
    for (let t = 0; t < 300; t += 0.25) {
      const f = queueFrame(SEED, 'shop-0', t, 60, true);
      expect(f.members.length).toBeLessThanOrEqual(6);
      f.members.forEach((m, i) => {
        expect(m.pos).toBeGreaterThanOrEqual(i);
        expect(m.pos).toBeLessThanOrEqual(i + 1);
      });
      if (f.ghost) {
        ghosts++;
        expect(f.ghost.p).toBeGreaterThanOrEqual(0);
        expect(f.ghost.p).toBeLessThan(1);
        expect(f.members.some((m) => m.id === f.ghost!.id)).toBe(false);
      }
    }
    expect(ghosts).toBeGreaterThan(0);
  });
});

describe('CityLifeLayer : terrasses selon la météo de la rue', () => {
  // Premier jour où la rue de la graine a un local à terrasse ouvert à midi.
  const find = (): { seed: number; date: YMD; slotId: string } => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const ss = shopSlotsFor(W, H, seed);
      for (const date of [SAT, { y: 2026, m: 10, d: 9 }]) {
        for (const s of streetOn(ss, seed, dayNumber(SAT), dayNumber(date), {})) {
          const v = shopViewAt(s, seed, date, 12 * 60 + 30);
          if (v.phase === 'open' && v.sign && SHOP_DEFS[v.sign.type].terrace > 0) return { seed, date, slotId: s.slot.id };
        }
      }
    }
    throw new Error('aucune terrasse trouvée');
  };
  const life = (seed: number, date: YMD, w: Weather): HTMLDivElement => {
    const minutes = 12 * 60 + 30;
    const sky = skyAt(minutes, times);
    const city: CityContext = { minutes, day: dayContext(date, []), precip: 0, snow: false, storm: false, daylight: sky.daylight, shops: { epochDay: dayNumber(SAT), names: {} } };
    return render(<svg><CityLifeLayer width={W} height={H} sky={sky} seed={seed} city={city} rainy={false} weather={{ read: () => w }} /></svg>).host;
  };
  it('par beau temps, la terrasse est sortie ; sous la pluie, aucune table dans la rue', () => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW);
    const { seed, date, slotId } = find();
    expect(life(seed, date, targetOf('sun')).querySelectorAll(`[data-shop-terrace="${slotId}"] [data-terrace-table]`).length).toBeGreaterThanOrEqual(2);
    expect(life(seed, date, targetOf('rain')).querySelectorAll('[data-terrace-table]')).toHaveLength(0);
  });
});
