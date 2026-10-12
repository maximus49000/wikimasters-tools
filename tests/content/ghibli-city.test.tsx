// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ART_KEY } from '../../src/content/art-setting';
import { resetPaintedCacheForTests, setTilePainterForTests } from '../../src/content/painted-city';
import { ScenePanorama } from '../../src/content/scene-panorama';
import { cityFacades } from '../../src/core/library/city/facades';
import { skyAt, sunTimes } from '../../src/core/library/sky';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
const times = sunTimes({ y: 2024, m: 6, d: 21 }, { lat: 48.85, lon: 2.35 }, 120);
const settle = () => act(async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0)); });
const render = async (minutes: number, width = 720) => {
  await act(async () => {
    root.render(
      <svg>
        <ScenePanorama scene="city" width={width} height={340} sky={skyAt(minutes, times)} minutes={minutes} seed={5} />
      </svg>,
    );
  });
  await settle();
};
const q = (s: string) => container.querySelector(s);
const qa = (s: string) => container.querySelectorAll(s);

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  vi.stubGlobal('requestAnimationFrame', () => 1);
  vi.stubGlobal('cancelAnimationFrame', () => undefined);
  vi.stubGlobal('requestIdleCallback', (fn: () => void) => { fn(); return 1; });
  vi.stubGlobal('cancelIdleCallback', () => undefined);
  resetPaintedCacheForTests();
  setTilePainterForTests(null);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  localStorage.removeItem(ART_KEY);
  setTilePainterForTests(null);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('ville peinte', () => {
  it('graphisme classique : aucune trace de la branche Ghibli', async () => {
    await render(12 * 60);
    expect(q('[data-painted-city]')).toBeNull();
    expect(q('[data-art="ghibli"]')).toBeNull();
    const lamps = cityFacades(720, 340, 5).filter((b) => !b.far).reduce((n, b) => n + b.lamps.length, 0);
    expect(qa('[data-lamp]').length).toBe(lamps);
  });

  it('graphisme classique : le socle d’un jumeau est dessiné avant les fenêtres (rien ne cache la rangée du socle)', async () => {
    await render(12 * 60, 2160);
    const podiums = [...qa('[data-podium]')];
    expect(podiums.length).toBeGreaterThan(0);
    const lamps = [...qa('[data-lamp]')];
    for (const p of podiums) for (const l of lamps) expect(p.compareDocumentPosition(l) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('Ghibli sans canvas (jsdom) : la ville classique reste visible', async () => {
    localStorage.setItem(ART_KEY, 'ghibli');
    await render(12 * 60);
    expect(q('[data-painted-city]')?.getAttribute('data-ready')).toBe('false');
    expect((q('[data-classic-city]') as HTMLElement).style.opacity).toBe('1');
  });

  it('Ghibli peint : images par tranche, fondu vers la peinture, fenêtres allumées', async () => {
    localStorage.setItem(ART_KEY, 'ghibli');
    const painter = vi.fn(async (_plan: unknown, tile: number) => `blob:fake-${tile}`);
    setTilePainterForTests(painter);
    await render(23 * 60);
    expect(qa('[data-painted-tile]').length).toBe(2);
    expect(q('[data-painted-city]')?.getAttribute('data-ready')).toBe('true');
    expect((q('[data-painted-city]') as HTMLElement).style.opacity).toBe('1');
    expect((q('[data-classic-city]') as HTMLElement).style.opacity).toBe('0');
    expect(q('[data-ghibli-windows] [data-lamp][data-lit="true"]')).not.toBeNull();
    expect(painter).toHaveBeenCalledTimes(2);
  });

  it('agrandir la pièce ne peint que les nouvelles tranches', async () => {
    localStorage.setItem(ART_KEY, 'ghibli');
    const painter = vi.fn(async (_plan: unknown, tile: number) => `blob:fake-${tile}`);
    setTilePainterForTests(painter);
    await render(12 * 60, 720);
    await render(12 * 60, 1080);
    // La 1re tranche n'est jamais repeinte ; la 2e peut l'être si un arbre ou une entrée change près de l'ancien bord.
    expect(painter.mock.calls.filter((c) => c[1] === 0).length).toBe(1);
    expect(painter.mock.calls.filter((c) => c[1] === 2).length).toBe(1);
    expect(qa('[data-painted-tile]').length).toBe(3);
  });

  it('l’étalonnage suit l’heure', async () => {
    localStorage.setItem(ART_KEY, 'ghibli');
    setTilePainterForTests(async (_p, t) => `blob:fake-${t}`);
    await render(12 * 60);
    const noon = q('[data-painted-city] feColorMatrix')?.getAttribute('values');
    await render(23 * 60);
    const night = q('[data-painted-city] feColorMatrix')?.getAttribute('values');
    expect(noon).toBeTruthy();
    expect(night).not.toBe(noon);
  });

  it('nuit : flaques des lampadaires et silhouettes aux fenêtres, hors filtre ; rien de visible à midi', async () => {
    localStorage.setItem(ART_KEY, 'ghibli');
    setTilePainterForTests(async (_p, t) => `blob:fake-${t}`);
    await render(23 * 60);
    const night = q('[data-painted-city] [data-ghibli-night]');
    expect(night).not.toBeNull();
    expect(night!.closest('[filter]')).toBeNull();
    const lamps = qa('[data-ghibli-night] [data-night-lamp]');
    expect(lamps.length).toBeGreaterThan(0);
    expect([...lamps].every((l) => l.getAttribute('data-lit') === 'true' && Number(l.getAttribute('opacity')) > 0.5)).toBe(true);
    expect(qa('[data-ghibli-windows] [data-lamp][data-lit="true"] [data-figure]').length).toBeGreaterThan(0);
    await render(12 * 60);
    expect([...qa('[data-ghibli-night] [data-night-lamp]')].every((l) => l.getAttribute('opacity') === '0')).toBe(true);
  });

  it('une erreur de peinture sur une tranche n’arrête pas les autres', async () => {
    localStorage.setItem(ART_KEY, 'ghibli');
    setTilePainterForTests(async (_p, t) => {
      if (t === 0) throw new Error('boom');
      return `blob:fake-${t}`;
    });
    await render(12 * 60);
    expect(qa('[data-painted-tile]').length).toBe(1);
    expect(q('[data-painted-city]')?.getAttribute('data-ready')).toBe('false');
  });
});
