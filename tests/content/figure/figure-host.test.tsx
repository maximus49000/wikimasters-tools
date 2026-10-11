// @vitest-environment jsdom
// tests/content/figure/figure-host.test.tsx
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { FigureContext, FigureDefs, FigureRegistry } from '../../../src/content/figure/figure-host';
import { GhibliFigure, poseFigure } from '../../../src/content/figure/ghibli-figure';
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

describe('éviction et références', () => {
  it('un symbole encore référencé par un <use> du document n’est jamais retiré', () => {
    const r = new FigureRegistry('t5', { max: 3, perFrame: 10 });
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    const first = r.ensure({ ...key, phase: 0 });
    act(() =>
      root.render(
        <svg>
          <defs><FigureDefs registry={r} /></defs>
          <use href={first} />
        </svg>,
      ),
    );
    for (let p = 1; p < 5; p++) r.ensure({ ...key, phase: p });
    r.flush();
    expect(r.root.querySelector(first)).not.toBeNull();
    expect(r.size()).toBe(3);
    act(() => root.unmount());
    host.remove();
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

  it('fonctionne aussi dans un shadow root (fenêtre de la Bibliothèque)', () => {
    const r = new FigureRegistry('t7', { max: 3, perFrame: 10 });
    const host = document.createElement('div');
    document.body.append(host);
    const inner = document.createElement('div');
    host.attachShadow({ mode: 'open' }).append(inner);
    const root = createRoot(inner);
    const first = r.ensure({ ...key, phase: 0 });
    act(() =>
      root.render(
        <svg>
          <defs><FigureDefs registry={r} /></defs>
          <use href={first} />
        </svg>,
      ),
    );
    for (let p = 1; p < 5; p++) r.ensure({ ...key, phase: p });
    r.flush();
    expect(r.root.querySelector(first)).not.toBeNull();
    expect(r.size()).toBe(3);
    act(() => root.unmount());
    host.remove();
  });
});
