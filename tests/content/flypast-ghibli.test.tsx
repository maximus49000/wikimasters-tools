// @vitest-environment jsdom
// tests/content/flypast-ghibli.test.tsx — défilé aérien du 14 juillet en Ghibli : avions de la Patrouille en images, fumées
// tricolores en particules posées par la boucle, hélicoptères à poses cycliques.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FlypastLayer, poseSmoke } from '../../src/content/flypast-sprite';
import { PropContext, PropRegistry } from '../../src/content/prop/prop-host';
import { skyAt, sunTimes } from '../../src/core/library/sky';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const sky = skyAt(600, sunTimes({ y: 2026, m: 7, d: 14 }, { lat: 48.85, lon: 2.35 }, 120));
// 10 h 00 min 10 s de la scène : l'horloge murale est sur une minute ronde + 10 s, la patrouille est en vol.
const NOW_S = 1_800_000_000 + 10;
const mounted: { root: Root; host: HTMLDivElement }[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const { root, host } of mounted.splice(0)) {
    act(() => root.unmount());
    host.remove();
  }
});
const mount = (ghibli: boolean): { svg: SVGSVGElement; flush: () => Promise<void> } => {
  vi.spyOn(Date, 'now').mockReturnValue(NOW_S * 1000);
  const jobs: (() => void)[] = [];
  const reg = new PropRegistry('t12fp', { schedule: (cb) => jobs.push(cb) });
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  mounted.push({ root, host });
  act(() =>
    root.render(
      <PropContext.Provider value={reg}>
        <svg>
          <FlypastLayer width={720} height={340} sky={sky} still={false} dayFests={['bastille']} minutes={600} ghibli={ghibli} />
        </svg>
      </PropContext.Provider>,
    ),
  );
  const flush = async (): Promise<void> => {
    for (let n = 0; jobs.length && n < 50; n++) await act(async () => jobs.shift()!());
  };
  return { svg: host.querySelector('svg')!, flush };
};

describe('défilé aérien Ghibli', () => {
  it('classique inchangé : 7 avions à traînées en rectangles, hélicoptères à rotor SMIL, aucune image', () => {
    const { svg } = mount(false);
    expect(svg.querySelectorAll('[data-jet]')).toHaveLength(7);
    expect(svg.querySelectorAll('[data-jet] rect')).toHaveLength(35); // 4 pans de traînée + bande blanche par avion
    expect(svg.querySelectorAll('[data-flypast-helicopter] animateTransform')).toHaveLength(2);
    expect(svg.querySelector('image, [data-smoke], [data-prop-cycle]')).toBeNull();
  });
  it('Ghibli : avions en images après cuisson, fumées en particules (une couleur par rang), hélicoptères à poses cycliques, aucun SMIL', async () => {
    const { svg, flush } = mount(true);
    expect(svg.querySelectorAll('[data-jet]')).toHaveLength(7);
    expect(svg.querySelectorAll('animate, animateTransform')).toHaveLength(0);
    const smokes = svg.querySelectorAll('[data-jet] [data-smoke]');
    expect(smokes).toHaveLength(7);
    for (const s of smokes) expect(s.querySelectorAll('circle').length).toBeGreaterThan(8);
    expect(new Set([...smokes].map((s) => s.getAttribute('data-smoke'))).size).toBe(3);
    expect(svg.querySelectorAll('[data-flypast-helicopter] [data-prop-cycle]')).toHaveLength(2);
    await flush();
    expect(svg.querySelectorAll('[data-jet] image')).toHaveLength(7);
    expect(svg.querySelectorAll('[data-flypast-helicopter] image')).toHaveLength(2);
  });
  it('la boucle fait onduler les fumées (ordonnées qui changent avec t, nombre constant)', () => {
    const { svg } = mount(true);
    const trail = svg.querySelector('[data-smoke]')!;
    const cy = (): string[] => [...trail.querySelectorAll('circle')].map((c) => c.getAttribute('cy')!);
    const before = cy();
    poseSmoke(svg, NOW_S + 0.7);
    expect(cy()).not.toEqual(before);
    expect(cy()).toHaveLength(before.length);
  });
  it('re-rendu React après que la boucle a posé les fumées : aucune erreur, fumées toujours en SVG', () => {
    const { svg } = mount(true);
    for (let t = 0; t < 30; t += 0.41) poseSmoke(svg, NOW_S + t);
    const { root } = mounted[mounted.length - 1]!;
    expect(() =>
      act(() =>
        root.render(
          <PropContext.Provider value={new PropRegistry('t12fp2', { schedule: () => undefined })}>
            <svg>
              <FlypastLayer width={720} height={340} sky={sky} still={false} dayFests={['bastille']} minutes={601} ghibli />
            </svg>
          </PropContext.Provider>,
        ),
      ),
    ).not.toThrow();
    for (const el of document.querySelectorAll('[data-smoke] *')) expect(el.namespaceURI).toBe('http://www.w3.org/2000/svg');
  });
});
