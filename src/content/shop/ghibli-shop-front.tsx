import type { ReactElement, ReactNode } from 'react';
import { FAMILY } from '../../core/library/paint/shop/families';
import { GROUND_FLOOR_H } from '../../core/library/paint/shop/facade';
import { SHOP_DEFS, type ShopTypeId } from '../../core/library/city/shops/catalog';
import type { ShopFrame } from '../../core/library/city/shops/slots';
import type { ShopView } from '../../core/library/city/shops/view';
import { hashString } from '../../core/library/scene-world';
import type { Sky } from '../../core/library/sky';
import { tone } from '../city-sprites';
import type { InteriorSlices } from '../shop-interiors';
import { EMPTY_WINDOW } from '../shop-sprites';
import { layerBox, quantDay, useShopLayer, type ShopLook } from './shop-host';

// Devanture Ghibli d'un local (G4a) : fond de la vitrine (intérieur peint) dans le <svg> imbriqué de la vitrine, façade
// percée par-dessus, et la nuit la flaque de lumière de la vitrine sur le trottoir et son reflet sur la chaussée (bords
// nets, comme les flaques des lampadaires). Tant que la façade n'est pas peinte, la devanture classique (`children`)
// reste affichée. Repère : le local commence à frame.sign.x, le haut du rez-de-chaussée est frame.sign.y − 2. Aucun id.

// Boutique éclairée : ouverte et assez sombre dehors (même seuil que le personnel et les clients).
export const litNow = (view: ShopView, sky: Sky): boolean => view.phase === 'open' && sky.daylight < 0.45;

export function shopLookOf(view: ShopView, frame: ShopFrame, sky: Sky, type: ShopTypeId | null = view.sign?.type ?? null): ShopLook {
  const state = view.phase === 'for-sale' ? 'empty' : view.phase;
  return {
    type,
    name: view.sign?.name ?? '',
    w: frame.sign.w,
    h: frame.window.h,
    doorSide: view.slot.doorSide,
    state,
    placard: view.placard,
    day: quantDay(sky.daylight),
    lit: litNow(view, sky),
    seed: hashString(view.slot.id),
  };
}

// Origine du local dans le monde.
export const shopOrigin = (frame: ShopFrame): { x: number; y: number } => ({ x: frame.sign.x, y: frame.sign.y - 2 });

type Props = { view: ShopView; frame: ShopFrame; sky: Sky; curb: number; interior: ShopTypeId | null; slices?: InteriorSlices; children?: ReactNode };

export function GhibliShopFront({ view, frame, sky, curb, interior, slices, children }: Props): ReactElement {
  const look = shopLookOf(view, frame, sky);
  const back: ShopLook = { ...look, type: interior };
  const facade = useShopLayer(look, 'facade');
  const backUrl = useShopLayer(interior ? back : null, 'back');
  if (facade === null) return <>{children}</>;
  const o = shopOrigin(frame);
  const win = frame.window;
  const fb = layerBox(look, 'facade');
  const glass = layerBox(back, 'back');
  const hidden = slices ? Math.min(slices.n, Math.max(0, slices.n - slices.shown)) : 0;
  const cut = (hidden * win.w) / (slices?.n ?? 1);
  const empty = tone(EMPTY_WINDOW, sky);
  const ground = o.y + GROUND_FLOOR_H;
  const family = look.type ? FAMILY[look.type] : null;
  const pool = look.lit ? (family === 'F' && look.type ? SHOP_DEFS[look.type].ink : '#FFD78C') : null;
  return (
    <g data-ghibli-shop={view.slot.id} data-shop-phase={view.phase}>
      <svg x={win.x} y={win.y} width={win.w} height={win.h} overflow="hidden">
        <rect x={0} y={0} width={win.w} height={win.h} fill={empty} />
        {backUrl !== null && (
          <image data-shop-layer="back" href={backUrl} x={o.x + glass.x - win.x} y={o.y + glass.y - win.y} width={glass.w} height={glass.h} preserveAspectRatio="none" />
        )}
        {hidden > 0 && <rect data-slices-cover="" x={slices!.doorRight ? win.w - cut : 0} y={0} width={cut} height={win.h} fill={empty} />}
      </svg>
      <image data-shop-layer="facade" href={facade} x={o.x + fb.x} y={o.y + fb.y} width={fb.w} height={fb.h} preserveAspectRatio="none" />
      {pool && (
        <g data-shop-pool="" fill={pool}>
          <polygon points={`${win.x},${ground} ${win.x + win.w},${ground} ${win.x + win.w + 6},${curb} ${win.x - 6},${curb}`} opacity={family === 'F' ? 0.2 : 0.26} />
          <rect x={win.x + 2} y={curb + 3} width={Math.max(0, win.w - 4)} height={6} opacity={family === 'F' ? 0.16 : 0.22} />
        </g>
      )}
    </g>
  );
}
