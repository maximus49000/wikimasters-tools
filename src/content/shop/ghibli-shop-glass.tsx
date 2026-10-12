import type { ReactElement } from 'react';
import { awningDrop } from '../../core/library/paint/shop/facade';
import { ghibliPostOf } from '../../core/library/city/shops/scene/stage';
import type { ShopFrame } from '../../core/library/city/shops/slots';
import type { ShopView } from '../../core/library/city/shops/view';
import type { Sky } from '../../core/library/sky';
import { shopLookOf, shopOrigin } from './ghibli-shop-front';
import { layerBox, specOf, useShopLayer } from './shop-host';

// Premier plan d'un intérieur Ghibli (G4a) : comptoir, tables, fauteuils… et la vitre (teinte, reflet, petits bois), dessiné
// DEVANT le personnel dans le calque animé, à la place de ShopInteriorFront. Repère : celui du <svg> de la vitrine (0, 0 =
// coin haut gauche de la vitrine). Rien tant que l'image n'est pas peinte. `layer` : `front` (mobilier et vitre), ou, pour une
// boutique de la scène G4b, `furnish` (le mobilier seul, sous les acteurs) ou `glass` (la vitre seule, devant eux).
type GlassLayer = 'front' | 'furnish' | 'glass';
export function GhibliShopGlass({ view, frame, sky, layer = 'front' }: { view: ShopView; frame: ShopFrame; sky: Sky; layer?: GlassLayer }): ReactElement | null {
  const look = shopLookOf(view, frame, sky, view.sign?.type ?? null);
  const url = useShopLayer(look.type ? look : null, layer);
  if (url === null) return null;
  const o = shopOrigin(frame);
  const g = layerBox(look, layer);
  return <image data-shop-layer={layer} href={url} x={o.x + g.x - frame.window.x} y={o.y + g.y - frame.window.y} width={g.w} height={g.h} preserveAspectRatio="none" />;
}

// Devant les acteurs de la scène G4b (dans le <svg> de la vitrine, après eux) : la vitre, puis la façade elle-même, rognée à la
// vitrine — percée à la partie vitrée, elle n'y couvre que le pilastre, le soubassement, l'encadrement et les montants. Qui
// passe derrière un mur y disparaît au lieu d'être dessiné par-dessus. Même image de façade que le décor (même clé : déjà
// peinte). `shift` : hauteur cachée par le store (le <svg> de la vitrine commence sous lui).
export function GhibliWindowCover({ view, frame, sky, shift }: { view: ShopView; frame: ShopFrame; sky: Sky; shift: number }): ReactElement {
  const look = shopLookOf(view, frame, sky);
  const facade = useShopLayer(look, 'facade');
  const o = shopOrigin(frame);
  const fb = layerBox(look, 'facade');
  return (
    <g data-scene-glass="" transform={shift ? `translate(0 ${-shift})` : undefined}>
      <GhibliShopGlass view={view} frame={frame} sky={sky} layer="glass" />
      {facade !== null && (
        <image data-shop-layer="facade" href={facade} x={o.x + fb.x - frame.window.x} y={o.y + fb.y - frame.window.y} width={fb.w} height={fb.h} preserveAspectRatio="none" />
      )}
    </g>
  );
}

// Hauteur de vitrine cachée par le store Ghibli (le personnel et les clients sont rognés dessous).
export const ghibliAwningShift = (view: ShopView, frame: ShopFrame, sky: Sky): number => awningDrop(specOf(shopLookOf(view, frame, sky)));

// Place de service du vendeur en Ghibli (repère de la vitrine, comme interiorPost du classique) : celle du comptoir peint de
// l'intérieur Ghibli, décalée du pilastre quand la partie vitrée ne commence pas au bord de la vitrine.
// Règle pure partagée avec le metteur en scène G4b (scene/stage.ts).
export function ghibliStaffPost(view: ShopView, frame: ShopFrame): number {
  const type = view.sign?.type ?? view.interior;
  return type ? ghibliPostOf(type, frame.sign.w, view.slot.doorSide) : frame.window.w / 2;
}
