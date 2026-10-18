import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { ShopTypeId } from '../../core/library/city/shops/catalog';
import type { Sky } from '../../core/library/sky';
import { tintedCtx, type ShopPaintCtx } from '../../core/library/paint/shop/ctx';
import { FACADE_MARGIN, GROUND_FLOOR_H, facadeGeometry, paintFacade, paintGlass, type FacadeSpec, type FacadeState } from '../../core/library/paint/shop/facade';
import { paintInterior } from '../../core/library/paint/shop/interiors';
import { tone } from '../city-sprites';
import { BLANK_SPRITE } from '../figure/figure-host';
import { PaintRegistry, paintSurface, quantDay } from '../paint-registry';
import type { LightBlob } from '../../core/library/city/night-light';
import { LAMP_TINT, buffers, noCanvas, tintAndMask } from '../painted-city';

// Images peintes des commerces (G4a) : chaque local est peint UNE fois par clé sur un canvas hors écran, en trois couches
// (fond de la vitrine, premier plan devant le personnel avec la vitre, façade percée à la vitrine), puis gardé en PNG
// (data URL : la CSP du site refuse blob:). Lumière au 1/8 de jour ; boutique éclairée : intérieur aux couleurs de jour,
// néons sans teinte. Les peintures sont étalées (1 couche par image, ≈ 4,5 ms sur ordinateur) ; tant qu'une couche n'est pas prête, l'appelant garde la
// précédente (useShopLayer).
export const SHOP_PX = 4;
// `front` = premier plan (comptoir, tables…) et vitre ; la scène des commerces (G4b) les sépare : `furnish` (le mobilier, sous
// les acteurs) et `glass` (la vitre seule : teinte, reflet, petits bois, montants, devant les acteurs).
export type ShopLayer = 'back' | 'front' | 'facade' | 'furnish' | 'glass';
export type ShopLook = { type: ShopTypeId | null; name: string; w: number; h: number; doorSide: 'left' | 'right'; state: FacadeState; placard: boolean; day: number; lit: boolean; seed: number };

export { quantDay };

export function shopKey(l: ShopLook, layer: ShopLayer): string {
  const common = `${layer}|${l.type ?? '-'}|${l.w.toFixed(1)}|${l.h.toFixed(1)}|${l.doorSide}|${l.state}|${l.lit ? 'L' : l.day}|${l.seed}`;
  return layer === 'facade' ? `${common}|${l.name}|${l.day}|${l.placard ? 'P' : ''}` : common;
}

export const specOf = (l: ShopLook): FacadeSpec => ({ type: l.type, name: l.name, w: l.w, doorSide: l.doorSide, state: l.state, placard: l.placard, night: l.day < 0.5, lit: l.lit });

// Cadre d'une couche dans le repère du local (fond et premier plan : la partie vitrée ; façade : le local et ses débords).
export function layerBox(l: ShopLook, layer: ShopLayer): { x: number; y: number; w: number; h: number } {
  if (layer !== 'facade') return facadeGeometry(specOf(l)).glass;
  return { x: -FACADE_MARGIN.left, y: -FACADE_MARGIN.top, w: l.w + FACADE_MARGIN.left + FACADE_MARGIN.right, h: GROUND_FLOOR_H + FACADE_MARGIN.top + FACADE_MARGIN.bottom };
}

export function paintShopLayer(l: ShopLook, layer: ShopLayer): string {
  const s = paintSurface();
  if (!s) return BLANK_SPRITE;
  const box = layerBox(l, layer);
  const { canvas, ctx } = s;
  canvas.width = Math.max(1, Math.ceil(box.w * SHOP_PX));
  canvas.height = Math.max(1, Math.ceil(box.h * SHOP_PX));
  ctx.setTransform(SHOP_PX, 0, 0, SHOP_PX, -box.x * SHOP_PX, -box.y * SHOP_PX);
  ctx.clearRect(box.x, box.y, box.w, box.h);
  const sky = { daylight: l.day } as Sky;
  const tint = (c: string): string => tone(c, sky);
  const raw = ctx as unknown as ShopPaintCtx;
  if (layer === 'facade') {
    paintFacade(tintedCtx(raw, tint), specOf(l));
  } else if (l.type) {
    // Intérieur éclairé : couleurs de jour ; sinon la teinte de la lumière du moment.
    const t = tintedCtx(raw, l.lit ? (c: string) => c : tint);
    ctx.translate(box.x, box.y);
    if (layer !== 'glass') paintInterior(t, l.type, box.w, box.h, layer === 'back' ? 'back' : 'front', l.lit || l.day >= 0.5, l.seed);
    if (layer === 'front' || layer === 'glass') paintGlass(t, specOf(l), box.w, box.h);
  }
  return canvas.toDataURL('image/png');
}

// 4 calques Ghibli par boutique (fond, mobilier, vitre, façade) × ~60 boutiques de la rue la plus large
// (MAX_COLS) + marge : le plafond ne doit jamais évincer la vitre/façade, sinon les murs disparaissent.
export class ShopRegistry extends PaintRegistry {
  constructor(label: string, opts: { max?: number; perFrame?: number; schedule?: (cb: () => void) => void } = {}) {
    super(label, { max: 400, perFrame: 1, ...opts });
  }
}

export const ShopContext = createContext<ShopRegistry | null>(null);

// Image de la couche pour `look` ; tant qu'elle n'est pas peinte, la dernière montrée par ce composant (pas de trou), ou
// null ; `look` null efface la mémoire (jamais l'image d'un intérieur parti).
export function useShopLayer(look: ShopLook | null, layer: ShopLayer): string | null {
  const reg = useContext(ShopContext);
  const [, bump] = useState(0);
  const last = useRef<string | null>(null);
  const key = look ? shopKey(look, layer) : null;
  const url = reg && key ? reg.get(key) : null;
  useEffect(() => {
    if (!reg || !key || !look || reg.get(key) !== null) return;
    return reg.want(
      key,
      () => paintShopLayer(look, layer),
      () => bump((n) => n + 1),
    );
    // `look` est entièrement décrit par la clé.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reg, key]);
  // Plus rien à montrer (intérieur parti, local vidé) : surtout pas l'ancienne image.
  if (key === null) last.current = null;
  if (url !== null) last.current = url;
  return url ?? last.current;
}

// ---------- Lumière d'un lampadaire sur une devanture (G5, tâche 15) ----------
// La devanture peinte (calque `facade`) passe par-dessus la découpe éclairée du décor (ghibli-night.tsx) : sans cela, la
// lueur du lampadaire s'arrête au haut du rez-de-chaussée. Même opération que paintLitPatch (« deux peintures ») : la façade
// peinte DE JOUR, teinte ambre (LAMP_TINT), découpée par le masque d'intensité des taches du lampadaire (`blobs`, repère du
// local : origine = shopOrigin). Posée par-dessus la façade de nuit, à l'opacité `dim` des lumières de la ville.
export const glowKey = (l: ShopLook, blobs: readonly LightBlob[]): string =>
  `glow|${shopKey({ ...l, day: 1, lit: false }, 'facade')}|${blobs.map((b) => `${b.cx.toFixed(1)},${b.cy.toFixed(1)},${b.rx.toFixed(1)},${b.ry.toFixed(1)},${b.peak}`).join(';')}`;
export function paintShopGlow(l: ShopLook, blobs: readonly LightBlob[]): string {
  if (noCanvas()) return BLANK_SPRITE;
  const box = layerBox(l, 'facade');
  const pw = Math.max(1, Math.ceil(box.w * SHOP_PX));
  const ph = Math.max(1, Math.ceil(box.h * SHOP_PX));
  const b = buffers(pw, ph);
  if (!b) return BLANK_SPRITE;
  const [lit, day, mask] = b as [CanvasRenderingContext2D, CanvasRenderingContext2D, CanvasRenderingContext2D];
  // Façade de jour (aucune teinte de nuit), dans le repère du local.
  lit.setTransform(SHOP_PX, 0, 0, SHOP_PX, -box.x * SHOP_PX, -box.y * SHOP_PX);
  paintFacade(tintedCtx(lit as unknown as ShopPaintCtx, (c: string) => c), specOf({ ...l, day: 1, lit: false }));
  lit.setTransform(1, 0, 0, 1, 0, 0);
  tintAndMask([lit, day, mask], blobs, LAMP_TINT, [SHOP_PX, SHOP_PX, -box.x * SHOP_PX, -box.y * SHOP_PX]);
  return lit.canvas.toDataURL('image/png');
}
// Image de la lueur (null tant qu'elle n'est pas peinte ; `blobs` vide : rien).
// `want` faux : l'image déjà cuite est rendue (fondu de sortie d'un lampadaire qui s'éteint) mais rien n'est demandé.
export function useShopGlow(look: ShopLook | null, blobs: readonly LightBlob[], want = true): string | null {
  const reg = useContext(ShopContext);
  const [, bump] = useState(0);
  const key = look && blobs.length > 0 ? glowKey(look, blobs) : null;
  const url = reg && key ? reg.get(key) : null;
  useEffect(() => {
    if (!want || !reg || !key || !look || reg.get(key) !== null) return;
    return reg.want(
      key,
      () => paintShopGlow(look, blobs),
      () => bump((n) => n + 1),
    );
    // `look` et `blobs` sont entièrement décrits par la clé.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reg, key, want]);
  return url;
}
