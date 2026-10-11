// @vitest-environment jsdom
// tests/content/figure/figure-host.test.tsx
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { FigureContext, FigureDefs, FigureRegistry } from '../../../src/content/figure/figure-host';
import { GhibliFigure, hideFigure, poseFigure } from '../../../src/content/figure/ghibli-figure';
import { skyAt, sunTimes } from '../../../src/core/library/sky';
import type { Outfit } from '../../../src/core/library/city/people';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const o: Outfit = { skin: '#F2C9A5', hair: 'short', hairColor: '#4a2e1e', hatColor: '#000000', top: 'sweater', topColor: '#C0463A', bottom: 'jeans', bottomColor: '#243044', accessory: 'none', accessoryColor: '#5A6B7A' };
const sky = skyAt(12 * 60, sunTimes({ y: 2026, m: 10, d: 9 }, { lat: 48.85, lon: 2.35 }, 120));
const key = { sig: 'short.long.pants.none.n', yaw: 0, gait: 'walk' as const, phase: 0, head: 0 };

describe('registre des symboles', () => {
  it('ensure crée un symbole une fois et rend sa référence', () => {
    const r = new FigureRegistry('t1');
    const a = r.ensure(key);
    expect(a.startsWith('#t1-')).toBe(true);
    expect(r.ensure(key)).toBe(a);
    expect(r.size()).toBe(1);
    expect(r.root.querySelector(a)?.querySelectorAll('path').length).toBeGreaterThan(5);
  });
  it('request met en file, flush respecte le budget par image', () => {
    const r = new FigureRegistry('t2', { perFrame: 2 });
    for (let p = 0; p < 5; p++) expect(r.request({ ...key, phase: p })).toBeNull();
    r.flush();
    expect(r.size()).toBe(2);
    r.flush();
    r.flush();
    expect(r.size()).toBe(5);
    expect(r.request({ ...key, phase: 4 })).not.toBeNull();
  });
  it('plafond : les moins récemment utilisés partent', () => {
    const r = new FigureRegistry('t3', { max: 3, perFrame: 10 });
    for (let p = 0; p < 5; p++) r.ensure({ ...key, phase: p });
    r.flush();
    expect(r.size()).toBe(3);
  });
});

describe('figure Ghibli', () => {
  it('rend un <use> vers un symbole existant ; poseFigure garde l’image si le symbole manque', () => {
    const r = new FigureRegistry('t4', { perFrame: 1 });
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    act(() =>
      root.render(
        <FigureContext.Provider value={r}>
          <svg>
            <defs><FigureDefs registry={r} /></defs>
            <GhibliFigure outfit={o} sky={sky} rainy={false} umbrella={false} initial={{ yaw: 0, gait: 'walk', phase: 0, head: 0 }} />
          </svg>
        </FigureContext.Provider>,
      ),
    );
    const node = host.querySelector('[data-figure]')!;
    const use = node.querySelector('use')!;
    const first = use.getAttribute('href')!;
    expect(host.querySelector(`[data-figure-defs] ${first}`)).not.toBeNull();
    expect((node as HTMLElement).style.getPropertyValue('--f-top')).not.toBe('');
    poseFigure(r, node, { yaw: 8, gait: 'walk', phase: 5, head: 0 });
    expect(use.getAttribute('href')).toBe(first);
    r.flush();
    poseFigure(r, node, { yaw: 8, gait: 'walk', phase: 5, head: 0 });
    expect(use.getAttribute('href')).not.toBe(first);
    act(() => root.unmount());
    host.remove();
  });
});

describe('éviction et détenteurs', () => {
  const fig = (): Element => document.createElementNS('http://www.w3.org/2000/svg', 'g');
  it('une clé détenue par une figure n’est jamais retirée, sans interroger le DOM', () => {
    const r = new FigureRegistry('t5', { max: 3, perFrame: 10 });
    const first = r.ensure({ ...key, phase: 0 });
    expect(r.hold(fig(), { ...key, phase: 0 })).toBe(first);
    for (let p = 1; p < 5; p++) r.ensure({ ...key, phase: p });
    r.flush();
    expect(r.root.querySelector(first)).not.toBeNull();
    expect(r.size()).toBe(3);
  });
  it('une clé libérée peut partir', () => {
    const r = new FigureRegistry('t5b', { max: 3, perFrame: 10 });
    const n = fig();
    const first = r.ensure({ ...key, phase: 0 });
    r.hold(n, { ...key, phase: 0 });
    expect(r.hold(n, null)).toBeNull();
    for (let p = 1; p < 5; p++) r.ensure({ ...key, phase: p });
    r.flush();
    expect(r.root.querySelector(first)).toBeNull();
  });
  it('changer de pose transfère la détention ; deux détenteurs d’une clé : elle reste tant qu’il en reste un', () => {
    const r = new FigureRegistry('t5c', { max: 2, perFrame: 10 });
    const a = fig();
    const b = fig();
    const k0 = r.ensure({ ...key, phase: 0 });
    const k1 = r.ensure({ ...key, phase: 1 });
    r.hold(a, { ...key, phase: 0 });
    r.hold(b, { ...key, phase: 0 });
    r.hold(a, { ...key, phase: 1 });
    r.hold(b, null);
    for (let p = 2; p < 5; p++) r.ensure({ ...key, phase: p });
    r.flush();
    expect(r.root.querySelector(k1)).not.toBeNull();
    expect(r.root.querySelector(k0)).toBeNull();
  });
  it('hold d’une clé sans symbole : demandée, rien n’est détenu, l’ancienne reste détenue', () => {
    const r = new FigureRegistry('t5d', { max: 1, perFrame: 10 });
    const n = fig();
    const k0 = r.ensure({ ...key, phase: 0 });
    r.hold(n, { ...key, phase: 0 });
    expect(r.hold(n, { ...key, phase: 1 })).toBeNull();
    r.flush();
    expect(r.root.querySelector(k0)).not.toBeNull();
  });
  it('une clé ancienne retouchée survit à une clé jamais retouchée', () => {
    const r = new FigureRegistry('t6', { max: 3, perFrame: 10 });
    const a = r.ensure({ ...key, phase: 0 });
    const b = r.ensure({ ...key, phase: 1 });
    r.ensure({ ...key, phase: 2 });
    r.request({ ...key, phase: 0 });
    r.ensure({ ...key, phase: 3 });
    r.flush();
    expect(r.root.querySelector(a)).not.toBeNull();
    expect(r.root.querySelector(b)).toBeNull();
  });
});

describe('file de création', () => {
  it('jette les demandes abandonnées depuis plus de 2 images', () => {
    const r = new FigureRegistry('t8', { perFrame: 1 });
    for (let p = 0; p < 5; p++) r.request({ ...key, phase: p });
    for (let i = 0; i < 6; i++) r.flush();
    expect(r.size()).toBe(3);
  });
  it('une demande renouvelée à chaque image finit créée', () => {
    const r = new FigureRegistry('t9', { perFrame: 1 });
    for (let p = 0; p < 5; p++) r.request({ ...key, phase: p });
    for (let i = 0; i < 6; i++) {
      r.request({ ...key, phase: 4 });
      r.flush();
    }
    expect(r.request({ ...key, phase: 4 })).not.toBeNull();
  });
});

describe('figure cachée', () => {
  const mount = (r: FigureRegistry, hidden: boolean): { host: HTMLDivElement; unmount: () => void } => {
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    act(() =>
      root.render(
        <FigureContext.Provider value={r}>
          <svg>
            <defs><FigureDefs registry={r} /></defs>
            <GhibliFigure outfit={o} sky={sky} rainy={false} umbrella={false} hidden={hidden} initial={{ yaw: 0, gait: 'walk', phase: 0, head: 0 }} />
          </svg>
        </FigureContext.Provider>,
      ),
    );
    return { host, unmount: () => { act(() => root.unmount()); host.remove(); } };
  };
  it('hidden : <use> sans href, aucun symbole créé ; poseFigure la remet en place', () => {
    const r = new FigureRegistry('t10', { perFrame: 1 });
    const { host, unmount } = mount(r, true);
    const node = host.querySelector('[data-figure]')!;
    expect(node.querySelector('use')!.hasAttribute('href')).toBe(false);
    expect(node.hasAttribute('data-key')).toBe(false);
    expect(r.size()).toBe(0);
    poseFigure(r, node, { yaw: 8, gait: 'walk', phase: 5, head: 0 });
    expect(node.querySelector('use')!.getAttribute('href')).toMatch(/^#t10-/);
    expect(node.getAttribute('data-key')).not.toBeNull();
    unmount();
  });
  it('hideFigure retire le href et data-key et libère la clé', () => {
    const r = new FigureRegistry('t11', { max: 1, perFrame: 10 });
    const { host, unmount } = mount(r, false);
    const node = host.querySelector('[data-figure]')!;
    const first = node.querySelector('use')!.getAttribute('href')!;
    r.ensure({ ...key, phase: 7 });
    r.flush();
    expect(r.root.querySelector(first)).not.toBeNull();
    hideFigure(r, node);
    expect(node.querySelector('use')!.hasAttribute('href')).toBe(false);
    expect(node.hasAttribute('data-key')).toBe(false);
    r.ensure({ ...key, phase: 8 });
    r.flush();
    expect(r.root.querySelector(first)).toBeNull();
    unmount();
  });
  it('démontage : la pose détenue est libérée', () => {
    const r = new FigureRegistry('t12', { max: 1, perFrame: 10 });
    const { host, unmount } = mount(r, false);
    const first = host.querySelector('[data-figure] use')!.getAttribute('href')!;
    unmount();
    r.ensure({ ...key, phase: 7 });
    r.flush();
    expect(r.root.querySelector(first)).toBeNull();
  });
});
