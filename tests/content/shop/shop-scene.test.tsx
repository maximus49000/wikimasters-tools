// @vitest-environment jsdom
// tests/content/shop/shop-scene.test.tsx — rendu Ghibli des partitions des commerces (G4b, tâche 10)
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ART_KEY, writeArt } from '../../../src/content/art-setting';
import { CityLifeLayer } from '../../../src/content/city-life';
import { FigureContext, FigureRegistry, type Citizen3D, type SpriteAnchors } from '../../../src/content/figure/figure-host';
import { blinkAt, blinkLevel, emotionFor, faceState } from '../../../src/core/citizens/face';
import { citizenSeed } from '../../../src/core/citizens/identity';
import type { CitizenDesc } from '../../../src/core/citizens/catalogue';
import { anchorsOf, type FigureKey } from '../../../src/core/library/figure/bake';
import type { ArmPose } from '../../../src/core/library/figure/skeleton';
import { shapeOf, signatureOf } from '../../../src/core/library/figure/dress';
import { ShopScene, collectScene, forgetScenes, muteScene, placeScene, sceneBudget, sceneParties } from '../../../src/content/shop/shop-scene';
import { anchorAt, infoOf, runtimes } from '../../../src/content/shop/scene-read';
import { sidewalkAt } from '../../../src/core/library/city/shops/scene/sidewalk';
import type { Score } from '../../../src/core/library/city/shops/scene/types';
import { GHIBLI_SHOP_SPRITE_CAP, spriteBudget } from '../../../src/core/library/city/shops/sprite-budget';
import { trackAt } from '../../../src/core/library/city/shops/scene/score';
import { forgetGates, makeScore, peekScore, planOf, slotGate, type SceneShop } from '../../../src/content/shop/scene-scores';
import { dayContext } from '../../../src/core/library/city/calendar';
import type { CityContext } from '../../../src/core/library/city/intensity';
import { cityMetrics } from '../../../src/core/library/city/metrics';
import { outfitFor } from '../../../src/core/library/city/people';
import { dayNumber } from '../../../src/core/library/city/shops/hours';
import { actorsAt } from '../../../src/core/library/city/shops/scene/score';
import { SLOT_S, slotIndexAt, slotStart } from '../../../src/core/library/city/shops/scene/slots';
import { shopFrame, shopSlotsFor } from '../../../src/core/library/city/shops/slots';
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
  vi.unstubAllGlobals();
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
const slot = shopSlotsFor(W, H, SEED)[0]!;
const frame = shopFrame(slot, metrics.ground);
const view: ShopView = { slot, phase: 'open', sign: { type: 'bakery', name: 'X' }, placard: false, interior: 'bakery', works: null, moving: null, interiorStage: null };
const rng = mulberry32(3);
const shop: SceneShop = { view, frame, open: true, staff: [{ id: 'emp-0', outfit: outfitFor('ordinary', rng), spans: [[0, 86400]] }] };
const NO_STREET = () => ({ rainFrom: null, paradeFrom: null, busAt: [] });
const env = { seed: SEED, day: DAY, street: NO_STREET };
const T0 = 1_790_000_000;

// Premier instant (s du jour) après 10 h où la partition a un client à l'intérieur.
function busyMoment(): number {
  const plan = planOf(shop, env);
  const from = slotIndexAt('bakery', 10 * 3600);
  for (let i = from; i < from + 30; i++) {
    const sc = makeScore(plan, i, 1);
    for (let t = 5; t < SLOT_S('bakery'); t += 1) if (actorsAt(sc, t).some((a) => a.role === 'customer' && a.where === 'inside')) return slotStart('bakery', i) + t;
  }
  throw new Error('aucun client');
}

// Instant où l'employé est libre (bras le long du corps, tête droite) : la surcouche du klaxon peut jouer.
function freeStaffMoment(): number {
  const plan = planOf(shop, env);
  const from = slotIndexAt('bakery', 10 * 3600);
  for (let i = from; i < from + 30; i++) {
    const sc = makeScore(plan, i, 1);
    for (let t = 5; t < SLOT_S('bakery') - 5; t += 1) {
      const st = actorsAt(sc, t).find((a) => a.role === 'staff' && a.where === 'inside');
      const later = actorsAt(sc, t + 2).find((a) => a.role === 'staff');
      if (st && later && st.arms === 'down' && st.headYaw === 0 && later.arms === 'down' && later.headYaw === 0 && st.gait === 'stand' && later.gait === 'stand') return slotStart('bakery', i) + t;
    }
  }
  throw new Error('employé jamais libre');
}

// Arrivée d'un parti de plusieurs personnes (s du jour, un peu avant qu'il paraisse dans la rue).
function groupMoment(): number {
  const plan = planOf(shop, env);
  const from = slotIndexAt('bakery', 10 * 3600);
  for (let i = from; i < from + 60; i++) {
    const sc = makeScore(plan, i, 1);
    const sizes = new Map<string, number>();
    for (const tr of sc.tracks) if (tr.party) sizes.set(tr.party, (sizes.get(tr.party) ?? 0) + 1);
    const tr = sc.tracks.find((x) => x.party && (sizes.get(x.party) ?? 0) >= 2 && x.arriveAt !== null && x.arriveAt > 90);
    if (tr) return slotStart('bakery', i) + tr.arriveAt! - 90;
  }
  throw new Error('aucun groupe');
}

type Opts = { open?: boolean; gate?: number; pool?: number; day?: number };
const scene = (secondsOfDay: number, still = false, figures = new FigureRegistry('ts', { perFrame: 50 }), o: Opts = {}): ReactNode => {
  const sky = skyAt(Math.floor(secondsOfDay / 60), times);
  return (
    <FigureContext.Provider value={figures}>
      <svg>
        <ShopScene
          shops={[{ ...shop, open: o.open ?? true }]}
          seed={SEED}
          day={o.day ?? DAY}
          secondsOfDay={secondsOfDay}
          t0={T0}
          width={W}
          metrics={metrics}
          sky={sky}
          rainy={false}
          umbrella={false}
          gates={new Map([[slot.id, o.gate ?? 1]])}
          street={NO_STREET}
          doorXs={[]}
          still={still}
          pool={o.pool}
        />
      </svg>
    </FigureContext.Provider>
  );
};
const activeActors = (c: Element): Element[] => [...c.querySelectorAll('[data-scene-actor][data-active="true"]')];
const activeStaff = (c: Element): Element[] => [...c.querySelectorAll('[data-scene-staff][data-active="true"]')];
const transforms = (c: Element): string[] => [...c.querySelectorAll('[data-scene-actor], [data-scene-staff] > [data-scene-fig], [data-scene-street]')].map((n) => `${n.getAttribute('transform')}|${n.getAttribute('display')}`);

describe('ShopScene (Ghibli)', () => {
  it('rend un employé intérieur et, quand la partition a un client à l’intérieur, un client actif', () => {
    const s = busyMoment();
    const { host, draw } = mount();
    draw(scene(s));
    expect(host.querySelector('svg[data-shop-window][data-scene]')).not.toBeNull();
    expect(activeStaff(host).length).toBeGreaterThan(0);
    expect(activeActors(host).length).toBeGreaterThan(0);
    // Le client actif est un pantin posé (sprite présent).
    expect(activeActors(host)[0]!.querySelector('[data-figure]')).not.toBeNull();
  });
  it('deux rendus à la même heure : mêmes transforms', () => {
    const s = busyMoment();
    const { host, draw } = mount();
    draw(scene(s));
    const a = transforms(host);
    draw(scene(s));
    expect(transforms(host)).toEqual(a);
    expect(a.length).toBeGreaterThan(0);
  });
  it('la boucle déplace les acteurs avec le temps, sans re-rendu', () => {
    const s = busyMoment();
    const { host, draw } = mount();
    const figures = new FigureRegistry('tl', { perFrame: 50 });
    draw(scene(s, false, figures));
    const before = transforms(host).join();
    const nodes = collectScene(host);
    let changed = false;
    for (let dt = 1; dt <= 20 && !changed; dt++) {
      placeScene(nodes, T0 + dt, figures, []);
      changed = transforms(host).join() !== before;
    }
    expect(changed).toBe(true);
  });
  it('mouvement réduit : aucun client, l’employé posé à son poste', () => {
    const s = busyMoment();
    const { host, draw } = mount();
    draw(scene(s, true));
    expect(activeActors(host)).toHaveLength(0);
    expect(activeStaff(host).length).toBeGreaterThan(0);
    const fig = activeStaff(host)[0]!.querySelector('[data-figure]')!;
    expect(fig.getAttribute('data-key')).not.toBeNull();
  });
  it('un klaxon proche fait tourner la tête d’un acteur libre (surcouche, 1 s)', () => {
    const s = freeStaffMoment();
    const { host, draw } = mount();
    const figures = new FigureRegistry('th', { perFrame: 50 });
    draw(scene(s, false, figures));
    const nodes = collectScene(host);
    const fig = activeStaff(host)[0]!.querySelector('[data-figure]')!;
    const head = (): string => (fig.getAttribute('data-key') ?? '').split('|')[4]!;
    // Sprite d'une nouvelle pose : demandé, peint par flush, posé à l'image suivante.
    const place = (t: number, horns: Parameters<typeof placeScene>[3]): void => {
      placeScene(nodes, t, figures, horns);
      figures.flush();
      placeScene(nodes, t, figures, horns);
    };
    const horn = [{ t: T0 - 0.2, x: frame.window.x + frame.window.w / 2 + 50, by: 'v1' }];
    place(T0, []);
    expect(head()).toBe('0');
    place(T0, horn);
    expect(head()).not.toBe('0');
    // Plus d'une seconde après le coup : tête droite ; trop loin (> 120 px) : rien.
    place(T0 + 2, horn);
    expect(head()).toBe('0');
    place(T0, [{ ...horn[0]!, x: frame.window.x + frame.window.w + 400 }]);
    expect(head()).toBe('0');
  });
});

// Acteurs montrés (nœud de la réserve affecté, l'un de ses trois nœuds actif) : id → transform du nœud actif.
const shownActors = (c: Element): Map<string, string> => {
  const out = new Map<string, string>();
  for (const inner of c.querySelectorAll('[data-scene-actor][data-actor]')) {
    const i = inner.getAttribute('data-entry');
    const nodes = [inner, c.querySelector(`[data-scene-street][data-entry="${i}"]`), c.querySelector(`svg[data-scene-door][data-entry="${i}"]`)];
    const on = nodes.find((n) => n?.getAttribute('data-active') === 'true');
    if (on) out.set(inner.getAttribute('data-actor')!, `${on.getAttribute('transform') ?? on.getAttribute('x')}`);
  }
  return out;
};
const partyOf = (id: string): string => id.slice(0, id.lastIndexOf(':'));
// Clients attendus visibles à `sec` d'après les partitions des créneaux N−1..N+1 (même lecture que la boucle).
const expected = (c: Element, sec: number): Map<string, string> => {
  const rt = runtimes.get(c.querySelector('[data-scene-shop]')!)!;
  const out = new Map<string, string>();
  const n = slotIndexAt('bakery', sec);
  for (let i = n - 1; i <= n + 1; i++) {
    const sc: Score | null = peekScore(rt.plan, i, slotGate(rt.plan, i, 1));
    if (!sc) continue;
    const tIn = sec - sc.start;
    for (const tr of sc.tracks) {
      if (tr.role !== 'customer') continue;
      const info = infoOf(tr, rt, sc);
      if (tIn < info.from || tIn > info.to) continue;
      const v = trackAt(tr, tIn);
      if (v.where === 'inside' || (info.plan && sidewalkAt(info.plan, tIn))) out.set(tr.id, tr.party ?? tr.id);
    }
  }
  return out;
};

describe('ShopScene : fermeture, affluence, partis, remontage, plafond (G4b, revue 1)', () => {
  it('rideau baissé en plein créneau : aucun client admis ne disparaît avant la fin de sa visite et de sa marche ; plus d’admission', () => {
    const s = busyMoment();
    const figures = new FigureRegistry('tc', { perFrame: 50 });
    const { host, draw } = mount();
    draw(scene(s, false, figures));
    placeScene(collectScene(host), T0, figures, []);
    const before = new Set(shownActors(host).keys());
    const admittedBefore = new Set(sceneParties(slot.id)!.admitted);
    expect(before.size).toBeGreaterThan(0);
    draw(scene(s, false, figures, { open: false }));
    const nodes = collectScene(host);
    let tail = 0;
    for (let dt = 0; dt <= 300; dt += 1) {
      placeScene(nodes, T0 + dt, figures, []);
      const shown = shownActors(host);
      const want = expected(host, s + dt);
      for (const id of before) if (want.has(id)) expect(shown.has(id), `${id} à +${dt} s`).toBe(true);
      // Plus d'admission : seuls des partis admis avant la fermeture.
      for (const id of shown.keys()) expect(admittedBefore.has(partyOf(id)), id).toBe(true);
      if ([...before].some((id) => want.has(id) && shown.has(id))) tail = dt;
    }
    expect(tail).toBeGreaterThan(0);
    // La vitrine est cachée (le rideau la couvre) ; le trottoir reste.
    expect(host.querySelector('svg[data-scene]')!.getAttribute('visibility')).toBe('hidden');
  });
  it('affluence changée en plein créneau : même partition, personne ne saute ni ne disparaît', () => {
    const s = busyMoment();
    const figures = new FigureRegistry('tg', { perFrame: 50 });
    const { host, draw } = mount();
    draw(scene(s, false, figures));
    placeScene(collectScene(host), T0, figures, []);
    const a = shownActors(host);
    expect(a.size).toBeGreaterThan(0);
    const plan = planOf(shop, env);
    const n = slotIndexAt('bakery', s);
    const score = peekScore(plan, n, slotGate(plan, n, 1));
    draw(scene(s, false, figures, { gate: 0.25 }));
    placeScene(collectScene(host), T0, figures, []);
    expect(shownActors(host)).toEqual(a);
    expect(peekScore(plan, n, slotGate(plan, n, 0.25))).toBe(score);
  });
  it('créneau suivant : affluence figée à sa première lecture, reprise quand il devient courant', () => {
    const plan = planOf(shop, env);
    expect(slotGate(plan, 333, 0.8)).toBe(0.8);
    expect(slotGate(plan, 333, 0.1)).toBe(0.8);
  });
  it('rideau baissé : l’affluence n’est pas figée ; à la réouverture le créneau prend celle du moment', () => {
    const plan = planOf(shop, env);
    expect(slotGate(plan, 444, 0, false)).toBe(0);
    expect(slotGate(plan, 444, 0.8)).toBe(0.8);
  });
  it('fermé puis rouvert en plein créneau : les clients viennent comme dans une boutique restée ouverte', () => {
    const s = busyMoment();
    const figures = new FigureRegistry('to', { perFrame: 50 });
    const { host, draw } = mount();
    draw(scene(s, false, figures, { open: false, gate: 0 }));
    const closed = collectScene(host);
    for (let dt = 0; dt < 5; dt++) placeScene(closed, T0 + dt, figures, []);
    expect(shownActors(host).size).toBe(0);
    draw(scene(s, false, figures, { gate: 1 }));
    placeScene(collectScene(host), T0, figures, []);
    const shown = [...shownActors(host).keys()].sort();
    expect(shown.length).toBeGreaterThan(0);
    expect(shown).toEqual([...expected(host, s).keys()].sort());
  });
  it('lendemain (même local) : état d’admission neuf', () => {
    const s = busyMoment();
    const figures = new FigureRegistry('td', { perFrame: 50 });
    const { host, draw } = mount();
    draw(scene(s - 120, false, figures, { pool: 1 }));
    const nodes = collectScene(host);
    for (let dt = 0; dt <= 400 && sceneParties(slot.id, SEED, DAY)!.refused.size === 0; dt += 0.5) placeScene(nodes, T0 + dt, figures, []);
    const today = sceneParties(slot.id, SEED, DAY)!;
    expect(today.refused.size).toBeGreaterThan(0);
    draw(scene(s - 120, false, figures, { pool: 12, day: DAY + 1 }));
    placeScene(collectScene(host), T0, figures, []);
    const next = sceneParties(slot.id, SEED, DAY + 1)!;
    expect(next).not.toBeNull();
    expect(next.refused.size).toBe(0);
    // Rien n'est hérité de la veille : les admis du lendemain sont exactement les partis en vue à cet instant.
    expect(next).not.toBe(today);
    expect([...next.admitted].sort()).toEqual([...new Set(expected(host, s - 120).values())].sort());
  });
  it('réserve épuisée : jamais un demi-parti ; un parti refusé n’apparaît jamais', () => {
    const s = busyMoment();
    const figures = new FigureRegistry('tp', { perFrame: 50 });
    const { host, draw } = mount();
    draw(scene(s - 60, false, figures, { pool: 2 }));
    const nodes = collectScene(host);
    let starved = false;
    for (let dt = 0; dt <= 240; dt += 0.5) {
      placeScene(nodes, T0 + dt, figures, []);
      const shown = shownActors(host);
      const want = expected(host, s - 60 + dt);
      const parties = new Set([...shown.keys()].map(partyOf));
      const { refused } = sceneParties(slot.id)!;
      for (const [id, party] of want) {
        if (parties.has(party)) expect(shown.has(id), `${id} (parti montré) à +${dt} s`).toBe(true);
        if (refused.has(party)) starved = true;
      }
      for (const p of parties) expect(refused.has(p)).toBe(false);
      expect(shown.size).toBeLessThanOrEqual(2);
    }
    expect(starved).toBe(true);
  }, 30_000);
  it('un seul nœud libre : un groupe n’est jamais montré à moitié', () => {
    const s = groupMoment();
    const figures = new FigureRegistry('t1', { perFrame: 50 });
    const { host, draw } = mount();
    draw(scene(s, false, figures, { pool: 1 }));
    const nodes = collectScene(host);
    let groups = 0;
    for (let dt = 0; dt <= 200; dt += 0.5) {
      placeScene(nodes, T0 + dt, figures, []);
      const shown = shownActors(host);
      const want = expected(host, s + dt);
      const parties = new Set([...shown.keys()].map(partyOf));
      for (const [id, party] of want) if (parties.has(party)) expect(shown.has(id), `${id} à +${dt} s`).toBe(true);
      const sizes = new Map<string, number>();
      for (const party of want.values()) sizes.set(party, (sizes.get(party) ?? 0) + 1);
      for (const n of sizes.values()) if (n >= 2) groups++;
    }
    expect(groups).toBeGreaterThan(0);
  });
  it('remontage (réserve changée) ou re-rendu : les admis restent, les refusés restent refusés', () => {
    const s = busyMoment();
    const figures = new FigureRegistry('tr', { perFrame: 50 });
    const { host, draw } = mount();
    draw(scene(s - 120, false, figures, { pool: 1 }));
    const nodes = collectScene(host);
    // Avance jusqu'à ce qu'un parti ait été refusé faute de place.
    let dt = 0;
    for (; dt <= 400 && sceneParties(slot.id)!.refused.size === 0; dt += 0.5) placeScene(nodes, T0 + dt, figures, []);
    const refused = new Set(sceneParties(slot.id)!.refused);
    expect(refused.size).toBeGreaterThan(0);
    const a = shownActors(host);
    const el = host.querySelector('[data-scene-shop]');
    // Simple re-rendu : mêmes nœuds, mêmes affectations.
    draw(scene(s - 120, false, figures, { pool: 1 }));
    placeScene(collectScene(host), T0 + dt, figures, []);
    expect(host.querySelector('[data-scene-shop]')).toBe(el);
    expect(shownActors(host)).toEqual(a);
    // Remontage (réserve plus grande) : les montrés restent, aucun refusé n'apparaît ensuite.
    draw(scene(s - 120, false, figures, { pool: 12 }));
    expect(host.querySelector('[data-scene-shop]')).not.toBe(el);
    const later = collectScene(host);
    placeScene(later, T0 + dt, figures, []);
    expect([...shownActors(host).keys()].sort()).toEqual([...a.keys()].sort());
    for (let k = 0; k <= 120; k += 1) {
      placeScene(later, T0 + dt + k, figures, []);
      for (const id of shownActors(host).keys()) expect(refused.has(partyOf(id)), id).toBe(false);
    }
  });
  it('plafond : les partis admis comptent comme fixes ; les partis à venir sont retenus et n’apparaissent pas', () => {
    const s = busyMoment();
    const figures = new FigureRegistry('tb', { perFrame: 50 });
    const { host, draw } = mount();
    draw(scene(s, false, figures));
    const nodes = collectScene(host);
    placeScene(nodes, T0, figures, []);
    const admitted = new Set(sceneParties(slot.id)!.admitted);
    expect(admitted.size).toBeGreaterThan(0);
    const sprites = sceneBudget(nodes, T0);
    for (const sp of sprites) expect(sp.kind).toBe(admitted.has(sp.party!) ? 'keep' : 'customer');
    // Plafond atteint par les fixes : tout parti à venir est retiré, le reste tient sous le plafond.
    const keep = sprites.filter((x) => x.kind === 'keep').length;
    const drop = spriteBudget(sprites, W / 2, keep);
    expect(sprites.filter((x) => !drop.has(x.id)).length).toBe(keep);
    expect(spriteBudget(sprites, W / 2, GHIBLI_SHOP_SPRITE_CAP).size).toBe(0);
    muteScene(nodes, drop);
    // La pose du rendu applique le plafond retenu (pas un ensemble vide).
    draw(scene(s, false, figures));
    const later = collectScene(host);
    for (let dt = 0; dt <= 120; dt += 1) {
      placeScene(later, T0 + dt, figures, []);
      for (const id of shownActors(host).keys()) expect(admitted.has(partyOf(id)), id).toBe(true);
    }
  });
});

describe('branchement dans la Ville', () => {
  const life = (ghibli: boolean): HTMLDivElement => {
    vi.spyOn(Date, 'now').mockReturnValue(T0 * 1000);
    if (ghibli) writeArt('ghibli');
    try {
      const minutes = 600;
      const sky = skyAt(minutes, times);
      const city: CityContext = { minutes, day: dayContext(TUESDAY, []), precip: 0, snow: false, storm: false, daylight: sky.daylight, shops: { epochDay: DAY, names: {} } };
      const { host, draw } = mount();
      draw(<svg><CityLifeLayer width={W} height={H} sky={sky} seed={SEED} city={city} rainy={false} /></svg>);
      return host;
    } finally {
      localStorage.removeItem(ART_KEY);
    }
  };
  it('classique : aucun nœud de la scène G4b', () => {
    const c = life(false);
    expect(c.querySelector('[data-scene], [data-scene-actor], [data-scene-staff]')).toBeNull();
  });
  it('Ghibli : les commerces G4b passent par la scène, sans clients intérieurs ni vendeur posé de l’ancien rendu', () => {
    const c = life(true);
    const windows = [...c.querySelectorAll('svg[data-shop-window][data-scene]')];
    expect(windows.length).toBeGreaterThan(0);
    for (const w of windows) {
      const id = w.getAttribute('data-shop-window')!;
      expect(c.querySelector(`svg[data-shop-window="${id}"]:not([data-scene]) [data-customer-inside]`)).toBeNull();
      expect(c.querySelector(`[data-shop-staff="${id}"] [data-posed="staff"]`)).toBeNull();
    }
  });
});

// ---------- Habitants 3D (Task 10) ----------
// Faux rendu 3D : base toujours prête, image et accroches fixes ; avec `faces`, l'état du visage du vrai face.ts.
const ANCH: SpriteAnchors = { handR: [9, -23], handL: [-9, -23], hands: [0, -23], head: [0, -42], headTop: [0, -50], nape: [0, -36], seat: [0, -20] };
const fake3D = (faces: boolean): Citizen3D => ({
  ready: () => true,
  prepare() {},
  render: (_d: CitizenDesc, _k: FigureKey, _l: number, face: string) => ({ url: `data:image/png;base64,3D|${face}`, anchors: ANCH }),
  dispose() {},
  ...(faces ? { faceOf: (arms: ArmPose, mood: CitizenDesc['mood'], t: number, seed: number) => faceState(emotionFor(arms, mood), blinkLevel(blinkAt(t, seed))) } : {}),
});
// Premier instant (s du jour) où un client de la partition vérifie `ok` dans la vitrine.
function customerMoment(ok: (a: ReturnType<typeof actorsAt>[number], sc: Score) => boolean): { sec: number; id: string } {
  const plan = planOf(shop, env);
  const from = slotIndexAt('bakery', 9 * 3600);
  for (let i = from; i < from + 80; i++) {
    const sc = makeScore(plan, i, 1);
    for (let t = 5; t < SLOT_S('bakery') - 5; t += 1) {
      const a = actorsAt(sc, t).find((x) => x.role === 'customer' && x.where === 'inside' && ok(x, sc));
      if (a) return { sec: slotStart('bakery', i) + t, id: a.id };
    }
  }
  throw new Error('aucun client');
}

describe('ShopScene : habitants 3D', () => {
  it('un enfant de parti parent-enfant a un corps d’enfant ; chaque client a la graine de son id', () => {
    const isChild = (id: string, sc: Score): boolean => sc.tracks.some((t) => t.id === id && t.child === true);
    const { sec, id } = customerMoment((a, sc) => isChild(a.id, sc));
    const figures = new FigureRegistry('t3d', { perFrame: 50, citizens: () => fake3D(false) });
    const spy = vi.spyOn(figures, 'citizen');
    const { draw } = mount();
    draw(scene(sec, false, figures));
    const bySeed = new Map(spy.mock.calls.map(([d, seed]) => [seed, d] as const));
    expect(bySeed.get(citizenSeed(id))?.base).toBe('enfant');
    // Les adultes du même parti (meneur `:0`) : jamais un corps d'enfant.
    const lead = `${id.slice(0, id.lastIndexOf(':'))}:0`;
    expect(bySeed.get(citizenSeed(lead))).toBeDefined();
    expect(bySeed.get(citizenSeed(lead))!.base).not.toBe('enfant');
  });

  it('caisse : au geste pay-card, le visage du client est « content » (registre à visages)', () => {
    const { sec, id } = customerMoment((a) => a.arms === 'pay-card');
    const figures = new FigureRegistry('t3d-faces', { perFrame: 50, faces: true, citizens: () => fake3D(true), now: () => 0 });
    const { host, draw } = mount();
    draw(scene(sec, false, figures));
    const fig = (): Element => host.querySelector(`[data-scene-actor][data-actor="${id}"] [data-figure]`)!;
    expect(fig()).not.toBeNull();
    // Premier rendu : pantin de repli (cycle 3D pas encore rendu) ; flush : le cycle (visage neutre), posé par la boucle ;
    // flush suivant : la variante du visage de ce geste.
    const nodes = collectScene(host.querySelector('[data-shop-scene]')!);
    for (let i = 0; i < 2; i++) {
      figures.flush();
      placeScene(nodes, T0, figures, []);
    }
    const sk = fig().getAttribute('data-key')!;
    expect(sk.split('#').pop()!.split('|')[5]).toBe('pay-card');
    expect(sk).toMatch(/@3dc(b5|b1)?$/);
  });

  it('objet en main : accroche de l’image 3D montrée par la figure, sinon celle du pantin', () => {
    const figures = new FigureRegistry('t3d-anch', { citizens: () => fake3D(false) });
    const node = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    const key: FigureKey = { sig: signatureOf(shapeOf(outfitFor('ordinary', mulberry32(1)), false)), yaw: 0, gait: 'stand', phase: 0, head: 0, arms: 'down', lean: 0 };
    vi.spyOn(figures, 'anchors').mockImplementation((sk) => (sk === 'img3d' ? ANCH : null));
    node.setAttribute('data-key', 'img3d');
    expect(anchorAt(key, 'handR', 10, 100, 2, { reg: figures, node })).toEqual([10 + ANCH.handR[0] * 2, 100 + ANCH.handR[1] * 2]);
    node.setAttribute('data-key', 'pantin');
    const p = anchorsOf(key).handR;
    expect(anchorAt(key, 'handR', 10, 100, 2, { reg: figures, node })).toEqual([10 + p[0] * 2, 100 + p[1] * 2]);
  });
});
