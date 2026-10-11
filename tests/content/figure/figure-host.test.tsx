// @vitest-environment jsdom
// tests/content/figure/figure-host.test.tsx
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { BLANK_SPRITE, FigureContext, FigureRegistry, spriteKey, type Palette } from '../../../src/content/figure/figure-host';
import { GhibliFigure, figurePalette, hideFigure, poseFigure } from '../../../src/content/figure/ghibli-figure';
import { keyString } from '../../../src/core/library/figure/bake';
import { skyAt, sunTimes } from '../../../src/core/library/sky';
import type { Outfit } from '../../../src/core/library/city/people';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const o: Outfit = { skin: '#F2C9A5', hair: 'short', hairColor: '#4a2e1e', hatColor: '#000000', top: 'sweater', topColor: '#C0463A', bottom: 'jeans', bottomColor: '#243044', accessory: 'none', accessoryColor: '#5A6B7A' };
const sky = skyAt(12 * 60, sunTimes({ y: 2026, m: 10, d: 9 }, { lat: 48.85, lon: 2.35 }, 120));
const night = skyAt(23 * 60, sunTimes({ y: 2026, m: 10, d: 9 }, { lat: 48.85, lon: 2.35 }, 120));
const key = { sig: 'short.long.pants.none.n', yaw: 0, gait: 'walk' as const, phase: 0, head: 0 };
const pal: Palette = figurePalette(o, sky, false);
const reg = (opts: { max?: number; perFrame?: number } = {}): { r: FigureRegistry; pk: string } => {
  const r = new FigureRegistry('t', opts);
  return { r, pk: r.addPalette(pal) };
};
const fig = (): Element => document.createElementNS('http://www.w3.org/2000/svg', 'g');

describe('palette', () => {
  it('mêmes cases que la tenue (éclairé + ombre), encre et sol ; la nuit change la palette', () => {
    for (const s of ['skin', 'top', 'bottom', 'hair', 'hat', 'acc', 'shoe', 'umb']) {
      expect(pal[`f-${s}`]).toBeTruthy();
      expect(pal[`fs-${s}`]).toBeTruthy();
    }
    expect(pal['f-ink']).toBeTruthy();
    expect(pal['f-ground']).toBe('#3a2f5a');
    const r = new FigureRegistry('t');
    expect(r.addPalette(figurePalette(o, night, false))).not.toBe(r.addPalette(pal));
    expect(r.addPalette({ ...pal })).toBe(r.addPalette(pal));
  });
  it('teinte quantifiée au huitième de jour : 0,51 et 0,53 même palette, 0,3 et 0,7 différentes', () => {
    const at = (daylight: number): Palette => figurePalette(o, { ...sky, daylight }, false);
    expect(at(0.51)).toEqual(at(0.53));
    expect(at(0.3)).not.toEqual(at(0.7));
  });
});

describe('registre des sprites', () => {
  it('clé de sprite = palette + # + pose', () => {
    expect(spriteKey('P', key)).toBe(`P#${keyString(key)}`);
  });
  it('ensure crée un sprite une fois et rend son image (repli BLANK_SPRITE sans canvas)', () => {
    const { r, pk } = reg();
    const a = r.ensure(pk, key);
    expect(a).toBe(BLANK_SPRITE);
    expect(BLANK_SPRITE.startsWith('data:image/png;base64,')).toBe(true);
    expect(r.ensure(pk, key)).toBe(a);
    expect(r.size()).toBe(1);
    expect(r.has(spriteKey(pk, key))).toBe(true);
  });
  it('palette inconnue : rien n’est créé', () => {
    const { r } = reg();
    expect(r.ensure('inconnue', key)).toBeNull();
    expect(r.request('inconnue', key)).toBeNull();
    r.flush();
    expect(r.size()).toBe(0);
  });
  it('deux palettes : deux sprites pour la même pose', () => {
    const { r, pk } = reg();
    const pn = r.addPalette(figurePalette(o, night, false));
    r.ensure(pk, key);
    r.ensure(pn, key);
    expect(r.size()).toBe(2);
  });
  it('request met en file, flush respecte le budget de 8 par image', () => {
    const { r, pk } = reg();
    for (let p = 0; p < 12; p++) expect(r.request(pk, { ...key, phase: p })).toBeNull();
    r.flush();
    expect(r.size()).toBe(8);
    for (let p = 0; p < 12; p++) r.request(pk, { ...key, phase: p });
    r.flush();
    expect(r.size()).toBe(12);
    expect(r.request(pk, { ...key, phase: 11 })).toBe(BLANK_SPRITE);
  });
  it('plafond par défaut : 1500 sprites, les moins récents partent', () => {
    const { r, pk } = reg();
    for (let p = 0; p < 1510; p++) r.ensure(pk, { ...key, phase: p });
    r.flush();
    expect(r.size()).toBe(1500);
    expect(r.has(spriteKey(pk, { ...key, phase: 0 }))).toBe(false);
    expect(r.has(spriteKey(pk, { ...key, phase: 1509 }))).toBe(true);
  });
});

describe('éviction et détenteurs', () => {
  it('une clé détenue n’est jamais retirée', () => {
    const { r, pk } = reg({ max: 3 });
    const k0 = spriteKey(pk, { ...key, phase: 0 });
    r.ensure(pk, { ...key, phase: 0 });
    expect(r.hold(fig(), k0)).toBe(BLANK_SPRITE);
    for (let p = 1; p < 5; p++) r.ensure(pk, { ...key, phase: p });
    r.flush();
    expect(r.has(k0)).toBe(true);
    expect(r.size()).toBe(3);
  });
  it('une clé libérée peut partir', () => {
    const { r, pk } = reg({ max: 3 });
    const n = fig();
    const k0 = spriteKey(pk, { ...key, phase: 0 });
    r.ensure(pk, { ...key, phase: 0 });
    r.hold(n, k0);
    expect(r.hold(n, null)).toBeNull();
    for (let p = 1; p < 5; p++) r.ensure(pk, { ...key, phase: p });
    r.flush();
    expect(r.has(k0)).toBe(false);
  });
  it('changer de pose transfère la détention ; deux détenteurs : la clé reste tant qu’il en reste un', () => {
    const { r, pk } = reg({ max: 2 });
    const a = fig();
    const b = fig();
    const k0 = spriteKey(pk, { ...key, phase: 0 });
    const k1 = spriteKey(pk, { ...key, phase: 1 });
    r.ensure(pk, { ...key, phase: 0 });
    r.ensure(pk, { ...key, phase: 1 });
    r.hold(a, k0);
    r.hold(b, k0);
    r.hold(a, k1);
    r.hold(b, null);
    for (let p = 2; p < 5; p++) r.ensure(pk, { ...key, phase: p });
    r.flush();
    expect(r.has(k1)).toBe(true);
    expect(r.has(k0)).toBe(false);
  });
  it('hold d’une clé sans sprite : rien n’est détenu, l’ancienne reste détenue', () => {
    const { r, pk } = reg({ max: 1 });
    const n = fig();
    const k0 = spriteKey(pk, { ...key, phase: 0 });
    r.ensure(pk, { ...key, phase: 0 });
    r.hold(n, k0);
    expect(r.hold(n, spriteKey(pk, { ...key, phase: 1 }))).toBeNull();
    r.ensure(pk, { ...key, phase: 2 });
    r.flush();
    expect(r.has(k0)).toBe(true);
  });
  it('une clé ancienne retouchée survit à une clé jamais retouchée', () => {
    const { r, pk } = reg({ max: 3 });
    r.ensure(pk, { ...key, phase: 0 });
    r.ensure(pk, { ...key, phase: 1 });
    r.ensure(pk, { ...key, phase: 2 });
    r.request(pk, { ...key, phase: 0 });
    r.ensure(pk, { ...key, phase: 3 });
    r.flush();
    expect(r.has(spriteKey(pk, { ...key, phase: 0 }))).toBe(true);
    expect(r.has(spriteKey(pk, { ...key, phase: 1 }))).toBe(false);
  });
});

describe('file de création', () => {
  it('jette les demandes abandonnées depuis plus de 2 images', () => {
    const { r, pk } = reg({ perFrame: 1 });
    for (let p = 0; p < 5; p++) r.request(pk, { ...key, phase: p });
    for (let i = 0; i < 6; i++) r.flush();
    expect(r.size()).toBe(3);
  });
  it('une demande renouvelée à chaque image finit créée', () => {
    const { r, pk } = reg({ perFrame: 1 });
    for (let p = 0; p < 5; p++) r.request(pk, { ...key, phase: p });
    for (let i = 0; i < 6; i++) {
      r.request(pk, { ...key, phase: 4 });
      r.flush();
    }
    expect(r.request(pk, { ...key, phase: 4 })).not.toBeNull();
  });
});

describe('figure Ghibli', () => {
  const mount = (r: FigureRegistry, hidden: boolean): { host: HTMLDivElement; rerender: (s: typeof sky) => void; unmount: () => void } => {
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    const draw = (s: typeof sky): void =>
      act(() =>
        root.render(
          <FigureContext.Provider value={r}>
            <svg>
              <GhibliFigure outfit={o} sky={s} rainy={false} umbrella={false} hidden={hidden} initial={{ yaw: 0, gait: 'walk', phase: 0, head: 0 }} />
            </svg>
          </FigureContext.Provider>,
        ),
      );
    draw(sky);
    return { host, rerender: draw, unmount: () => { act(() => root.unmount()); host.remove(); } };
  };
  it('rend une <image> avec href et data-palette, sans variables CSS ; poseFigure garde l’image tant que le sprite manque', () => {
    const r = new FigureRegistry('t', { perFrame: 1 });
    const { host, unmount } = mount(r, false);
    const node = host.querySelector('[data-figure]')!;
    const img = node.firstElementChild!;
    expect(img.tagName).toBe('image');
    expect(host.querySelector('use')).toBeNull();
    expect(img.getAttribute('href')).toBe(BLANK_SPRITE);
    expect([img.getAttribute('x'), img.getAttribute('y'), img.getAttribute('width'), img.getAttribute('height')]).toEqual(['-20', '-64', '40', '68']);
    const pk = node.getAttribute('data-palette')!;
    expect(pk).toBe(r.addPalette(pal));
    expect(node.getAttribute('data-key')).toBe(spriteKey(pk, key));
    expect(node.getAttribute('style')).toBeNull();
    poseFigure(r, node, { yaw: 8, gait: 'walk', phase: 5, head: 0 });
    expect(node.getAttribute('data-key')).toBe(spriteKey(pk, key));
    r.flush();
    poseFigure(r, node, { yaw: 8, gait: 'walk', phase: 5, head: 0 });
    expect(node.getAttribute('data-key')).toBe(spriteKey(pk, { ...key, yaw: 8, phase: 5 }));
    expect(img.getAttribute('href')).toBe(BLANK_SPRITE);
    unmount();
  });
  it('hidden : <image> sans href, aucun sprite créé ; poseFigure la remet en place tout de suite', () => {
    const r = new FigureRegistry('t', { perFrame: 1 });
    const { host, unmount } = mount(r, true);
    const node = host.querySelector('[data-figure]')!;
    const img = node.querySelector('image')!;
    expect(img.hasAttribute('href')).toBe(false);
    expect(node.hasAttribute('data-key')).toBe(false);
    expect(node.getAttribute('data-palette')).not.toBeNull();
    expect(r.size()).toBe(0);
    poseFigure(r, node, { yaw: 8, gait: 'walk', phase: 5, head: 0 });
    expect(img.getAttribute('href')).toBe(BLANK_SPRITE);
    expect(node.getAttribute('data-key')).not.toBeNull();
    unmount();
  });
  it('hideFigure retire le href et data-key et libère la clé', () => {
    const { r, pk } = reg({ max: 1, perFrame: 10 });
    const { host, unmount } = mount(r, false);
    const node = host.querySelector('[data-figure]')!;
    const first = node.getAttribute('data-key')!;
    r.ensure(pk, { ...key, phase: 7 });
    r.flush();
    expect(r.has(first)).toBe(true);
    hideFigure(r, node);
    expect(node.querySelector('image')!.hasAttribute('href')).toBe(false);
    expect(node.hasAttribute('data-key')).toBe(false);
    r.ensure(pk, { ...key, phase: 8 });
    r.flush();
    expect(r.has(first)).toBe(false);
    unmount();
  });
  it('démontage : la pose détenue est libérée', () => {
    const { r, pk } = reg({ max: 1, perFrame: 10 });
    const { host, unmount } = mount(r, false);
    const first = host.querySelector('[data-figure]')!.getAttribute('data-key')!;
    unmount();
    r.ensure(pk, { ...key, phase: 7 });
    r.flush();
    expect(r.has(first)).toBe(false);
  });
  it('nouvelle palette (nuit) : aucun sprite peint au rendu, l’ancienne image reste jusqu’à la nouvelle, puis libérée', () => {
    const { r, pk } = reg({ max: 2, perFrame: 10 });
    const { host, rerender, unmount } = mount(r, false);
    const node = host.querySelector('[data-figure]')!;
    const day = node.getAttribute('data-key')!;
    expect(r.size()).toBe(1);
    rerender(night);
    const pn = node.getAttribute('data-palette')!;
    expect(pn).toBe(r.addPalette(figurePalette(o, night, false)));
    // Rien n’est peint pendant le rendu : la figure garde son image et sa clé (détenue), la nouvelle est en file.
    expect(r.size()).toBe(1);
    expect(r.has(spriteKey(pn, key))).toBe(false);
    expect(node.getAttribute('data-key')).toBe(day);
    expect(node.firstElementChild!.getAttribute('href')).toBe(BLANK_SPRITE);
    r.flush();
    expect(r.has(spriteKey(pn, key))).toBe(true);
    expect(r.has(day)).toBe(true);
    poseFigure(r, node, { yaw: 0, gait: 'walk', phase: 0, head: 0 });
    expect(node.getAttribute('data-key')).toBe(spriteKey(pn, key));
    r.ensure(pk, { ...key, phase: 7 });
    r.flush();
    expect(r.has(day)).toBe(false);
    unmount();
  });
  it('nouvelle palette, sprite déjà peint : utilisé tout de suite au rendu', () => {
    const { r } = reg({ perFrame: 10 });
    const pn = r.addPalette(figurePalette(o, night, false));
    r.ensure(pn, key);
    const { host, rerender, unmount } = mount(r, false);
    const node = host.querySelector('[data-figure]')!;
    rerender(night);
    expect(node.getAttribute('data-key')).toBe(spriteKey(pn, key));
    unmount();
  });
});
