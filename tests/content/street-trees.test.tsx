// @vitest-environment jsdom
// tests/content/street-trees.test.tsx — calque `arbres-rue` (PR 3) : un groupe par fosse plantée, nœuds constants à toute heure,
// mouvement réduit sans aucune transformation qui change, pose au vent (rameaux, grappes, rehauts ; fût jamais transformé).
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RUE_BAKE_TRIES, StreetTrees, resetStreetTreesForTests, setRueSpritePainterForTests, type RueBakeJob, type RueSprites } from '../../src/content/street-trees';
import { cityPaintPlan } from '../../src/core/library/paint/city-plan';
import { fondMoment } from '../../src/core/library/paint/fond-time';
import { windOf } from '../../src/core/library/paint/fond-vent';
import { IDENTITY, NIGHT } from '../../src/core/library/paint/grade';
import type { RuePit } from '../../src/core/library/paint/rue-verte-plan';
import { rueTreeModel } from '../../src/core/library/paint/rue-verte-painter';
import { gradePixels, rueLayers, rueSpriteBox, rueTreePose } from '../../src/core/library/paint/rue-sprites';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const W = 1400;
const H = 340;
const plan = cityPaintPlan(W, H, 7);
const pits = plan.rue.filter((v): v is RuePit => v.kind === 'pit' && !v.empty);
const windy = fondMoment({ y: 2026, m: 7, d: 7 }, 15 * 60, { cloud: 0.2, precip: 0, wind: 0.8, snow: false });

let host: HTMLDivElement;
let root: Root;
let frames: FrameRequestCallback[] = [];
let jobs: RueBakeJob[] = [];
beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  frames = [];
  jobs = [];
  vi.stubGlobal('requestIdleCallback', (fn: () => void) => { fn(); return 1; });
  vi.stubGlobal('cancelIdleCallback', () => undefined);
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { frames.push(cb); return frames.length; });
  vi.stubGlobal('cancelAnimationFrame', () => undefined);
  resetStreetTreesForTests();
  setRueSpritePainterForTests(async (job) => {
    jobs.push(job);
    return Object.fromEntries(job.layers.map((l) => [l, `data:${job.key}|${l}`]));
  });
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  setRueSpritePainterForTests(null);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
const settle = () => act(async () => { for (let i = 0; i < 8; i++) await new Promise((r) => setTimeout(r, 0)); });
const render = (minutes: number, opts: { still?: boolean; daylight?: number; onReady?: (r: boolean) => void; hourly?: boolean } = {}): void =>
  act(() =>
    root.render(
      <svg>
        <StreetTrees
          plan={plan}
          moment={opts.hourly ? fondMoment({ y: 2026, m: 7, d: 7 }, minutes, windy.meteo) : windy}
          daylight={opts.daylight ?? 1}
          twilight={0}
          gloom={false}
          dim={0}
          minutes={minutes}
          still={opts.still}
          onReady={opts.onReady}
        />
      </svg>,
    ),
  );
// Une image de la boucle (15 Hz) à l'instant `ms` de l'horloge murale.
const tick = (ms: number): void => {
  vi.spyOn(Date, 'now').mockReturnValue(ms);
  const list = frames.splice(0);
  act(() => list.forEach((cb) => cb(ms)));
};
const transforms = (): (string | null)[] => [...host.querySelectorAll('[data-rue-arbre] image')].map((n) => n.getAttribute('transform'));

describe('calque arbres-rue', () => {
  it('la ville de test a des fosses plantées', () => {
    expect(pits.length).toBeGreaterThan(2);
  });
  it('un groupe par fosse plantée, couches dans l\'ordre, même nombre de nœuds à 0 h, 8 h, 15 h, 23 h', async () => {
    const counts: number[] = [];
    for (const h of [0, 8, 15, 23]) {
      render(h * 60, { daylight: h === 0 || h === 23 ? 0.1 : 1, hourly: true });
      await settle();
      counts.push(host.querySelectorAll('*').length);
    }
    const groups = host.querySelectorAll('[data-rue-arbre]');
    expect(groups).toHaveLength(pits.length);
    groups.forEach((g, i) => {
      expect([...g.children].map((c) => c.getAttribute('data-rue-couche'))).toEqual(rueLayers(rueTreeModel(pits[i]!)));
    });
    expect(new Set(counts).size).toBe(1);
    // Images cuites posées sur la boîte fixe de la fosse ; nuit : cuisson étalonnée.
    const img = groups[0]!.querySelector('[data-rue-couche="trunk"]')!;
    const box = rueSpriteBox(pits[0]!);
    expect(img.getAttribute('href')).toMatch(/^data:.*\|trunk$/);
    expect([img.getAttribute('x'), img.getAttribute('width')]).toEqual([String(box.x), String(box.w)]);
    expect(jobs.some((j) => j.grade !== null)).toBe(true);
    expect(jobs.some((j) => j.grade === null)).toBe(true);
  });
  it('au vent : les grappes bougent d\'une image à l\'autre, le fût jamais', async () => {
    render(15 * 60, { still: false });
    await settle();
    tick(1_800_000_000_000);
    const a = transforms();
    tick(1_800_000_000_700);
    const b = transforms();
    expect(a).not.toEqual(b);
    const trunk = [...host.querySelectorAll('[data-rue-couche="trunk"], [data-rue-couche="shadow"]')];
    expect(trunk.every((n) => n.getAttribute('transform') === null)).toBe(true);
  });
  it('mouvement réduit : aucune transformation ne change entre deux images de la boucle', async () => {
    render(15 * 60, { still: true });
    await settle();
    tick(1_800_000_000_000);
    const a = transforms();
    tick(1_800_000_000_700);
    expect(transforms()).toEqual(a);
    expect(a.filter((v) => v !== null).length).toBeGreaterThan(pits.length);
    expect(a.every((v) => v === null || /^(translate\(0 0\)|matrix\(1 0 0 1 0 0\))$/.test(v))).toBe(true);
  });
});

describe('cuisson et apparition des arbres', () => {
  const sprite = (job: RueBakeJob): RueSprites => Object.fromEntries(job.layers.map((l) => [l, `data:${job.key}|${l}`]));
  const opacities = (): string[] => [...host.querySelectorAll<SVGGElement>('[data-rue-arbre]')].map((g) => g.style.opacity);
  it("onReady attend que toutes les fosses aient leur image ; avant, chaque arbre est à opacité 0 (fondu à l'entrée)", async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => (release = r));
    setRueSpritePainterForTests(async (job) => {
      if (job.pit === pits.at(-1)) await gate;
      return sprite(job);
    });
    const ready = vi.fn();
    render(15 * 60, { onReady: ready });
    await settle();
    expect(ready).toHaveBeenLastCalledWith(false);
    expect(opacities().slice(0, -1).every((o) => o === '1')).toBe(true);
    expect(opacities().at(-1)).toBe('0');
    const g = host.querySelectorAll<SVGGElement>('[data-rue-arbre]');
    expect(g[g.length - 1]!.style.transition).toContain('opacity');
    release();
    await settle();
    expect(ready).toHaveBeenLastCalledWith(true);
    expect(opacities().every((o) => o === '1')).toBe(true);
  });
  it('une cuisson ratée est retentée ; épuisée, la fosse est marquée et ne bloque pas la ville', async () => {
    const tries = new Map<string, number>();
    setRueSpritePainterForTests(async (job) => {
      const n = (tries.get(job.key) ?? 0) + 1;
      tries.set(job.key, n);
      if (job.pit === pits[0]) return n < 3 ? null : sprite(job);
      if (job.pit === pits[1]) throw new Error('boom');
      return sprite(job);
    });
    const ready = vi.fn();
    render(15 * 60, { onReady: ready });
    await settle();
    const keyOf = (v: RuePit): string => [...tries.keys()].find((k) => k.includes(`|${Math.round(v.x * 10)}|`))!;
    expect(tries.get(keyOf(pits[0]!))).toBe(3);
    expect(tries.get(keyOf(pits[1]!))).toBe(RUE_BAKE_TRIES);
    const g = host.querySelectorAll('[data-rue-arbre]');
    expect(g[0]!.querySelector('image')!.getAttribute('href')).toMatch(/^data:/);
    expect(g[0]!.hasAttribute('data-rue-echec')).toBe(false);
    expect(g[1]!.hasAttribute('data-rue-echec')).toBe(true);
    expect(ready).toHaveBeenLastCalledWith(true);
  });
  it("mouvement réduit : aucune boucle de l'horloge murale", async () => {
    render(15 * 60, { still: true });
    await settle();
    expect(frames).toHaveLength(0);
  });
});

describe('rueTreePose', () => {
  const v = pits[0]!;
  const m = rueTreeModel(v);
  it('calme : toutes les translations nulles, rehauts éteints', () => {
    const p = rueTreePose(v, m, 1234.5, windOf({ cloud: 0, precip: 0, wind: 0, snow: false }, false), W);
    expect(p.twigShear).toBe(0);
    expect(p.masses.every((g) => g.dx === 0 && g.dy === 0)).toBe(true);
    expect([p.hiAlpha, p.paleAlpha]).toEqual([0, 0]);
  });
  it('vent 0,8 : à écart au tronc égal, la grappe haute bouge plus que la basse ; une pose par grappe, pas de pose du fût', () => {
    const w = windOf({ cloud: 0, precip: 0, wind: 0.8, snow: false }, false);
    // Modèle réel, touffes regroupées en deux grappes au même écart horizontal : 0 en haut du houppier, 1 en bas.
    const tf = (cluster: number, y: number) => ({ ...m.tufts[0]!, x: m.foot.x + 10, y, cluster });
    const mm = { ...m, segs: m.segs.filter((sg) => sg.lv !== 1).concat(m.segs.filter((sg) => sg.lv === 1).slice(0, 2)), tufts: [tf(0, m.cy - m.ry * 0.8), tf(1, m.cy + m.ry * 0.8)] };
    expect(mm.segs.filter((sg) => sg.lv === 1)).toHaveLength(2);
    let sHi = 0;
    let sLo = 0;
    for (let t = 0; t < 120; t += 0.37) {
      const p = rueTreePose(v, mm, 1000 + t, w, W);
      expect(p.masses).toHaveLength(2);
      expect(Object.keys(p)).not.toContain('trunk');
      sHi += Math.abs(p.masses[0]!.dx);
      sLo += Math.abs(p.masses[1]!.dx);
    }
    expect(sLo).toBeGreaterThan(0);
    expect(sHi).toBeGreaterThan(sLo);
  });
  it('vent 0,8 sur les vrais arbres : chaque grappe bouge, une pose par couche de grappe', () => {
    const w = windOf({ cloud: 0, precip: 0, wind: 0.8, snow: false }, false);
    for (const pit of pits) {
      const mm = rueTreeModel(pit);
      const p = rueTreePose(pit, mm, 1000, w, W);
      expect(p.masses).toHaveLength(rueLayers(mm).filter((l) => l[0] === 'c').length);
      expect(p.masses.some((g) => Math.abs(g.dx) > 0.1)).toBe(true);
      expect(p.twigShear).not.toBe(0);
    }
  });
});

describe('gradePixels', () => {
  it('identité : pixels inchangés ; nuit : plus sombre, alpha et transparents intacts', () => {
    const d = new Uint8ClampedArray([200, 150, 100, 255, 9, 9, 9, 0]);
    gradePixels(d, IDENTITY);
    expect([...d]).toEqual([200, 150, 100, 255, 9, 9, 9, 0]);
    gradePixels(d, NIGHT);
    expect(d[0]).toBeLessThan(200);
    expect(d[3]).toBe(255);
    expect([...d.slice(4)]).toEqual([9, 9, 9, 0]);
  });
});
