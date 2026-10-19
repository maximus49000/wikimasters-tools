// @vitest-environment jsdom
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FacadeWindow } from '../../src/core/library/city/facade-layout';
import { amb as nightAmb } from '../../src/content/ghibli-window-art';
import {
  Curtains, DARK_ALPHA, DARK_VEIL, FlowerBox, HeldProp, InteriorProp, Sapin, Sash, Shutters, curtainOpenWidth, flowerPalette, shutterTransform,
} from '../../src/content/window-life-art';

// Dessins de la façade vivante (chantier « vie au-dessus de la rue ») : composants à nœuds constants, seuls transform /
// opacity changent avec l'état (volets, battant, rideaux, guirlande), couleurs de la saison pour les jardinières.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
const win: FacadeWindow = { x: 10, y: 20, w: 7, h: 11, kind: 'std', level: 1, bay: 0, home: 0, key: 1, main: true, box: true, u: 0.5, blue: false };
const french: FacadeWindow = { ...win, kind: 'french', h: 14 };
const render = (el: ReactElement) => act(() => root.render(<svg>{el}</svg>));
const svg = () => container.querySelector('svg')!;
const all = () => [...svg().querySelectorAll('*')];
// Empreinte d'un rendu hors transform / opacity : balise et attributs restants, dans l'ordre du document.
const shape = () => all().map((el) => `${el.tagName}|${[...el.attributes].filter((a) => a.name !== 'transform' && a.name !== 'opacity').map((a) => `${a.name}=${a.value}`).sort().join(' ')}`);
const html = () => svg().innerHTML;

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('volets et persiennes', () => {
  it('Shutters : même nombre de nœuds pour open 0, 0,5 et 1', () => {
    for (const kind of ['persienne', 'battant'] as const) {
      const counts = [0, 0.5, 1].map((open) => {
        render(<Shutters win={win} kind={kind} color="#C4CCC8" open={open} litBehind={false} />);
        return all().length;
      });
      expect(counts[0]).toBeGreaterThan(2);
      expect(new Set(counts).size).toBe(1);
    }
  });

  it('open ne change que transform / opacity ; les vantaux portent shutterTransform(open, kind)', () => {
    for (const kind of ['persienne', 'battant'] as const) {
      render(<Shutters win={win} kind={kind} color="#8FA88C" open={0} litBehind={true} />);
      const closed = shape();
      render(<Shutters win={win} kind={kind} color="#8FA88C" open={0.5} litBehind={true} />);
      expect(shape()).toEqual(closed);
      const leaves = [...svg().querySelectorAll('[data-shutter-leaf]')];
      expect(leaves.length).toBe(2);
      for (const l of leaves) expect(l.getAttribute('transform')).toBe(shutterTransform(0.5, kind));
    }
  });

  it('shutterTransform : persienne repliée à 0 en pleine ouverture, battant rabattu contre le mur (largeur non nulle)', () => {
    expect(shutterTransform(0)).toBe('scale(1 1)');
    expect(shutterTransform(1)).toBe('scale(0 1)');
    expect(shutterTransform(0, 'battant')).toBe('translate(0 0) scale(1 1)');
    expect(shutterTransform(1, 'battant')).toBe('translate(-0.6 0) scale(-0.5 1)');
  });

  it('lames éclairées seulement quand la pièce est allumée derrière', () => {
    render(<Shutters win={win} kind="persienne" color="#C4CCC8" open={0} litBehind={true} />);
    expect(svg().querySelector('[data-slats-lit]')!.getAttribute('opacity')).toBe('1');
    render(<Shutters win={win} kind="persienne" color="#C4CCC8" open={0} litBehind={false} />);
    expect(svg().querySelector('[data-slats-lit]')!.getAttribute('opacity')).toBe('0');
  });
});

describe('battant de la fenêtre', () => {
  it('Sash : open et night ne changent que transform / opacity', () => {
    render(<Sash win={win} open={0} night={false} />);
    const base = shape();
    render(<Sash win={win} open={0.7} night={true} />);
    expect(shape()).toEqual(base);
    expect(svg().querySelector('[data-sash-leaf]')!.getAttribute('transform')).toBe('scale(0.7 1)');
  });
});

describe('rideaux', () => {
  it('Curtains : drawn ne change que transform / opacity', () => {
    for (const style of ['side', 'voile'] as const) {
      render(<Curtains win={win} style={style} color="#C85A3A" drawn={0} lit={true} wall="#EDE2C8" />);
      const open = shape();
      for (const drawn of [0.5, 1]) {
        render(<Curtains win={win} style={style} color="#C85A3A" drawn={drawn} lit={true} wall="#EDE2C8" />);
        expect(shape()).toEqual(open);
      }
    }
  });

  it('panneaux : largeur du chantier 1 à drawn 0, moitié de la vitre tirés ; la nuit éteinte, jamais plus clairs que le mur', () => {
    expect(curtainOpenWidth(7)).toBeCloseTo(1.54);
    render(<Curtains win={win} style="side" color="#F4E6D0" drawn={1} lit={false} wall="#EDE2C8" night={true} />);
    const panels = [...svg().querySelectorAll('[data-curtain-panel]')];
    expect(panels.length).toBe(2);
    expect(panels[0]!.getAttribute('transform')).toContain('scale(1 1)');
    expect(svg().querySelector('[data-curtain-night]')!.getAttribute('opacity')).toBe('1');
    expect(svg().querySelector('[data-curtain-day]')!.getAttribute('opacity')).toBe('0');
    render(<Curtains win={win} style="side" color="#F4E6D0" drawn={0} lit={true} wall="#EDE2C8" />);
    expect(svg().querySelector('[data-curtain-day]')!.getAttribute('opacity')).toBe('1');
  });

  it('voile : le voilage se voit tant que les rideaux ne sont pas tirés à moitié', () => {
    render(<Curtains win={win} style="voile" color="#F4E6D0" drawn={0.2} lit={true} wall="#EDE2C8" />);
    expect(svg().querySelector('[data-voile-lit]')!.getAttribute('opacity')).toBe('1');
    render(<Curtains win={win} style="voile" color="#F4E6D0" drawn={0.8} lit={true} wall="#EDE2C8" />);
    expect(svg().querySelector('[data-voile-lit]')!.getAttribute('opacity')).toBe('0');
  });
});

describe('ambiance de nuit (dark)', () => {
  const amb = (c: string): string => {
    const a = [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
    const b = [1, 3, 5].map((i) => parseInt(DARK_VEIL.slice(i, i + 2), 16));
    return `#${a.map((v, i) => Math.round(v + (b[i]! - v) * DARK_ALPHA).toString(16).padStart(2, '0')).join('')}`;
  };
  const views: [string, (dark: number) => ReactElement][] = [
    ['Shutters persienne', (d) => <Shutters win={win} kind="persienne" color="#C4CCC8" open={0} litBehind={true} dark={d} />],
    ['Shutters battant', (d) => <Shutters win={win} kind="battant" color="#8FA88C" open={1} litBehind={false} dark={d} />],
    ['Sash', (d) => <Sash win={win} open={1} night={true} dark={d} />],
    ['FlowerBox', (d) => <FlowerBox win={win} month={7} seed={2} dark={d} />],
    ['InteriorProp', (d) => <InteriorProp win={win} kind="desk" tone="cool" flicker={0} dark={d} />],
    ['HeldProp', (d) => <HeldProp kind="watering-can" at={[1, 2]} phase={1} night={false} dark={d} />],
  ];

  it('nœuds constants pour dark 0 / 0,5 / 1 ; seule l’opacité du voile change', () => {
    for (const [, view] of views) {
      render(view(0));
      const day = shape();
      const count = all().length;
      for (const d of [0.5, 1]) {
        render(view(d));
        expect(shape()).toEqual(day);
        expect(all().length).toBe(count);
      }
    }
  });

  it('le voile compose exactement amb(c) à la nuit pleine : #1E2A5A à 0,64 sur les formes colorées, 0 de jour', () => {
    expect(amb('#C4CCC8')).toBe(nightAmb('#C4CCC8'));
    expect(amb('#8FA88C')).toBe(nightAmb('#8FA88C'));
    for (const [name, view] of views) {
      render(view(1));
      const veils = [...svg().querySelectorAll('[data-dark-veil]')];
      expect(veils.length, name).toBeGreaterThan(0);
      for (const v of veils) {
        expect(v.getAttribute('fill') ?? v.getAttribute('stroke')).toBe(DARK_VEIL);
        expect(v.getAttribute('opacity')).toBe('0.64');
      }
      render(view(0));
      for (const v of svg().querySelectorAll('[data-dark-veil]')) expect(v.getAttribute('opacity')).toBe('0');
    }
  });

  it('les lames éclairées des persiennes restent claires au-dessus du voile ; la braise n’est pas voilée', () => {
    render(<Shutters win={win} kind="persienne" color="#C4CCC8" open={0} litBehind={true} dark={1} />);
    const leaf = svg().querySelector('[data-shutter-leaf]')!;
    const order = [...leaf.querySelectorAll('*')].map((el) => (el.hasAttribute('data-dark-veil') ? 'veil' : el.hasAttribute('data-slats-lit') ? 'lit' : '-'));
    expect(order.indexOf('veil')).toBeLessThan(order.indexOf('lit'));
    render(<HeldProp kind="cigarette" at={[1, 2]} phase={0.3} night={false} dark={1} />);
    const ember = svg().querySelector('circle[fill="#FF6A2A"]')!;
    expect(ember.nextElementSibling?.hasAttribute('data-dark-veil') ?? false).toBe(false);
  });
});

describe('jardinière, sapin, accessoires', () => {
  it('FlowerBox : couleurs de la saison du mois', () => {
    const colours = (month: number) => {
      render(<FlowerBox win={win} month={month} seed={7} />);
      return [...svg().querySelectorAll('[data-flower]')].map((c) => c.getAttribute('fill'));
    };
    expect(flowerPalette(7)).toEqual(['#E8456B', '#F6C62E', '#FFFFFF', '#E070C0', '#3F8A3A']);
    for (const [month, n] of [[1, 2], [4, 6], [7, 6], [10, 6]] as const) {
      const got = colours(month);
      expect(got.length).toBe(n);
      for (const c of got) expect(flowerPalette(month)).toContain(c);
    }
    expect(colours(7)).not.toEqual(colours(10));
  });

  it('FlowerBox : même graine, même dessin', () => {
    render(<FlowerBox win={win} month={6} seed={3} />);
    const a = html();
    render(<FlowerBox win={win} month={6} seed={3} />);
    expect(html()).toBe(a);
    render(<FlowerBox win={win} month={6} seed={4} />);
    expect(html()).not.toBe(a);
  });

  it('Sapin : blink et night ne changent que les opacités ; 7 ampoules', () => {
    render(<Sapin win={french} night={false} blink={0} />);
    const base = shape();
    render(<Sapin win={french} night={true} blink={1.1} />);
    expect(shape()).toEqual(base);
    expect(svg().querySelectorAll('[data-bulb]').length).toBe(7);
  });

  it('InteriorProp et HeldProp : chaque sorte se dessine', () => {
    for (const kind of ['table', 'tv', 'stove', 'desk'] as const) {
      render(<InteriorProp win={win} kind={kind} tone="warm" flicker={0.3} />);
      expect(svg().querySelector(`[data-interior-prop="${kind}"]`)).not.toBeNull();
    }
    render(<InteriorProp win={win} kind="tv" tone="tv" flicker={0} />);
    const a = shape();
    render(<InteriorProp win={win} kind="tv" tone="tv" flicker={0.9} />);
    expect(shape()).toEqual(a);
    for (const kind of ['cigarette', 'watering-can', 'rug', 'spoon', 'book', 'cup'] as const) {
      render(<HeldProp kind={kind} at={[3, 4]} phase={0.4} night={false} />);
      const el = svg().querySelector(`[data-held-prop="${kind}"]`)!;
      expect(el).not.toBeNull();
      expect(el.getAttribute('transform')).toBe('translate(3 4)');
      const day = shape();
      render(<HeldProp kind={kind} at={[3, 4]} phase={0.9} night={false} />);
      expect(shape()).toEqual(day);
    }
  });
});
