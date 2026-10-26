import { describe, expect, it } from 'vitest';
import { bent, lathe, place, part, superEll } from '../../../src/core/library/cel/mesh';
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
  it('bent garde les normales vers l’extérieur, même quand la déformation est un miroir ou un échange d’axes', () => {
    const ball = superEll(10, 6, 4, 0.5, 0.5, 10, 16);
    const outward = (m: ReturnType<typeof bent>) => {
      const c = m.v.reduce((a, v) => [a[0] + v[0] / m.v.length, a[1] + v[1] / m.v.length, a[2] + v[2] / m.v.length], [0, 0, 0]);
      return m.v.filter((v, i) => (v[0] - c[0]) * m.n[i]![0] + (v[1] - c[1]) * m.n[i]![1] + (v[2] - c[2]) * m.n[i]![2] > 0).length / m.v.length;
    };
    expect(outward(bent(ball, (x, y, z) => [x, y + 0.02 * x * x, z]))).toBeGreaterThan(0.95); // cintrage
    expect(outward(bent(ball, (x, y, z) => [-x, y, z]))).toBeGreaterThan(0.95); // miroir
    expect(outward(bent(ball, (x, y, z) => [x + 30, -z, y]))).toBeGreaterThan(0.95); // rotation (échange d'axes sans miroir)
    expect(outward(bent(ball, (x, y, z) => [x, z, y]))).toBeGreaterThan(0.95); // échange d'axes (miroir)
  });
  it('lathe : l’option center fixe le point d’où les triangles sont orientés « vers l’extérieur » (surface ouverte, dôme d’abat-jour)', () => {
    // Un anneau plat (profil à y constant) : sans `center`, le milieu du profil est dans son plan et l'orientation est indécise ;
    // avec un centre sous lui, toutes les normales regardent en haut ; au-dessus, en bas.
    const ring = (center: [number, number, number]) => lathe([[5, 0], [14, 0]], 16, undefined, { caps: false, center });
    expect(ring([0, -4, 0]).n.every((n) => n[1] > 0.99)).toBe(true);
    expect(ring([0, 4, 0]).n.every((n) => n[1] < -0.99)).toBe(true);
    // Dôme ouvert vers le bas (l'abat-jour du lampadaire arc, maquette l. 293) : centre dans le creux → normales vers le dehors (haut).
    const dome = lathe([[14, -17], [13.6, -15.5], [5.5, 0], [0, 0]], 28, undefined, { caps: false, center: [0, -4, 0] });
    expect(dome.n.filter((n) => n[1] > 0).length / dome.n.length).toBeGreaterThan(0.9);
    // Sans l'option : même comportement qu'avant (centre au milieu des hauteurs).
    expect(lathe([[14, -17], [5.5, 0], [0, 0]], 12).n).toEqual(lathe([[14, -17], [5.5, 0], [0, 0]], 12, undefined, { center: [0, -8.5, 0] }).n);
  });
});
