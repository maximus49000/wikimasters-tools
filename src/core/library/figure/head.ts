// src/core/library/figure/head.ts
import type { Hair } from '../city/people';
import { CAM_CA, CAM_SA, type P2 } from './geometry';
import type { Frame3 } from './skeleton';

// Cheveux, bonnet et casquette du pantin : un champ f(élévation, azimut) sur la sphère de la tête (> 0 = cheveux), évalué
// sur l'hémisphère visible ; le contour est tiré par marching squares (ligne de front nette, pas d'enveloppe convexe) puis
// fermé le long du cercle de la tête. Azimut 0 = devant le visage, élévation π/2 = sommet.
export type HairField = (el: number, az: number) => number;

export function hairField(hair: Hair): HairField | null {
  if (hair === 'bald') return null;
  if (hair === 'beanie') return (el) => el - 0.18;
  if (hair === 'cap') return (el) => el - 0.3;
  const low = hair === 'long' ? 0.95 : 0.32;
  return (el, az) => Math.max(el - (0.5 - 0.32 * Math.max(0, -Math.cos(az)) - 0.12 * Math.abs(Math.sin(az))), Math.min(-Math.cos(az) - 0.25, el + low));
}

// Père Noël (G5, maquette g5-fetes) : champs sur la même sphère. Bonnet jusqu'aux sourcils (`el − 0,5`) posé sur une calotte
// de fourrure (`el − 0,36`) : le bord de fourrure est la bande [0,36 ; 0,5] qui dépasse (un anneau ouvert des deux côtés se
// fermait mal). Barbe : part des pommettes (plus haute sur les côtés), contourne la bouche au centre, s'arrête sous le menton
// (la masse qui pend est une enveloppe à part, bake.ts). Moustache en deux mèches de part et d'autre du nez ; sourcils :
// deux taches au-dessus des yeux (élévation 0,26, azimuts ±0,4).
export const SANTA_FIELDS = {
  fur: (el: number): number => el - 0.36,
  hat: (el: number): number => el - 0.5,
  beard: (el: number, az: number): number => {
    const a = Math.abs(az);
    return Math.min(-0.55 - el + 0.35 * Math.min(1, a / 1.2) - 0.15 * Math.max(0, 1 - a / 0.45), 1.45 - a, el + 1.5);
  },
  mustL: (el: number, az: number): number => Math.min(el + 0.56 - 0.1 * Math.abs(az), -0.34 - el, 0.75 - Math.abs(az), -az - 0.05),
  mustR: (el: number, az: number): number => Math.min(el + 0.56 - 0.1 * Math.abs(az), -0.34 - el, 0.75 - Math.abs(az), az - 0.05),
  browL: (el: number, az: number): number => Math.min(0.06 - Math.abs(el - 0.26), 0.2 - Math.abs(az + 0.4)),
  browR: (el: number, az: number): number => Math.min(0.06 - Math.abs(el - 0.26), 0.2 - Math.abs(az - 0.4)),
} as const satisfies Record<string, HairField>;
export type SantaField = keyof typeof SANTA_FIELDS;

const N = 22;
const U = [0, CAM_CA, -CAM_SA] as const;
const V = [0, CAM_SA, CAM_CA] as const;

// Polygones (repère écran, centre de la tête en (0, 0)) de la région où field > 0.
export function headRegion(hr: number, hf: Frame3, field: HairField): P2[][] {
  const cell = (2 * hr) / N;
  const fAt = (dx0: number, dy0: number): number => {
    let dx = dx0;
    let dy = dy0;
    const d = Math.hypot(dx, dy);
    if (d > hr * 0.995) {
      dx *= (hr * 0.995) / d;
      dy *= (hr * 0.995) / d;
    }
    const cz = Math.sqrt(Math.max(0, hr * hr - dx * dx - dy * dy));
    const n = [dx / hr, (-dy * U[1] + cz * V[1]) / hr, (-dy * U[2] + cz * V[2]) / hr] as const;
    const f = n[0] * hf.F[0] + n[2] * hf.F[2];
    const l = n[0] * hf.R[0] + n[2] * hf.R[2];
    return field(Math.asin(Math.max(-1, Math.min(1, n[1]))), Math.atan2(l, f));
  };
  const val: number[][] = [];
  for (let i = 0; i <= N; i++) {
    val.push([]);
    for (let j = 0; j <= N; j++) val[i]!.push(fAt(-hr + i * cell, -hr + j * cell));
  }
  const pt = (i: number, j: number): P2 => [-hr + i * cell, -hr + j * cell];
  const lerp = (a: P2, b: P2, va: number, vb: number): P2 => {
    const t = va / (va - vb);
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  };
  // Segments du contour, chaque point d'arête calculé dans un ordre canonique (mêmes coordonnées des deux côtés).
  const segs: [P2, P2][] = [];
  for (let i = 0; i < N; i++)
    for (let j = 0; j < N; j++) {
      const c: [number, number][] = [[i, j], [i + 1, j], [i + 1, j + 1], [i, j + 1]];
      const vs = c.map(([a, b]) => val[a]![b]!);
      const e: P2[] = [];
      for (let k = 0; k < 4; k++) {
        let a = k;
        let b = (k + 1) % 4;
        if (vs[a]! > 0 === vs[b]! > 0) continue;
        if (c[a]![0] * 99 + c[a]![1] > c[b]![0] * 99 + c[b]![1]) [a, b] = [b, a];
        e.push(lerp(pt(...c[a]!), pt(...c[b]!), vs[a]!, vs[b]!));
      }
      if (e.length === 2) segs.push([e[0]!, e[1]!]);
      else if (e.length === 4) segs.push([e[0]!, e[1]!], [e[2]!, e[3]!]);
    }
  // Chaînage des segments en lignes, prolongées par les deux bouts.
  const key = (q: P2): string => `${q[0].toFixed(3)},${q[1].toFixed(3)}`;
  const adj = new Map<string, P2[]>();
  for (const [a, b] of segs)
    for (const [x, y] of [[a, b], [b, a]] as const) {
      const k = key(x);
      if (!adj.has(k)) adj.set(k, []);
      adj.get(k)!.push(y);
    }
  const used = new Set<string>();
  const mark = (a: P2, b: P2): void => {
    used.add(`${key(a)}|${key(b)}`);
    used.add(`${key(b)}|${key(a)}`);
  };
  const lines: P2[][] = [];
  for (const [a, b] of segs) {
    if (used.has(`${key(a)}|${key(b)}`)) continue;
    const line: P2[] = [a, b];
    mark(a, b);
    for (const end of [1, 0]) {
      for (let guard = 0; guard < 4000; guard++) {
        const last = end ? line[line.length - 1]! : line[0]!;
        const nx = (adj.get(key(last)) ?? []).find((q) => !used.has(`${key(last)}|${key(q)}`));
        if (!nx) break;
        mark(last, nx);
        if (end) line.push(nx);
        else line.unshift(nx);
      }
    }
    lines.push(line);
  }
  const clamp = (q: P2): P2 => {
    const d = Math.hypot(q[0], q[1]);
    return d > hr ? [(q[0] * hr) / d, (q[1] * hr) / d] : q;
  };
  const arc = (from: number, to: number, dir: 1 | -1): P2[] => {
    let d = to - from;
    if (dir > 0 && d < 0) d += 2 * Math.PI;
    if (dir < 0 && d > 0) d -= 2 * Math.PI;
    const P: P2[] = [];
    for (let k = 1; k < 12; k++) {
      const t = from + (d * k) / 12;
      P.push([hr * Math.cos(t), hr * Math.sin(t)]);
    }
    return P;
  };
  const out: P2[][] = [];
  for (const raw of lines) {
    let line = raw.map(clamp);
    const a = raw[0]!;
    const b = raw[raw.length - 1]!;
    if (Math.hypot(a[0] - b[0], a[1] - b[1]) > cell * 0.5) {
      // Ligne ouverte (elle sort du disque) : fermée par l'arc du cercle qui est du côté des cheveux.
      const aa = Math.atan2(line[line.length - 1]![1], line[line.length - 1]![0]);
      const ab = Math.atan2(line[0]![1], line[0]![0]);
      const p1 = arc(aa, ab, 1);
      const p2 = arc(aa, ab, -1);
      const inside = (P: P2[]): boolean => fAt(P[5]![0] * 0.9, P[5]![1] * 0.9) > 0;
      line = line.concat(inside(p1) ? p1 : p2);
    }
    if (line.length > 2) out.push(line);
  }
  // Aucun contour mais le centre est dans la région (vue de dos) : le disque entier.
  if (!out.length && fAt(0, 0) > 0) {
    const P: P2[] = [];
    for (let k = 0; k < 32; k++) P.push([hr * Math.cos((k / 32) * 2 * Math.PI), hr * Math.sin((k / 32) * 2 * Math.PI)]);
    out.push(P);
  }
  return out;
}
