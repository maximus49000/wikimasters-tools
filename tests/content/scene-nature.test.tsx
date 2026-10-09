// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ScenePanorama } from '../../src/content/scene-panorama';
import { skyAt, sunTimes } from '../../src/core/library/sky';
import type { SceneId } from '../../src/core/library/library-types';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
const times = sunTimes({ y: 2024, m: 6, d: 21 }, { lat: 48.85, lon: 2.35 }, 120);
const render = (scene: SceneId, minutes: number) =>
  act(() => root.render(<svg><ScenePanorama scene={scene} width={1080} height={340} sky={skyAt(minutes, times)} minutes={minutes} seed={9} /></svg>));

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

describe.each([['countryside', 'sheep'], ['mountain', 'hiker'], ['sea', 'boat']] as const)('scène %s', (scene, kind) => {
  it('dessine son décor et ses acteurs propres', () => {
    render(scene, 13 * 60);
    expect(container.querySelector(`[data-scene-art="${scene}"]`)).not.toBeNull();
    expect(container.querySelector(`[data-actor][data-kind="${kind}"]`)).not.toBeNull();
    expect(container.querySelector('[data-sun]')).not.toBeNull();
  });

  it('de nuit : lune, étoiles, pas de soleil', () => {
    render(scene, 0);
    expect(container.querySelector('[data-moon]')).not.toBeNull();
    expect(container.querySelector('[data-sun]')).toBeNull();
  });
});

describe('lumières nocturnes', () => {
  it('la campagne a des fermes éclairées le soir, plus rares à 4 h', () => {
    const lit = (m: number): number => { render('countryside', m); return container.querySelectorAll('[data-lamp][data-lit="true"]').length; };
    expect(lit(21 * 60)).toBeGreaterThan(lit(4 * 60));
  });
  it('la mer a des lumières de port qui suivent l’activité', () => {
    const lit = (m: number): number => { render('sea', m); return container.querySelectorAll('[data-lamp][data-lit="true"]').length; };
    expect(lit(21 * 60)).toBeGreaterThan(lit(4 * 60));
  });
});

describe('ciel sombre (météo)', () => {
  it('fermes, refuge et port allument plus de lumières en plein jour sous un ciel sombre, bien visibles', () => {
    const lit = (gloom: boolean): SVGElement[] =>
      (['countryside', 'mountain', 'sea'] as const).flatMap((scene) => {
        act(() => root.render(<svg><ScenePanorama scene={scene} width={1080} height={340} sky={skyAt(12 * 60, times)} minutes={12 * 60} seed={9} gloom={gloom} /></svg>));
        return Array.from(container.querySelectorAll<SVGElement>('[data-lamp][data-lit="true"]'));
      });
    const bright = lit(true);
    expect(bright.length).toBeGreaterThan(lit(false).length);
    for (const lamp of bright) expect(Number(lamp.getAttribute('opacity'))).toBeGreaterThanOrEqual(0.7);
  });
});
