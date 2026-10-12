import type { TintedCtx } from '../shop/ctx';

// Peintres des accessoires de rue Ghibli (G5 : mobilier, lampadaires, fêtes, événements). Chaque fichier de groupe déclare
// ses peintres par registerProps ; l'hôte (content/prop/prop-host.tsx) les cuit en images, une par clé.
export type PropArgs = Readonly<Record<string, string | number | boolean>>;
// Lumière et pose : `day` jour quantifié (1/8), `lit` élément allumé (couleurs de jour, lumières dans glowing()),
// `dir` orientation (déjà passée à `facing` du kit), `frame` pose clé déjà réduite modulo `frames`.
export type PropPaint = { day: number; lit: boolean; dir: 1 | -1; frame: number };
// `box` : cadre [x, y, w, h] dans le repère du sprite classique, orienté vers +x (l'hôte le retourne pour dir = −1 : le
// peintre dessine alors en miroir autour de x = 0). `frames` : nombre de poses clés (1 par défaut).
export type PropPainter = {
  box(a: PropArgs): readonly [number, number, number, number];
  frames?: number;
  paint(x: TintedCtx, a: PropArgs, p: PropPaint): void;
};

export const PROPS: Record<string, PropPainter> = {};

export function registerProps(group: Record<string, PropPainter>): void {
  Object.assign(PROPS, group);
}
