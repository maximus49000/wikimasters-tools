// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GhibliWindows } from '../../src/content/ghibli-windows';
import { NightGlass, amb, luminance, nightCurtain, nightGlass, nightVoile } from '../../src/content/ghibli-window-art';
import { PLASTERS, STONES } from '../../src/core/library/city/facade-layout';
import { FAR_WINDOW, cityFacades } from '../../src/core/library/city/facades';
import { cityMetrics } from '../../src/core/library/city/metrics';
import { PODIUM_H } from '../../src/core/library/scene-world';
import { cityPaintPlan } from '../../src/core/library/paint/city-plan';
import empreinte from '../core/library/fixtures/city-skyline-empreinte.json';

// Calque des fenêtres de la ville peinte : vitres sombres de nuit par immeuble, fenêtres allumées par logement (pièce
// seule, télé), lueur partagée par taille, lumières du fond hors de l'emprise du premier plan.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
const facades = cityFacades(720, 340, 5);
type Opts = { minutes?: number; daylight?: number; gloom?: boolean; dim?: number; buildings?: typeof facades; plan?: ReturnType<typeof cityPaintPlan> };
const render = (o: Opts = {}) =>
  act(() => {
    root.render(
      <svg>
        <GhibliWindows buildings={o.buildings ?? facades} minutes={o.minutes ?? 1320} day={undefined} daylight={o.daylight ?? 0} gloom={o.gloom ?? false} dim={o.dim ?? 1} farLight={0.5} plan={o.plan} />
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
    expect(defs.length).toBe(sizes.size);
    // Chaque fenêtre allumée reprend la définition de sa taille.
    for (const el of lamps()) {
      const href = el.querySelector('use')!.getAttribute('href')!;
      expect(ids.has(href.slice(1))).toBe(true);
    }
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
