import { createElement, type ReactElement } from 'react';

// Outils de dessin des intérieurs de commerces (vus par la vitrine). Repère LOCAL : x de 0 à w, y de 0 (plafond) à h (sol) ;
// bande de sol sur les 3 px du bas (y ≥ f), plateau des comptoirs à ct (le vendeur, à l'échelle 0,5, n'en dépasse que par le buste).
// Chaque dessin s'empile dans `out` : d'abord le fond (murs, étagères), puis `front()` bascule vers le premier plan (comptoir…)
// qui passe DEVANT le vendeur. Couleurs passées en clair : `t` (assombri la nuit) est appliqué ici, sauf `on` (lumière propre :
// écrans, frigos, aquariums…). Les rectangles sont rognés à la vitrine (aucun ne déborde), aucun `transform`, aucun `id`.
export type Paint = (c: string) => string;
type Opts = { on?: boolean; op?: number; rx?: number; stroke?: string; sw?: number };

export type Kit = {
  w: number;
  h: number;
  f: number; // haut de la bande de sol
  ct: number; // plateau des comptoirs
  lit: boolean;
  t: Paint;
  back: ReactElement[];
  front: ReactElement[];
  toFront(): void;
  rect(x: number, y: number, bw: number, bh: number, c: string, o?: Opts): void;
  circle(cx: number, cy: number, r: number, c: string, o?: Opts): void;
  path(d: string, c: string, o?: Opts): void;
  line(x1: number, y1: number, x2: number, y2: number, c: string, sw: number, o?: Opts): void;
  // Éléments répétés : de `from` à `to` par pas de `step`, tant que l'élément (largeur `size`) tient.
  each(from: number, to: number, step: number, size: number, fn: (x: number, i: number) => void): void;
};

export const n = (v: number): number => Math.round(v * 100) / 100;

export function makeKit(w: number, h: number, t: Paint, lit: boolean): Kit {
  const back: ReactElement[] = [];
  const front: ReactElement[] = [];
  let out = back;
  const fill = (c: string, o?: Opts): string => (o?.on ? c : t(c));
  const extra = (o?: Opts): Record<string, unknown> => ({
    ...(o?.op !== undefined ? { opacity: o.op } : {}),
    ...(o?.stroke ? { stroke: o.on ? o.stroke : t(o.stroke), strokeWidth: o.sw ?? 0.4 } : {}),
  });
  return {
    w,
    h,
    f: h - 3,
    ct: h - 9,
    lit,
    t,
    back,
    front,
    toFront() {
      out = front;
    },
    rect(x, y, bw, bh, c, o) {
      const x0 = n(Math.max(0, x));
      const y0 = n(Math.max(0, y));
      const x1 = n(Math.min(w, x + bw));
      const y1 = n(Math.min(h, y + bh));
      if (x1 - x0 <= 0 || y1 - y0 <= 0) return;
      out.push(createElement('rect', { x: x0, y: y0, width: n(x1 - x0), height: n(y1 - y0), fill: fill(c, o), ...(o?.rx ? { rx: o.rx } : {}), ...extra(o) }));
    },
    circle(cx, cy, r, c, o) {
      out.push(createElement('circle', { cx: n(cx), cy: n(cy), r: n(r), fill: c === 'none' ? 'none' : fill(c, o), ...extra(o) }));
    },
    path(d, c, o) {
      out.push(createElement('path', { d, fill: c === 'none' ? 'none' : fill(c, o), ...extra(o) }));
    },
    line(x1, y1, x2, y2, c, sw, o) {
      out.push(createElement('line', { x1: n(x1), y1: n(y1), x2: n(x2), y2: n(y2), stroke: fill(c, o), strokeWidth: sw, strokeLinecap: 'round', ...(o?.op !== undefined ? { opacity: o.op } : {}) }));
    },
    each(from, to, step, size, fn) {
      let i = 0;
      for (let x = from; x + size <= to + 0.001; x += step) fn(x, i++);
    },
  };
}

// Chemin rapide : points [x, y] reliés et fermés.
export const poly = (pts: readonly (readonly [number, number])[]): string => `M${pts.map(([x, y]) => `${n(x)} ${n(y)}`).join(' L')}Z`;

// Mobilier partagé entre plusieurs commerces.
export function counter(k: Kit, x: number, cw: number, body: string, top: string): void {
  k.rect(x, k.ct, cw, k.h - 0.5 - k.ct, body);
  k.rect(x - 0.3, k.ct - 0.8, cw + 0.6, 1, top);
}

export function shelf(k: Kit, x: number, y: number, sw: number, c: string): void {
  k.rect(x, y, sw, 0.6, c);
}

// Petite table ronde de bistrot (plateau, pied) + une chaise de profil.
export function bistroTable(k: Kit, cx: number, cloth: string | null, wood: string): void {
  const y = k.h - 7;
  k.rect(cx - 0.3, y, 0.6, k.h - 0.5 - y, '#4A4A4A');
  k.rect(cx - 2.2, y - 0.6, 4.4, 1, cloth ?? wood, { rx: 0.4 });
  if (cloth) k.path(poly([[cx - 2.2, y + 0.4], [cx + 2.2, y + 0.4], [cx + 2.6, y + 2.6], [cx - 2.6, y + 2.6]]), cloth);
  // chaise à droite de la table
  k.rect(cx + 3, y - 2.5, 0.5, k.h - 0.5 - (y - 2.5), wood);
  k.rect(cx + 1.8, y + 1.5, 1.7, 0.6, wood);
  k.rect(cx + 1.9, y + 2.1, 0.4, k.h - 0.5 - (y + 2.1), wood);
}

export const group = (els: ReactElement[]): ReactElement => createElement('g', null, ...els);

// Ellipse en chemin (disque vu de biais, assiette, pizza…).
export const ell = (cx: number, cy: number, rx: number, ry: number): string =>
  `M${n(cx - rx)} ${n(cy)} A${n(rx)} ${n(ry)} 0 1 0 ${n(cx + rx)} ${n(cy)} A${n(rx)} ${n(ry)} 0 1 0 ${n(cx - rx)} ${n(cy)}Z`;
