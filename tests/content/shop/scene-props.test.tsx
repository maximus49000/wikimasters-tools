// @vitest-environment jsdom
// tests/content/shop/scene-props.test.tsx
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { PICTO_LIFE, Picto } from '../../../src/content/shop/picto';
import { PropSprite, WornFrames } from '../../../src/content/shop/scene-props';
import type { PictoId, PropId } from '../../../src/core/library/city/shops/scene/moves';
import { skyAt } from '../../../src/core/library/sky';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const PROPS: readonly PropId[] = ['coin', 'card', 'ticket', 'menu', 'notepad', 'plate', 'glass', 'parcel', 'bouquet', 'frames', 'mirror', 'sample', 'cup', 'book', 'bag', 'accessory'];
const PICTOS: readonly PictoId[] = ['question', 'bang', 'note', 'joy', 'sweat', 'heart'];
const day = skyAt(12 * 60, { kind: 'normal', sunrise: 360, sunset: 1200 });
const night = skyAt(3 * 60, { kind: 'normal', sunrise: 360, sunset: 1200 });

let root: Root | null = null;
let host: HTMLElement | null = null;
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});
const mount = (node: ReactNode): HTMLElement => {
  act(() => root?.unmount());
  host?.remove();
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(<svg>{node}</svg>));
  return host;
};

describe('objets d’interaction (PropSprite)', () => {
  it('chaque objet rend un <g data-prop> non vide, encré en cellulo', () => {
    for (const id of PROPS) {
      const g = mount(<PropSprite id={id} sky={day} accessory="baguette" />).querySelector(`[data-prop="${id}"]`);
      expect(g, id).not.toBeNull();
      expect(g!.childElementCount, id).toBeGreaterThan(0);
      // L'accessoire du métier est le dessin existant (AccessorySprite), pas forcément encré.
      if (id !== 'accessory') expect(g!.querySelector('[stroke]'), id).not.toBeNull();
    }
  });
  it('« accessory » délègue à l’accessoire du métier, ou se rabat sur un paquet sans accessoire', () => {
    expect(mount(<PropSprite id="accessory" sky={day} accessory="baguette" />).querySelector('[data-prop="accessory"] [data-accessory="baguette"]')).not.toBeNull();
    const g = mount(<PropSprite id="accessory" sky={day} accessory={null} />).querySelector('[data-prop="accessory"]');
    expect(g).not.toBeNull();
    expect(g!.childElementCount).toBeGreaterThan(0);
  });
  it('se teinte la nuit (aplats et encre plus sombres) et n’utilise aucun id', () => {
    const fills = (c: HTMLElement): string[] => Array.from(c.querySelectorAll('[fill]')).map((e) => e.getAttribute('fill') ?? '').filter((f) => f.startsWith('#'));
    const lum = (h: string): number => parseInt(h.slice(1, 3), 16) + parseInt(h.slice(3, 5), 16) + parseInt(h.slice(5, 7), 16);
    const sum = (xs: string[]): number => xs.reduce((s, h) => s + lum(h), 0);
    const d = mount(<PropSprite id="coin" sky={day} accessory={null} />);
    expect(d.querySelector('[id]')).toBeNull();
    const dayFills = fills(d);
    const nightFills = fills(mount(<PropSprite id="coin" sky={night} accessory={null} />));
    expect(dayFills.length).toBeGreaterThan(0);
    expect(sum(nightFills)).toBeLessThan(sum(dayFills));
  });
});

describe('montures portées (WornFrames)', () => {
  it('visibles de face et de profil, invisibles de dos', () => {
    expect(mount(<WornFrames yaw={4} sky={day} />).querySelector('[data-worn-frames]')).not.toBeNull();
    expect(mount(<WornFrames yaw={0} sky={day} />).querySelector('[data-worn-frames]')).not.toBeNull();
    expect(mount(<WornFrames yaw={8} sky={day} />).querySelector('[data-worn-frames]')).not.toBeNull();
    expect(mount(<WornFrames yaw={12} sky={day} />).querySelector('[data-worn-frames]')).toBeNull();
    expect(mount(<WornFrames yaw={-4} sky={day} />).querySelector('[data-worn-frames]')).toBeNull();
  });
  it('de face, deux verres ; de profil, le verre avant seulement', () => {
    expect(mount(<WornFrames yaw={4} sky={day} />).querySelectorAll('[data-lens]').length).toBe(2);
    expect(mount(<WornFrames yaw={0} sky={day} />).querySelectorAll('[data-lens]').length).toBe(1);
  });
});

describe('pictogrammes manga (Picto)', () => {
  it('PICTO_LIFE vaut 1 s', () => {
    expect(PICTO_LIFE).toBe(1);
  });
  it('chaque picto rend <g data-picto> à mi-vie, et rien après sa durée', () => {
    for (const id of PICTOS) {
      const g = mount(<Picto id={id} age={0.5} />).querySelector(`[data-picto="${id}"]`);
      expect(g, id).not.toBeNull();
      expect(g!.childElementCount, id).toBeGreaterThan(0);
      expect(mount(<Picto id={id} age={1.2} />).querySelector('[data-picto]'), id).toBeNull();
    }
  });
  it('saute à l’apparition : plus grand à 0,05 s qu’à 0,5 s, puis s’efface', () => {
    const scaleAt = (age: number): number => {
      const t = mount(<Picto id="bang" age={age} />).querySelector('[data-picto]')!.getAttribute('transform') ?? '';
      return Number(/scale\(([\d.]+)/.exec(t)?.[1]);
    };
    expect(scaleAt(0.05)).toBeGreaterThan(scaleAt(0.5));
    expect(scaleAt(0.5)).toBeCloseTo(scaleAt(0.3), 5);
    const opacity = (age: number): number => Number(mount(<Picto id="bang" age={age} />).querySelector('[data-picto]')!.getAttribute('opacity'));
    expect(opacity(0.5)).toBe(1);
    expect(opacity(0.95)).toBeLessThan(0.5);
    expect(mount(<Picto id="bang" age={-0.1} />).querySelector('[data-picto]')).toBeNull();
  });
  it('trait tremblé encré, aucun id', () => {
    const c = mount(<Picto id="question" age={0.5} />);
    expect(c.querySelector('[id]')).toBeNull();
    expect(c.querySelector('[stroke="#2A1A18"]')).not.toBeNull();
  });
});
