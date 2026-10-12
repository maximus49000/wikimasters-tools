// @vitest-environment jsdom
// tests/content/shop-terrace.test.tsx — terrasses, cordon, videurs et file de la boîte de nuit (rendu, vague 1b-iv-b)
import { act, useEffect, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CityLifeLayer } from '../../src/content/city-life';
import { FigureContext, FigureRegistry } from '../../src/content/figure/figure-host';
import { PropContext, PropRegistry } from '../../src/content/prop/prop-host';
import { MIN_PITCH, NightclubDoor, entryScript, queueFrame, queueLayout, type EntryScript } from '../../src/content/shop-queue';
import { THRESHOLD_S } from '../../src/core/library/city/doorway';
import { ADVANCE_S, queueAt, queueWalkSpeed } from '../../src/core/library/city/shops/queue';
import { TURN_S } from '../../src/core/library/figure/gait';
import { ShopTerrace, collectCarriers, collectTerraceGuests, collectWaiters, placeCarriers, placeTerraceGuests, placeWaiters, terraceTables, tripAt, waiterTripAt, weatherHistory, type TerraceSky } from '../../src/content/shop-terrace';
import { ACCESSORY, gestureAt } from '../../src/core/library/city/shops/gestures';
import { dayContext, type YMD } from '../../src/core/library/city/calendar';
import type { CityContext } from '../../src/core/library/city/intensity';
import { cityMetrics } from '../../src/core/library/city/metrics';
import { outfitFor } from '../../src/core/library/city/people';
import { SHOP_DEFS, type ShopTypeId } from '../../src/core/library/city/shops/catalog';
import { dayNumber, isOpenAt, openRangeAt } from '../../src/core/library/city/shops/hours';
import { streetOn } from '../../src/core/library/city/shops/lifecycle';
import { shopFrame, shopSlotsFor } from '../../src/core/library/city/shops/slots';
import { WEATHER_HOLD, type TerraceWeather } from '../../src/core/library/city/shops/terrace';
import { shopViewAt, type ShopView } from '../../src/core/library/city/shops/view';
import { WORLD_MARGIN, mulberry32 } from '../../src/core/library/scene-world';
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
    // Les tables glissent pendant le montage…
    for (const t of tables(host)) expect((t as SVGGElement).style.transition).toContain('60s');
  });
  it('dernière minute du montage : toutes les tables visent déjà leur place (passage sans saut à la terrasse posée)', () => {
    const open = openRangeAt(SHOP_DEFS.cafe, SAT, 9 * 60)![0];
    const { host } = render(terrace('cafe', open + 5, SUN));
    expect(host.querySelector('[data-shop-terrace]')!.getAttribute('data-terrace-state')).toBe('setting-up');
    const targets = terraceTables(frame, metrics, tables(host).length);
    expect(tables(host).length).toBeGreaterThanOrEqual(2);
    for (const t of tables(host)) {
      const i = Number(t.getAttribute('data-terrace-table'));
      expect((t as SVGGElement).style.transform, `table ${i}`).toContain(`${targets[i]!.x.toFixed(1)}px`);
    }
    // La minute suivante, terrasse posée : même place, plus de transition.
    const { host: next } = render(terrace('cafe', open + 6, SUN));
    for (const t of tables(next)) {
      const i = Number(t.getAttribute('data-terrace-table'));
      expect((t as SVGGElement).style.transform).toContain(`${targets[i]!.x.toFixed(1)}px`);
      expect((t as SVGGElement).style.transition).toBe('');
    }
  });
  it('terrasse posée (ouverte ou parasols) : aucune glissade, rien ne peut partir du coin de la scène', () => {
    for (const w of [FINE, SUN]) {
      const { host } = render(terrace('cafe', 12 * 60, w));
      expect(tables(host).length).toBeGreaterThanOrEqual(2);
      for (const t of tables(host)) expect((t as SVGGElement).style.transition).toBe('');
    }
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
      // Aucune glissade : les tables n'ont pas de transition.
      for (const t of tables(host)) expect((t as SVGGElement).style.transition).toBe('');
    }
    expect(seated).toBeGreaterThan(0);
  });
});

// G5 : mobilier en images cellulo (registre d'accessoires) ; le classique reste le repli tant que l'image n'est pas cuite.
describe('terrasse et cordon : cellulo en Ghibli (G5)', () => {
  // Images du mobilier (pas celles des pantins) ; `before` : combien avant que la file ait cuit les images.
  const FURNITURE = '[data-table-top] > image, [data-terrace-chair] > image, [data-parasol] > image, [data-cordon] image';
  const cooked = async (node: ReactNode): Promise<{ host: HTMLDivElement; before: number }> => {
    const jobs: (() => void)[] = [];
    const reg = new PropRegistry('t', { schedule: (cb) => jobs.push(cb) });
    const { host } = render(<PropContext.Provider value={reg}>{node}</PropContext.Provider>);
    const before = host.querySelectorAll(FURNITURE).length;
    while (jobs.length) await act(async () => jobs.shift()!());
    return { host, before };
  };
  it('tables, chaises et parasols : repli classique puis une image chacun ; la chaise gauche par orientation, jamais par miroir', async () => {
    const { host, before } = await cooked(
      <svg>
        <ShopTerrace view={viewOf('cafe', SAT, 12 * 60)} frame={frame} metrics={metrics} minutes={12 * 60} date={SAT} weather={{ now: SUN, before: SUN }} crowd={1} reduced={false} sky={skyAt(12 * 60, times)} seed={SEED} waiterOutfit={waiter} ghibli />
      </svg>,
    );
    expect(before).toBe(0);
    const n = tables(host).length;
    expect(n).toBeGreaterThanOrEqual(2);
    expect(host.querySelectorAll('[data-table-top] > image')).toHaveLength(n);
    expect(host.querySelectorAll('[data-parasol] > image')).toHaveLength(n);
    const chairs = [...host.querySelectorAll('[data-terrace-chair]')];
    expect(chairs).toHaveLength(2 * n);
    for (const c of chairs) {
      expect(c.getAttribute('transform')).not.toContain('scale');
      expect(c.querySelector(':scope > image')).not.toBeNull();
    }
    // Deux images de chaise seulement (une par côté), partagées par toutes les tables.
    const hrefs = new Set(chairs.map((c) => c.querySelector('image')!.getAttribute('href')));
    expect(hrefs.size).toBeLessThanOrEqual(2);
  });
  it('classique : aucune image, chaises en miroir comme avant', () => {
    const { host } = render(terrace('cafe', 12 * 60, SUN));
    expect(host.querySelectorAll(FURNITURE)).toHaveLength(0);
    for (const c of host.querySelectorAll('[data-terrace-chair]')) expect(c.getAttribute('transform')).toContain('scale(');
  });
  it('cordon : deux poteaux en image, corde cellulo en trois traits (encre, velours, rehaut)', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW);
    const { host, before } = await cooked(
      <svg>
        <NightclubDoor view={viewOf('nightclub', SAT, 30)} frame={frame} metrics={metrics} minutes={30} date={SAT} reduced={false} sky={skyAt(30, times)} seed={SEED} sessionT0={NOW / 1000 - 600} width={W} ghibli />
      </svg>,
    );
    expect(before).toBe(0);
    const cordon = host.querySelector('[data-cordon]')!;
    expect(cordon.querySelectorAll('image')).toHaveLength(2);
    expect(cordon.querySelectorAll(':scope > path')).toHaveLength(3);
  });
});

describe('terrasse : serveur et météo', () => {
  it('le serveur sort par le seuil de la porte, va à une table et revient, absent le reste du temps', () => {
    const doorX = 100;
    const door = { x: 96, y: metrics.doorY - 20, w: 8, h: 20 };
    const targets = [80, 70];
    let street = 0;
    let sill = 0;
    for (let t = 0; t < 200; t += 0.25) {
      const trip = waiterTripAt(t, 7, doorX, door, metrics, targets, metrics.doorY + 10, 0.5)!;
      const v = tripAt(trip, t);
      if (v?.where === 'street') {
        street++;
        expect(v.x).toBeGreaterThanOrEqual(70 - 1e-6);
        expect(v.x).toBeLessThanOrEqual(doorX + 1e-6);
      }
      if (v?.where === 'door') {
        sill++;
        expect(v.passage.x).toBe(doorX);
      }
    }
    expect(street).toBeGreaterThan(100);
    expect(sill).toBeGreaterThan(10);
    expect(street + sill).toBeLessThan(800 * 0.6);
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
        <NightclubDoor view={viewOf('nightclub', date, minutes)} frame={frame} metrics={metrics} minutes={minutes} date={date} reduced={reduced} sky={skyAt(minutes, times)} seed={SEED} sessionT0={NOW / 1000 - 600} width={W} />
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
  it('queueLayout : façade étroite, moins de monde ; jamais moins de MIN_PITCH entre deux personnes ni personne sur l’entrée des habitants', () => {
    const counts = new Set<number>();
    let narrowest: { run: number; last: number; edge: number; away: number } | null = null;
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
      for (const slot of shopSlotsFor(W, H, seed)) {
        const f = shopFrame(slot, metrics.ground);
        const { doorX, away, pitch, max } = queueLayout(slot, f, metrics.unit);
        counts.add(max);
        expect(max).toBeGreaterThanOrEqual(1);
        expect(max).toBeLessThanOrEqual(6);
        if (max > 1) expect(pitch).toBeGreaterThanOrEqual(MIN_PITCH - 1e-9);
        expect(pitch).toBeLessThanOrEqual(6.5);
        // File du côté de la vitrine.
        expect(Math.sign(f.window.x + f.window.w / 2 - doorX)).toBe(away);
        // Dernière personne visible : pas au-delà du bord de l'entrée des habitants.
        const last = doorX + away * (9 + (max - 1) * pitch) * metrics.unit;
        const edge = away < 0 ? slot.residentDoorX + 12 : slot.residentDoorX;
        expect(away < 0 ? last >= edge - 1e-6 : last <= edge + 1e-6).toBe(true);
        const run = Math.abs(edge - doorX);
        if (!narrowest || run < narrowest.run) narrowest = { run, last, edge, away };
      }
    }
    // Les façades étroites montrent moins de monde que les larges.
    expect(counts.size).toBeGreaterThan(1);
    expect(Math.min(...counts)).toBeLessThan(6);
    const n = narrowest!;
    expect(n.away < 0 ? n.last >= n.edge - 1e-6 : n.last <= n.edge + 1e-6).toBe(true);
  });
  it('queueFrame : au plus `max` personnes, la dernière venue arrive une place plus loin (à pied, sans fondu)', () => {
    let stepping = 0;
    for (let t = 0; t < 300; t += 0.25) {
      const full = queueFrame(SEED, 'shop-0', t, 60, true);
      const two = queueFrame(SEED, 'shop-0', t, 60, true, 2);
      expect(two.members.length).toBeLessThanOrEqual(2);
      expect(two.members.map((m) => m.id)).toEqual(full.members.slice(0, 2).map((m) => m.id));
      for (const m of two.members) expect(m).not.toHaveProperty('opacity');
      const last = two.members[two.members.length - 1];
      if (last && last.pos > two.members.length - 1) stepping++;
    }
    expect(stepping).toBeGreaterThan(0);
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

describe('boîte de nuit : file à pied, sans fondu (G3a)', () => {
  const T0 = NOW / 1000 - 600;
  const clubAt = (t: number, ghibli: boolean): HTMLDivElement => {
    vi.spyOn(Date, 'now').mockReturnValue((T0 + t) * 1000);
    return render(
      <svg>
        <NightclubDoor view={viewOf('nightclub', SAT, 30)} frame={frame} metrics={metrics} minutes={30} date={SAT} reduced={false} sky={skyAt(30, times)} seed={SEED} sessionT0={T0} ghibli={ghibli} width={W} />
      </svg>,
    ).host;
  };
  const layout0 = queueLayout(slots[0]!, frame, metrics.unit);
  const entryOf = (id: string): EntryScript => entryScript(SEED, 'shop-0', id, metrics);
  // Instant où la personne qui entre est entre lo(e) et hi(e) secondes après son instant d'entrée (e : son script d'entrée).
  const when = (lo: (e: EntryScript) => number, hi: (e: EntryScript) => number): number => {
    for (let t = 0; t < 600; t += 0.05) {
      const g = queueFrame(SEED, 'shop-0', t, 30, true, 6, () => 9).ghost;
      if (!g) continue;
      const e = entryOf(g.id);
      if (g.c > lo(e) && g.c < hi(e)) return t;
    }
    throw new Error('aucune entrée');
  };
  const walkingAt = (): number => when(() => 0.02, (e) => e.walkS * 0.6);
  const turningAt = (): number => when((e) => e.walkS + 0.05, (e) => e.turnEnd - 0.05);
  const sillAt = (): number => when((e) => e.turnEnd + 0.1, (e) => e.end - 0.1);
  const xOf = (n: Element): number => Number(/translate\(([-\d.]+)/.exec(n.getAttribute('transform')!)![1]);
  it.each([false, true])('aucun nœud de la file n’a d’opacité < 1 (Ghibli : %s)', (ghibli) => {
    let sills = 0;
    for (const t of [3, 17.3, walkingAt(), sillAt(), 100.4]) {
      const c = clubAt(t, ghibli);
      for (const n of c.querySelectorAll('[data-queue-id]')) expect(Number(n.getAttribute('opacity') ?? '1')).toBe(1);
      if (c.querySelector('svg[data-club-door] [data-door-fig]')) sills++;
    }
    expect(sills).toBeGreaterThan(0);
  });
  it('Ghibli : chaque membre de la file est un pantin', () => {
    const c = clubAt(40, true);
    const members = [...c.querySelectorAll('[data-queue-member]')];
    expect(members.length).toBeGreaterThan(0);
    for (const m of members) expect(m.querySelector('[data-figure]')).not.toBeNull();
  });
  it('la personne marche vers la porte, puis passe le seuil dans un svg[data-club-door]', () => {
    for (const ghibli of [false, true]) {
      const before = clubAt(walkingAt(), ghibli);
      expect(before.querySelector('[data-queue-entering]')).not.toBeNull();
      expect(before.querySelector('svg[data-club-door] [data-queue-entering]')).toBeNull();
      const after = clubAt(sillAt(), ghibli);
      const node = after.querySelector('svg[data-club-door] [data-queue-entering]');
      expect(node).not.toBeNull();
      expect(after.querySelector('svg[data-club-door] [data-door-dark]')).not.toBeNull();
      expect(after.querySelector('svg[data-club-door]')!.hasAttribute('id')).toBe(false);
      if (ghibli) expect(node!.querySelector('[data-figure]')).not.toBeNull();
    }
  });
  // Pose Ghibli lue sur la clé affichée (palette # sig|yaw|gait|phase|head|arms|lean).
  const poseOf = (fig: Element): { yaw: number; gait: string; arms: string } => {
    const parts = fig.getAttribute('data-key')!.split('#').pop()!.split('|');
    return { yaw: Number(parts[1]), gait: parts[2]!, arms: parts[5]! };
  };
  it('Ghibli : demi-tour sur place à la porte avant le seuil (petits pas), marche avant', () => {
    const { doorX } = layout0;
    const walking = clubAt(walkingAt(), true).querySelector('[data-queue-entering] [data-figure]')!;
    expect(poseOf(walking).gait).toBe('walk');
    const turning = clubAt(turningAt(), true).querySelector('[data-queue-entering]')!;
    expect(turning.closest('svg[data-club-door]')).toBeNull();
    expect(Math.abs(xOf(turning) - doorX)).toBeLessThan(0.11);
    const pose = poseOf(turning.querySelector('[data-figure]')!);
    expect(pose.gait).toBe('step');
    // Entre le profil (vers la porte) et le dos.
    expect([0, 8]).not.toContain(pose.yaw);
  });
  it('la personne qui entre marche à sa vitesse de passant (pas de marche pressée), puis demi-tour et seuil', () => {
    const t = when((e) => e.walkS * 0.45, (e) => e.walkS * 0.55);
    const g = queueFrame(SEED, 'shop-0', t, 30, true, 6, () => 9).ghost!;
    const e = entryOf(g.id);
    const speed = queueWalkSpeed(SEED, 'shop-0', g.id);
    expect(e.walkS).toBeCloseTo(e.walkDist / speed, 6);
    expect(e.turnEnd - e.walkS).toBeCloseTo(TURN_S, 6);
    expect(e.end - e.turnEnd).toBeCloseTo(THRESHOLD_S, 6);
    // Plus long que l'avancée d'un cran : l'étape d'entrée est allongée, la marche n'est pas accélérée.
    expect(e.end).toBeGreaterThan(ADVANCE_S);
    for (const ghibli of [false, true]) {
      const node = clubAt(t, ghibli).querySelector('[data-queue-entering]')!;
      const slot0 = layout0.doorX + layout0.away * 9 * metrics.unit;
      const w = g.c / e.walkS;
      expect(Math.abs(xOf(node) - (slot0 + (layout0.doorX - slot0) * w))).toBeLessThan(0.11);
    }
  });
  it('Ghibli : au re-rendu, un membre qui avance garde sa marche (pose tirée de la dernière place connue)', () => {
    const max = layout0.max;
    const sig = (f: ReturnType<typeof queueFrame>): string => f.members.map((m) => m.id).join(',') + '|' + (f.ghost?.id ?? '');
    let t1 = -1;
    let id = '';
    for (let t = 2; t < 600 && t1 < 0; t += 0.05) {
      const a = queueFrame(SEED, 'shop-0', t, 30, true, max, () => 0.5);
      const b = queueFrame(SEED, 'shop-0', t + 0.1, 30, true, max, () => 0.5);
      if (sig(a) !== sig(b) || a.ghost) continue;
      const m = a.members.find((x, i) => i < a.members.length - 1 && x.pos % 1 > 0.2 && x.pos % 1 < 0.6);
      if (m) {
        t1 = t;
        id = m.id;
      }
    }
    expect(t1).toBeGreaterThanOrEqual(0);
    const reg = new FigureRegistry('t', { perFrame: 50 });
    const now = vi.spyOn(Date, 'now').mockReturnValue((T0 + t1) * 1000);
    const club = (): ReactNode => (
      <FigureContext.Provider value={reg}>
        <svg>
          <NightclubDoor view={viewOf('nightclub', SAT, 30)} frame={frame} metrics={metrics} minutes={30} date={SAT} reduced={false} sky={skyAt(30, times)} seed={SEED} sessionT0={T0} ghibli width={W} />
        </svg>
      </FigureContext.Provider>
    );
    const { host, root } = render(club());
    now.mockReturnValue((T0 + t1 + 0.1) * 1000);
    // Re-rendu (sprite de la nouvelle pose mis en file), puis peint, puis re-rendu : la clé affichée est celle du rendu.
    act(() => root.render(club()));
    reg.flush();
    act(() => root.render(club()));
    expect(poseOf(host.querySelector(`[data-queue-id="${id}"] [data-figure]`)!).gait).toBe('walk');
  });
});

describe('boîte de nuit : vigiles et arrivées de la file (G3b)', () => {
  const T0 = NOW / 1000 - 600;
  const layout0 = queueLayout(slots[0]!, frame, metrics.unit);
  const clubAt = (t: number, ghibli: boolean, width = W, doorXs: number[] = []): HTMLDivElement => {
    vi.spyOn(Date, 'now').mockReturnValue((T0 + t) * 1000);
    return render(
      <svg>
        <NightclubDoor view={viewOf('nightclub', SAT, 30)} frame={frame} metrics={metrics} minutes={30} date={SAT} reduced={false} sky={skyAt(30, times)} seed={SEED} sessionT0={T0} ghibli={ghibli} width={width} doorXs={doorXs} />
      </svg>,
    ).host;
  };
  const arriveOf = (width: number, doorXs: number[]) => ({ doorX: layout0.doorX, away: layout0.away, startPx: 9 * metrics.unit, pitchPx: layout0.pitch * metrics.unit, width, doorXs });
  const xOf = (n: Element): number => Number(/translate\(([-\d.]+)/.exec(n.getAttribute('transform')!)![1]);
  const keyOf = (fig: Element): string[] => fig.getAttribute('data-key')!.split('#').pop()!.split('|');

  it('Ghibli : vigiles en pantin bras croisés, de trois quarts vers la rue (2 à gauche, 6 à droite), sans miroir', () => {
    const c = clubAt(40, true);
    const bouncers = [...c.querySelectorAll('[data-bouncer]')];
    expect(bouncers).toHaveLength(2);
    for (const b of bouncers) {
      const fig = b.querySelector('[data-figure]')!;
      expect(fig).not.toBeNull();
      expect(b.querySelector('[data-crossed-arms]')).toBeNull();
      expect(b.getAttribute('transform')).not.toMatch(/scale\(-/);
      const [, yaw, gait, , , arms] = keyOf(fig);
      expect(arms).toBe('crossed');
      expect(gait).toBe('stand');
      expect(Number(yaw)).toBe(xOf(b) < layout0.doorX ? 2 : 6);
      // Costume des videurs (noir).
      expect(fig.getAttribute('data-sig')).toMatch(/^(bald|short)\.long\.pants\.none\./);
    }
    // Classique : dessin d'avant (bras croisés posés sur le passant).
    expect(clubAt(40, false).querySelectorAll('[data-bouncer] [data-crossed-arms]')).toHaveLength(2);
  });

  it.each([false, true])('arrivée depuis le bord : à pied sur le trottoir, hors de la file, sans opacité (Ghibli : %s)', (ghibli) => {
    let seen = 0;
    for (let t = 30; t < 400 && seen < 3; t += 7.3) {
      const f = queueFrame(SEED, 'shop-0', t, 30, true, layout0.max, () => 9, arriveOf(W, []));
      const a = f.arrivals.find((x) => x.passage.x > 0 && x.passage.x < W);
      if (!a) continue;
      seen++;
      const c = clubAt(t, ghibli);
      const node = c.querySelector(`[data-queue-id="${a.id}"]`)!;
      expect(node.hasAttribute('data-queue-arriving')).toBe(true);
      expect(node.hasAttribute('data-queue-member')).toBe(false);
      expect(node.getAttribute('opacity')).toBeNull();
      expect(Math.abs(xOf(node) - a.passage.x)).toBeLessThan(0.11);
      if (ghibli) {
        expect(keyOf(node.querySelector('[data-figure]')!)[2]).toBe('walk');
        expect(node.getAttribute('transform')).not.toMatch(/scale\(-/);
      }
      expect(c.querySelectorAll('[data-queue-member]').length).toBeLessThanOrEqual(layout0.max);
    }
    expect(seen).toBeGreaterThan(0);
  });

  it('bord trop loin : l’arrivée sort d’une entrée d’immeuble par le seuil (svg rogné, ombre de l’entrée)', () => {
    // Un local dont la file s'étire vers +x : dans un monde de 4000 px, le bord de ce côté est hors de portée (MAX_TRIP_PX).
    const slot = [1, 2, 3, 4, 5, 6, 7, 8].flatMap((s) => shopSlotsFor(W, H, s)).find((sl) => queueLayout(sl, shopFrame(sl, metrics.ground), metrics.unit).away > 0)!;
    const fr = shopFrame(slot, metrics.ground);
    const L = queueLayout(slot, fr, metrics.unit);
    const door = L.doorX + 200;
    const arrive = { doorX: L.doorX, away: L.away, startPx: 9 * metrics.unit, pitchPx: L.pitch * metrics.unit, width: 4000, doorXs: [door] };
    let found = false;
    for (let t = 30; t < 600 && !found; t += 0.1) {
      const f = queueFrame(SEED, slot.id, t, 30, true, L.max, () => 9, arrive);
      const a = f.arrivals.find((x) => x.passage.stage === 'threshold' && x.passage.depth > 0.2 && x.passage.depth < 0.8);
      if (!a) continue;
      found = true;
      expect(a.fromX).toBe(door);
      for (const ghibli of [false, true]) {
        vi.spyOn(Date, 'now').mockReturnValue((T0 + t) * 1000);
        const c = render(
          <svg>
            <NightclubDoor view={{ ...viewOf('nightclub', SAT, 30), slot }} frame={fr} metrics={metrics} minutes={30} date={SAT} reduced={false} sky={skyAt(30, times)} seed={SEED} sessionT0={T0} ghibli={ghibli} width={4000} doorXs={[door]} />
          </svg>,
        ).host;
        const sill = c.querySelector(`svg[data-club-arrival][data-queue-id="${a.id}"]`)!;
        expect(sill).not.toBeNull();
        expect(sill.querySelector('[data-door-dark]')).not.toBeNull();
        expect(sill.querySelector('[data-door-fig][data-queue-arriving]')).not.toBeNull();
        expect(sill.hasAttribute('id')).toBe(false);
      }
    }
    expect(found).toBe(true);
  });

  it('mouvement réduit : aucune arrivée', () => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW);
    reduceMotion();
    const c = render(
      <svg>
        <NightclubDoor view={viewOf('nightclub', SAT, 30)} frame={frame} metrics={metrics} minutes={30} date={SAT} reduced sky={skyAt(30, times)} seed={SEED} sessionT0={T0} ghibli width={W} />
      </svg>,
    ).host;
    expect(c.querySelector('[data-queue-arriving]')).toBeNull();
  });

  it.each([true, false])('longueur cible changée à la minute (diminue : %s) : au re-rendu, personne ne quitte la file ni n’y est posé', (shrink) => {
    const lengthAt = (m: number): number => queueAt(SEED, 'shop-0', 100, m, true).slice(0, layout0.max).length;
    let m0 = -1;
    for (let m = shrink ? 0 : 23 * 60; m < (shrink ? 299 : 1439) && m0 < 0; m++) if (shrink ? lengthAt(m + 1) < lengthAt(m) : lengthAt(m + 1) > lengthAt(m)) m0 = m;
    expect(m0).toBeGreaterThanOrEqual(0);
    const now = vi.spyOn(Date, 'now');
    const club = (m: number): ReactNode => (
      <svg>
        <NightclubDoor view={viewOf('nightclub', SAT, m)} frame={frame} metrics={metrics} minutes={m} date={SAT} reduced={false} sky={skyAt(m, times)} seed={SEED} sessionT0={T0} ghibli width={W} />
      </svg>
    );
    for (const tb of [207.3, 251.9]) {
      now.mockReturnValue((T0 + tb - 0.05) * 1000);
      const { host, root } = render(club(m0));
      const ids = (sel: string): string[] => [...host.querySelectorAll(sel)].map((n) => n.getAttribute('data-queue-id')!).sort();
      const before = { members: ids('[data-queue-member]'), all: ids('[data-queue-id]') };
      now.mockReturnValue((T0 + tb) * 1000);
      act(() => root.render(club(m0 + 1)));
      expect(ids('[data-queue-member]')).toEqual(before.members);
      for (const id of before.all) expect(ids('[data-queue-id]')).toContain(id);
    }
  });

  it.each([true, false])('trajets de plus d’une minute (bord lointain) : ni saut ni apparition à la minute qui suit le changement (diminue : %s)', (shrink) => {
    // Un local dont la file s'étire vers +x : dans un monde de 1400 px, le bord de ce côté est à plus d'une minute de marche.
    const slot = [1, 2, 3, 4, 5, 6, 7, 8].flatMap((sd) => shopSlotsFor(W, H, sd)).find((sl) => queueLayout(sl, shopFrame(sl, metrics.ground), metrics.unit).away > 0 && queueLayout(sl, shopFrame(sl, metrics.ground), metrics.unit).max >= 4)!;
    const fr = shopFrame(slot, metrics.ground);
    const lay = queueLayout(slot, fr, metrics.unit);
    const lengthAt = (m: number): number => queueAt(SEED, slot.id, 100, m, true).slice(0, lay.max).length;
    let m0 = -1;
    for (let m = shrink ? 0 : 23 * 60; m < (shrink ? 298 : 1438) && m0 < 0; m++)
      if ((shrink ? lengthAt(m + 1) < lengthAt(m) : lengthAt(m + 1) > lengthAt(m)) && lengthAt(m + 2) === lengthAt(m + 1)) m0 = m;
    expect(m0).toBeGreaterThanOrEqual(0);
    const now = vi.spyOn(Date, 'now');
    const club = (m: number): ReactNode => (
      <svg>
        <NightclubDoor view={{ ...viewOf('nightclub', SAT, m), slot }} frame={fr} metrics={metrics} minutes={m} date={SAT} reduced={false} sky={skyAt(m, times)} seed={SEED} sessionT0={T0} ghibli={false} width={1400} />
      </svg>
    );
    const spots = (host: HTMLElement): Map<string, number | null> =>
      new Map([...host.querySelectorAll('[data-queue-id]')].map((n) => [n.getAttribute('data-queue-id')!, n.tagName === 'svg' ? null : Number(/translate\(([-\d.]+)/.exec(n.getAttribute('transform')!)![1])]));
    const tb = 203.7;
    now.mockReturnValue((T0 + tb - 0.05) * 1000);
    const { host, root } = render(club(m0));
    // Chaque minute, rendue jusqu'à la suivante ; à chaque passage de minute, comparaison de l'image d'avant et de celle d'après.
    for (const [m, at] of [[m0 + 1, tb], [m0 + 2, tb + 60]] as const) {
      now.mockReturnValue((T0 + at - 0.05) * 1000);
      act(() => root.render(club(m - 1)));
      const before = spots(host);
      now.mockReturnValue((T0 + at) * 1000);
      act(() => root.render(club(m)));
      const after = spots(host);
      for (const [id, x] of before) {
        expect(after.has(id), `${id} disparaît à la minute ${m}`).toBe(true);
        const y = after.get(id);
        if (x !== null && y !== null && y !== undefined) expect(Math.abs(y - x), `${id} saute à la minute ${m}`).toBeLessThan(1.5);
      }
      for (const [id, x] of after) if (!before.has(id)) expect(x === null || x > 1400 + WORLD_MARGIN - 2, `${id} apparaît à la minute ${m}`).toBe(true);
    }
  });
});

describe('boîte de nuit : fermeture et arrivée des videurs, à pied (G3b)', () => {
  const T0 = NOW / 1000 - 600;
  const xOf = (n: Element): number => Number(/translate\(([-\d.]+)/.exec(n.getAttribute('transform')!)![1]);
  const club = (date: YMD, m: number, ghibli: boolean): ReactNode => (
    <svg>
      <NightclubDoor view={viewOf('nightclub', date, m)} frame={frame} metrics={metrics} minutes={m} date={date} reduced={false} sky={skyAt(m, times)} seed={SEED} sessionT0={T0} ghibli={ghibli} width={W} />
    </svg>
  );
  // Où est chaque personne affichée : sur le trottoir (x) ou dans un seuil (opacité de la figure : 1 − profondeur).
  type Spot = { street: number | null; sill: number | null };
  const spots = (host: HTMLElement): Map<string, Spot> => {
    const out = new Map<string, Spot>();
    for (const n of host.querySelectorAll('[data-queue-id], [data-bouncer]')) {
      const key = n.getAttribute('data-queue-id') ?? `b@${n.getAttribute('data-club-walk') ?? out.size}`;
      if (n.tagName === 'svg') out.set(key, { street: null, sill: Number(n.querySelector('[data-door-fig]')!.getAttribute('opacity')) });
      else out.set(key, { street: xOf(n), sill: null });
    }
    return out;
  };
  it.each([false, true])('fermeture (5 h) : personne ne disparaît sur place, la file s’en va à pied, les videurs finissent dans la porte (Ghibli : %s)', (ghibli) => {
    const now = vi.spyOn(Date, 'now');
    const tb = 233.4;
    now.mockReturnValue((T0 + tb - 0.05) * 1000);
    const { host, root } = render(club(SAT, 4 * 60 + 59, ghibli));
    const before = spots(host);
    expect([...before.keys()].filter((k) => !k.startsWith('b@')).length).toBeGreaterThan(0);
    now.mockReturnValue((T0 + tb) * 1000);
    act(() => root.render(club(SAT, 5 * 60, ghibli)));
    expect(host.querySelector('[data-club-closing]')).not.toBeNull();
    let last = spots(host);
    for (const id of before.keys()) if (!id.startsWith('b@')) expect(last.has(id), `${id} disparaît à la fermeture`).toBe(true);
    expect(host.querySelectorAll('[data-bouncer]')).toHaveLength(2);
    let bouncersInDoor = 0;
    for (let t = tb + 0.2; t < tb + 400 && host.querySelector('[data-nightclub]'); t += 0.2) {
      now.mockReturnValue((T0 + t) * 1000);
      act(() => root.render(club(SAT, 5 * 60, ghibli)));
      const cur = spots(host);
      for (const [id, s] of last) {
        if (cur.has(id)) continue;
        // Parti : hors champ (bord du monde) ou au fond d'un seuil.
        if (s.sill !== null) {
          expect(s.sill, `${id} disparaît dans un seuil peu profond @${t}`).toBeLessThanOrEqual(0.25);
          if (id.startsWith('b@')) bouncersInDoor++;
        } else expect(s.street! < -WORLD_MARGIN + 12 || s.street! > W + WORLD_MARGIN - 12, `${id} disparaît en pleine rue (${s.street}) @${t}`).toBe(true);
      }
      for (const id of cur.keys()) if (!last.has(id) && !id.startsWith('b@')) throw new Error(`${id} apparaît @${t}`);
      for (const n of host.querySelectorAll('[data-queue-id], [data-bouncer]')) expect(n.getAttribute('opacity')).toBeNull();
      last = cur;
    }
    expect(host.querySelector('[data-nightclub]')).toBeNull();
    expect(bouncersInDoor).toBe(2);
  });

  it('arrivée des videurs (22 h 30) : ils sortent de la porte du club, puis se postent, bras croisés', () => {
    const now = vi.spyOn(Date, 'now');
    const tb = 120.7;
    now.mockReturnValue((T0 + tb - 0.05) * 1000);
    const { host, root } = render(club(THU, 22 * 60 + 29, true));
    expect(host.querySelector('[data-nightclub]')).toBeNull();
    now.mockReturnValue((T0 + tb) * 1000);
    act(() => root.render(club(THU, 22 * 60 + 30, true)));
    const first = [...host.querySelectorAll('[data-bouncer]')];
    expect(first).toHaveLength(2);
    // Au fond de l'entrée du club : invisibles (profondeur 1), pas posés sur le trottoir.
    for (const b of first) {
      expect(b.tagName).toBe('svg');
      expect(Number(b.querySelector('[data-door-fig]')!.getAttribute('opacity'))).toBe(0);
    }
    let street = 0;
    for (let t = tb + 0.2; t < tb + 30; t += 0.2) {
      now.mockReturnValue((T0 + t) * 1000);
      act(() => root.render(club(THU, 22 * 60 + 30, true)));
      street += [...host.querySelectorAll('g[data-bouncer][data-club-walk]')].length;
    }
    expect(street).toBeGreaterThan(0);
    const posted = [...host.querySelectorAll('[data-bouncer]')];
    expect(posted).toHaveLength(2);
    for (const b of posted) {
      expect(b.hasAttribute('data-club-walk')).toBe(false);
      const parts = b.querySelector('[data-figure]')!.getAttribute('data-key')!.split('#').pop()!.split('|');
      expect(parts[5]).toBe('crossed');
    }
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
  it('horloge réglée APRÈS le montage (effet du parent) : la terrasse et ses parasols se corrigent aussitôt', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW);
    const { seed, date, slotId } = find();
    // Comme useWeather : l'horloge rend une météo par défaut (ici la pluie) tant que le parent n'a pas posé sa source.
    const source = { w: targetOf('rain') };
    const clock = { read: (): Weather => source.w };
    function Panel({ children }: { children: ReactNode }): ReactNode {
      useEffect(() => {
        source.w = targetOf('sun');
      }, []);
      return children;
    }
    const minutes = 12 * 60 + 30;
    const sky = skyAt(minutes, times);
    const city: CityContext = { minutes, day: dayContext(date, []), precip: 0, snow: false, storm: false, daylight: sky.daylight, shops: { epochDay: dayNumber(SAT), names: {} } };
    const { host } = render(
      <Panel>
        <svg><CityLifeLayer width={W} height={H} sky={sky} seed={seed} city={city} rainy={false} weather={clock} /></svg>
      </Panel>,
    );
    // Premier rendu avec la météo par défaut : rien.
    expect(host.querySelectorAll('[data-terrace-table]')).toHaveLength(0);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    const terrace = host.querySelector(`[data-shop-terrace="${slotId}"]`)!;
    expect(terrace.getAttribute('data-terrace-state')).toBe('umbrellas');
    expect(terrace.querySelectorAll('[data-parasol]').length).toBe(terrace.querySelectorAll('[data-terrace-table]').length);
  });
});

describe('G3b : convives et serveur de terrasse', () => {
  const T = NOW / 1000;
  const keyOf = (fig: Element | null): string[] => (fig?.getAttribute('data-key') ?? '').split('#').pop()!.split('|');
  // Montré : ni lui ni un ancêtre caché (visibility ou display).
  const shown = (n: Element | null): boolean => {
    if (!n) return false;
    for (let x: Element | null = n; x; x = x.parentElement) if (x.getAttribute('visibility') === 'hidden' || x.getAttribute('display') === 'none') return false;
    return true;
  };
  const draw = (figures: FigureRegistry, type: ShopTypeId, minutes: number, ghibli: boolean, reduced = false): HTMLDivElement =>
    render(
      <FigureContext.Provider value={figures}>
        <svg>
          <ShopTerrace view={viewOf(type, SAT, minutes)} frame={frame} metrics={metrics} minutes={minutes} date={SAT} weather={{ now: FINE, before: FINE }} crowd={1} reduced={reduced} sky={skyAt(minutes, times)} seed={SEED} waiterOutfit={waiter} ghibli={ghibli} />
        </svg>
      </FigureContext.Provider>,
    ).host;
  const settle = (figures: FigureRegistry, f: () => void): void => {
    f();
    figures.flush();
    f();
  };
  // Première minute où un convive du café arrive / repart / reste assis.
  const found = new Map<string, number>();
  const minuteWith = (move: 'arrive' | 'leave' | 'seated'): number => {
    if (found.has(move)) return found.get(move)!;
    for (let m = 9 * 60; m < 19 * 60; m++) {
      vi.spyOn(Date, 'now').mockReturnValue(NOW);
      const { host, root } = render(
        <svg>
          <ShopTerrace view={viewOf('cafe', SAT, m)} frame={frame} metrics={metrics} minutes={m} date={SAT} weather={{ now: FINE, before: FINE }} crowd={1} reduced={false} sky={skyAt(m, times)} seed={SEED} waiterOutfit={waiter} />
        </svg>,
      );
      const hit = host.querySelector(`[data-terrace-guest][data-move="${move}"]`) !== null;
      act(() => root.unmount());
      host.remove();
      mounted.pop();
      if (hit) {
        found.set(move, m);
        return m;
      }
    }
    throw new Error(`aucun convive « ${move} »`);
  };
  // Aucun fondu sur un convive : seul le seuil de porte (data-door-fig) porte une opacité.
  const noFade = (c: Element): void => {
    for (const n of c.querySelectorAll('[data-terrace-guest], [data-terrace-guest] *, [data-terrace-trip], [data-terrace-trip] *')) {
      // Groupes seulement (les dessins du sprite ont leurs propres transparences de matière, ex. rayure du maillot).
      if (n.hasAttribute('data-door-fig') || n.hasAttribute('data-door-dark') || (n.tagName.toLowerCase() !== 'g' && n.tagName.toLowerCase() !== 'svg')) continue;
      expect(n.getAttribute('opacity')).toBeNull();
    }
  };

  it('Ghibli : convive assis en pantin, tourné vers sa table (2 ou 6), sans miroir, geste de la famille à table', () => {
    const m = minuteWith('seated');
    vi.spyOn(Date, 'now').mockReturnValue(NOW);
    const figures = new FigureRegistry('g4s', { perFrame: 50 });
    const c = draw(figures, 'cafe', m, true);
    const guest = c.querySelector('[data-terrace-guest][data-move="seated"]')!;
    expect(guest.getAttribute('transform')).not.toMatch(/scale\(-/);
    const fig = guest.querySelector('[data-figure]')!;
    expect(fig).not.toBeNull();
    expect(guest.querySelector('[data-pose-body]')).toBeNull();
    const guests = collectTerraceGuests(c);
    settle(figures, () => placeTerraceGuests(guests, T + 5, metrics, figures));
    const key = keyOf(fig);
    expect(key[2]).toBe('seated');
    expect(key[1]).toBe(guest.getAttribute('data-seat') === '0' ? '2' : '6');
    const seed = Number(guest.getAttribute('data-gesture-seed'));
    expect(key[5]).toBe(gestureAt('cafe', 'customer', T + 5, seed).arms);
    expect(guest.querySelector(`[data-accessory="${ACCESSORY.cafe}"]`)).not.toBeNull();
    noFade(c);
  });

  it.each([true, false])('arrivée : sort de la porte du local, marche jusqu’à sa chaise et s’assoit, sans fondu (Ghibli : %s)', (ghibli) => {
    const m = minuteWith('arrive');
    vi.spyOn(Date, 'now').mockReturnValue(NOW);
    const figures = new FigureRegistry('g4a', { perFrame: 50 });
    const c = draw(figures, 'cafe', m, ghibli);
    const guest = c.querySelector('[data-terrace-guest][data-move="arrive"]')!;
    const key = guest.getAttribute('data-guest-key')!;
    const trip = c.querySelector(`[data-terrace-trip="${key}"]`)!;
    expect(trip).not.toBeNull();
    const seat = guest.querySelector('[data-guest-seat]')!;
    const street = trip.querySelector('[data-trip-street]')!;
    const door = trip.querySelector('svg[data-trip-door]')!;
    // Au rendu : ni sur la chaise ni dans la rue (encore dans le local).
    expect(shown(seat)).toBe(false);
    expect(shown(street)).toBe(false);
    const guests = collectTerraceGuests(c);
    const seen: string[] = [];
    const xs: number[] = [];
    for (let t = T; t < T + 60; t += 0.25) {
      settle(figures, () => placeTerraceGuests(guests, t, metrics, ghibli ? figures : null));
      const s = shown(seat) ? 'seat' : shown(street) ? 'street' : shown(door) ? 'door' : 'none';
      if (seen[seen.length - 1] !== s) seen.push(s);
      if (s === 'street') xs.push(Number(/translate\(([-\d.]+)/.exec(street.getAttribute('transform')!)![1]));
      // Jamais à deux endroits à la fois.
      expect([shown(seat), shown(street), shown(door)].filter(Boolean).length).toBeLessThanOrEqual(1);
    }
    expect(seen).toEqual(['none', 'door', 'street', 'seat']);
    const doorX = frame.door.x + frame.door.w / 2;
    expect(Math.abs(xs[0]! - doorX)).toBeLessThan(1);
    expect(Math.abs(xs[xs.length - 1]! - Number(guest.getAttribute('data-seat-x')))).toBeLessThan(1);
    noFade(c);
    if (ghibli) {
      expect(street.querySelector('[data-figure]')).not.toBeNull();
      expect(street.getAttribute('transform')).not.toMatch(/scale\(-/);
    } else expect(trip.querySelector('[data-figure]')).toBeNull();
  });

  it.each([true, false])('départ : se lève, marche jusqu’à la porte et rentre ; rien sur la chaise à la fin de la minute (Ghibli : %s)', (ghibli) => {
    const m = minuteWith('leave');
    vi.spyOn(Date, 'now').mockReturnValue(NOW);
    const figures = new FigureRegistry('g4l', { perFrame: 50 });
    const c = draw(figures, 'cafe', m, ghibli);
    const guest = c.querySelector('[data-terrace-guest][data-move="leave"]')!;
    const trip = c.querySelector(`[data-terrace-trip="${guest.getAttribute('data-guest-key')}"]`)!;
    const seat = guest.querySelector('[data-guest-seat]')!;
    const street = trip.querySelector('[data-trip-street]')!;
    const door = trip.querySelector('svg[data-trip-door]')!;
    expect(shown(seat)).toBe(true);
    const guests = collectTerraceGuests(c);
    const seen: string[] = [];
    let stood = false;
    for (let t = T; t < T + 60; t += 0.25) {
      settle(figures, () => placeTerraceGuests(guests, t, metrics, ghibli ? figures : null));
      const s = shown(seat) ? 'seat' : shown(street) ? 'street' : shown(door) ? 'door' : 'none';
      if (seen[seen.length - 1] !== s) seen.push(s);
      if (ghibli && s === 'street' && keyOf(street.querySelector('[data-figure]'))[2] === 'stand') stood = true;
    }
    expect(seen).toEqual(['seat', 'street', 'door', 'none']);
    if (ghibli) expect(stood).toBe(true);
    noFade(c);
  });

  it('classique : convive assis inchangé (passant assis, miroir à droite de la table)', () => {
    const m = minuteWith('seated');
    vi.spyOn(Date, 'now').mockReturnValue(NOW);
    const c = draw(new FigureRegistry('g4c', { perFrame: 50 }), 'cafe', m, false);
    const guests = [...c.querySelectorAll('[data-terrace-guest][data-move="seated"]')];
    expect(guests.length).toBeGreaterThan(0);
    for (const g of guests) {
      expect(g.querySelector('[data-figure]')).toBeNull();
      expect(g.getAttribute('transform')).toBe(g.getAttribute('data-seat') === '0' ? 'translate(-9 0) scale(1 1)' : 'translate(9 0) scale(-1 1)');
    }
  });

  it('plafond des figurants : un convive caché par le plafond ne marche pas non plus', () => {
    const m = minuteWith('arrive');
    vi.spyOn(Date, 'now').mockReturnValue(NOW);
    const c = draw(new FigureRegistry('g4b', { perFrame: 50 }), 'cafe', m, false);
    const guest = c.querySelector('[data-terrace-guest][data-move="arrive"]')!;
    const trip = c.querySelector(`[data-terrace-trip="${guest.getAttribute('data-guest-key')}"]`)!;
    guest.setAttribute('visibility', 'hidden');
    const guests = collectTerraceGuests(c);
    for (let t = T; t < T + 60; t += 0.5) {
      placeTerraceGuests(guests, t, metrics, null);
      expect(shown(trip.querySelector('[data-trip-street]'))).toBe(false);
      expect(shown(trip.querySelector('svg[data-trip-door]'))).toBe(false);
    }
  });

  it('mouvement réduit : convives assis immobiles, aucun trajet', () => {
    const m = minuteWith('arrive');
    vi.spyOn(Date, 'now').mockReturnValue(NOW);
    const c = draw(new FigureRegistry('g4r', { perFrame: 50 }), 'cafe', m, true, true);
    expect(c.querySelector('[data-terrace-trip]')).toBeNull();
    for (const g of c.querySelectorAll('[data-terrace-guest]')) expect(shown(g.querySelector('[data-guest-seat]'))).toBe(true);
  });

  it('Ghibli : serveur en tablier, sort par la porte avec l’objet du commerce à la main, sert, revient les mains vides', () => {
    const m = minuteWith('seated');
    vi.spyOn(Date, 'now').mockReturnValue(NOW);
    const figures = new FigureRegistry('g4w', { perFrame: 50 });
    const c = draw(figures, 'cafe', m, true);
    const node = c.querySelector('[data-terrace-waiter]')!;
    expect(node).not.toBeNull();
    expect(node.getAttribute('opacity')).toBeNull();
    const street = node.querySelector('[data-trip-street]')!;
    const door = node.querySelector('svg[data-trip-door]')!;
    const fig = street.querySelector('[data-figure]')!;
    expect(fig.getAttribute('data-sig')!.endsWith('.a')).toBe(true);
    const item = street.querySelector('[data-item-hand]')!;
    expect(item.querySelector(`[data-accessory="${ACCESSORY.cafe}"]`)).not.toBeNull();
    expect(item.closest('[data-held]')!.getAttribute('data-held')).toBe('handR');
    const waiters = collectWaiters(c);
    let doors = 0, loaded = 0, empty = 0, served = 0;
    for (let t = T; t < T + 40; t += 0.25) {
      settle(figures, () => placeWaiters(waiters, t, metrics, figures));
      if (shown(door)) doors++;
      if (!shown(street)) continue;
      const k = keyOf(fig);
      expect(street.getAttribute('transform')).not.toMatch(/scale\(-/);
      if (k[2] === 'walk' && k[5] === 'hold' && shown(item)) loaded++;
      if (k[2] === 'walk' && k[5] === 'swing' && !shown(item)) empty++;
      if (k[2] === 'stand') served++;
    }
    expect(doors).toBeGreaterThan(0);
    expect(loaded).toBeGreaterThan(0);
    expect(empty).toBeGreaterThan(0);
    expect(served).toBeGreaterThan(0);
  });
});

describe('G3b : porteur des tables et averse', () => {
  const T = NOW / 1000;
  const shown = (n: Element | null): boolean => {
    if (!n) return false;
    for (let x: Element | null = n; x; x = x.parentElement) if (x.getAttribute('visibility') === 'hidden' || x.getAttribute('display') === 'none') return false;
    return true;
  };
  const keyOf = (fig: Element | null): string[] => (fig?.getAttribute('data-key') ?? '').split('#').pop()!.split('|');
  const at = (type: ShopTypeId, m: number, ghibli: boolean, figures: FigureRegistry, w: TerraceSky = { now: SUN, before: SUN }): HTMLDivElement =>
    render(
      <FigureContext.Provider value={figures}>
        <svg>
          <ShopTerrace view={viewOf(type, SAT, m)} frame={frame} metrics={metrics} minutes={m} date={SAT} weather={w} crowd={1} reduced={false} sky={skyAt(m, times)} seed={SEED} waiterOutfit={waiter} ghibli={ghibli} />
        </svg>
      </FigureContext.Provider>,
    ).host;
  // Où est le porteur à chaque instant de la minute rendue : 'door', 'street' ou 'none'.
  const follow = (c: HTMLDivElement, ghibli: boolean, figures: FigureRegistry, poses?: string[]): string[] => {
    const carriers = collectCarriers(c);
    const node = c.querySelector('[data-terrace-carrier]');
    const seq: string[] = [];
    for (let t = T; t < T + 60; t += 0.25) {
      placeCarriers(carriers, t, metrics, ghibli ? figures : null);
      if (ghibli) figures.flush();
      placeCarriers(carriers, t, metrics, ghibli ? figures : null);
      const street = node?.querySelector('[data-trip-street]') ?? null;
      const s = shown(street) ? 'street' : shown(node?.querySelector('svg[data-trip-door]') ?? null) ? 'door' : 'none';
      if (seq[seq.length - 1] !== s) seq.push(s);
      if (poses && s === 'street') poses.push(keyOf(street!.querySelector('[data-figure]'))[5]!);
    }
    return seq;
  };

  it.each([true, false])('montage : le porteur sort par la porte avec la première table et rentre par la porte la minute d’après (Ghibli : %s)', (ghibli) => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW);
    const figures = new FigureRegistry('g4p', { perFrame: 50 });
    const open = openRangeAt(SHOP_DEFS.cafe, SAT, 9 * 60)![0];
    const first = at('cafe', open, ghibli, figures);
    expect(first.querySelector('[data-terrace-carrier]')!.getAttribute('style')).toBeNull();
    const poses: string[] = [];
    const seq = follow(first, ghibli, figures, poses);
    // Avant de sortir, il est dans le local ; puis le seuil, puis le trottoir.
    expect(seq.slice(seq[0] === 'none' ? 1 : 0, (seq[0] === 'none' ? 1 : 0) + 2)).toEqual(['door', 'street']);
    if (ghibli) expect(poses).toContain('carry');
    // Minutes du montage : jamais d'apparition sur le trottoir sans passer la porte.
    for (let m = open + 1; m < open + 6; m++) {
      const s = follow(at('cafe', m, ghibli, figures), ghibli, figures);
      expect(s).not.toContain('none');
    }
    // Minute suivante (terrasse posée) : il revient et rentre par la porte.
    const home = follow(at('cafe', open + 6, ghibli, figures), ghibli, figures);
    expect(home.slice(-2)).toEqual(['door', 'none']);
    expect(home[0]).toBe('street');
  });

  it.each([true, false])('démontage : chaque table rentre par la porte, le porteur avec elle ; dernière minute : tout est rentré (Ghibli : %s)', (ghibli) => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW);
    const figures = new FigureRegistry('g4d', { perFrame: 50 });
    const close = openRangeAt(SHOP_DEFS.cafe, SAT, 12 * 60)![1];
    const last = at('cafe', close - 10 + 5, ghibli, figures);
    expect(last.querySelector('[data-shop-terrace]')!.getAttribute('data-terrace-state')).toBe('clearing');
    const doorX = frame.door.x + frame.door.w / 2;
    for (const t of tables(last)) expect((t as SVGGElement).style.transform).toContain(`${doorX.toFixed(1)}px`);
    expect(follow(last, ghibli, figures).slice(-2)).toEqual(['door', 'none']);
  });

  it('averse soudaine : 1re minute, les convives repartent tous à pied (tables dehors) ; puis l’employé rentre les tables ; puis rien', () => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW);
    const figures = new FigureRegistry('g4r', { perFrame: 50 });
    const RAIN_ = { ...FINE, rain: true };
    const rush = (sinceBad: number): TerraceSky => ({ now: RAIN_, before: RAIN_, rush: { sinceBad, beforeBad: FINE } });
    let m = 12 * 60;
    const guestsAt = (x: number): number => at('cafe', x, true, figures, { now: FINE, before: FINE }).querySelectorAll('[data-terrace-guest]').length;
    for (let n = 0; guestsAt(m) === 0 && n < 600; n++) m++;
    expect(guestsAt(m)).toBeGreaterThan(0);
    const c = at('cafe', m, true, figures, rush(1));
    expect(c.querySelector('[data-shop-terrace]')!.getAttribute('data-terrace-state')).toBe('emptying');
    const guests = [...c.querySelectorAll('[data-terrace-guest]')];
    expect(guests.length).toBeGreaterThan(0);
    for (const g of guests) expect(g.getAttribute('data-move')).toBe('leave');
    expect(c.querySelector('[data-terrace-waiter]')).toBeNull();
    const after = at('cafe', m + 1, true, figures, rush(2));
    expect(after.querySelector('[data-shop-terrace]')!.getAttribute('data-terrace-state')).toBe('clearing');
    expect(after.querySelectorAll('[data-terrace-guest]')).toHaveLength(0);
    expect(after.querySelector('[data-terrace-carrier]')).not.toBeNull();
    expect(at('cafe', m + 4, true, figures, rush(5)).querySelector('[data-shop-terrace]')).toBeNull();
  });

  it('historique : compte les minutes d’averse et garde le temps d’avant', () => {
    const h = weatherHistory();
    const t0 = NOW + 30 * 60_000;
    const rainFrom = t0 - 60_000;
    const read = (ms: number): Weather => targetOf(ms >= rainFrom ? 'rain' : 'sun');
    const s = h.sample(read, t0);
    expect(s.rush!.sinceBad).toBe(2);
    expect(s.rush!.beforeBad.rain).toBe(false);
    // Minute d'avant : sa propre fenêtre (k = 2..11), début de l'averse à sa minute.
    expect(s.prev!.rush!.sinceBad).toBe(1);
    expect(s.prev!.now.rain).toBe(true);
    expect(h.sample(() => targetOf('sun'), t0 + 30 * 60_000).rush!.sinceBad).toBe(0);
  });
  it('historique : averse d’une minute puis beau temps, le rush continue (minutes depuis le début de l’averse)', () => {
    const h = weatherHistory();
    const t0 = NOW + 30 * 60_000;
    const rainMinute = Math.floor(t0 / 60_000) - 2;
    const read = (ms: number): Weather => targetOf(Math.floor(ms / 60_000) === rainMinute ? 'rain' : 'sun');
    const s = h.sample(read, t0);
    expect(s.now.rain).toBe(false);
    expect(s.rush!.sinceBad).toBe(3);
  });
  it('fin de l’hystérésis : à la première minute de beau temps, les convives arrivent à pied (pas posés sur la chaise)', () => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW);
    const figures = new FigureRegistry('g4h', { perFrame: 50 });
    const h = weatherHistory();
    // Pluie jusqu'à 11 minutes avant : la fenêtre de la minute courante (1..10) est sèche, celle de la minute d'avant (2..11) non.
    let m = 12 * 60;
    for (;; m++) {
      const t0 = NOW + 60 * 60_000;
      const end = Math.floor(t0 / 60_000) - WEATHER_HOLD - 1;
      const sky = h.sample((ms) => targetOf(Math.floor(ms / 60_000) <= end ? 'rain' : 'sun'), t0);
      expect(sky.before.rain).toBe(false);
      expect(sky.prev!.before.rain).toBe(true);
      const c = at('cafe', m, true, figures, sky);
      const guests = [...c.querySelectorAll('[data-terrace-guest]')];
      if (guests.length === 0) continue;
      for (const g of guests) expect(g.getAttribute('data-move')).toBe('arrive');
      break;
    }
  });
});
