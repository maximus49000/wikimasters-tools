// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { registerProps } from '../../src/core/library/paint/props/index';
import { RD } from '../../src/core/library/paint/props/kit';
import { paintProp, PropContext, PropImage, PropRegistry, propKey, type PropSpec, type PropSurface } from '../../src/content/prop/prop-host';
import { recordingCtx, type RecordingCtx } from '../core/library/paint/recording-ctx';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

registerProps({
  test: { box: () => [-2, -4, 4, 4], frames: 4, paint: (x) => { x.fillStyle = '#ff0000'; x.fillRect(-2, -4, 4, 4); } },
  // Cadre asymétrique : retourné en [-4, -4, 4, 4] pour dir = −1.
  asym: { box: () => [0, -4, 4, 4], paint: (x) => RD(x, 0, -4, 4, 4, '#C0302B') },
  // Élément allumé : corps teint, verre dans glowing().
  lamp: {
    box: () => [0, -4, 4, 4],
    paint: (x) => {
      x.fillStyle = '#ff0000';
      x.fillRect(0, -4, 4, 2);
      x.glowing(() => {
        x.fillStyle = '#ffff00';
        x.fillRect(0, -2, 4, 2);
      });
    },
  },
});

// Faux canvas : contexte enregistreur (+ setTransform/clearRect ignorés).
function fakeSurface(): { surf: PropSurface; ctx: RecordingCtx } {
  const ctx = Object.assign(recordingCtx(), { setTransform: () => undefined, clearRect: () => undefined });
  return { ctx, surf: { canvas: { width: 0, height: 0, toDataURL: () => 'data:image/png;base64,' }, ctx } };
}

// Abscisses MONDE de la première bande d'ombre (1er fillRect), sous le retournement `scale(dir, 1)` posé par l'hôte.
function shadowWorld(spec: PropSpec): [number, number] {
  const { surf, ctx } = fakeSurface();
  paintProp(spec, surf);
  const sx = ctx.ops.find((o) => o.op === 'scale')!.args[0]!;
  const [x, , w] = ctx.ops.find((o) => o.op === 'fillRect')!.args as [number, number, number, number];
  return [Math.min(sx * x, sx * (x + w)), Math.max(sx * x, sx * (x + w))];
}

function mount() {
  const jobs: (() => void)[] = [];
  const reg = new PropRegistry('t', { schedule: (cb) => jobs.push(cb) });
  const host = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  const root = createRoot(host);
  const show = (spec: PropSpec) => root.render(<PropContext.Provider value={reg}><PropImage spec={spec} fallback={<rect data-classic="" />} /></PropContext.Provider>);
  return { jobs, host, show };
}

describe('registre des accessoires', () => {
  it('clé : lumière quantifiée, frame modulo frames, args triés', () => {
    expect(propKey({ id: 'test', args: { b: 1, a: 2 }, day: 0.53, frame: 5 })).toBe(propKey({ id: 'test', args: { a: 2, b: 1 }, day: 0.5, frame: 1 }));
    expect(propKey({ id: 'test', day: 0.1, lit: true })).not.toBe(propKey({ id: 'test', day: 0.1 }));
  });
  it('clé : orientation distincte, arguments sans collision, allumé garde le jour', () => {
    expect(propKey({ id: 'test', dir: -1, day: 1 })).not.toBe(propKey({ id: 'test', dir: 1, day: 1 }));
    expect(propKey({ id: 'test', args: { a: '1,b=2' }, day: 1 })).not.toBe(propKey({ id: 'test', args: { a: 1, b: 2 }, day: 1 }));
    expect(propKey({ id: 'test', lit: true, day: 0 })).not.toBe(propKey({ id: 'test', lit: true, day: 1 }));
  });
  it('dir = −1 : l’hôte retourne le canvas, l’ombre reste à droite du monde', () => {
    const right = shadowWorld({ id: 'asym', day: 1 }); // cadre monde [0, 4]
    const left = shadowWorld({ id: 'asym', day: 1, dir: -1 }); // cadre monde [−4, 0]
    expect((right[0] + right[1]) / 2).toBeGreaterThan(2);
    expect((left[0] + left[1]) / 2).toBeGreaterThan(-2);
    expect(left[1]).toBeLessThanOrEqual(1); // dans le cadre retourné (à 1 près : débord rogné par le chemin)
  });
  it('allumé la nuit : le corps reste teint, seul glowing() garde sa couleur', () => {
    const { surf, ctx } = fakeSurface();
    paintProp({ id: 'lamp', day: 0, lit: true }, surf);
    expect(ctx.fills[0]).not.toBe('#ff0000');
    expect(ctx.fills[1]).toBe('#ffff00');
  });
  it('rend le repli tant que l’image n’est pas cuite, puis l’image ; garde l’ancienne image au changement de lumière', async () => {
    const { jobs, host, show } = mount();
    await act(async () => show({ id: 'test', day: 1 }));
    expect(host.querySelector('[data-classic]')).not.toBeNull();
    await act(async () => jobs.shift()!());
    const href = host.querySelector('image')!.getAttribute('href');
    expect(href).not.toBeNull();
    await act(async () => show({ id: 'test', day: 0 }));
    expect(host.querySelector('image')!.getAttribute('href')).toBe(href); // pas de retour au repli ni de trou
    expect(host.querySelector('[data-classic]')).toBeNull();
    await act(async () => jobs.shift()!());
    expect(host.querySelector('image')).not.toBeNull();
    expect(host.querySelector('[data-classic]')).toBeNull();
  });
  it('dir = −1 : <image> au cadre retourné', async () => {
    const { jobs, host, show } = mount();
    await act(async () => show({ id: 'asym', day: 1, dir: -1 }));
    await act(async () => jobs.shift()!());
    expect(host.querySelector('image')!.getAttribute('x')).toBe('-4');
  });
  it('autre peintre ou autre orientation : repli, jamais l’ancienne image', async () => {
    const { jobs, host, show } = mount();
    await act(async () => show({ id: 'test', day: 1 }));
    await act(async () => jobs.shift()!());
    await act(async () => show({ id: 'asym', day: 1 }));
    expect(host.querySelector('image')).toBeNull();
    expect(host.querySelector('[data-classic]')).not.toBeNull();
    await act(async () => jobs.shift()!());
    expect(host.querySelector('image')!.getAttribute('x')).toBe('0');
    await act(async () => show({ id: 'asym', day: 1, dir: -1 }));
    expect(host.querySelector('image')).toBeNull();
  });
});
