// @vitest-environment jsdom
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FacadeWindow } from '../../src/core/library/city/facade-layout';
import {
  Curtains, FlowerBox, HeldProp, InteriorProp, Sapin, Sash, Shutters, curtainOpenWidth, flowerPalette, shutterTransform,
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
