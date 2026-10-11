import type { ReactElement } from 'react';
import { awningDrop } from '../../core/library/paint/shop/facade';
import type { ShopFrame } from '../../core/library/city/shops/slots';
import type { ShopView } from '../../core/library/city/shops/view';
import type { Sky } from '../../core/library/sky';
import { shopLookOf, shopOrigin } from './ghibli-shop-front';
import { layerBox, specOf, useShopLayer } from './shop-host';

// Premier plan d'un intérieur Ghibli (G4a) : comptoir, tables, fauteuils… et la vitre (teinte, reflet, petits bois), dessiné
// DEVANT le personnel dans le calque animé, à la place de ShopInteriorFront. Repère : celui du <svg> de la vitrine (0, 0 =
// coin haut gauche de la vitrine). Rien tant que l'image n'est pas peinte.
export function GhibliShopGlass({ view, frame, sky }: { view: ShopView; frame: ShopFrame; sky: Sky }): ReactElement | null {
  const look = shopLookOf(view, frame, sky, view.sign?.type ?? null);
  const url = useShopLayer(look.type ? look : null, 'front');
  if (url === null) return null;
  const o = shopOrigin(frame);
  const g = layerBox(look, 'front');
  return <image data-shop-layer="front" href={url} x={o.x + g.x - frame.window.x} y={o.y + g.y - frame.window.y} width={g.w} height={g.h} preserveAspectRatio="none" />;
}

// Hauteur de vitrine cachée par le store Ghibli (le personnel et les clients sont rognés dessous).
export const ghibliAwningShift = (view: ShopView, frame: ShopFrame, sky: Sky): number => awningDrop(specOf(shopLookOf(view, frame, sky)));
