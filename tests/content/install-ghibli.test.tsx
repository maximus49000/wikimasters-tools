// @vitest-environment jsdom
// tests/content/install-ghibli.test.tsx
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { InstallLayer, barrierK } from '../../src/content/install-layer';
import { BARRIER } from '../../src/content/install-sprites';
import { FigureContext, FigureRegistry, type Citizen3D, type SpriteAnchors } from '../../src/content/figure/figure-host';
import type { CitizenDesc } from '../../src/core/citizens/catalogue';
import { collectWorkers, placeWorkers } from '../../src/content/city-shops-life';
import type { YMD } from '../../src/core/library/city/calendar';
import { absMinute, crewAt, decorSetsFor, itemEquipment } from '../../src/core/library/city/install';
import { STREET_SCALE, cityMetrics } from '../../src/core/library/city/metrics';
import { dayNumber } from '../../src/core/library/city/shops/hours';
import { anchorsOf, type FigureKey } from '../../src/core/library/figure/bake';
import { skyAt, sunTimes } from '../../src/core/library/sky';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const mounted: { root: Root; host: HTMLDivElement }[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const { root, host } of mounted.splice(0)) {
    act(() => root.unmount());
    host.remove();
  }
});

const W = 720;
const H = 340;
const SEED = 1;
const metrics = cityMetrics(H);
const K = metrics.unit * STREET_SCALE.person;
const times = sunTimes({ y: 2026, m: 7, d: 14 }, { lat: 48.85, lon: 2.35 }, 120);
const D13: YMD = { y: 2026, m: 7, d: 13 };
const D14: YMD = { y: 2026, m: 7, d: 14 };
const MUSIC: YMD = { y: 2026, m: 6, d: 21 };
const NOW = 1_790_000_000_000;

// Calque monté sur une racine gardée (re-rendu à la minute suivante : la marche se règle sur le déplacement).
type Mount = { host: HTMLDivElement; at: (minutes: number, nowS?: number) => void; figures: FigureRegistry };
const mount = (date: YMD, ghibli: boolean, figures = new FigureRegistry('t8', { perFrame: 200 })): Mount => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  mounted.push({ root, host });
  const node = (minutes: number): ReactNode => (
    <FigureContext.Provider value={figures}>
      <svg>
        <InstallLayer width={W} height={H} seed={SEED} sky={skyAt(minutes, times)} still={false} date={date} minutes={minutes} metrics={metrics} rainy={false} ghibli={ghibli} />
      </svg>
    </FigureContext.Provider>
  );
  return {
    host,
    figures,
    at: (minutes, nowS = NOW / 1000 + minutes * 60) => {
      vi.spyOn(Date, 'now').mockReturnValue(nowS * 1000);
      act(() => root.render(node(minutes)));
    },
  };
};

// Première minute du jour où l'équipe du jeu `setId` est à l'étape voulue (moteur seul : aucun rendu).
const findMinute = (date: YMD, setId: string, ok: (c: NonNullable<ReturnType<typeof crewAt>>, next: ReturnType<typeof crewAt>) => boolean): number => {
  const set = decorSetsFor(date, W, H, SEED).find((s) => s.id === setId)!;
  const day = dayNumber(date);
  for (let m = 0; m < 1439; m++) {
    const c = crewAt(set, absMinute(day, m), set.day);
    if (c && ok(c, crewAt(set, absMinute(day, m + 1), set.day))) return m;
  }
  throw new Error(`${setId} : aucune minute`);
};
const kindOf = (date: YMD, setId: string, itemId: string): { kind: string; eq: string } => {
  const set = decorSetsFor(date, W, H, SEED).find((s) => s.id === setId)!;
  const item = set.items.find((i) => i.id === itemId)!;
  return { kind: item.kind, eq: itemEquipment(set, item) };
};

const keyOf = (fig: Element): FigureKey => {
  const [sig, yaw, gait, phase, head, arms, lean] = fig.getAttribute('data-key')!.split('#').pop()!.split('|');
  return { sig: sig!, yaw: Number(yaw), gait: gait as FigureKey['gait'], phase: Number(phase), head: Number(head), arms: arms as FigureKey['arms'], lean: Number(lean) };
};
const xy = (e: Element): { x: number; y: number } => {
  const m = /translate\(([-\d.]+)px, ([-\d.]+)px\)/.exec((e as HTMLElement).style.transform)!;
  return { x: Number(m[1]), y: Number(m[2]) };
};
const figOf = (w: Element): Element => w.querySelector('[data-figure]')!;
// Pose par la boucle (deux passes, peinture entre les deux : poseFigure garde l'image tant que le sprite n'est pas peint).
const settle = (r: Mount, t: number): void => {
  const placed = collectWorkers(r.host);
  placeWorkers(placed, t, r.figures);
  r.figures.flush();
  placeWorkers(placed, t, r.figures);
};
// Ouvriers à pied (le cycliste du vélo porteur reste au dessin classique, G3c).
const workers = (c: Element): Element[] => [...c.querySelectorAll('[data-crew] [data-worker]')].filter((w) => !w.hasAttribute('data-bike-rider'));

describe('équipes d’installation au pantin (Ghibli)', () => {
  it('échelle : ouvriers en gilet, sans miroir ; celui qui monte est de dos, allure d’escalade, drapeau à la main droite ; la phase suit la hauteur', () => {
    const m = findMinute(D13, 'doors-bastille', (c, n) => c.step === 'climb' && !c.removing && n?.step === 'climb');
    const r = mount(D13, true);
    r.at(m);
    const ws = workers(r.host);
    expect(ws.length).toBeGreaterThan(0);
    for (const w of ws) {
      const fig = figOf(w);
      expect(fig, 'pantin').not.toBeNull();
      expect(fig.getAttribute('data-sig')!.endsWith('.v')).toBe(true);
      expect(w.querySelector('[data-crew-worker]')).toBeNull();
      for (const g of [w, ...w.querySelectorAll('g')]) expect(g.getAttribute('transform') ?? '').not.toMatch(/scale\(-/);
    }
    const climber = ws.find((w) => w.getAttribute('data-pose') === 'climb')!;
    expect(climber).toBeDefined();
    const key = keyOf(figOf(climber));
    expect([key.yaw, key.gait]).toEqual([12, 'climb']);
    const held = figOf(climber).querySelector(':scope > [data-held="handR"]')!;
    expect(held.querySelector('[data-held-flag]')).not.toBeNull();
    expect(held.getAttribute('transform')).toBe(`translate(${anchorsOf(key).handR[0]} ${anchorsOf(key).handR[1]})`);
    // Minute suivante : il a monté ; la boucle règle l'allure sur la hauteur gravie.
    const { x: x0, y: y0 } = xy(climber);
    r.at(m + 1);
    const c2 = workers(r.host).find((w) => w.getAttribute('data-pose') === 'climb')!;
    const mv = JSON.parse(c2.getAttribute('data-move')!) as { dist: number; look: { gait: string; yaw: number } };
    expect(Math.abs(mv.dist - Math.hypot(xy(c2).x - x0, xy(c2).y - y0))).toBeLessThan(0.2);
    expect(mv.dist).toBeGreaterThan(0);
    expect(mv.look).toMatchObject({ gait: 'climb', yaw: 12 });
    const phases = new Set<number>();
    const placed = collectWorkers(r.host);
    for (let s = 0; s <= 30; s += 2) {
      placeWorkers(placed, NOW / 1000 + (m + 1) * 60 + s, r.figures);
      r.figures.flush();
      placeWorkers(placed, NOW / 1000 + (m + 1) * 60 + s, r.figures);
      phases.add(keyOf(figOf(c2)).phase);
    }
    expect(phases.size).toBeGreaterThan(1);
  });

  it('barrière à deux porteurs : l’un tire (tow), l’autre tient (hold) ; centre de la barrière entre leurs mains ; ils marchent', () => {
    const m = findMinute(D14, 'barriers-bastille', (c, n) => c.step === 'arrive' && !c.removing && c.progress > 0.3 && n?.step === 'arrive' && kindOf(D14, 'barriers-bastille', c.itemId).eq === 'hand');
    const r = mount(D14, true);
    r.at(m - 1);
    r.at(m);
    settle(r, NOW / 1000 + m * 60);
    const crew = r.host.querySelector('[data-crew="barriers-bastille"]')!;
    const [b, a] = [...crew.querySelectorAll('[data-worker]')];
    expect(keyOf(figOf(a!)).arms).toBe('tow');
    expect(keyOf(figOf(b!)).arms).toBe('hold');
    const hand = (w: Element): { x: number; y: number } => {
      const p = xy(w);
      // Main du pantin debout dans ce geste (la charge ne suit pas le balancement de la marche).
      const h = anchorsOf({ ...keyOf(figOf(w)), gait: 'stand', phase: 0 }).handR;
      return { x: p.x + h[0] * K, y: p.y + h[1] * K };
    };
    const ha = hand(a!);
    const hb = hand(b!);
    const load = crew.querySelector('[data-carried-item="barrier"]')!;
    const lp = xy(load);
    expect(Math.abs(lp.x - (ha.x + hb.x) / 2)).toBeLessThan(0.15);
    // Prise à mi-hauteur de la barrière, à la hauteur des mains.
    expect(Math.abs(lp.y - (BARRIER.height / 2) * barrierK(metrics.unit) - (ha.y + hb.y) / 2)).toBeLessThan(0.15);
    // Chaque porteur a sa main au bout de la barrière (montants à ±BARRIER.post).
    expect(Math.abs(Math.abs(ha.x - hb.x) - 2 * BARRIER.post * barrierK(metrics.unit))).toBeLessThan(0.3);
    for (const w of [a!, b!]) {
      const mv = JSON.parse(w.getAttribute('data-move')!) as { dist: number; look: { gait: string } };
      expect(mv.dist).toBeGreaterThan(0);
      expect(mv.look.gait).toBe('walk');
    }
  });

  it('nacelle : pantin debout dans la nacelle, bras levés quand il pose, pièce de treillis ou projecteur à la main droite', () => {
    const r = mount(MUSIC, true);
    const set = decorSetsFor(MUSIC, W, H, SEED).find((s) => s.items.some((i) => i.kind === 'stage-frame' && itemEquipment(s, i) === 'lift'))!;
    const fix = findMinute(MUSIC, set.id, (c) => c.step === 'fix' && !c.removing && kindOf(MUSIC, set.id, c.itemId).eq === 'lift');
    r.at(fix);
    settle(r, NOW / 1000 + fix * 60);
    const rider = r.host.querySelector(`[data-crew="${set.id}"] [data-lift-bucket] [data-worker]`)!;
    const key = keyOf(figOf(rider));
    expect(key.arms).toBe('overhead');
    expect(key.gait).toBe('stand');
    expect(figOf(rider).getAttribute('data-sig')!.endsWith('.v')).toBe(true);
    const held = figOf(rider).querySelector(':scope > [data-held="handR"]')!;
    expect(held.querySelector('[data-held-piece]')).not.toBeNull();
    expect(rider.querySelector('[data-crew-worker]')).toBeNull();
    const rise = findMinute(MUSIC, set.id, (c) => c.step === 'rise' && !c.removing && c.progress > 0.2 && kindOf(MUSIC, set.id, c.itemId).eq === 'lift');
    r.at(rise);
    settle(r, NOW / 1000 + rise * 60);
    const up = r.host.querySelector(`[data-crew="${set.id}"] [data-lift-bucket] [data-worker]`)!;
    expect(keyOf(figOf(up)).arms).toBe('down');
  });

  it('aucune opacité sur un ouvrier ni sur le groupe de l’équipe ; classique inchangé (aucun pantin)', () => {
    const m = findMinute(D14, 'barriers-bastille', (c) => c.step === 'arrive' && !c.removing && c.progress > 0.3);
    for (const ghibli of [true, false]) {
      const r = mount(D14, ghibli);
      r.at(m);
      for (const crew of r.host.querySelectorAll('[data-crew]')) {
        expect(crew.hasAttribute('opacity')).toBe(false);
        for (const w of crew.querySelectorAll('[data-worker]')) {
          for (const e of [w, ...w.querySelectorAll('*')]) {
            if (e.closest('[data-crew-worker]')) continue; // dessin classique (gilet légèrement transparent)
            expect(e.hasAttribute('opacity'), e.tagName).toBe(false);
          }
        }
      }
      expect(r.host.querySelectorAll('[data-crew] [data-figure]').length > 0).toBe(ghibli);
      expect(r.host.querySelectorAll('[data-crew] [data-crew-worker]').length > 0).toBe(!ghibli);
    }
  });

  it('demi-tour entre deux minutes (arrivée → mise en place face à face) : petits pas sur place, cran par cran', () => {
    const m = findMinute(D14, 'barriers-bastille', (c) => c.step === 'place' && !c.removing && c.progress < 0.2);
    const r = mount(D14, true);
    r.at(m - 1);
    const t = NOW / 1000 + m * 60;
    r.at(m, t);
    const crew = r.host.querySelector('[data-crew="barriers-bastille"]')!;
    const turning = [...crew.querySelectorAll('[data-worker]')].find((w) => (JSON.parse(w.getAttribute('data-move')!) as { turnFrom?: number }).turnFrom !== undefined)!;
    expect(turning).toBeDefined();
    const yaws: number[] = [];
    const gaits = new Set<string>();
    for (let s = 0; s <= 0.6; s += 0.02) {
      settle(r, t + s);
      const k = keyOf(figOf(turning));
      yaws.push(k.yaw);
      gaits.add(k.gait);
    }
    const gap = (a: number, b: number): number => Math.min((((a - b) % 16) + 16) % 16, (((b - a) % 16) + 16) % 16);
    for (let i = 1; i < yaws.length; i++) expect(gap(yaws[i]!, yaws[i - 1]!)).toBeLessThanOrEqual(2);
    expect(new Set(yaws).size).toBeGreaterThan(2);
    expect(gaits.has('step')).toBe(true);
  });
});

describe('charge portée à deux, porteurs en 3D', () => {
  // Faux rendu 3D : main droite d'autant plus haute que l'habitant est grand (porteurs de tailles différentes).
  const anchorsFor = (d: CitizenDesc): SpriteAnchors => {
    const s = d.height / 1.7;
    const p = (x: number, y: number): readonly [number, number] => [x * s, y * s];
    return { handR: p(7, -21), handL: p(-5, -21), hands: p(1, -21), head: p(0, -40), headTop: p(0, -47), nape: p(0, -34), seat: p(0, -19) };
  };
  const fake: Citizen3D = { ready: () => true, prepare() {}, render: (d: CitizenDesc) => ({ url: 'data:image/png;base64,3D', anchors: anchorsFor(d) }), dispose() {} };
  it('barrière posée : sa ligne de prise passe par la main droite 3D de chaque porteur (± 1 unité)', () => {
    const m = findMinute(D14, 'barriers-bastille', (c) => c.step === 'place' && !c.removing && kindOf(D14, 'barriers-bastille', c.itemId).eq === 'hand');
    const figures = new FigureRegistry('t3di', { perFrame: 200, citizens: () => fake });
    const r = mount(D14, true, figures);
    r.at(m);
    const placed = collectWorkers(r.host);
    act(() => {
      for (let i = 0; i < 40; i++) {
        placeWorkers(placed, NOW / 1000 + m * 60, figures);
        figures.flush();
      }
    });
    const crew = r.host.querySelector('[data-crew="barriers-bastille"]')!;
    const ws = ['a', 'b'].map((id) => crew.querySelector(`:scope > [data-worker-k="${id}"]`)!);
    const figs = ws.map((w) => w.querySelector('[data-figure]')!);
    for (const f of figs) expect(f.getAttribute('data-key')).toMatch(/@3d/);
    const load = crew.querySelector('[data-carried-item="barrier"]')!;
    const fit = load.querySelector(':scope > [data-carry-fit]')!.getAttribute('transform')!;
    const tm = /translate\(([-\d.]+) ([-\d.]+)\) rotate\(([-\d.]+) 0 ([-\d.]+)\)/.exec(fit)!;
    expect(tm).not.toBeNull();
    const [dx, ty, deg, py] = tm.slice(1).map(Number) as [number, number, number, number];
    const ox = Number(load.getAttribute('data-x'));
    const oy = Number(load.getAttribute('data-base'));
    const hands = ws.map((w, i) => {
      const a3 = figures.anchors(figs[i]!.getAttribute('data-key')!)!;
      return [Number(w.getAttribute('data-wx')) + a3.handR[0] * K, Number(w.getAttribute('data-wy')) + a3.handR[1] * K] as const;
    });
    expect(Math.abs(hands[0]![1] - hands[1]![1])).toBeGreaterThan(0.3 * metrics.unit);
    for (const [hx, hy] of hands) {
      // Point de la main dans le repère de la charge avant le réglage (inverse de translate puis rotate autour de (0, py)).
      const a = (-deg * Math.PI) / 180;
      const x = hx - ox - dx;
      const y = hy - oy - ty - py;
      const ly = x * Math.sin(a) + y * Math.cos(a) + py;
      expect(Math.abs(ly - py)).toBeLessThanOrEqual(metrics.unit);
    }
  });
});
