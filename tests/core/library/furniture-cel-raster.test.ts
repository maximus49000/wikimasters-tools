import { describe, expect, it } from 'vitest';
import { place, part, superEll } from '../../../src/core/library/cel/mesh';
import { celJob, renderCel } from '../../../src/core/library/cel/raster';
import { ROOM_CAMERA } from '../../../src/core/library/cel/camera';
import { tone } from '../../../src/core/library/cel/tone';

const T = tone('#C9744F');
const ball = () => [part(place(superEll(20, 20, 20, 1, 1), { t: [0, 20, 0] }), T)];
const view = { cam: ROOM_CAMERA, yaw: 0, side: 'right' as const, px: 2, ss: 1 };
const hex = (img: { rgba: Uint8ClampedArray }, i: number) => '#' + [0, 1, 2].map((k) => img.rgba[i * 4 + k]!.toString(16).padStart(2, '0')).join('').toUpperCase();
const opaque = (img: { rgba: Uint8ClampedArray; w: number; h: number }) => Array.from({ length: img.w * img.h }, (_, i) => i).filter((i) => img.rgba[i * 4 + 3] === 255);

describe('moteur cellulo', () => {
  it('déterministe', () => expect(renderCel(ball(), view).rgba).toEqual(renderCel(ball(), view).rgba));
  it('à ss = 1, un corps n’a que base, ombre, rehaut et encre', () => {
    const img = renderCel(ball(), { ...view, shadow: null });
    expect(new Set(opaque(img).map((i) => hex(img, i)))).toEqual(new Set([T.base, T.shade, T.hi, '#2A1A18'].map((c) => c.toUpperCase())));
  });
  it('silhouette encrée : le premier pixel opaque de chaque ligne est de l’encre', () => {
    const img = renderCel(ball(), { ...view, shadow: null });
    for (let y = 0; y < img.h; y++) {
      const x = [...Array(img.w).keys()].find((x) => img.rgba[(y * img.w + x) * 4 + 3] === 255);
      if (x !== undefined) expect(hex(img, y * img.w + x)).toBe('#2A1A18');
    }
  });
  it('ombre portée à l’opposé de la lumière, translucide', () => {
    const img = renderCel(ball(), view);
    const shade = [...Array(img.w * img.h).keys()].filter((i) => img.rgba[i * 4 + 3]! > 0 && img.rgba[i * 4 + 3]! < 255);
    const cx = shade.reduce((s, i) => s + (i % img.w), 0) / shade.length;
    expect(cx).toBeLessThan(img.ox); // lumière à droite → ombre à gauche
  });
  it('z-buffer : la boule de devant cache celle de derrière', () => {
    const front = part(place(superEll(10, 10, 10, 1, 1), { t: [0, 20, 30] }), tone('#2F7D64'));
    const img = renderCel([...ball(), front], { ...view, shadow: null });
    const centre = Math.round(img.oy - 20 * view.px) * img.w + Math.round(img.ox);
    expect([tone('#2F7D64').base, tone('#2F7D64').shade, tone('#2F7D64').hi].map((c) => c.toUpperCase())).toContain(hex(img, centre));
  });
  it('jamais de miroir : yaw et −yaw ne donnent pas deux images symétriques', () => {
    const asym = () => [...ball(), part(place(superEll(6, 6, 6, 1, 1), { t: [18, 30, 10] }), tone('#2F7D64'))];
    const a = renderCel(asym(), { ...view, yaw: Math.PI / 4 });
    const b = renderCel(asym(), { ...view, yaw: -Math.PI / 4 });
    const mirrored = new Uint8ClampedArray(b.rgba.length);
    for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) mirrored.set(b.rgba.subarray((y * b.w + b.w - 1 - x) * 4, (y * b.w + b.w - x) * 4), (y * b.w + x) * 4);
    expect(a.w === b.w && a.rgba.every((v, i) => v === mirrored[i])).toBe(false);
  });
  it('par tranches = d’un coup', () => {
    const job = celJob(ball(), view);
    let clock = 0;
    while (!job.step(1, () => (clock += 0.4)));
    expect(job.image().rgba).toEqual(renderCel(ball(), view).rgba);
  });
});
