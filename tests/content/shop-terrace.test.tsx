// @vitest-environment jsdom
// tests/content/shop-terrace.test.tsx — terrasses, cordon, videurs et file de la boîte de nuit (rendu, vague 1b-iv-b)
import { act, useEffect, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CityLifeLayer } from '../../src/content/city-life';
import { FigureContext, FigureRegistry } from '../../src/content/figure/figure-host';
import { MIN_PITCH, NightclubDoor, queueFrame, queueLayout } from '../../src/content/shop-queue';
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
  it('queueFrame : au plus `max` personnes, la dernière visible arrive en fondu', () => {
    let fading = 0;
    for (let t = 0; t < 300; t += 0.25) {
      const full = queueFrame(SEED, 'shop-0', t, 60, true);
      const two = queueFrame(SEED, 'shop-0', t, 60, true, 2);
      expect(two.members.length).toBeLessThanOrEqual(2);
      expect(two.members.map((m) => m.id)).toEqual(full.members.slice(0, 2).map((m) => m.id));
      const last = two.members[two.members.length - 1];
      if (last && last.opacity < 1) fading++;
      if (two.members.length === 2) expect(two.members[0]!.opacity).toBe(1);
    }
    expect(fading).toBeGreaterThan(0);
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
        <NightclubDoor view={viewOf('nightclub', SAT, 30)} frame={frame} metrics={metrics} minutes={30} date={SAT} reduced={false} sky={skyAt(30, times)} seed={SEED} sessionT0={T0} ghibli={ghibli} />
      </svg>,
    ).host;
  };
  // Instant où la personne qui entre est à `p` (0..1) de son parcours.
  const when = (lo: number, hi: number): number => {
    for (let t = 0; t < 600; t += 0.05) {
      const g = queueFrame(SEED, 'shop-0', t, 30, true).ghost;
      if (g && g.p > lo && g.p < hi) return t;
    }
    throw new Error('aucune entrée');
  };
  it.each([false, true])('aucun nœud de la file n’a d’opacité < 1 (Ghibli : %s)', (ghibli) => {
    let sills = 0;
    for (const t of [3, 17.3, when(0.2, 0.3), when(0.7, 0.8), 100.4]) {
      const c = clubAt(t, ghibli);
      for (const n of c.querySelectorAll('[data-queue-id]')) expect(Number(n.getAttribute('opacity') ?? '1')).toBe(1);
      const g = queueFrame(SEED, 'shop-0', t, 30, true).ghost;
      if (g && g.p > 0.5) {
        expect(c.querySelectorAll('[data-queue-id] [data-door-fig]').length).toBeGreaterThan(0);
        sills++;
      }
    }
    expect(sills).toBeGreaterThan(0);
  });
  it('Ghibli : chaque membre de la file est un pantin', () => {
    const c = clubAt(40, true);
    const members = [...c.querySelectorAll('[data-queue-member]')];
    expect(members.length).toBeGreaterThan(0);
    for (const m of members) expect(m.querySelector('[data-figure]')).not.toBeNull();
  });
  it('p ≤ 0,5 : la personne marche vers la porte ; p > 0,5 : elle passe le seuil dans un svg[data-club-door]', () => {
    for (const ghibli of [false, true]) {
      const before = clubAt(when(0.1, 0.4), ghibli);
      expect(before.querySelector('[data-queue-entering]')).not.toBeNull();
      expect(before.querySelector('svg[data-club-door] [data-queue-entering]')).toBeNull();
      const after = clubAt(when(0.6, 0.9), ghibli);
      const node = after.querySelector('svg[data-club-door] [data-queue-entering]');
      expect(node).not.toBeNull();
      expect(after.querySelector('svg[data-club-door] [data-door-dark]')).not.toBeNull();
      expect(after.querySelector('svg[data-club-door]')!.hasAttribute('id')).toBe(false);
      if (ghibli) expect(node!.querySelector('[data-figure]')).not.toBeNull();
    }
  });
  // Pose Ghibli lue sur la clé affichée (palette # sig|yaw|gait|phase|head).
  const poseOf = (fig: Element): { yaw: number; gait: string } => {
    const parts = fig.getAttribute('data-key')!.split('#').pop()!.split('|');
    return { yaw: Number(parts[1]), gait: parts[2]! };
  };
  it('Ghibli : demi-tour sur place à la porte avant le seuil (petits pas), marche avant', () => {
    const { doorX } = queueLayout(slots[0]!, frame, metrics.unit);
    const walking = clubAt(when(0.01, 0.08), true).querySelector('[data-queue-entering] [data-figure]')!;
    expect(poseOf(walking).gait).toBe('walk');
    const turning = clubAt(when(0.3, 0.48), true).querySelector('[data-queue-entering]')!;
    expect(turning.closest('svg[data-club-door]')).toBeNull();
    const x = Number(/translate\(([-\d.]+)/.exec(turning.getAttribute('transform')!)![1]);
    expect(Math.abs(x - doorX)).toBeLessThan(0.11);
    const pose = poseOf(turning.querySelector('[data-figure]')!);
    expect(pose.gait).toBe('step');
    // Entre le profil (vers la porte) et le dos.
    expect([0, 8]).not.toContain(pose.yaw);
  });
  it('Ghibli : au re-rendu, un membre qui avance garde sa marche (pose tirée de la dernière place connue)', () => {
    const max = queueLayout(slots[0]!, frame, metrics.unit).max;
    const sig = (f: ReturnType<typeof queueFrame>): string => f.members.map((m) => m.id).join(',') + '|' + (f.ghost?.id ?? '') + (f.ghost && f.ghost.p > 0.5 ? '+' : '');
    let t1 = -1;
    let id = '';
    for (let t = 0; t < 600 && t1 < 0; t += 0.05) {
      const a = queueFrame(SEED, 'shop-0', t, 30, true, max);
      const b = queueFrame(SEED, 'shop-0', t + 0.1, 30, true, max);
      if (sig(a) !== sig(b) || a.ghost) continue;
      const m = a.members.find((x, i) => i < a.members.length - 1 && x.opacity === 1 && x.pos % 1 > 0.2 && x.pos % 1 < 0.6);
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
          <NightclubDoor view={viewOf('nightclub', SAT, 30)} frame={frame} metrics={metrics} minutes={30} date={SAT} reduced={false} sky={skyAt(30, times)} seed={SEED} sessionT0={T0} ghibli />
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
  it('le dernier arrivé est opaque et arrive de plus loin', () => {
    let seen = 0;
    for (let t = 0; t < 120; t += 0.1) {
      const f = queueFrame(SEED, 'shop-0', t, 30, true, queueLayout(slots[0]!, frame, metrics.unit).max);
      const m = f.members[f.members.length - 1];
      if (!m || m.opacity >= 1) continue;
      seen++;
      const c = clubAt(t, true);
      const node = c.querySelector(`[data-queue-id="${m.id}"]`)!;
      expect(node.getAttribute('opacity')).toBeNull();
      const x = Number(/translate\(([-\d.]+)/.exec(node.getAttribute('transform')!)![1]);
      const { doorX, pitch } = queueLayout(slots[0]!, frame, metrics.unit);
      expect(Math.abs(x - doorX)).toBeGreaterThan((9 + m.pos * pitch) * metrics.unit + 1);
      if (seen > 2) break;
    }
    expect(seen).toBeGreaterThan(0);
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
