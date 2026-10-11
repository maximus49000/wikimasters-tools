import type { ShopTypeId } from '../../city/shops/catalog';
import { mulberry32 } from '../../scene-world';
import { passCtx, type Pass, type ShopPaintCtx } from './ctx';
import * as alimentation from './interiors-alimentation';
import type { InteriorFn } from './kit';

// Les 32 intérieurs vus par la vitrine (G4a). Chaque intérieur trace le fond puis, après toFront(), le premier plan (comptoir,
// tables, fauteuils…) ; `paintInterior` ne garde que la passe demandée et rend la place du vendeur (repère local, bornée).
export const INTERIORS: Partial<Record<ShopTypeId, InteriorFn>> = { ...alimentation };

export function paintInterior(ctx: ShopPaintCtx, type: ShopTypeId, w: number, h: number, pass: Pass, lit: boolean, seed: number): number {
  const fn = INTERIORS[type];
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, w, h);
  ctx.clip();
  const post = fn ? fn({ x: passCtx(ctx, pass), w, h, lit, r: mulberry32((seed * 7919 + type.length) >>> 0) }) : w / 2;
  ctx.restore();
  return Math.min(w - 1, Math.max(1, post));
}
