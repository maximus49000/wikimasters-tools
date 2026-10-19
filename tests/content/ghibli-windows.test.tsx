// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GhibliWindows } from '../../src/content/ghibli-windows';
import { LitWindow, NightGlass, amb, luminance, nightCurtain, nightGlass, nightVoile } from '../../src/content/ghibli-window-art';
import { PLASTERS, STONES, type FacadeWindow } from '../../src/core/library/city/facade-layout';
import { GROUND_FLOOR } from '../../src/core/library/city/metrics';
import { FAR_WINDOW, cityFacades } from '../../src/core/library/city/facades';
import { cityMetrics } from '../../src/core/library/city/metrics';
import { PODIUM_H } from '../../src/core/library/scene-world';
import { cityPaintPlan } from '../../src/core/library/paint/city-plan';
import empreinte from '../core/library/fixtures/city-skyline-empreinte.json';
import { buildSceneLife, type SceneLife } from '../../src/content/use-scene-life';
import { dayContext } from '../../src/core/library/city/calendar';
import { homeState } from '../../src/core/library/city/home-state';
import { roomLit } from '../../src/core/library/city/window-lights';

// Calque des fenêtres de la ville peinte : vitres sombres de nuit par immeuble, fenêtres allumées par logement (pièce
// seule, télé), lueur partagée par taille, lumières du fond hors de l'emprise du premier plan.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
const facades = cityFacades(720, 340, 5);
type Opts = { minutes?: number; daylight?: number; gloom?: boolean; dim?: number; buildings?: typeof facades; plan?: ReturnType<typeof cityPaintPlan>; life?: SceneLife | null };
const render = (o: Opts = {}) =>
  act(() => {
    root.render(
      <svg>
        <GhibliWindows buildings={o.buildings ?? facades} minutes={o.minutes ?? 1320} day={undefined} daylight={o.daylight ?? 0} gloom={o.gloom ?? false} dim={o.dim ?? 1} farLight={0.5} plan={o.plan} life={o.life} />
      </svg>,
    );
  });
const layer = () => container.querySelector('[data-ghibli-windows]')!;
const lamps = () => [...container.querySelectorAll('[data-ghibli-windows] [data-lamp]')];
const nodes = () => layer().querySelectorAll('*').length;
const lit = (el: Element) => el.getAttribute('data-lit') === 'true';
const allumables = facades.filter((b) => !b.far).flatMap((b) => b.lamps.filter((l) => l.home >= 0));

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('calque des fenêtres Ghibli', () => {
  it('un nœud par fenêtre allumable : ni cage, ni entresol', () => {
    render();
    expect(lamps().length).toBe(allumables.length);
    expect(allumables.every((w) => w.kind !== 'stair' && w.kind !== 'mezz')).toBe(true);
  });

  it('les fenêtres d’un logement s’allument ensemble, sauf en pièce seule', () => {
    let solo = 0;
    let whole = 0;
    for (const minutes of [19 * 60, 21 * 60, 23 * 60, 30]) {
      render({ minutes });
      const byHome = new Map<string, Element[]>();
      for (const el of lamps()) byHome.set(el.getAttribute('data-home')!, [...(byHome.get(el.getAttribute('data-home')!) ?? []), el]);
      for (const wins of byHome.values()) {
        const main = wins.filter((el) => el.getAttribute('data-main') === 'true');
        const rest = wins.filter((el) => el.getAttribute('data-main') !== 'true');
        expect(main.length).toBe(1);
        // Les autres pièces partagent le même état ; jamais allumées sans la pièce principale.
        expect(new Set(rest.map(lit)).size).toBeLessThanOrEqual(1);
        if (rest.some(lit)) expect(lit(main[0]!)).toBe(true);
        if (rest.length > 0 && lit(main[0]!)) {
          if (rest.some(lit)) whole++;
          else solo++;
        }
      }
    }
    expect(solo).toBeGreaterThan(0);
    expect(whole).toBeGreaterThan(0);
  });

  it('22 h ↔ 2 h ↔ 21 h59 / 22 h01 : même nombre de nœuds, seule l’opacité change', () => {
    const shots = [22 * 60, 2 * 60, 22 * 60 - 1, 22 * 60 + 1, 20 * 60 - 1, 20 * 60 + 1].map((minutes) => {
      render({ minutes });
      return { count: nodes(), opacity: lamps().map((el) => el.getAttribute('opacity')).join() };
    });
    expect(new Set(shots.map((s) => s.count)).size).toBe(1);
    expect(shots[0]!.opacity).not.toBe(shots[1]!.opacity);
    // Aucun nœud créé ni retiré sur une bascule (mêmes éléments DOM avant et après).
    render({ minutes: 21 * 60 + 59 });
    const before = [...layer().querySelectorAll('*')];
    render({ minutes: 22 * 60 + 1 });
    const after = [...layer().querySelectorAll('*')];
    expect(after.length).toBe(before.length);
    expect(after.every((el, i) => el === before[i])).toBe(true);
    expect(lamps().every((el) => (el as HTMLElement).style.transition === 'opacity 4s ease')).toBe(true);
  });

  it('pas plus de nœuds que sur main', () => {
    render({ minutes: 1320, daylight: 0, dim: 1 });
    const count = nodes();
    expect(count).toBeLessThanOrEqual(empreinte.ghibliWindowsNodes);
  });

  it('vitres sombres la nuit : une par immeuble proche et par socle, opacité selon l’obscurité du ciel', () => {
    render({ daylight: 0 });
    const glass = [...container.querySelectorAll('[data-night-glass]')];
    const near = facades.filter((b) => !b.far && b.layout).length + facades.filter((b) => b.podiumLayout).length;
    expect(glass.length).toBe(near);
    expect(glass.every((g) => g.getAttribute('opacity') === '1' && (g as HTMLElement).style.transition === 'opacity 4s ease')).toBe(true);
    // Avant les fenêtres allumées (la lueur et la vitre allumée passent devant).
    const first = lamps()[0]!;
    expect(glass.every((g) => g.compareDocumentPosition(first) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
    render({ daylight: 0.45 });
    expect(container.querySelector('[data-night-glass]')!.getAttribute('opacity')).toBe('0.5');
  });

  it('midi sous un ciel couvert : vitres éteintes non assombries (opacité 0), fenêtres allumables', () => {
    render({ minutes: 12 * 60, daylight: 1, gloom: true, dim: 0.7 });
    expect([...container.querySelectorAll('[data-night-glass]')].every((g) => g.getAttribute('opacity') === '0')).toBe(true);
    expect(lamps().some((el) => lit(el) && el.getAttribute('opacity') === '0.7')).toBe(true);
    render({ minutes: 12 * 60, daylight: 1, gloom: false, dim: 0 });
    expect(lamps().every((el) => !lit(el) && el.getAttribute('opacity') === '0')).toBe(true);
  });

  it('aucune lumière du fond dans l’emprise d’un immeuble proche', () => {
    for (const width of [720, 1440, 2160]) {
      const buildings = cityFacades(width, 340, 5);
      render({ buildings });
      const { ground } = cityMetrics(340);
      const front = buildings.filter((b) => !b.far);
      const near = [
        ...front.map((b) => ({ x: b.x, w: b.w, top: ground - b.h })),
        ...front.filter((b) => b.podium && b.x === b.podium.x).map((b) => ({ x: b.podium!.x, w: b.podium!.w, top: ground - PODIUM_H })),
      ];
      const far = [...container.querySelectorAll('[data-far-lamp]')];
      expect(far.length).toBeGreaterThan(0);
      for (const el of far) {
        const x = Number(el.getAttribute('x'));
        const y = Number(el.getAttribute('y'));
        expect(Number(el.getAttribute('width'))).toBe(FAR_WINDOW.w);
        expect(near.some((b) => x < b.x + b.w && x + FAR_WINDOW.w > b.x && y + FAR_WINDOW.h > b.top)).toBe(false);
      }
      // Dessinées avant les vitres et fenêtres du premier plan.
      const firstNear = container.querySelector('[data-night-glass]')!;
      expect(far.every((el) => el.compareDocumentPosition(firstNear) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
    }
  });

  it('une seule définition de lueur par taille de fenêtre', () => {
    render();
    const defs = [...container.querySelectorAll('[data-glow-def]')];
    const ids = new Set(defs.map((d) => d.id));
    expect(ids.size).toBe(defs.length);
    const sizes = new Set(allumables.map((w) => `${Math.round(w.w * 2) / 2}x${Math.round(w.h * 2) / 2}`));
    // Une définition par taille, plus une par hauteur bornée (étage 0, socle) : chacune servie, aucune en double.
    expect(defs.length).toBeGreaterThanOrEqual(sizes.size);
    const used = new Set(lamps().map((el) => el.querySelector('use')!.getAttribute('href')!.slice(1)));
    expect(used.size).toBe(defs.length);
    // Chaque fenêtre allumée reprend la définition de sa taille.
    for (const el of lamps()) {
      const href = el.querySelector('use')!.getAttribute('href')!;
      expect(ids.has(href.slice(1))).toBe(true);
    }
  });

  it('lueur bornée en SVG : aucune lueur de l’étage 0 ni du socle des jumeaux ne descend sous son plancher', () => {
    // Point le plus bas d'un chemin de lueur (segments et courbe quadratique échantillonnée), en coordonnées de la définition.
    const lowest = (d: string): number => {
      const n = (d.match(/-?\d+(?:\.\d+)?(?:e-?\d+)?/g) ?? []).map(Number);
      const [, h, , , ly, , cy, , y2] = n as number[];
      let m = Math.max(h!, ly!, y2!);
      for (let t = 0; t <= 1; t += 0.01) m = Math.max(m, (1 - t) ** 2 * ly! + 2 * (1 - t) * t * cy! + t * t * y2!);
      return m;
    };
    let level0 = 0;
    let podium = 0;
    for (let seed = 1; seed <= 12 && (level0 === 0 || podium === 0); seed++) {
      const buildings = cityFacades(1440, 340, seed);
      const ground = cityMetrics(340).ground;
      render({ buildings });
      const els = lamps();
      let k = 0;
      for (const b of buildings) {
        if (b.far) continue;
        const tower = b.layout?.windows.length ?? 0;
        b.lamps.forEach((win, j) => {
          if (win.home < 0) return;
          const el = els[k++]!;
          const use = el.querySelector('use')!;
          // Plus de découpe CSS : la borne est dans la définition elle-même.
          expect(use.getAttribute('style')).toBeNull();
          let floor: number | null = null;
          if (j < tower && win.level === 0) {
            const lv = b.layout!.levels[0]!;
            floor = lv.y + lv.h;
            level0++;
          } else if (j >= tower) {
            floor = ground - GROUND_FLOOR;
            podium++;
          }
          if (floor === null) return;
          const def = container.querySelector(`[id="${use.getAttribute('href')!.slice(1)}"]`)!;
          const y = Number(use.getAttribute('y'));
          for (const p of def.querySelectorAll('path')) expect(y + lowest(p.getAttribute('d')!)).toBeLessThanOrEqual(floor + 1e-6);
          // Fond arrondi gardé : la lueur reste un chemin à courbe.
          expect(def.querySelector('path')!.getAttribute('d')).toContain('Q');
        });
      }
      expect(k).toBe(els.length);
    }
    expect(level0).toBeGreaterThan(0);
    expect(podium).toBeGreaterThan(0);
  });

  it('balcon filant : les barreaux de la fenêtre allumée tombent sur ceux de la vitre éteinte (pas de saut au fondu)', () => {
    const barXs = (d: string): string[] => [...d.matchAll(/M(-?[\d.]+) [\d.e-]+V/g)].map((m) => Number(m[1]).toFixed(4));
    render({ daylight: 0 });
    const glass = [...container.querySelectorAll('[data-night-glass]')];
    const els = lamps();
    const near = facades.filter((b) => !b.far && b.layout);
    let k = 0;
    let checked = 0;
    for (const b of facades) {
      if (b.far) continue;
      const tower = b.layout?.windows.length ?? 0;
      const night = b.layout ? new Set(barXs(glass[near.indexOf(b)]!.querySelector('[data-night-bars]')?.getAttribute('d') ?? '')) : new Set<string>();
      b.lamps.forEach((win, j) => {
        if (win.home < 0) return;
        const el = els[k++]!;
        if (j >= tower || win.kind !== 'french' || b.layout!.levels[win.level]?.balcony !== 'filant') return;
        const bars = [...el.querySelectorAll('path')].find((p) => p.getAttribute('stroke-width') === '0.5')!;
        const xs = barXs(bars.getAttribute('d')!);
        expect(xs.length).toBeGreaterThan(0);
        for (const x of xs) expect(night.has(x), `barreau ${x}`).toBe(true);
        checked++;
      });
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('lucarne haute (h ≥ 8) : pas de traverse, ni allumée ni éteinte, comme la vitre de jour', () => {
    const win: FacadeWindow = { x: 10, y: 20, w: 5, h: 9, kind: 'dormer', level: -1, bay: 0, home: 0, key: 0, u: 0.5, blue: false, main: true, box: false };
    const std: FacadeWindow = { ...win, kind: 'std', level: 0 };
    const draw = (w: FacadeWindow) =>
      act(() => {
        root.render(
          <svg>
            <NightGlass layout={{ windows: [w], dormers: [] }} wall="#EDE2C8" opacity={1} />
            <LitWindow win={w} home={null} level={null} tone="warm" glow="g" />
          </svg>,
        );
      });
    const traverse = `M10 ${20 + 9 * 0.33}h5`;
    draw(win);
    expect(container.querySelector('[data-night-frames]')!.getAttribute('d')).not.toContain(traverse);
    const lit = [...container.querySelectorAll('path')].filter((p) => p.getAttribute('stroke-width') === '0.55');
    expect(lit.length).toBe(2);
    for (const p of lit) expect(p.getAttribute('d')).not.toContain(traverse);
    // Fenêtre d'étage de même taille : traverse gardée (paintDayWindow).
    draw(std);
    expect(container.querySelector('[data-night-frames]')!.getAttribute('d')).toContain(traverse);
  });

  it('vitres éteintes jamais plus claires que le mur : voilage et rideaux ambiants sous la luminance du mur ambiant', () => {
    // Rideaux de notes.md §Couleurs (palette privée de facade-layout).
    const curtains = ['#F4E6D0', '#C85A3A', '#5A7AA8', '#E8C890', '#8A5A8E'];
    for (const wall of [...STONES, ...PLASTERS]) {
      const max = luminance(amb(wall));
      expect(luminance(nightGlass(wall)), wall).toBeLessThan(max);
      expect(luminance(nightVoile(wall)), wall).toBeLessThanOrEqual(max);
      for (const c of curtains) expect(luminance(nightCurtain(c, wall)), `${c} sur ${wall}`).toBeLessThanOrEqual(max);
    }
    // Un rideau déjà sombre garde exactement sa couleur ambiante.
    expect(nightCurtain('#5A7AA8', '#EDE2C8')).toBe(amb('#5A7AA8'));
    render({ daylight: 0 });
    const glass = [...container.querySelectorAll('[data-night-glass]')];
    const near = facades.filter((b) => !b.far && b.layout);
    let voiles = 0;
    near.forEach((b, i) => {
      const v = glass[i]!.querySelector('[data-night-voile]');
      if (!v) return;
      voiles++;
      expect(v.getAttribute('fill')).toBe(nightVoile(b.layout!.wall));
    });
    expect(voiles).toBeGreaterThan(0);
  });

  it('vitres éteintes : menuiserie et barreaux des balcons redessinés en un chemin par immeuble, socle avec ses rideaux', () => {
    render({ daylight: 0 });
    const glass = [...container.querySelectorAll('[data-night-glass]')];
    for (const g of glass) {
      const frames = g.querySelectorAll('[data-night-frames]');
      expect(frames.length).toBe(1);
      expect(frames[0]!.getAttribute('stroke')).toBe('#2A1A18');
      expect(g.querySelectorAll('[data-night-bars]').length).toBeLessThanOrEqual(1);
    }
    // Au moins un immeuble à balcon filant ou balconnet : des barreaux devant ses vitres éteintes.
    expect(container.querySelectorAll('[data-night-glass] [data-night-bars]').length).toBeGreaterThan(0);
    // Socle des jumeaux : rideaux de ses logements présents si l'un d'eux en a.
    const podium = facades.find((b) => b.podiumLayout && b.podiumLayout.homes.some((h) => h.curtain));
    if (podium) {
      const near = facades.filter((b) => !b.far && b.layout).length;
      const pg = glass[near + facades.filter((b) => b.podiumLayout).indexOf(podium)]!;
      expect(pg.querySelectorAll('[data-night-voile], [data-night-curtain]').length).toBeGreaterThan(0);
    }
  });

  it('jumeaux : la vitre de nuit de la 2e tour se mélange au mur du plan peint (teinte recolorée)', () => {
    let found = false;
    for (let seed = 1; seed <= 40 && !found; seed++) {
      const buildings = cityFacades(2160, 340, seed);
      const plan = cityPaintPlan(2160, 340, seed);
      const i = buildings.findIndex((b, k) => b.layout && plan.buildings[k]!.layout!.wall !== b.layout.wall);
      if (i < 0) continue;
      found = true;
      render({ buildings, plan });
      const near = buildings.filter((b) => !b.far && b.layout);
      const glass = container.querySelectorAll('[data-night-glass]')[near.indexOf(buildings[i]!)]!;
      const ref = document.createElement('div');
      const refRoot = createRoot(ref);
      act(() => refRoot.render(<svg><NightGlass layout={plan.buildings[i]!.layout!} wall={plan.buildings[i]!.layout!.wall} opacity={1} /></svg>));
      expect(glass.querySelector('path')!.getAttribute('fill')).toBe(ref.querySelector('path')!.getAttribute('fill'));
      act(() => refRoot.unmount());
    }
    expect(found).toBe(true);
  });
});

describe('calque des fenêtres Ghibli : lumières par présence', () => {
  const life = buildSceneLife(facades, dayContext({ y: 2026, m: 10, d: 14 }, []), { precip: 0, snow: false, storm: false }, 5, false);
  // Fenêtres allumables dans l'ordre du calque, avec leur logement.
  const slots = facades.flatMap((b, i) => (b.far ? [] : b.lamps.flatMap((win) => (win.home < 0 ? [] : [{ win, group: `${i}:${win.home}` }]))));
  const TONE_FILL: Record<string, string> = { warm: '#FFD86A', cream: '#FFF0C0', orange: '#FFB048', tv: '#9CC4FF', cool: '#C8DCFF' };

  it('avec life, data-lit suit homeState', () => {
    let on = 0;
    let off = 0;
    for (const minutes of [6 * 60 + 30, 7 * 60 + 15, 19 * 60, 20 * 60 + 30, 22 * 60, 23 * 60 + 30, 30, 2 * 60]) {
      render({ minutes, life });
      const els = lamps();
      expect(els.length).toBe(slots.length);
      slots.forEach(({ win, group }, k) => {
        const d = life.byFacadeHome.get(group)!;
        const st = homeState(d, life.today.get(d.id)!, life.yesterday.get(d.id)!, minutes);
        const room = d.roomOfWindow.get(win.bay)!;
        const want = !!st.lit[room];
        const el = els[k]!;
        expect(el.getAttribute('data-home')).toBe(group);
        expect(lit(el), `${group} ${room} ${minutes}`).toBe(want);
        if (want) {
          on++;
          // Teinte de la pièce (vitre teintée, premier rectangle après la lueur).
          expect(el.querySelector('rect')!.getAttribute('fill')).toBe(TONE_FILL[st.tone[room]!]);
        } else off++;
      });
    }
    expect(on).toBeGreaterThan(0);
    expect(off).toBeGreaterThan(0);
  });

  it('avec life : rien d’allumé de jour, même sous un ciel couvert', () => {
    render({ minutes: 12 * 60, daylight: 1, gloom: true, dim: 0.7, life });
    expect(lamps().every((el) => !lit(el))).toBe(true);
  });

  it('même nombre de nœuds de 6 h à 2 h', () => {
    render({ minutes: 6 * 60, life });
    const before = [...layer().querySelectorAll('*')];
    for (let minutes = 6 * 60; minutes <= 26 * 60; minutes += 17) {
      render({ minutes: minutes % 1440, life });
      const now = [...layer().querySelectorAll('*')];
      expect(now.length).toBe(before.length);
      expect(now.every((el, i) => el === before[i])).toBe(true);
    }
  });

  it('avec life : ni rideau ni voilage dans les vitres éteintes et allumées (le calque de la vie les dessine)', () => {
    render({ minutes: 22 * 60, life });
    expect(container.querySelectorAll('[data-night-curtain], [data-night-voile]').length).toBe(0);
    for (const el of lamps()) expect([...el.querySelectorAll('rect')].some((r) => r.getAttribute('fill') === 'rgba(255,248,230,0.45)')).toBe(false);
    render({ minutes: 22 * 60 });
    expect(container.querySelectorAll('[data-night-curtain], [data-night-voile]').length).toBeGreaterThan(0);
  });

  it('sans life : allumage du chantier 1 inchangé', () => {
    for (const minutes of [19 * 60, 22 * 60, 30]) {
      render({ minutes, life: null });
      const els = lamps();
      slots.forEach(({ win }, k) => expect(lit(els[k]!)).toBe(roomLit(win, minutes, undefined, 0, false)));
    }
  });

  it('fond : fenêtres du fond identiques avec et sans life', () => {
    for (const minutes of [19 * 60, 23 * 60, 2 * 60]) {
      render({ minutes });
      const without = [...container.querySelectorAll('[data-far-lamp]')].map((el) => el.outerHTML);
      render({ minutes, life });
      const withLife = [...container.querySelectorAll('[data-far-lamp]')].map((el) => el.outerHTML);
      expect(without.length).toBeGreaterThan(0);
      expect(withLife).toEqual(without);
    }
  });
});
