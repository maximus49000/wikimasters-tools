import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { ShopTypeId } from '../../core/library/city/shops/catalog';
import type { Sky } from '../../core/library/sky';
import { tintedCtx, type ShopPaintCtx } from '../../core/library/paint/shop/ctx';
import { FACADE_MARGIN, GROUND_FLOOR_H, facadeGeometry, paintFacade, paintGlass, type FacadeSpec, type FacadeState } from '../../core/library/paint/shop/facade';
import { paintInterior } from '../../core/library/paint/shop/interiors';
import { tone } from '../city-sprites';
import { BLANK_SPRITE } from '../figure/figure-host';

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

export const quantDay = (daylight: number): number => Math.round(daylight * 8) / 8;

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

let surface: { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null | undefined;
function getSurface(): typeof surface {
  if (surface !== undefined) return surface;
  try {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    surface = ctx ? { canvas, ctx } : null;
  } catch {
    surface = null;
  }
  return surface;
}

export function paintShopLayer(l: ShopLook, layer: ShopLayer): string {
  const s = getSurface();
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

export class ShopRegistry {
  private readonly sprites = new Map<string, string>();
  private readonly queue = new Map<string, { paint: () => string; done: Set<() => void> }>();
  private pending = false;
  private readonly max: number;
  private readonly perFrame: number;
  private readonly schedule: (cb: () => void) => void;
  constructor(
    readonly label: string,
    opts: { max?: number; perFrame?: number; schedule?: (cb: () => void) => void } = {},
  ) {
    // 4 calques Ghibli par boutique (fond, mobilier, vitre, façade) × ~60 boutiques de la rue la plus large
    // (MAX_COLS) + marge : le plafond ne doit jamais évincer la vitre/façade, sinon les murs disparaissent.
    this.max = opts.max ?? 400;
    this.perFrame = opts.perFrame ?? 1;
    this.schedule = opts.schedule ?? ((cb) => void requestAnimationFrame(() => cb()));
  }
  size(): number {
    return this.sprites.size;
  }
  // Image de la clé (rang rafraîchi : la moins récemment lue part en premier au-delà du plafond), sinon null.
  get(k: string): string | null {
    const url = this.sprites.get(k);
    if (url === undefined) return null;
    this.sprites.delete(k);
    this.sprites.set(k, url);
    return url;
  }
  // Demande de peinture : `done` est appelé quand l'image est prête. Rend l'annulation : une clé dont plus personne
  // n'attend l'image (clé changée, composant démonté) n'est pas peinte.
  want(k: string, paint: () => string, done: () => void): () => void {
    const q = this.queue.get(k);
    if (q) q.done.add(done);
    else this.queue.set(k, { paint, done: new Set([done]) });
    this.pump();
    return () => {
      const p = this.queue.get(k);
      if (!p) return;
      p.done.delete(done);
      if (p.done.size === 0) this.queue.delete(k);
    };
  }
  private pump(): void {
    if (this.pending || this.queue.size === 0) return;
    this.pending = true;
    this.schedule(() => {
      this.pending = false;
      let made = 0;
      for (const [k, q] of [...this.queue]) {
        if (made >= this.perFrame) break;
        this.queue.delete(k);
        this.sprites.set(k, q.paint());
        made++;
        while (this.sprites.size > this.max) this.sprites.delete(this.sprites.keys().next().value as string);
        for (const d of q.done) d();
      }
      this.pump();
    });
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
