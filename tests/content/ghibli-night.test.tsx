// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GhibliNightLight, resetNightLightForTests } from '../../src/content/ghibli-night';
import { setLitPatchPainterForTests, type LitPatchPainter } from '../../src/content/painted-city';
import { lampsFor } from '../../src/core/library/city/lamps';
import { cityPaintPlan } from '../../src/core/library/paint/city-plan';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const W = 720;
const H = 340;
const SEED = 5;
const plan = cityPaintPlan(W, H, SEED);
let container: HTMLDivElement;
let root: Root;
let frames: (() => void)[];
let painter: ReturnType<typeof vi.fn<LitPatchPainter>>;

type Opts = { minutes?: number; daylight?: number; dim?: number; rainy?: boolean; shops?: { x: number; w: number; top: number; lit: boolean }[] };
const render = async ({ minutes = 23 * 60, daylight = 0.05, dim = 0.95, rainy = false, shops = [] }: Opts = {}) => {
  await act(async () => {
    root.render(
      <svg>
        <GhibliNightLight width={W} height={H} seed={SEED} minutes={minutes} daylight={daylight} dim={dim} plan={plan} shops={shops} rainy={rainy} />
      </svg>,
    );
  });
};
// Fait tourner les images d'animation en attente (une peinture par image), jusqu'à épuisement.
const flush = async () => {
  for (let i = 0; i < 100 && frames.length > 0; i++) {
    const f = frames.shift()!;
    await act(async () => f());
  }
};
const q = (s: string) => container.querySelector(s);
const qa = (s: string) => [...container.querySelectorAll(s)];

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  frames = [];
  vi.stubGlobal('requestAnimationFrame', (cb: () => void) => { frames.push(cb); return frames.length; });
  vi.stubGlobal('cancelAnimationFrame', () => undefined);
  // Les découpes sont cuites au repos (idle) : même file que les images d'animation.
  vi.stubGlobal('requestIdleCallback', (cb: () => void) => { frames.push(cb); return frames.length; });
  vi.stubGlobal('cancelIdleCallback', () => undefined);
  resetNightLightForTests();
  painter = vi.fn<LitPatchPainter>(() => 'data:image/png;base64,lit');
  setLitPatchPainterForTests(painter);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  setLitPatchPainterForTests(null);
  vi.unstubAllGlobals();
});

describe('lumière de nuit Ghibli (deux peintures)', () => {
  it('lampadaire allumé la nuit : découpe éclairée et bloom, à l’opacité dim, transition 4 s', async () => {
    await render();
    await flush();
    const lamps = lampsFor(W, SEED);
    const nodes = qa('[data-night-lamp]');
    expect(nodes).toHaveLength(lamps.length);
    for (const n of nodes) {
      expect(n.getAttribute('data-lit')).toBe('true');
      expect(n.getAttribute('opacity')).toBe('0.95');
      expect((n as SVGElement).style.transition).toContain('4s');
      expect(n.querySelector('image[data-lit-patch]')?.getAttribute('href')).toBe('data:image/png;base64,lit');
    }
    // Une peinture par lampadaire, au plus une par image d'animation.
    expect(painter).toHaveBeenCalledTimes(lamps.length);
    const glows = qa('[data-night-glow]');
    expect(glows).toHaveLength(lamps.length);
    expect(glows.every((g) => g.getAttribute('opacity') === '0.95' && g.querySelector('circle[data-bloom]'))).toBe(true);
    // Le dégradé du bloom est partagé, à id unique par instance.
    const fill = q('circle[data-bloom]')!.getAttribute('fill')!;
    expect(fill).toMatch(/^url\(#.+\)$/);
    expect(q(`radialGradient[id="${fill.slice(5, -1)}"]`)).not.toBeNull();
    // Par temps sec : ni halo de pluie ni colonne.
    expect(q('[data-rain-column]')).toBeNull();
  });

  it('une peinture par image d’animation (budget rAF)', async () => {
    await render();
    expect(painter).not.toHaveBeenCalled();
    const f = frames.shift()!;
    await act(async () => f());
    expect(painter).toHaveBeenCalledTimes(1);
  });

  it('de jour (daylight 0,6) : opacité 0 et aucune peinture demandée, même sous la pluie', async () => {
    await render({ minutes: 12 * 60, daylight: 0.6, dim: 0.7, rainy: true, shops: [{ x: 200, w: 40, top: 220, lit: false }] });
    await flush();
    expect(painter).not.toHaveBeenCalled();
    expect(frames).toHaveLength(0);
    expect(qa('[data-night-lamp]').every((n) => n.getAttribute('opacity') === '0' && n.getAttribute('data-lit') === 'false')).toBe(true);
    expect(qa('[data-night-glow]').every((n) => n.getAttribute('opacity') === '0')).toBe(true);
    expect(q('image[data-lit-patch]')).toBeNull();
  });

  it('pluie la nuit : halo diffus et colonne de lumière sous chaque lampe', async () => {
    await render({ rainy: true });
    await flush();
    expect(qa('[data-rain-column]')).toHaveLength(lampsFor(W, SEED).length);
    expect(qa('circle[data-rain-halo]')).toHaveLength(lampsFor(W, SEED).length);
  });

  it('vitrine allumée : découpe sur le trottoir ; éteinte : rien', async () => {
    await render({ shops: [{ x: 200, w: 40, top: 220, lit: true }, { x: 400, w: 40, top: 220, lit: false }] });
    await flush();
    const shops = qa('[data-night-shop]');
    expect(shops).toHaveLength(2);
    expect(shops[0]!.getAttribute('opacity')).toBe('0.95');
    expect(shops[0]!.querySelector('image[data-lit-patch]')).not.toBeNull();
    expect(shops[1]!.getAttribute('opacity')).toBe('0');
    expect(shops[1]!.querySelector('image[data-lit-patch]')).toBeNull();
  });

  it('sans plan peint : lampes et bloom quand même, sans découpe', async () => {
    await act(async () => {
      root.render(
        <svg>
          <GhibliNightLight width={W} height={H} seed={SEED} minutes={23 * 60} daylight={0.05} dim={0.95} plan={null} shops={[]} rainy={false} />
        </svg>,
      );
    });
    await flush();
    expect(painter).not.toHaveBeenCalled();
    expect(qa('[data-night-lamp]').length).toBeGreaterThan(0);
    expect(q('image[data-lit-patch]')).toBeNull();
  });
});
