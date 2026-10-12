// @vitest-environment jsdom
// tests/content/shop/shop-scene-bounds.test.tsx — scène G4b : vitre devant les acteurs, bornes de créneau et de jour, objets
// en main, affluence et géométrie dans l'identité d'un créneau (revue finale G4b)
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StaffLayer } from '../../../src/content/city-shops-life';
import { FigureContext, FigureRegistry } from '../../../src/content/figure/figure-host';
import { ShopContext, ShopRegistry } from '../../../src/content/shop/shop-host';
import { ShopScene, collectScene, forgetScenes, placeScene } from '../../../src/content/shop/shop-scene';
import { infoOf, runtimes, staffTrack } from '../../../src/content/shop/scene-read';
import { eveOf, forgetGates, lastSlot, makeScore, peekScore, planOf, quantGate, slotGate, type GateOf, type SceneShop } from '../../../src/content/shop/scene-scores';
import { cityMetrics } from '../../../src/core/library/city/metrics';
import { outfitFor } from '../../../src/core/library/city/people';
import { SHOP_DEFS, type ShopTypeId } from '../../../src/core/library/city/shops/catalog';
import { dayNumber } from '../../../src/core/library/city/shops/hours';
import { actorsAt, trackAt } from '../../../src/core/library/city/shops/scene/score';
import { sidewalkAt, sidewalkPlan } from '../../../src/core/library/city/shops/scene/sidewalk';
import { SLOT_S, slotIndexAt, slotStart } from '../../../src/core/library/city/shops/scene/slots';
import { shopFrame, shopSlotsFor } from '../../../src/core/library/city/shops/slots';
import { staffShiftsAt } from '../../../src/core/library/city/shops/staff';
import type { ShopView } from '../../../src/core/library/city/shops/view';
import { mulberry32 } from '../../../src/core/library/scene-world';
import { skyAt, sunTimes } from '../../../src/core/library/sky';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mounted: { root: Root; host: HTMLDivElement }[] = [];
const mount = (): { host: HTMLDivElement; draw: (node: ReactNode) => void } => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  mounted.push({ root, host });
  return { host, draw: (node) => act(() => root.render(node)) };
};
afterEach(() => {
  forgetScenes();
  forgetGates();
  vi.restoreAllMocks();
  for (const { root, host } of mounted.splice(0)) {
    act(() => root.unmount());
    host.remove();
  }
});

const W = 720;
const H = 340;
const SEED = 1;
const TUESDAY = { y: 2026, m: 10, d: 6 };
const DAY = dayNumber(TUESDAY);
const times = sunTimes(TUESDAY, { lat: 48.85, lon: 2.35 }, 120);
const metrics = cityMetrics(H);
// Vitrine réelle de 47 px (bar : postes 24,0 et 13,2).
const slot = shopSlotsFor(W, H, SEED)[0]!;
const frame = shopFrame(slot, metrics.ground);
const viewOf = (type: ShopTypeId): ShopView => ({ slot, phase: 'open', sign: { type, name: 'X' }, placard: false, interior: type, works: null, moving: null, interiorStage: null });
const rng = mulberry32(3);
const outfit = outfitFor('ordinary', rng);
const ALL_DAY: [number, number][] = [[-86400, 2 * 86400]];
const shopOf = (type: ShopTypeId, staff: SceneShop['staff'] = [{ id: 'emp-0', outfit, spans: ALL_DAY }]): SceneShop => ({ view: viewOf(type), frame, open: true, staff });
const NO_STREET = () => ({ rainFrom: null, paradeFrom: null, busAt: [] });
const env = (day = DAY) => ({ seed: SEED, day, street: NO_STREET });
const T0 = 1_790_000_000;

type Opts = { day?: number; gate?: GateOf; pool?: number; t0?: number; shops?: SceneShop[]; reg?: ShopRegistry | null };
const scene = (shop: SceneShop, secondsOfDay: number, figures: FigureRegistry, o: Opts = {}): ReactNode => {
  const sky = skyAt(Math.floor(secondsOfDay / 60) % 1440, times);
  const shops = o.shops ?? [shop];
  const body = (
    <FigureContext.Provider value={figures}>
      <svg>
        <ShopScene
          shops={shops}
          seed={SEED}
          day={o.day ?? DAY}
          secondsOfDay={secondsOfDay}
          t0={o.t0 ?? T0}
          width={W}
          metrics={metrics}
          sky={sky}
          rainy={false}
          umbrella={false}
          gates={new Map(shops.map((s) => [s.view.slot.id, o.gate ?? 1]))}
          street={NO_STREET}
          doorXs={[]}
          still={false}
          pool={o.pool}
        />
      </svg>
    </FigureContext.Provider>
  );
  return o.reg ? <ShopContext.Provider value={o.reg}>{body}</ShopContext.Provider> : body;
};
// Acteurs montrés (nœud de la réserve affecté, l'un de ses trois nœuds actif).
const shownActors = (c: Element): Set<string> => {
  const out = new Set<string>();
  for (const inner of c.querySelectorAll('[data-scene-actor][data-actor]')) {
    const i = inner.getAttribute('data-entry');
    const nodes = [inner, c.querySelector(`[data-scene-street][data-entry="${i}"]`), c.querySelector(`svg[data-scene-door][data-entry="${i}"]`)];
    if (nodes.some((n) => n?.getAttribute('data-active') === 'true')) out.add(inner.getAttribute('data-actor')!);
  }
  return out;
};
const activeNodes = (c: Element): Element[] => [...c.querySelectorAll('[data-scene-actor], [data-scene-street], svg[data-scene-door]')].filter((n) => n.getAttribute('display') !== 'none');

// Premier instant (s du jour) à partir de `from` où le créneau a un client à l'intérieur.
function busyMoment(shop: SceneShop, from: number, day = DAY): number {
  const plan = planOf(shop, env(day));
  const type = plan.type;
  const n0 = slotIndexAt(type, from);
  for (let i = n0; i < n0 + 30; i++) {
    const sc = makeScore(plan, i, 1);
    for (let t = 5; t < SLOT_S(type); t += 1) if (actorsAt(sc, t).some((a) => a.role === 'customer' && a.where === 'inside')) return slotStart(type, i) + t;
  }
  throw new Error('aucun client');
}

describe('vitre et murs devant les acteurs (rapport utilisateur : « passent à travers les murs »)', () => {
  it('boutique de la scène : la vitre et la façade sont après les employés, les clients et les objets dans la vitrine', () => {
    const shop = shopOf('bar');
    const figures = new FigureRegistry('tg', { perFrame: 50 });
    const queue: (() => void)[] = [];
    const reg = new ShopRegistry('tg', { schedule: (cb) => void queue.push(cb) });
    const s = busyMoment(shop, 20 * 3600);
    const { host, draw } = mount();
    draw(scene(shop, s, figures, { reg }));
    while (queue.length) act(() => queue.shift()!());
    const win = host.querySelector('svg[data-shop-window][data-scene]')!;
    const glass = win.querySelector(':scope > [data-scene-glass]')!;
    expect(glass).not.toBeNull();
    // La vitre (seule) puis la façade (pilastre, soubassement, montants), dans le repère de la vitrine.
    expect(glass.querySelector('image[data-shop-layer="glass"]')).not.toBeNull();
    expect(glass.querySelector('image[data-shop-layer="facade"]')).not.toBeNull();
    expect(glass.querySelector('image[data-shop-layer="front"]')).toBeNull();
    placeScene(collectScene(host), T0, figures, []);
    const before = [...win.querySelectorAll('[data-scene-staff], [data-scene-actor], [data-scene-back], [data-scene-front], [data-prop-slot]')];
    expect(win.querySelectorAll('[data-scene-actor][data-active="true"]').length).toBeGreaterThan(0);
    for (const n of before) expect(n.compareDocumentPosition(glass) & Node.DOCUMENT_POSITION_FOLLOWING, n.getAttribute('data-entry') ?? n.tagName).toBeTruthy();
    // Les marcheurs passent au calque avant : toujours sous la vitre.
    for (let dt = 0; dt < 60; dt++) placeScene(collectScene(host), T0 + dt, figures, []);
    expect(win.lastElementChild).toBe(glass);
  });
  it('StaffLayer d’une boutique de la scène, rideau levé : le mobilier seul (la vitre est dans la scène) ; ailleurs inchangé', () => {
    const queue: (() => void)[] = [];
    const reg = new ShopRegistry('ts', { schedule: (cb) => void queue.push(cb) });
    const layers = (scene: boolean): string[] => {
      const { host, draw } = mount();
      draw(
        <ShopContext.Provider value={reg}>
          <FigureContext.Provider value={new FigureRegistry('tsl', { perFrame: 50 })}>
            <svg>
              <StaffLayer view={viewOf('bakery')} shifts={staffShiftsAt(SHOP_DEFS.bakery, SEED, slot.id, TUESDAY)} frame={frame} metrics={metrics} minutes={600} reduced={false} date={TUESDAY} width={W} sky={skyAt(600, times)} rainy={false} umbrella={false} seed={SEED} seats={[]} post={20} ghibli scene={scene} />
            </svg>
          </FigureContext.Provider>
        </ShopContext.Provider>,
      );
      while (queue.length) act(() => queue.shift()!());
      return [...host.querySelectorAll('[data-staff-window] image[data-shop-layer]')].map((n) => n.getAttribute('data-shop-layer')!);
    };
    expect(layers(true)).toEqual(['furnish']);
    expect(layers(false)).toEqual(['front']);
  });
});

describe('bascule du jour', () => {
  it('lendemain sur les mêmes nœuds : aucun pantin figé ; nœuds, objets et pictos remis à neuf', () => {
    const shop = shopOf('bakery');
    const figures = new FigureRegistry('td', { perFrame: 50 });
    const s = busyMoment(shop, 10 * 3600);
    const { host, draw } = mount();
    draw(scene(shop, s, figures));
    const nodes = collectScene(host);
    for (let dt = 0; dt < 30; dt++) placeScene(nodes, T0 + dt, figures, []);
    const el = host.querySelector('[data-scene-shop]');
    expect(activeNodes(host).length).toBeGreaterThan(0);
    // 3 h du matin le lendemain, personne ne vient (affluence nulle) : même ShopNodes (pas de remontage).
    draw(scene(shop, 3 * 3600, figures, { day: DAY + 1, gate: 0 }));
    expect(host.querySelector('[data-scene-shop]')).toBe(el);
    placeScene(collectScene(host), T0, figures, []);
    expect(activeNodes(host)).toHaveLength(0);
    expect(host.querySelectorAll('[data-scene-actor][data-actor]')).toHaveLength(0);
    for (const n of host.querySelectorAll('[data-prop-slot], [data-carry-slot]')) expect(n.getAttribute('display')).toBe('none');
  });
  it('à minuit, les clients du dernier créneau de la veille finissent leur visite (lus avec le plan de la veille)', () => {
    const shop = shopOf('bar');
    const figures = new FigureRegistry('tm', { perFrame: 50 });
    const L = SLOT_S('bar');
    const doorX = frame.door.x + frame.door.w / 2;
    // Un jour dont le dernier créneau a un client encore sur le trottoir après minuit (il rentre chez lui).
    let day = DAY;
    const lateOf = (d: number): boolean => {
      const p = planOf(shop, env(d));
      return makeScore(p, lastSlot(p), 1).tracks.some((tr) => tr.role === 'customer' && (sidewalkPlan(tr, { doorX, width: W, doorXs: [] })?.to ?? 0) > L + 5);
    };
    while (day < DAY + 40 && !lateOf(day)) day++;
    const plan = planOf(shop, env(day));
    const last = lastSlot(plan);
    const sc = makeScore(plan, last, 1);
    const { host, draw } = mount();
    draw(scene(shop, 86400 - 8, figures, { pool: 10, day }));
    const rt0 = runtimes.get(host.querySelector('[data-scene-shop]')!)!;
    // Clients du dernier créneau visibles à `tIn` (s du créneau) : dedans, sur le seuil ou sur le trottoir.
    const want = (tIn: number): Set<string> => {
      const out = new Set<string>();
      for (const tr of sc.tracks) {
        if (tr.role !== 'customer') continue;
        const info = infoOf(tr, rt0, sc);
        if (tIn < info.from || tIn > info.to) continue;
        const v = trackAt(tr, tIn);
        if (v.where === 'inside' || (info.plan && sidewalkAt(info.plan, tIn))) out.add(tr.id);
      }
      return out;
    };
    // Un instant après minuit où des clients de la veille sont encore en vue (ils rentrent chez eux).
    let d = 0;
    while (d < 110 && want(L + d).size === 0) d++;
    expect(want(L + d).size).toBeGreaterThan(0);
    const nodes = collectScene(host);
    for (let dt = 0; dt <= 8; dt += 0.5) placeScene(nodes, T0 + dt, figures, []);
    const atMidnight = shownActors(host);
    for (const id of want(L)) expect(atMidnight.has(id), id).toBe(true);
    // Bascule : nouveau jour, seconde 0 (8 s plus tard à l'horloge murale), puis jusqu'à d.
    draw(scene(shop, 0, figures, { day: day + 1, pool: 10, t0: T0 + 8 }));
    const rt = runtimes.get(host.querySelector('[data-scene-shop]')!)!;
    expect(peekScore(eveOf(rt.plan), last, slotGate(eveOf(rt.plan), last, 1))).toBe(sc);
    const after = collectScene(host);
    // Même instant de part et d'autre de la bascule : mêmes acteurs en vue (veille qui repart, lendemain qui arrive).
    placeScene(after, T0 + 8, figures, []);
    expect(shownActors(host)).toEqual(atMidnight);
    for (let dt = 0; dt <= d; dt += 0.5) {
      placeScene(after, T0 + 8 + dt, figures, []);
      const shown = shownActors(host);
      for (const id of want(L + dt)) expect(shown.has(id), `${id} à +${dt} s`).toBe(true);
    }
  });
});

describe('employés aux bornes des créneaux', () => {
  const L = SLOT_S('bar');
  const N = 300;
  const s0 = slotStart('bar', N);
  type Crew = SceneShop['staff'];
  const member = (id: string, spans: [number, number][]): Crew[number] => ({ id, outfit, spans });
  const crews: [string, Crew][] = [
    ['collègue absent tout un créneau (cas des 47 px)', [member('A', ALL_DAY), member('B', [[0, s0 + L - 10], [s0 + 2 * L + 10, 86400]]), member('C', ALL_DAY)]],
    ['pause en plein créneau (deux plages)', [member('A', ALL_DAY), member('B', [[0, s0 + L + 60], [s0 + L + 150, 86400]]), member('C', ALL_DAY)]],
    ['relève : l’ancre part en plein créneau, un autre arrive pile à une borne', [member('A', [[0, s0 + L + 100]]), member('B', ALL_DAY), member('C', [[s0 + L, 86400]]), member('D', ALL_DAY)]],
    ['fin de plage pile à la borne', [member('A', ALL_DAY), member('B', [[0, s0 + L]]), member('C', [[s0 + 2 * L, 86400]])]],
  ];
  it('chacun finit un créneau où il commence le suivant (poste stable, réserve par l’arrière-boutique)', () => {
    let inside = 0;
    for (const [name, staff] of crews) {
      for (let seed = 1; seed <= 3; seed++) {
        for (let day = DAY; day < DAY + 6; day++) {
          const plan = planOf(shopOf('bar', staff), { seed, day, street: NO_STREET });
          for (let n = N - 1; n <= N + 2; n++) {
            const a = makeScore(plan, n, 0.5);
            const b = makeScore(plan, n + 1, 0.5);
            for (const m of staff) {
              const ta = staffTrack(a, m.id);
              const tb = staffTrack(b, m.id);
              const va = ta ? trackAt(ta, L) : null;
              const vb = tb ? trackAt(tb, 0) : null;
              const ia = va?.where === 'inside';
              const ib = vb?.where === 'inside';
              const where = `${name} · ${m.id} · graine ${seed} · jour ${day} · ${n}→${n + 1}`;
              // Seul passage permis entre « dedans » et « absent » : la porte de l'arrière-boutique (stage.back).
              if (ia !== ib) expect(Math.abs((ia ? va! : vb!).x - plan.stage.back), `${where} : ${ia ? 'dedans' : 'absent'} puis ${ib ? 'dedans' : 'absent'}`).toBeLessThan(0.5);
              else if (ia && ib) {
                inside++;
                expect(Math.abs(va!.x - vb!.x), where).toBeLessThan(0.5);
              }
            }
          }
        }
      }
    }
    expect(inside).toBeGreaterThan(100);
  });
  it('poste tiré du rang dans la liste du jour : le même d’un créneau à l’autre, absent ou non le collègue', () => {
    const staff = crews[0]![1];
    const plan = planOf(shopOf('bar', staff), env());
    const post = (n: number, id: string): number | null => {
      const tr = staffTrack(makeScore(plan, n, 0), id);
      const seg = tr?.segments[0];
      return seg ? seg.x0 : null;
    };
    // Sans client (affluence nulle), qui est au poste au début du créneau y est à son poste : C reste au sien quand B s'absente.
    const c10 = post(N, 'C');
    const c11 = post(N + 1, 'C');
    if (c10 !== null && c11 !== null) expect(c11).toBeCloseTo(c10, 6);
    expect(post(N + 1, 'B')).toBeNull();
  });
});

describe('objets en main : un emplacement par acteur de la vitrine', () => {
  it('bar et café bondés : jamais un objet tenu sans être dessiné (plus de 3 à la fois)', () => {
    let most = 0;
    for (const type of ['bar', 'cafe'] as const) {
      const shop = shopOf(type, [{ id: 'emp-0', outfit, spans: ALL_DAY }, { id: 'emp-1', outfit, spans: ALL_DAY }]);
      const figures = new FigureRegistry(`tp${type}`, { perFrame: 50 });
      const s = busyMoment(shop, (type === 'bar' ? 21 : 9) * 3600);
      const { host, draw } = mount();
      draw(scene(shop, s, figures, { pool: 10 }));
      const win = host.querySelector('svg[data-scene]')!;
      expect(win.querySelectorAll(':scope > [data-prop-slot]').length).toBe(10 + 2);
      const nodes = collectScene(host);
      const rt = runtimes.get(host.querySelector('[data-scene-shop]')!)!;
      for (let dt = 0; dt < 400; dt += 1) {
        placeScene(nodes, T0 + dt, figures, []);
        const sec = s + dt;
        // Clients montrés dans la vitrine qui tiennent un objet (pas une monture portée), d'après leur partition.
        let holding = 0;
        for (const inner of win.querySelectorAll('[data-scene-actor][data-actor][data-active="true"]')) {
          const id = inner.getAttribute('data-actor')!;
          const n = slotIndexAt(type, sec);
          for (let i = n - 1; i <= n + 1; i++) {
            const sc = peekScore(rt.plan, i, slotGate(rt.plan, i, 1));
            const tr = sc?.tracks.find((x) => x.id === id);
            if (!tr) continue;
            const v = trackAt(tr, sec - sc!.start);
            if (v.where === 'inside' && v.prop && !v.worn) holding++;
          }
        }
        const drawn = [...win.querySelectorAll(':scope > [data-prop-slot]')].filter((n) => n.getAttribute('display') !== 'none').length;
        expect(drawn, `${type} +${dt} s`).toBeGreaterThanOrEqual(holding);
        most = Math.max(most, drawn);
      }
    }
    expect(most).toBeGreaterThan(3);
  }, 30_000);
});

describe('identité d’un créneau : affluence et géométrie', () => {
  it('affluence lue à la minute de début du créneau : rechargement ou autre fenêtre, même distribution', () => {
    const plan = planOf(shopOf('bakery'), env());
    const n = slotIndexAt('bakery', 12 * 3600);
    // L'affluence varie à chaque minute : seule celle du début du créneau compte, quelle que soit la minute de la lecture.
    const gate = (m: number): number => (m % 60) / 60;
    const want = quantGate(gate(slotStart('bakery', n) / 60));
    expect(slotGate(plan, n, gate)).toBe(want);
    forgetGates();
    expect(slotGate(plan, n, gate)).toBe(want);
    const first = makeScore(plan, n, slotGate(plan, n, gate));
    forgetGates();
    expect(peekScore(plan, n, slotGate(plan, n, gate))).toBe(first);
    // Rideau baissé : pas figée ; à la réouverture, la même lecture (celle du début du créneau).
    forgetGates();
    expect(slotGate(plan, n + 1, gate, false)).toBe(quantGate(gate(slotStart('bakery', n + 1) / 60)));
  });
  it('ShopScene : même instant lu par deux montages (seconde fenêtre, rechargement) → mêmes clients', () => {
    const shop = shopOf('bakery');
    const s = busyMoment(shop, 10 * 3600);
    const gate = (m: number): number => 0.5 + 0.5 * Math.sin(m / 7);
    const look = (secondsOfDay: number, t: number): Set<string> => {
      const figures = new FigureRegistry('tw', { perFrame: 50 });
      const { host, draw } = mount();
      draw(scene(shop, secondsOfDay, figures, { gate, pool: 10, t0: T0 }));
      const nodes = collectScene(host);
      for (let k = 0; k < 10; k++) placeScene(nodes, T0 + t, figures, []);
      return shownActors(host);
    };
    const a = look(s, 0);
    forgetScenes();
    forgetGates();
    // Ouverte 50 s plus tard (autre minute de lecture), regardée au même instant.
    const b = look(s - 50, 50);
    expect(b).toEqual(a);
  });
  it('largeur de la vitrine dans la clé : un redimensionnement ne relit pas la partition de l’ancienne scène', () => {
    const shop = shopOf('bakery');
    const wider = { ...shop, frame: { ...frame, window: { ...frame.window, w: frame.window.w + 22 }, sign: { ...frame.sign, w: frame.sign.w + 22 } } };
    const a = planOf(shop, env());
    const b = planOf(wider, env());
    expect(b.id).toBe(a.id);
    const n = slotIndexAt('bakery', 11 * 3600);
    const sa = makeScore(a, n, 1);
    expect(peekScore(b, n, slotGate(b, n, 1))).toBeNull();
    const sb = makeScore(b, n, 1);
    expect(sb).not.toBe(sa);
    expect(peekScore(a, n, slotGate(a, n, 1))).toBe(sa);
  });
});
