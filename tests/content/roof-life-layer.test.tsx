// @vitest-environment jsdom
// tests/content/roof-life-layer.test.tsx — calque des toits vivants (chantier « vie au-dessus de la rue », tâche 12) : nœuds
// montés pour la journée (aucune création d'une minute à l'autre), chat, pigeons, fumées d'hiver et couvreur montrés aux
// bons moments, mouvement réduit (chat assis, pigeons posés), averse pendant une sortie du chat.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RoofLifeLayer } from '../../src/content/roof-life-layer';
import { sharedSceneLife, type SceneLife } from '../../src/content/use-scene-life';
import { dayContext } from '../../src/core/library/city/calendar';
import { cityFacades, type Facade } from '../../src/core/library/city/facades';
import { CAT_EMERGE, catOutings, catRoofs } from '../../src/core/library/city/roof-life';
import { skyAt, sunTimes } from '../../src/core/library/sky';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const H = 340;
const W = 1080;
const SEED = 1;
// Mardi 15 décembre 2026 ; mardi 16 juin 2026.
const DEC = { y: 2026, m: 12, d: 15 };
const JUNE = { y: 2026, m: 6, d: 16 };
const skyOf = (minutes: number, d = DEC) => skyAt(minutes, sunTimes(d, { lat: 48.85, lon: 2.35 }, 120));
const NOW_S = Math.floor(1.8e9 / 86400) * 86400;
const facades = cityFacades(W, H, SEED);
const lifeOf = (d = DEC, wet = false): SceneLife => sharedSceneLife(facades, dayContext(d, []), wet, SEED, false);

const mounted: { root: Root; host: HTMLDivElement }[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const { root, host } of mounted.splice(0)) {
    act(() => root.unmount());
    host.remove();
  }
});

function mount(): { host: HTMLDivElement; render: (o: { minutes: number; life?: SceneLife; still?: boolean; d?: typeof DEC; fs?: Facade[] }) => void; layer: () => Element } {
  const now = vi.spyOn(Date, 'now').mockReturnValue(NOW_S * 1000);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  mounted.push({ root, host });
  const render = (o: { minutes: number; life?: SceneLife; still?: boolean; d?: typeof DEC; fs?: Facade[] }): void => {
    now.mockReturnValue((NOW_S + Math.round((o.minutes % 1) * 60)) * 1000);
    act(() =>
      root.render(
        <svg>
          <RoofLifeLayer facades={o.fs ?? facades} life={o.life ?? lifeOf(o.d ?? DEC)} sky={skyOf(Math.floor(o.minutes), o.d ?? DEC)} minutes={Math.floor(o.minutes)} still={o.still ?? false} seed={SEED} />
        </svg>,
      ),
    );
  };
  return { host, render, layer: () => host.querySelector('[data-roof-life]')! };
}

function watch(el: Element): () => number {
  const obs = new MutationObserver(() => undefined);
  obs.observe(el, { childList: true, subtree: true });
  return () => obs.takeRecords().reduce((n, r) => n + r.addedNodes.length + r.removedNodes.length, 0);
}
const shown = (el: Element, sel: string): Element[] => [...el.querySelectorAll(sel)].filter((e) => e.getAttribute('display') !== 'none');
const cats = catRoofs(facades.map((f) => f.layout), SEED);

describe('calque des toits vivants', () => {
  it('calque : nœuds constants de 6 h à 2 h', () => {
    const m = mount();
    m.render({ minutes: 360 });
    const layer = m.layer();
    const count = layer.querySelectorAll('*').length;
    expect(count).toBeGreaterThan(10);
    const changes = watch(layer);
    for (let t = 361; t < 1440 + 120; t += 7) m.render({ minutes: t % 1440 });
    expect(changes()).toBe(0);
    expect(layer.querySelectorAll('*').length).toBe(count);
    expect(m.layer()).toBe(layer);
  });

  it('un mardi de décembre à 11 h : couvreur, fumées, pigeons', () => {
    const m = mount();
    m.render({ minutes: 660 });
    const layer = m.layer();
    expect(shown(layer, '[data-roof-roofer-slot] [data-pose="kneel"]')).toHaveLength(1);
    expect(shown(layer, '[data-roof-smoke-slot]').length).toBeGreaterThan(0);
    expect(layer.querySelectorAll('[data-roof-pigeon-slot]').length).toBeGreaterThan(0);
  });

  it('le chat sort par la tabatière, marche, s’assoit et rentre', () => {
    expect(cats.length).toBeGreaterThan(0);
    const fi = cats[0]!;
    const o = catOutings(SEED, '2026-12-15', fi)[0]!;
    const m = mount();
    const slot = (): Element => m.layer().querySelector(`[data-roof-cat-slot="${fi}"]`)!;
    const pose = (): string[] => shown(slot(), '[data-pose]').map((e) => e.getAttribute('data-pose')!);
    m.render({ minutes: o.start - 1 });
    expect(pose()).toEqual([]);
    m.render({ minutes: o.start + CAT_EMERGE / 2 });
    expect(pose()).toEqual(['emerge']);
    m.render({ minutes: o.start + o.dur / 2 });
    expect(pose()).toEqual(['sit']);
    m.render({ minutes: o.start + o.dur + 1 });
    expect(pose()).toEqual([]);
  });

  it('juin : aucune fumée montée', () => {
    const m = mount();
    m.render({ minutes: 660, d: JUNE });
    expect(m.layer().querySelectorAll('[data-roof-smoke-slot]')).toHaveLength(0);
  });

  it('mouvement réduit : chat assis pendant sa sortie, pigeons posés, aucun en vol', () => {
    const fi = cats[0]!;
    const o = catOutings(SEED, '2026-12-15', fi)[0]!;
    const m = mount();
    // Première minute entière de la sortie (le chat sort ou marche encore) : assis en mouvement réduit.
    m.render({ minutes: Math.ceil(o.start), still: true });
    const slot = m.layer().querySelector(`[data-roof-cat-slot="${fi}"]`)!;
    expect(shown(slot, '[data-pose]').map((e) => e.getAttribute('data-pose'))).toEqual(['sit']);
    for (let t = 420; t < 1200; t += 3) {
      m.render({ minutes: t, still: true });
      expect(shown(m.layer(), '[data-roof-pigeon-slot] [data-pose="fly"]')).toHaveLength(0);
    }
  });

  it('averse pendant une sortie : le chat ne disparaît pas sur place, il rentre', () => {
    const fi = cats[0]!;
    const o = catOutings(SEED, '2026-12-15', fi)[0]!;
    const m = mount();
    const slot = (): Element => m.layer().querySelector(`[data-roof-cat-slot="${fi}"]`)!;
    const pose = (): string[] => shown(slot(), '[data-pose]').map((e) => e.getAttribute('data-pose')!);
    m.render({ minutes: o.start + 10 });
    expect(pose()).toEqual(['sit']);
    const wet = lifeOf(DEC, true);
    m.render({ minutes: o.start + 10, life: wet });
    expect(pose()).toHaveLength(1);
    // Il revient vers la tabatière, puis rentre ; plus rien ensuite.
    m.render({ minutes: o.start + 10 + 5 / 60, life: wet });
    expect(pose()).toEqual(['walk']);
    m.render({ minutes: o.start + 13, life: wet });
    expect(pose()).toEqual([]);
  });
});
