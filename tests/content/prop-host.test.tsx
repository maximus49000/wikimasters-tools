// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { registerProps } from '../../src/core/library/paint/props/index';
import { PropContext, PropImage, PropRegistry, propKey } from '../../src/content/prop/prop-host';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

registerProps({ test: { box: () => [-2, -4, 4, 4], frames: 4, paint: (x) => { x.fillStyle = '#ff0000'; x.fillRect(-2, -4, 4, 4); } } });

describe('registre des accessoires', () => {
  it('clé : lumière quantifiée, frame modulo frames, args triés', () => {
    expect(propKey({ id: 'test', args: { b: 1, a: 2 }, day: 0.53, frame: 5 })).toBe(propKey({ id: 'test', args: { a: 2, b: 1 }, day: 0.5, frame: 1 }));
    expect(propKey({ id: 'test', day: 0.1, lit: true })).not.toBe(propKey({ id: 'test', day: 0.1 }));
  });
  it('rend le repli tant que l’image n’est pas cuite, puis l’image ; garde l’ancienne image au changement de lumière', async () => {
    const jobs: (() => void)[] = [];
    const reg = new PropRegistry('t', { schedule: (cb) => jobs.push(cb) });
    const host = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const root = createRoot(host);
    const show = (day: number) => root.render(<PropContext.Provider value={reg}><PropImage spec={{ id: 'test', day }} fallback={<rect data-classic="" />} /></PropContext.Provider>);
    await act(async () => show(1));
    expect(host.querySelector('[data-classic]')).not.toBeNull();
    await act(async () => jobs.shift()!());
    expect(host.querySelector('image')).not.toBeNull();
    await act(async () => show(0));
    expect(host.querySelector('image')).not.toBeNull(); // pas de retour au repli ni de trou
    expect(host.querySelector('[data-classic]')).toBeNull();
  });
});
