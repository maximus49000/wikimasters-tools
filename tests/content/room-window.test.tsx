// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WindowArt } from '../../src/content/window-art';
import { RoomView } from '../../src/content/RoomView';
import { rainLoopsActive } from '../../src/content/rain-canvas';
import { createInitialState, activeRoom, setRoomScene, setRoomStyle, updateLayout } from '../../src/core/library/library-book';
import { skyAt, sunTimes } from '../../src/core/library/sky';
import { createWeatherClock, steadySource } from '../../src/core/library/weather/weather-clock';
import type { SceneId } from '../../src/core/library/library-types';
import { dayContext } from '../../src/core/library/city/calendar';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
const times = sunTimes({ y: 2024, m: 6, d: 21 }, { lat: 48.85, lon: 2.35 }, 120);

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  vi.stubGlobal('requestAnimationFrame', () => 1);
  vi.stubGlobal('cancelAnimationFrame', () => undefined);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

type WeatherProp = { clock: ReturnType<typeof createWeatherClock>; flags: { gloom: boolean; rainy: boolean } };
const rainyWeather = (): WeatherProp => {
  const clock = createWeatherClock();
  clock.setSource(steadySource('rain'), Date.now());
  return { clock, flags: { gloom: true, rainy: true } };
};

// Jour de la ville (vendredi 21 juin 2024) : fourni par le panneau, il donne sa population à la scène Ville.
const cityDay = dayContext({ y: 2024, m: 6, d: 21 }, []);

function show(windows: number, scene: SceneId = 'city', weather?: WeatherProp, drag: { id: string; x: number; y: number } | null = null) {
  let state = setRoomScene(createInitialState(), 'r1', scene);
  state = updateLayout(state, 'r1', () => Array.from({ length: windows }, (_, i) => ({ id: `w${i}`, kind: 'window' as const, col: 2 + i * 10, row: 1, w: 6 + i * 2, h: 5 })));
  act(() =>
    root.render(<RoomView room={activeRoom(state)} editing={false} cellsActive={false} selectedId={null} blink={[]} onCell={() => undefined} onPick={() => undefined} drag={drag ? { ...drag, ok: true, ghost: null } : null} sceneView={{ sky: skyAt(13 * 60, times), minutes: 13 * 60, weather, city: { day: cityDay, forcedNight: false } }} />),
  );
}

describe('RoomView — fenêtres', () => {
  it('sans fenêtre, aucun décor n’est dessiné', () => {
    show(0);
    expect(container.querySelector('[data-panorama]')).toBeNull();
  });

  it('deux fenêtres partagent UN SEUL décor', () => {
    show(2);
    expect(container.querySelectorAll('[data-panorama]')).toHaveLength(1);
    expect(container.querySelectorAll('[data-furniture="window"]')).toHaveLength(2);
    // Le décor est de vrais nœuds, hors de <defs> : aucune copie <use> hors glissé.
    expect(container.querySelectorAll('[data-window-views] [data-panorama]')).toHaveLength(1);
    expect(container.querySelector('defs [data-panorama]')).toBeNull();
    expect(container.querySelector('use:not([href$="-wall"])')).toBeNull();
  });

  it('une seule couche d’acteurs pour deux fenêtres, hors de <defs>, sans <use>', () => {
    show(2);
    expect(container.querySelectorAll('[data-actors]')).toHaveLength(1);
    expect(container.querySelectorAll('[data-window-actors]')).toHaveLength(1);
    expect(container.querySelector('defs [data-actors]')).toBeNull();
    expect(container.querySelector('use[data-window-actors]')).toBeNull();
  });

  it('décor fixe et acteurs animés sont deux groupes distincts, dans le calque des vues', () => {
    show(2);
    // La boucle d’animation ne touche que le groupe des acteurs : ils ne sont PAS dans le décor fixe.
    expect(container.querySelectorAll('[data-window-views] [data-panorama]')).toHaveLength(1);
    expect(container.querySelectorAll('[data-window-views] [data-actors]')).toHaveLength(1);
    expect(container.querySelector('[data-panorama] [data-actor]')).toBeNull();
    expect(container.querySelector('[data-actors] [data-actor]')).not.toBeNull();
    const staticId = container.querySelector('[data-panorama]')!.closest('g[id]')!.id;
    const actorsId = container.querySelector('[data-actors]')!.closest('g[id]')!.id;
    expect(staticId).not.toBe(actorsId);
    const views = container.querySelector('[data-window-views]')!;
    expect(views.tagName.toLowerCase()).toBe('svg');
    expect(views.getAttribute('overflow')).toBe('hidden');
    // Les cadres ne dessinent plus ni vitre ni décor.
    for (const w of container.querySelectorAll('[data-window-art]')) {
      expect(w.querySelector('use')).toBeNull();
      expect(w.querySelector('rect[fill="#9CC4E8"]')).toBeNull();
    }
    // Le calque des vues est dessiné avant les cadres.
    // (les cadres sont dans le groupe des couches de la pièce : on compare l'ordre du document)
    expect(views.compareDocumentPosition(container.querySelector('[data-furniture="window"]')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('la vue est découpée par UN seul rectangle (englobant), sans clipPath', () => {
    show(2);
    expect(container.querySelector('clipPath')).toBeNull();
    const views = container.querySelector('[data-window-views]')!;
    const [x, y, w, h] = ['x', 'y', 'width', 'height'].map((a) => Number(views.getAttribute(a)));
    // Fenêtres à col 2 (6 de large) et col 12 (8 de large) : de la vitre de gauche à celle de droite.
    expect(w!).toBeGreaterThan(0);
    expect(views.getAttribute('viewBox')).toBe(`${x} ${y} ${w} ${h}`);
  });

  it('des fenêtres alignées sur la même rangée ont un trou de mur entre leurs vitres, dessiné après la vue', () => {
    show(2);
    const gaps = container.querySelectorAll('[data-window-gap]');
    expect(gaps).toHaveLength(1);
    expect(gaps[0]!.querySelector('use')?.getAttribute('href')).toMatch(/-wall$/);
    expect(container.querySelector('[id$="-wall"]')).not.toBeNull();
    const kids = Array.from(container.querySelector('svg')!.children);
    const idx = (el: Element) => kids.findIndex((k) => k === el || k.contains(el));
    const wall = idx(container.querySelector('[data-window-wall]')!);
    const views = idx(container.querySelector('[data-window-views]')!);
    const gap = idx(gaps[0]!);
    const furniture = idx(container.querySelector('[data-furniture="window"]')!);
    expect(wall).toBeLessThan(views);
    expect(views).toBeLessThan(gap);
    expect(gap).toBeLessThanOrEqual(furniture);
    // Dans le groupe des couches, le trou précède le cadre.
    expect(gaps[0]!.compareDocumentPosition(container.querySelector('[data-furniture="window"]')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('une seule fenêtre : aucun trou', () => {
    show(1);
    expect(container.querySelector('[data-window-gap]')).toBeNull();
  });

  it('WindowArt sans mode vue ne dessine ni vitre ni décor', () => {
    const rect = { x: 10, y: 10, w: 100, h: 80 };
    const palette = { skirt: '#111', edge: '#222' } as never;
    act(() => root.render(<svg><WindowArt rect={rect} palette={palette} steampunk={false} /></svg>));
    expect(container.querySelector('rect[fill="#9CC4E8"]')).toBeNull();
    expect(container.querySelector('use:not([href$="-wall"])')).toBeNull();
    expect(container.querySelector('clipPath')).toBeNull();
  });

  it('pendant le glissé, la vitre de la fenêtre soulevée quitte le masque et le fond ; l’autre reste', () => {
    show(2, 'city', undefined, { id: 'w0', x: 200, y: 200 });
    // La vue ne couvre plus que l'autre vitre ; la vitre soulevée n'a plus de vue sur le mur.
    expect(container.querySelectorAll('[data-window-views]')).toHaveLength(1);
    expect(Number(container.querySelector('[data-window-views]')!.getAttribute('x'))).toBeGreaterThan(200);
    expect(container.querySelectorAll('[data-window-glass] rect')).toHaveLength(1);
  });

  it('le calque des vues ne capte pas le toucher, et le fond de vitre est hors du masque', () => {
    show(2);
    const views = container.querySelector('[data-window-views]') as SVGElement;
    expect(views.style.pointerEvents).toBe('none');
    expect(views.querySelector('rect[fill="#9CC4E8"]')).toBeNull();
    expect(container.querySelectorAll('[data-window-glass] rect[fill="#9CC4E8"]')).toHaveLength(2);
  });

  it('pendant le glissé d’une fenêtre, la copie soulevée recopie le décor par <use>', () => {
    show(2, 'city', undefined, { id: 'w0', x: 200, y: 200 });
    const copy = container.querySelector('[data-lifted-copy] [data-window-art]')!;
    expect(copy).not.toBeNull();
    const staticId = container.querySelector('[data-panorama]')!.closest('g[id]')!.id;
    const actorsId = container.querySelector('[data-actors]')!.closest('g[id]')!.id;
    expect(copy.querySelector('use[data-window-view]')?.getAttribute('href')).toBe(`#${staticId}`);
    expect(copy.querySelector('use[data-window-actors]')?.getAttribute('href')).toBe(`#${actorsId}`);
    // Le décor réel reste unique.
    expect(container.querySelectorAll('[data-actors]')).toHaveLength(1);
  });

  it('le décor suit la scène de la pièce', () => {
    show(1, 'sea');
    expect(container.querySelector('[data-panorama][data-scene="sea"]')).not.toBeNull();
  });
});

describe('RoomView — ordre de dessin', () => {
  it('steampunk : les vues viennent après le décor et avant les tapis et les cadres', () => {
    let state = setRoomStyle(setRoomScene(createInitialState(), 'r1', 'city'), 'r1', 'steampunk');
    state = updateLayout(state, 'r1', () => [
      { id: 'w0', kind: 'window' as const, col: 2, row: 1, w: 6, h: 5 },
      { id: 'rg', kind: 'rug' as const, col: 12, row: 15 },
    ]);
    act(() => root.render(<RoomView room={activeRoom(state)} editing={false} cellsActive={false} selectedId={null} blink={[]} onCell={() => undefined} onPick={() => undefined} sceneView={{ sky: skyAt(13 * 60, times), minutes: 13 * 60, city: { day: cityDay, forcedNight: false } }} />));
    const kids = Array.from(container.querySelectorAll('svg > *'));
    const at = (el: Element | null) => kids.findIndex((k) => k === el || (el !== null && k.contains(el)));
    const decor = at(container.querySelector('[data-steampunk-decor]'));
    const views = at(container.querySelector('[data-window-views]'));
    const rug = at(container.querySelector('[data-furniture="rug"]'));
    const win = at(container.querySelector('[data-furniture="window"]'));
    expect(decor).toBeGreaterThanOrEqual(0);
    expect(views).toBeGreaterThan(decor);
    expect(rug).toBeGreaterThan(-1);
    expect(views).toBeLessThan(Math.min(rug, win));
  });
});

describe('RoomView — météo dans les fenêtres', () => {
  it('avec la météo, chaque fenêtre montre le sol mouillé, la pluie et des gouttes sur la vitre', () => {
    show(2, 'city', rainyWeather());
    expect(container.querySelectorAll('[data-window-views] [data-weather]')).toHaveLength(1);
    expect(container.querySelectorAll('[data-window-views] [data-weather-ground]')).toHaveLength(1);
    expect(container.querySelector('defs [data-weather]')).toBeNull();
    const sky = container.querySelector('[data-window-weather]')!;
    const ground = container.querySelector('[data-window-weather-ground]')!;
    expect(sky.id).not.toBe('');
    expect(ground.id).not.toBe(sky.id);
    // Les gouttes de la vitre : UN canvas qui couvre les deux vitres (découpé à chacune), plus de gouttes SVG.
    expect(container.querySelectorAll('[data-rain-canvas="glass"]')).toHaveLength(1);
    expect(container.querySelector('[data-glass-drops]')).toBeNull();
    // Ordre : décor fixe, sol (flaques, neige, sol mouillé), acteurs, puis ciel et précipitations par-dessus, puis la vitre.
    const kids = Array.from(container.querySelector('[data-window-views]')!.children).map((c) => (c.hasAttribute('data-window-view') ? 'view' : c.hasAttribute('data-window-weather-ground') ? 'ground' : c.hasAttribute('data-window-actors') ? 'actors' : c.hasAttribute('data-window-weather') ? 'sky' : c.getAttribute('data-rain-canvas') === 'glass' ? 'glass' : 'rect'));
    expect(kids).toEqual(['view', 'ground', 'actors', 'sky', 'glass']);
  });

  it('les drapeaux de la météo atteignent le décor : parapluies sous la pluie', () => {
    show(1, 'city', rainyWeather());
    // Le parapluie est dessiné dès qu'il pleut (même chez un passant absent à cette minute) : il prouve que le drapeau arrive.
    expect(container.querySelector('[data-actors] [data-city-life] [data-ped] [data-umbrella]')).not.toBeNull();
  });

  it('par temps sec, la couche de vie de la ville est là mais sans parapluie', () => {
    const clock = createWeatherClock();
    clock.setSource(steadySource('sun'), Date.now());
    show(1, 'city', { clock, flags: { gloom: false, rainy: false } });
    expect(container.querySelector('[data-actors] [data-city-life]')).not.toBeNull();
    expect(container.querySelector('[data-umbrella]')).toBeNull();
  });

  it('par temps sec, pas de gouttes sur la vitre (ni leur animation)', () => {
    const clock = createWeatherClock();
    clock.setSource(steadySource('sun'), Date.now());
    show(2, 'city', { clock, flags: { gloom: false, rainy: false } });
    expect(container.querySelectorAll('[data-window-weather]')).toHaveLength(1);
    expect(container.querySelector('[data-glass-drops]')).toBeNull();
    expect(container.querySelector('animate[attributeName="cy"]')).toBeNull();
    // le canvas de la vitre est là mais ne tourne pas (rien à animer par temps sec)
    expect(rainLoopsActive()).toBe(0);
  });

  it('sans météo, ni calque ni gouttes', () => {
    show(2);
    expect(container.querySelector('[data-weather]')).toBeNull();
    expect(container.querySelector('[data-window-weather]')).toBeNull();
    expect(container.querySelector('[data-glass-drops]')).toBeNull();
    expect(container.querySelector('[data-rain-canvas]')).toBeNull();
  });

  it.each(['space', 'earth'] as const)('scène %s : pas de météo même si le panneau en fournit une', (scene) => {
    show(2, scene, rainyWeather());
    expect(container.querySelector('[data-weather]')).toBeNull();
    expect(container.querySelector('[data-window-weather]')).toBeNull();
    expect(container.querySelector('[data-window-weather-ground]')).toBeNull();
    expect(container.querySelector('[data-glass-drops]')).toBeNull();
    expect(container.querySelector('[data-rain-canvas]')).toBeNull();
    expect(container.querySelector('[data-umbrella]')).toBeNull();
  });
});
