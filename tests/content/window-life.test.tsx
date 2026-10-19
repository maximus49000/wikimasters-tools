// @vitest-environment jsdom
// tests/content/window-life.test.tsx — calque de la vie derrière les fenêtres (chantier « vie au-dessus de la rue », tâche 9) :
// nœuds montés pour la journée, borne des 8 pantins animés, remontage au changement de largeur ou de jour, pluie qui commence
// pendant une scène de balcon, mouvement réduit, pantins toujours en 2D.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WindowLifeLayer } from '../../src/content/window-life';
import { sharedSceneLife, type SceneLife } from '../../src/content/use-scene-life';
import { FigureContext, FigureRegistry } from '../../src/content/figure/figure-host';
import { dayContext } from '../../src/core/library/city/calendar';
import { cityFacades, type Facade } from '../../src/core/library/city/facades';
import { homeState } from '../../src/core/library/city/home-state';
import { windowPose } from '../../src/core/library/city/window-choreo';
import { skyAt, sunTimes } from '../../src/core/library/sky';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const H = 340;
const SEED = 7;
// Mardi 20 octobre 2026, et le mercredi qui suit (lendemain).
const DATE = { y: 2026, m: 10, d: 20 };
const NEXT = { y: 2026, m: 10, d: 21 };
const skyOf = (minutes: number, d = DATE) => skyAt(minutes, sunTimes(d, { lat: 48.85, lon: 2.35 }, 120));
// Instant mural multiple de 60 s : la minute de la scène est exactement `minutes` (aucune fraction).
const NOW_S = Math.floor(1.8e9 / 86400) * 86400;

type Mount = { host: HTMLDivElement; reg: FigureRegistry; render: (o: { minutes: number; life?: SceneLife; facades?: Facade[]; width?: number; still?: boolean; d?: typeof DATE }) => void; layer: () => Element };
const mounted: { root: Root; host: HTMLDivElement }[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const { root, host } of mounted.splice(0)) {
    act(() => root.unmount());
    host.remove();
  }
});

const lifeOf = (facades: Facade[], d = DATE, wet = false): SceneLife => sharedSceneLife(facades, dayContext(d, []), wet, SEED, false);

function mount(width: number, reg = new FigureRegistry('twl', { perFrame: 400 })): Mount {
  vi.spyOn(Date, 'now').mockReturnValue(NOW_S * 1000);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  mounted.push({ root, host });
  const base = { facades: cityFacades(width, H, SEED), width };
  const render: Mount['render'] = (o) => {
    const facades = o.facades ?? base.facades;
    const life = o.life ?? lifeOf(facades, o.d ?? DATE);
    act(() =>
      root.render(
        <FigureContext.Provider value={reg}>
          <svg>
            <WindowLifeLayer facades={facades} life={life} sky={skyOf(o.minutes, o.d ?? DATE)} minutes={o.minutes} still={o.still ?? false} width={o.width ?? width} />
          </svg>
        </FigureContext.Provider>,
      ),
    );
  };
  return { host, reg, render, layer: () => host.querySelector('[data-window-life]')! };
}

// Ajouts et retraits de nœuds observés sous le calque.
function watch(el: Element): () => number {
  const obs = new MutationObserver(() => undefined);
  obs.observe(el, { childList: true, subtree: true });
  return () => obs.takeRecords().reduce((n, r) => n + r.addedNodes.length + r.removedNodes.length, 0);
}

const shown = (layer: Element): Element[] => [...layer.querySelectorAll('[data-wl-fig]')].filter((g) => g.getAttribute('display') !== 'none');

describe('calque de la vie derrière les fenêtres', () => {
  it('nœuds constants de 6 h à 2 h (aucune création ni suppression)', () => {
    const m = mount(1080);
    m.render({ minutes: 6 * 60 });
    const layer = m.layer();
    expect(layer.querySelectorAll('[data-wl-fig]').length).toBeGreaterThan(0);
    const changes = watch(m.host);
    let seen = 0;
    for (let t = 6 * 60; t < 1440; t += 7) {
      m.render({ minutes: t });
      seen = Math.max(seen, shown(m.layer()).length);
    }
    expect(changes()).toBe(0);
    expect(seen).toBeGreaterThan(0);
    // Minuit : nouveau jour de scène (un seul remontage), puis plus rien jusqu'à 2 h.
    m.render({ minutes: 0, d: NEXT });
    expect(changes()).toBeGreaterThan(0);
    for (let t = 1; t <= 120; t += 3) m.render({ minutes: t, d: NEXT });
    expect(changes()).toBe(0);
  });

  it('au plus 8 pantins animés visibles', () => {
    const width = 2000;
    const m = mount(width);
    const facades = cityFacades(width, H, SEED);
    const life = lifeOf(facades);
    let busiest = 0;
    let maxShown = 0;
    for (let t = 6 * 60; t < 1440; t += 5) {
      // Candidats : chorégraphies animées dont la pose bouge à cette minute, sur toute la ville.
      let candidates = 0;
      for (const d of life.dwellings) {
        const st = homeState(d, life.today.get(d.id)!, life.yesterday.get(d.id)!, t);
        for (const a of st.actors) {
          const p = windowPose(a, d);
          if (a.animated && p && !p.still) candidates++;
        }
      }
      busiest = Math.max(busiest, candidates);
      m.render({ minutes: t, facades, life });
      const anim = shown(m.layer()).filter((g) => g.getAttribute('data-anim') === '1').length;
      maxShown = Math.max(maxShown, anim);
      expect(anim).toBeLessThanOrEqual(8);
    }
    expect(busiest).toBeGreaterThan(8);
    expect(maxShown).toBe(8);
  });

  it('changement de largeur ou de jour : remontage unique', () => {
    const m = mount(1080);
    m.render({ minutes: 12 * 60 });
    let changes = watch(m.host);
    const wide = cityFacades(1440, H, SEED);
    m.render({ minutes: 12 * 60 + 1, facades: wide, width: 1440 });
    expect(changes()).toBeGreaterThan(0);
    for (let t = 12 * 60 + 2; t < 12 * 60 + 40; t += 3) m.render({ minutes: t, facades: wide, width: 1440 });
    expect(changes()).toBe(0);
    changes = watch(m.host);
    m.render({ minutes: 12 * 60 + 40, facades: wide, width: 1440, d: NEXT });
    expect(changes()).toBeGreaterThan(0);
    for (let t = 12 * 60 + 41; t < 12 * 60 + 60; t += 3) m.render({ minutes: t, facades: wide, width: 1440, d: NEXT });
    expect(changes()).toBe(0);
  });

  it('pluie en cours de scène : le pantin du balcon finit sa sortie', () => {
    const width = 2000;
    const facades = cityFacades(width, H, SEED);
    const dry = lifeOf(facades, DATE, false);
    const wet = lifeOf(facades, DATE, true);
    // Une scène de balcon assez longue de la journée sèche, absente de la journée humide ; accoudé au garde-corps (pose fixe :
    // jamais écartée par la borne des animées).
    let found: { id: string; m: number; t0: number; t1: number } | null = null;
    for (const d of dry.dwellings) {
      for (const g of dry.today.get(d.id)!.segments) {
        if (g.k !== 'act' || g.where !== 'balcony' || g.choreo !== 'leanRail' || g.t1 - g.t0 < 4 || g.t0 < 480 || g.t1 > 1380) continue;
        const rainy = wet.today.get(d.id)!.segments.some((s) => s.k === 'act' && s.where === 'balcony' && s.t0 < g.t1 && s.t1 > g.t0);
        if (!rainy) {
          found = { id: d.id, m: g.m, t0: g.t0, t1: g.t1 };
          break;
        }
      }
      if (found) break;
    }
    expect(found).not.toBeNull();
    const { id, m: who, t0, t1 } = found!;
    const m = mount(width);
    const node = (): Element => m.layer().querySelector(`[data-wl-fig="${id}/${who}"][data-side="out"]`)!;
    const at = Math.ceil(t0 + 1);
    m.render({ minutes: at, facades, life: dry });
    expect(node().getAttribute('display')).not.toBe('none');
    // La pluie commence : nouvel emploi du temps, la scène commencée continue jusqu'à sa fin.
    m.render({ minutes: at + 1, facades, life: wet });
    expect(node().getAttribute('display')).not.toBe('none');
    for (let t = at + 2; t < Math.floor(t1); t++) {
      m.render({ minutes: t, facades, life: wet });
      const inside = m.layer().querySelector(`[data-wl-fig="${id}/${who}"][data-side="in"]`)!;
      expect(node().getAttribute('display') !== 'none' || inside.getAttribute('display') !== 'none').toBe(true);
    }
    m.render({ minutes: Math.ceil(t1) + 1, facades, life: wet });
    expect(node().getAttribute('display')).toBe('none');
  });

  it('mouvement réduit : aucune transition, poses fixes', () => {
    const m = mount(1080);
    let seen = 0;
    for (let t = 7 * 60; t < 23 * 60; t += 11) {
      m.render({ minutes: t, still: true });
      const layer = m.layer();
      for (const el of layer.querySelectorAll('[style]')) expect((el as HTMLElement).style.transition).toBe('');
      expect(layer.querySelectorAll('animate, animateTransform, animateMotion')).toHaveLength(0);
      for (const g of shown(layer)) {
        seen++;
        expect(g.getAttribute('data-anim')).toBe('0');
        const key = g.querySelector('[data-figure]')!.getAttribute('data-key') ?? '';
        expect(key).not.toMatch(/\|walk\|/);
      }
      // Même minute rendue deux fois : rien ne bouge.
      const before = shown(layer).map((g) => g.getAttribute('transform'));
      m.render({ minutes: t, still: true });
      expect(shown(m.layer()).map((g) => g.getAttribute('transform'))).toEqual(before);
    }
    expect(seen).toBeGreaterThan(0);
  });

  it('pantins toujours en 2D (aucune image 3D demandée)', () => {
    const reg = new FigureRegistry('twl3', { perFrame: 400 });
    const citizen = vi.spyOn(reg, 'citizen');
    const m = mount(1080, reg);
    for (let t = 6 * 60; t < 1440; t += 17) m.render({ minutes: t });
    const figs = [...m.layer().querySelectorAll('[data-figure]')];
    expect(figs.length).toBeGreaterThan(0);
    expect(citizen).not.toHaveBeenCalled();
    for (const f of figs) expect(reg.wants3D(f.getAttribute('data-palette')!)).toBe(false);
  });

  it('de nuit, silhouettes unies ; de jour, pièce éteinte vue à 0,3 sous le reflet', () => {
    const m = mount(1080);
    m.render({ minutes: 21 * 60 });
    const nightFig = m.layer().querySelector('[data-figure]')!;
    // Clé de palette = ses couleurs dans un ordre fixe : toutes celles de la silhouette.
    expect(new Set(nightFig.getAttribute('data-palette')!.split(',').filter(Boolean))).toEqual(new Set(['#1A1422']));
    // De jour : chaque pantin dedans visible a l'opacité de sa pièce (0,3 éteinte et fermée, 0,9 fenêtre ouverte).
    let checked = 0;
    for (let t = 9 * 60; t < 16 * 60 && checked < 3; t += 4) {
      m.render({ minutes: t });
      for (const g of shown(m.layer())) {
        if (g.getAttribute('data-side') !== 'in') continue;
        expect(['0.30', '0.90']).toContain(g.getAttribute('opacity'));
        expect(g.closest('[clip-path]')?.getAttribute('clip-path')).toMatch(/^url\(#/);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });
});
