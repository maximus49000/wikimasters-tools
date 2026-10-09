// @vitest-environment jsdom
// tests/content/city-sprites.test.tsx
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { EntranceSprite, LampSprite, PersonSprite, VehicleSprite } from '../../src/content/city-sprites';
import { outfitFor } from '../../src/core/library/city/people';
import { LANE_DIR, vehiclesFor } from '../../src/core/library/city/vehicles';
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
