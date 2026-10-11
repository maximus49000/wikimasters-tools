// @vitest-environment jsdom
import { act, type ReactElement } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { useFigureRegistry } from '../../../src/content/figure/figure-host';
import { useCarRegistry } from '../../../src/content/vehicle/car-host';
import { ScriptedCar, placeScripted } from '../../../src/content/vehicle/scripted-car';
import { skyAt, sunTimes } from '../../../src/core/library/sky';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const sky = skyAt(12 * 60, sunTimes({ y: 2026, m: 10, d: 9 }, { lat: 48.85, lon: 2.35 }, 120));

let regs: { fig: ReturnType<typeof useFigureRegistry>; car: ReturnType<typeof useCarRegistry> } | null = null;
function Probe(): null {
  regs = { fig: useFigureRegistry(), car: useCarRegistry() };
  return null;
}
async function mount(el: ReactElement): Promise<HTMLElement> {
  const host = document.createElement('div');
  await act(async () => createRoot(host).render(<svg><Probe />{el}</svg>));
  return host;
}

describe('ScriptedCar', () => {
  it('GhibliCar à l’échelle k, éléments dynamiques en miroir pour dir −1, roues = position / k', async () => {
    const host = await mount(
      <ScriptedCar spec={{ id: 'crew-van', seed: 1 }} dir={-1} k={1.5} sky={sky} rainy={false} lights={false} still={false} roll={{ worldX: 120, move: 'transform 60s linear' }}>
        <rect data-probe="" x={-25} y={-20} width={5} height={10} />
      </ScriptedCar>,
    );
    expect(host.querySelector('[data-scripted-car]')!.getAttribute('transform')).toBe('scale(1.500)');
    expect(host.querySelector('[data-probe]')!.parentElement!.getAttribute('transform')).toBe('scale(-1.500 1.500)');
    expect(host.querySelector<SVGGElement>('[data-wheel-spin]')!.style.transform).toBe(`rotate(${(((80 / 4) * 180) / Math.PI).toFixed(2)}deg)`);
    expect(host.querySelector<SVGGElement>('[data-wheel-spin]')!.style.transition).toBe('transform 60s linear');
  });
  it('sans roll : posé par la boucle (placeScripted fait tourner les roues), teinte gardée en attribut', async () => {
    const host = await mount(<ScriptedCar spec={{ id: 'tank', seed: 1, paint: '#4B5320' }} dir={1} k={1} sky={sky} rainy={false} lights={false} still={false} />);
    const node = host.querySelector('[data-scripted-car]')!;
    expect(node.getAttribute('data-paint')).toBe('#4B5320');
    expect(host.querySelectorAll('[data-ghibli-car]')).toHaveLength(1);
    const w = (): string => host.querySelector('[data-wheel]')!.getAttribute('transform')!;
    const before = w();
    placeScripted(regs!.fig, regs!.car, node, 25, 20, 1, 3);
    expect(w()).not.toBe(before);
  });
  it('under : dessiné avant la carrosserie', async () => {
    const host = await mount(<ScriptedCar spec={{ id: 'lift', seed: 1 }} dir={1} k={1} sky={sky} rainy={false} lights={false} still under={<rect data-under="" />} />);
    const order = [...host.querySelectorAll('[data-under], [data-scripted-car]')].map((e) => (e.hasAttribute('data-under') ? 'under' : 'car'));
    expect(order).toEqual(['under', 'car']);
  });
});
