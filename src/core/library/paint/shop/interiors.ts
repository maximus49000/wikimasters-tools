import type { ShopTypeId } from '../../city/shops/catalog';
import { mulberry32 } from '../../scene-world';
import { passCtx, type Pass, type ShopPaintCtx } from './ctx';
import * as alimentation from './interiors-alimentation';
import * as boutiques from './interiors-boutiques';
import * as restauration from './interiors-restauration';
import * as services from './interiors-services';
import type { InteriorFn } from './kit';

// Les 32 intérieurs vus par la vitrine (G4a). Chaque intérieur trace le fond puis, après toFront(), le premier plan (comptoir,
// tables, fauteuils…) ; `paintInterior` ne garde que la passe demandée et rend la place du vendeur (repère local, bornée).
export const INTERIORS: Readonly<Record<ShopTypeId, InteriorFn>> = { ...alimentation, ...boutiques, ...services, ...restauration };

export function paintInterior(ctx: ShopPaintCtx, type: ShopTypeId, w: number, h: number, pass: Pass, lit: boolean, seed: number): number {
  const fn = INTERIORS[type];
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, w, h);
  ctx.clip();
  const post = fn({ x: passCtx(ctx, pass), w, h, lit, r: mulberry32((seed * 7919 + type.length) >>> 0) });
  ctx.restore();
  return Math.min(w - 1, Math.max(1, post));
}

// Contexte muet : chaque tracé est ignoré (le calcul de la place du vendeur n'a pas besoin de dessiner).
const MUTE = new Proxy({} as ShopPaintCtx, {
  get: (_t, key) => (key === 'measureText' ? () => ({ width: 0 }) : () => undefined),
  set: () => true,
});
const posts = new Map<string, number>();

// Place du vendeur d'un intérieur (repère de la partie vitrée), sans peindre ; gardée par (métier, largeur, hauteur).
export function interiorPostOf(type: ShopTypeId, w: number, h: number): number {
  const key = `${type}|${w}|${h}`;
  let p = posts.get(key);
  if (p === undefined) posts.set(key, (p = paintInterior(MUTE, type, w, h, 'back', false, 1)));
  return p;
}
