// @vitest-environment jsdom
// tests/content/city-event-sprites.test.tsx
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { CityEventSprite } from '../../src/content/city-event-sprites';
import { EVENT_DEFS, type CityEvent } from '../../src/core/library/city/events';
import { skyAt, sunTimes } from '../../src/core/library/sky';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const sky = skyAt(12 * 60, sunTimes({ y: 2026, m: 10, d: 9 }, { lat: 48.85, lon: 2.35 }, 120));
const draw = (event: CityEvent, still: boolean): SVGSVGElement => {
  const host = document.createElement('div');
  act(() => createRoot(host).render(<svg><CityEventSprite event={event} sky={sky} still={still} lights rainy={false} /></svg>));
  return host.querySelector('svg')!;
};
const ev = (id: CityEvent['id']): CityEvent => ({ key: `k-${id}`, id, layer: EVENT_DEFS.find((d) => d.id === id)!.layer, start: 0, end: 10, dir: 1, track: null, speed: 1, x0: 0, y: 0.1, pick: 0.4, variant: 0.6, yields: [] });

describe('CityEventSprite', () => {
  it.each(EVENT_DEFS.map((d) => d.id))('dessine %s sans id fixe', (id) => {
    const svg = draw(ev(id), false);
    expect(svg.querySelector(`[data-event-sprite="${id}"]`)).not.toBeNull();
    expect(svg.querySelector(`[data-event-sprite="${id}"]`)!.childElementCount).toBeGreaterThan(0);
    expect(svg.querySelector('[id]')).toBeNull();
  });
  it.each(EVENT_DEFS.map((d) => d.id))('%s : aucune animation en mouvement réduit', (id) => {
    expect(draw(ev(id), true).querySelectorAll('animate, animateTransform')).toHaveLength(0);
  });
  it('l’hélicoptère, l’ambulance et le feu d’artifice sont animés hors mouvement réduit', () => {
    for (const id of ['helicopter', 'ambulance', 'fireworks'] as const) expect(draw(ev(id), false).querySelectorAll('animate, animateTransform').length).toBeGreaterThan(0);
  });
  it('le groupe pressé porte des parapluies, le promeneur tient un chien', () => {
    expect(draw(ev('umbrella-group'), false).querySelectorAll('[data-umbrella]').length).toBe(3);
    expect(draw(ev('dog-walker'), false).querySelector('[data-dog]')).not.toBeNull();
  });
});
