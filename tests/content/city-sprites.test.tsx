// @vitest-environment jsdom
// tests/content/city-sprites.test.tsx
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { EntranceSprite, LampSprite, PersonSprite, VehicleSprite } from '../../src/content/city-sprites';
import type { Accessory, Bottom, Hair, Outfit, Top } from '../../src/core/library/city/people';
import { outfitFor } from '../../src/core/library/city/people';
import { LANE_DIR, vehiclesFor, type Vehicle } from '../../src/core/library/city/vehicles';
import { mulberry32 } from '../../src/core/library/scene-world';
import { skyAt, sunTimes } from '../../src/core/library/sky';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const sky = skyAt(720, sunTimes({ y: 2026, m: 10, d: 9 }, { lat: 48.85, lon: 2.35 }, 120));
const night = skyAt(0, sunTimes({ y: 2026, m: 10, d: 9 }, { lat: 48.85, lon: 2.35 }, 120));

// Rendu via react-dom/client (pas de @testing-library dans le dépôt).
const mounted: { root: Root; host: HTMLElement }[] = [];
afterEach(() => {
  for (const m of mounted.splice(0)) {
    act(() => m.root.unmount());
    m.host.remove();
  }
});
const svg = (node: ReactNode): SVGSVGElement => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  mounted.push({ root, host });
  act(() => root.render(<svg>{node}</svg>));
  return host.querySelector('svg')!;
};

describe('signes de fête', () => {
  const outfit = outfitFor('ordinary', mulberry32(3));
  it.each(['crown', 'heart-balloon', 'basket', 'lily', 'flag', 'poppy', 'streamer', 'note'] as const)('dessine le signe %s', (mark) => {
    expect(svg(<PersonSprite outfit={outfit} sky={sky} rainy={false} umbrella={false} mark={mark} />).querySelector(`[data-mark-art="${mark}"]`)).not.toBeNull();
  });
  it('ne dessine aucun signe par défaut', () => {
    expect(svg(<PersonSprite outfit={outfit} sky={sky} rainy={false} umbrella={false} />).querySelector('[data-mark-art]')).toBeNull();
  });
});

describe('sprites de la ville', () => {
  it('dessine un passant avec parapluie seulement quand on le demande', () => {
    const outfit = outfitFor('ordinary', mulberry32(3));
    expect(svg(<PersonSprite outfit={outfit} sky={sky} rainy={false} umbrella={false} />).querySelector('[data-umbrella]')).toBeNull();
    expect(svg(<PersonSprite outfit={outfit} sky={sky} rainy umbrella />).querySelector('[data-umbrella]')).not.toBeNull();
  });
  it('habille la silhouette d’après la tenue (couleur du haut)', () => {
    const outfit = { ...outfitFor('ordinary', mulberry32(3)), top: 'tee' as const, topColor: '#C0463A' };
    expect(svg(<PersonSprite outfit={outfit} sky={sky} rainy={false} umbrella={false} />).innerHTML.toLowerCase()).toContain('#c0463a');
  });
  it('un passant de nuit est plus sombre que de jour', () => {
    const outfit = { ...outfitFor('ordinary', mulberry32(3)), top: 'tee' as const, topColor: '#C0463A' };
    expect(svg(<PersonSprite outfit={outfit} sky={night} rainy={false} umbrella={false} />).innerHTML).not.toBe(svg(<PersonSprite outfit={outfit} sky={sky} rainy={false} umbrella={false} />).innerHTML);
  });
  it('dessine les véhicules (phares seulement allumés) et le lampadaire', () => {
    const v = vehiclesFor(720, 4).find((x) => x.kind === 'car')!;
    expect(svg(<VehicleSprite vehicle={v} sky={sky} lights={false} />).querySelector('[data-headlight]')).toBeNull();
    expect(svg(<VehicleSprite vehicle={v} sky={night} lights />).querySelector('[data-headlight]')).not.toBeNull();
    expect(LANE_DIR.near).toBe(1);
    expect(svg(<LampSprite lit />).querySelector('[data-lamp-glow]')).not.toBeNull();
    expect(svg(<LampSprite lit={false} />).querySelector('[data-lamp-glow]')).toBeNull();
  });
  it('dessine les trois variantes d’entrée, le hall éclairé quand demandé', () => {
    for (const variant of [0, 1, 2] as const) {
      expect(svg(<EntranceSprite variant={variant} hallLit={false} sky={sky} />).querySelector('[data-entrance]')).not.toBeNull();
    }
    expect(svg(<EntranceSprite variant={0} hallLit sky={night} />).querySelector('[data-hall-lit]')).not.toBeNull();
    expect(svg(<EntranceSprite variant={0} hallLit={false} sky={night} />).querySelector('[data-hall-lit]')).toBeNull();
  });
});

// ---------- Contrôles détaillés ----------
const lum = (hex: string): number => {
  const n = parseInt(hex.slice(1), 16);
  return 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
};
const html = (el: Element): string => el.innerHTML.toLowerCase();
const base: Outfit = { skin: '#F2C9A5', hair: 'short', hairColor: '#123456', hatColor: '#654321', top: 'tee', topColor: '#C0463A', bottom: 'pants', bottomColor: '#2F4A7A', accessory: 'none', accessoryColor: '#ABCDEF' };
const person = (o: Partial<Outfit>, s = sky, rainy = false): SVGSVGElement => svg(<PersonSprite outfit={{ ...base, ...o }} sky={s} rainy={rainy} umbrella={false} />);
const topRect = (el: Element): Element => el.querySelector('rect[x="-5"][y="-28"]')!;

describe('sprites de la ville : détails', () => {
  it('assombrit la tenue la nuit (couleur du haut absente, plus sombre)', () => {
    const day = person({});
    const dark = person({}, night);
    expect(html(day)).toContain('#c0463a');
    expect(html(dark)).not.toContain('#c0463a');
    expect(lum(topRect(dark).getAttribute('fill')!)).toBeLessThan(lum(topRect(day).getAttribute('fill')!));
  });
  it('garde phares, halo du lampadaire et vitrage du hall éclairé non assombris la nuit', () => {
    const v = vehiclesFor(720, 4).find((x) => x.kind === 'car')!;
    expect(html(svg(<VehicleSprite vehicle={v} sky={night} lights />).querySelector('[data-headlight]')!)).toContain('#ffe9a0');
    expect(html(svg(<LampSprite lit />).querySelector('[data-lamp-glow]')!)).toContain('#ffe9a0');
    expect(html(svg(<EntranceSprite variant={0} hallLit sky={night} />))).toContain('#ffd27a');
  });
  it('dessine chaque haut, bas, coiffure et accessoire avec sa signature', () => {
    const tops: Top[] = ['tee', 'sweater', 'jacket', 'coat', 'shirt', 'suit', 'jersey'];
    for (const top of tops) {
      const el = person({ top });
      const r = topRect(el);
      expect(r.getAttribute('fill')!.toLowerCase()).toBe('#c0463a');
      expect(r.getAttribute('height')).toBe(top === 'coat' ? '19' : '14');
      expect(html(el).includes('#b03030')).toBe(top === 'suit');
      expect(el.querySelector('rect[opacity="0.8"]') !== null).toBe(top === 'jersey');
    }
    const bottoms: Bottom[] = ['pants', 'jeans', 'skirt', 'shorts', 'dress', 'jogging'];
    for (const bottom of bottoms) {
      const el = person({ bottom });
      expect(html(el)).toContain('#2f4a7a');
      const legs = el.querySelectorAll('rect[fill="#F2C9A5" i]').length;
      const trapeze = el.querySelector('path[d^="M-5.5"]') !== null;
      if (bottom === 'skirt' || bottom === 'dress') {
        expect(trapeze).toBe(true);
        expect(legs).toBe(2);
      } else if (bottom === 'shorts') {
        expect(trapeze).toBe(false);
        expect(legs).toBe(2);
      } else {
        expect(trapeze).toBe(false);
        expect(legs).toBe(0);
        expect(el.querySelectorAll('rect[height="15"]').length).toBe(2);
      }
    }
    const hairs: Hair[] = ['short', 'long', 'bun', 'cap', 'beanie', 'bald'];
    for (const hair of hairs) {
      const el = person({ hair });
      expect(el.querySelector('circle[r="4.6"]')).not.toBeNull();
      const h = html(el);
      expect(h.includes('#123456')).toBe(hair === 'short' || hair === 'long' || hair === 'bun');
      expect(h.includes('#654321')).toBe(hair === 'cap' || hair === 'beanie');
      // Signatures de forme : chaque élément n'existe que pour sa coiffure.
      expect(el.querySelector('circle[r="2.4"]') !== null).toBe(hair === 'bun');
      expect(el.querySelector('rect[x="2"][y="-35"]') !== null).toBe(hair === 'cap');
      expect(el.querySelector('circle[r="1.4"]') !== null).toBe(hair === 'beanie');
      if (hair === 'long') {
        expect(el.querySelector('rect[x="-5.2"][y="-37"][width="10.4"][height="4"][rx="3"]')).not.toBeNull();
        expect(el.querySelector('rect[x="-5.4"][y="-35"][width="3"][height="11"]')).not.toBeNull();
      }
    }
    const accs: Accessory[] = ['none', 'backpack', 'bag', 'case', 'ball', 'scarf'];
    for (const accessory of accs) {
      const el = person({ accessory });
      expect(html(el).includes('#abcdef')).toBe(accessory === 'backpack' || accessory === 'bag' || accessory === 'scarf');
      expect(el.querySelector('circle[r="3.2"]') !== null).toBe(accessory === 'ball');
      expect(el.querySelector('rect[fill="#4A3B2A" i]') !== null).toBe(accessory === 'case');
      expect(el.querySelector('rect[x="5"][y="-17"]') !== null).toBe(accessory === 'bag');
      expect(el.querySelector('rect[x="-5"][y="-29"]') !== null).toBe(accessory === 'scarf');
      expect(el.querySelector('rect[x="-9"]') !== null).toBe(accessory === 'backpack');
    }
  });
  it('met un imperméable sous la pluie pour les hauts légers seulement', () => {
    expect(html(person({ top: 'tee' }, sky, true))).toContain('#2e5e8a');
    expect(html(person({ top: 'coat' }, sky, true))).not.toContain('#2e5e8a');
  });
  it('dessine les quatre véhicules, phares seulement avec lights', () => {
    const mk = (kind: Vehicle['kind']): Vehicle => ({ id: 'x', lane: 'near', kind, color: '#3B6FD6', speed: 1, phase: 0, u: 0, scale: 1 });
    for (const kind of ['car', 'bus', 'van', 'bike'] as const) {
      const off = svg(<VehicleSprite vehicle={mk(kind)} sky={sky} lights={false} />);
      const on = svg(<VehicleSprite vehicle={mk(kind)} sky={night} lights />);
      expect(off.querySelector('[data-headlight]')).toBeNull();
      expect(on.querySelector('[data-headlight]')).not.toBeNull();
    }
    const car = svg(<VehicleSprite vehicle={mk('car')} sky={sky} lights={false} />);
    expect(car.querySelectorAll('rect[width="40"][height="9"]').length).toBe(1);
    expect(car.querySelectorAll('rect[width="22"][height="9"]').length).toBe(1);
    expect(car.querySelectorAll('circle[r="4"]').length).toBe(2);
    const bus = svg(<VehicleSprite vehicle={mk('bus')} sky={sky} lights={false} />);
    expect(bus.querySelectorAll('rect[width="7"][height="8"]').length).toBe(6);
    const bike = svg(<VehicleSprite vehicle={mk('bike')} sky={sky} lights={false} />);
    expect(bike.querySelectorAll('circle[r="5"]').length).toBe(2);
    expect(svg(<VehicleSprite vehicle={mk('van')} sky={sky} lights={false} />).querySelector('rect[width="46"][height="18"]')).not.toBeNull();
  });
  it('le vélo porte un cycliste assis : jambe vers la pédale, buste vers le guidon, tête au-dessus de la selle, aux couleurs de sa tenue', () => {
    const rider: Outfit = { ...outfitFor('ordinary', mulberry32(9)), hair: 'short', topColor: '#C0463A', bottomColor: '#243044' };
    const bike: Vehicle = { id: 'b', lane: 'near', kind: 'bike', color: '#3B6FD6', speed: 1, phase: 0, u: 0, scale: 1, rider };
    const el = svg(<VehicleSprite vehicle={bike} sky={sky} lights={false} />);
    const r = el.querySelector('[data-rider]')!;
    expect(r).not.toBeNull();
    // Jambe : hanche sur la selle (-3, -16), pied sur le pédalier (0,5 ; -6).
    expect(r.querySelector('[data-rider-leg]')!.getAttribute('d')).toBe('M-3 -16 L2.5 -12 L0.5 -6');
    expect(r.querySelector('[data-rider-torso]')!.getAttribute('d')).toBe('M-4.6 -16.5 L-2 -24 L1.6 -23 L-0.6 -15.5Z');
    const head = r.querySelector('circle[data-rider-head]')!;
    expect(head.getAttribute('cy')).toBe('-26.6');
    expect(head.getAttribute('r')).toBe('2.6');
    // Plein jour : couleurs de la tenue telles quelles.
    expect(r.querySelector('[data-rider-torso]')!.getAttribute('fill')!.toLowerCase()).toBe('#c0463a');
    expect(r.querySelector('[data-rider-leg]')!.getAttribute('stroke')!.toLowerCase()).toBe('#243044');
    // Sans tenue fournie, un cycliste par défaut ; une voiture n'en a pas.
    expect(svg(<VehicleSprite vehicle={{ ...bike, rider: undefined }} sky={sky} lights={false} />).querySelector('[data-rider]')).not.toBeNull();
    expect(svg(<VehicleSprite vehicle={{ ...bike, kind: 'car' }} sky={sky} lights={false} />).querySelector('[data-rider]')).toBeNull();
  });
  it('les trois entrées diffèrent, cadre de x = 0 sur 22 de large', () => {
    const outs = ([0, 1, 2] as const).map((variant) => svg(<EntranceSprite variant={variant} hallLit={false} sky={sky} />));
    expect(new Set(outs.map((o) => o.innerHTML)).size).toBe(3);
    for (const o of outs) {
      const frame = o.querySelector('rect[width="22"][height="27"]')!;
      expect(frame.getAttribute('x')).toBe('0');
      expect(frame.getAttribute('width')).toBe('22');
    }
  });
  it('n’emploie aucun id SVG fixe', () => {
    const nodes = [
      person({ accessory: 'bag' }, sky, true),
      svg(<PersonSprite outfit={base} sky={sky} rainy umbrella />),
      ...vehiclesFor(720, 4).map((x) => svg(<VehicleSprite vehicle={x} sky={night} lights />)),
      svg(<LampSprite lit />),
      ...([0, 1, 2] as const).map((variant) => svg(<EntranceSprite variant={variant} hallLit sky={night} />)),
    ];
    for (const n of nodes) expect(n.querySelector('[id]')).toBeNull();
  });
});
