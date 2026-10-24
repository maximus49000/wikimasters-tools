// @vitest-environment jsdom
// tests/content/painted-city-grue.test.tsx
// Grue et ailes des moulins devant les nuages (capture de l'utilisateur du 2026-10-24 : trous en forme de boîte dans les nuages
// au-dessus des toits, la nuit sous la pluie) : avec le calque météo, elles sont dessinées dans son groupe du ciel, après les
// nuages et sous les voiles ; sans météo, elles restent dans vie-fond. Mêmes poses et mêmes couleurs qu'avant.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ART_KEY } from '../../src/content/art-setting';
import { FondLife } from '../../src/content/fond-life';
import { FondSkySlot, fondSig, resetFondSkySlotForTests, veilAlphaAt, type FondVeil } from '../../src/content/fond-sky-slot';
import { resetPaintQueueForTests, setJobRunnerForTests } from '../../src/content/paint-queue';
import { resetPaintedCacheForTests, setTilePainterForTests } from '../../src/content/painted-city';
import { ScenePanorama } from '../../src/content/scene-panorama';
import { WeatherLayer } from '../../src/content/scene-weather';
import { resetStreetTreesForTests, setRueSpritePainterForTests } from '../../src/content/street-trees';
import { resetStreetTreesSlotForTests } from '../../src/content/street-trees-slot';
import { cityPaintPlan, type CityPaintPlan } from '../../src/core/library/paint/city-plan';
import { SUNNY, fondMoment, type FondMoment } from '../../src/core/library/paint/fond-time';
import { craneK, gradeHex, vieDay, vieFrame, vieModel } from '../../src/core/library/paint/fond-vie';
import { gradeFor } from '../../src/core/library/paint/grade';
import { mixHex, skyAt, sunTimes } from '../../src/core/library/sky';
import { createWeatherClock, steadySource } from '../../src/core/library/weather/weather-clock';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
const settle = () => act(async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0)); });
const q = (s: string) => container.querySelector(s);
const SKY_ID = /^(grue|grue-feu|moulin)-\d+$/;
const skyNodes = (scope: Element | null): Element[] => [...(scope?.querySelectorAll('[data-vie]') ?? [])].filter((n) => SKY_ID.test(n.getAttribute('data-vie')!));
const before = (a: Element, b: Element): boolean => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  vi.stubGlobal('requestAnimationFrame', () => 1);
  vi.stubGlobal('cancelAnimationFrame', () => undefined);
  vi.stubGlobal('requestIdleCallback', (fn: () => void) => { fn(); return 1; });
  vi.stubGlobal('cancelIdleCallback', () => undefined);
  resetPaintQueueForTests();
  setJobRunnerForTests(async (j) => `data:image/png;base64,${btoa(j.key)}`);
  resetPaintedCacheForTests();
  resetStreetTreesForTests();
  resetStreetTreesSlotForTests();
  resetFondSkySlotForTests();
  setTilePainterForTests(async (_p, t) => `data:fake-${t}`);
  setRueSpritePainterForTests(async (job) => Object.fromEntries(job.layers.map((l) => [l, `data:${job.key}|${l}`])));
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  localStorage.removeItem(ART_KEY);
  setJobRunnerForTests(null);
  setTilePainterForTests(null);
  setRueSpritePainterForTests(null);
  vi.unstubAllGlobals();
});

describe('grue et ailes des moulins : calque', () => {
  const times = sunTimes({ y: 2024, m: 6, d: 21 }, { lat: 48.85, lon: 2.35 }, 120);
  const minutes = 22 * 60;
  const sky = skyAt(minutes, times);
  const clock = () => {
    const c = createWeatherClock();
    c.setSource(steadySource('rain'), Date.now());
    return c;
  };

  it('avec la météo : dans le groupe du ciel, après les nuages, avant le voile gris et la pluie ; plus dans vie-fond', async () => {
    localStorage.setItem(ART_KEY, 'ghibli');
    await act(async () => {
      root.render(
        <svg>
          <ScenePanorama scene="city" width={720} height={340} sky={sky} minutes={minutes} seed={5} />
          <WeatherLayer scene="city" width={720} height={340} seed={5} sky={sky} clock={clock()} />
        </svg>,
      );
    });
    await settle();
    const weather = q('[data-weather]')!;
    const inSky = skyNodes(weather);
    expect(inSky.length).toBeGreaterThan(0);
    expect(inSky.some((n) => n.getAttribute('data-vie') === 'grue-0')).toBe(true);
    expect(skyNodes(q('[data-vie-fond]'))).toHaveLength(0);
    // Portail dans un <g> : éléments SVG (pas HTML).
    for (const n of inSky) expect(n.namespaceURI).toBe('http://www.w3.org/2000/svg');
    const clouds = q('[data-wx-clip="sky"]')!;
    const overcast = q('[data-wx="overcast"]')!;
    const fog = q('[data-wx="fog"]')!;
    for (const n of inSky) {
      expect(before(clouds, n) && !clouds.contains(n)).toBe(true);
      expect(before(n, overcast)).toBe(true);
      expect(before(n, fog)).toBe(true);
    }
    // Découpe au-dessus du premier plan et du mur du fond, comme dans vie-fond ; visibilité de la ville peinte.
    const wrap = q('[data-vie-fond-ciel]') as HTMLElement;
    expect(wrap.querySelector('clipPath path')!.getAttribute('d')).toBe(vieModel(cityPaintPlan(720, 340, 5)).clipHill);
    expect(wrap.style.opacity).toBe((q('[data-painted-city]') as HTMLElement).style.opacity);
  });

  it('sans météo : la grue et les ailes restent dans vie-fond', async () => {
    localStorage.setItem(ART_KEY, 'ghibli');
    await act(async () => {
      root.render(
        <svg>
          <ScenePanorama scene="city" width={720} height={340} sky={sky} minutes={minutes} seed={5} />
        </svg>,
      );
    });
    await settle();
    expect(skyNodes(q('[data-vie-fond]')).length).toBeGreaterThan(0);
    expect(q('[data-vie-ciel]')).toBeNull();
  });
});

describe('grue et ailes des moulins : mêmes poses qu’avant', () => {
  // Une ville avec un moulin, et un jour de semaine où la grue est en service.
  const pick = (): { plan: CityPaintPlan; date: { y: number; m: number; d: number } } => {
    for (let seed = 1; seed < 200; seed++) {
      const plan = cityPaintPlan(1440, 340, seed);
      if (!plan.fond.escapes.some((e) => e.mill)) continue;
      for (let k = 0; k < 365; k++) {
        const t = new Date(Date.UTC(2026, 0, 1 + k));
        const date = { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
        const m = fondMoment(date, 10 * 60, SUNNY);
        const D = vieDay(m);
        if (D.weekday >= 1 && D.weekday <= 5 && plan.fond.escapes.some((e) => craneK(e, 10, D) >= 1)) return { plan, date };
      }
    }
    throw new Error('aucune ville avec moulin et grue');
  };
  const { plan, date } = pick();
  const cases: { name: string; at: number; daylight: number; moment: FondMoment }[] = [
    { name: 'jour de semaine 10 h, grue en service', at: 10.25, daylight: 1, moment: fondMoment(date, 10 * 60 + 15, SUNNY) },
    { name: 'nuit', at: 22.5, daylight: 0, moment: fondMoment(date, 22 * 60 + 30, SUNNY) },
    { name: 'vent fort', at: 15.1, daylight: 0.9, moment: fondMoment(date, 15 * 60 + 6, { ...SUNNY, wind: 0.9 }) },
  ];
  const sig = 'test|grue';
  const mount = async (c: (typeof cases)[number], veil: FondVeil | null): Promise<void> => {
    await act(async () => {
      root.render(
        <svg>
          <FondLife plan={plan} moment={c.moment} minutes={Math.floor(c.at * 60)} daylight={c.daylight} twilight={0} gloom={false} dim={1 - c.daylight} at={c.at} still={false} sky={{ sig, shown: true, fade: 'none' }} />
          <g data-weather="">{veil && <FondSkySlot sig={sig} veil={veil} height={340} />}</g>
        </svg>,
      );
    });
    await settle();
  };
  const snapshot = (): Map<string, string> => new Map(skyNodes(container).map((n) => [n.getAttribute('data-vie')!, n.outerHTML.toLowerCase()]));

  for (const c of cases)
    it(`${c.name} : nœuds identiques à vie-fond (voile nul), poses de vieFrame`, async () => {
      await mount(c, null);
      const old = snapshot();
      expect(skyNodes(q('[data-vie-fond]')).length).toBe(old.size);
      act(() => root.unmount());
      root = createRoot(container);
      await mount(c, { color: '#123456', alpha: 0 });
      expect(skyNodes(q('[data-vie-fond]'))).toHaveLength(0);
      expect(skyNodes(q('[data-vie-ciel]')).length).toBe(old.size);
      expect(snapshot()).toEqual(old);
      // Poses de vieFrame à cet instant (ailes : rotation autour du moyeu ; grue : mât et flèche).
      const model = vieModel(plan);
      const frame = vieFrame(model, { T: c.at, D: vieDay(c.moment), daylight: c.daylight, gloom: false, dim: 1 - c.daylight, minutes: Math.floor(c.at * 60), still: false, millOffset: model.escapes.map(() => 0), lights: true });
      let mills = 0;
      model.nodes.forEach((n, i) => {
        if (!SKY_ID.test(n.id)) return;
        const el = q(`[data-vie-ciel] [data-vie="${n.id}"]`)!;
        for (const [k, v] of Object.entries(frame[i]!.a)) expect(el.getAttribute(k), `${n.id} ${k}`).toBe(v);
        frame[i]!.k?.forEach((attrs, j) => {
          for (const [k, v] of Object.entries(attrs)) expect(el.children[j]!.getAttribute(k), `${n.id}/${j} ${k}`).toBe(v);
        });
        if (n.id.startsWith('moulin-')) mills++;
      });
      expect(mills).toBeGreaterThan(0);
      // Grue en service à 10 h : montée (visible).
      if (c.at === 10.25) expect(skyNodes(q('[data-vie-ciel]')).some((n) => /^grue-\d+$/.test(n.getAttribute('data-vie')!) && n.getAttribute('display') === 'inline')).toBe(true);
    });

  it('sous le voile de la météo : couleurs mêlées au voile (comme le voile posé dessus)', async () => {
    const c = cases[1]!;
    const veil: FondVeil = { color: '#202838', alpha: 0.8 };
    await mount(c, veil);
    const model = vieModel(plan);
    const grade = gradeFor(c.daylight, 0, false);
    const e = model.escapes.find((v) => v.e.mill)!.e;
    const k = model.escapes.findIndex((v) => v.e === e);
    const mill = q(`[data-vie-ciel] [data-vie="moulin-${k}"]`)!;
    const tpl = model.nodes.find((n) => n.id === `moulin-${k}`)!.kids![1]!;
    const a = Math.round(veilAlphaAt(veil, e.mill!.y - 13 * e.mill!.s, 340) * 64) / 64;
    expect(mill.children[1]!.getAttribute('fill')).toBe(mixHex(gradeHex(tpl.attrs.fill!, grade), veil.color, a));
    expect(a).toBeGreaterThan(0.4);
  });
});

describe('emplacement', () => {
  it('signature de la ville : graine, largeur, hauteur', () => {
    expect(fondSig(5, 720, 340)).toBe('5|720|340');
  });
});
