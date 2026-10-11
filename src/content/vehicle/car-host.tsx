// src/content/vehicle/car-host.tsx
import { createContext, useContext } from 'react';
import { INK, wheelOps, type CarArt, type Op } from '../../core/library/city/traffic/car-art';
import type { CarSpec, Rim } from '../../core/library/city/traffic/cars';
import { mixHex, type Sky } from '../../core/library/sky';
import { tone } from '../city-sprites';
import { BLANK_SPRITE } from '../figure/figure-host';

// Sprites peints des voitures Ghibli (spec véhicules §3) : chaque couche d'une voiture (habitacle, caisse percée aux vitres,
// vitrage, jupes) et chaque roue est peinte UNE fois sur un canvas hors écran (plan de car-art.ts) puis gardée en PNG (data
// URL : la CSP du site refuse blob:) ; la voiture n'est qu'un assemblage d'<image>. Clés : voiture (graine + type), couche,
// jour au 1/8 (teinte de nuit par paliers, comme les pantins), sens (la voie du fond est peinte tournée vers la gauche :
// jamais de miroir, la lumière reste en haut à gauche) et vitres chaudes la nuit. Plafond (les moins récemment utilisés
// partent) et budget de rendus par image ; une demande non renouvelée depuis 2 images est jetée. Pas de détenteurs : chaque
// voiture affichée renouvelle ses clés à chaque image (request), ce qui les garde en fin de file.
export const CAR_PX = 3;
export type CarLayer = 'interior' | 'body' | 'glazing' | 'over';
export type Lit = { day: number; dir: 1 | -1; night: boolean };
const STEPS = 8;
export const litOf = (sky: Sky): { day: number; night: boolean } => {
  const day = Math.round(sky.daylight * STEPS) / STEPS;
  return { day, night: day < 0.5 };
};
export const layerKey = (c: CarSpec, layer: CarLayer, lit: Lit): string => `${c.seed}|${c.arch}|${layer}|${lit.day}|${lit.dir}|${lit.night ? 'n' : 'd'}`;
export const wheelKey = (rim: Rim, rimColor: string, r: number, day: number): string => `w|${rim}|${rimColor}|${r.toFixed(2)}|${day}`;

// Cadre commun aux couches (marge 3 unités), en miroir pour le sens −1.
export function layerBox(art: CarArt, dir: 1 | -1): { x: number; y: number; w: number; h: number } {
  const x0 = art.x0 - 3;
  const x1 = art.x1 + 3;
  const y = art.top - 3;
  return { x: dir > 0 ? x0 : -x1, y, w: x1 - x0, h: 3 - y };
}
export const wheelBox = (r: number): { x: number; y: number; w: number; h: number } => ({ x: -(r + 1), y: -(r + 1), w: 2 * (r + 1), h: 2 * (r + 1) });

// ---------- Exécuteur du plan de peinture ----------
const shade = (c: string): string => mixHex(mixHex(c, '#4a3a6a', 0.32), '#000000', 0.06);
const light = (c: string): string => mixHex(c, '#fff6e0', 0.18);

let surface: { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null | undefined;
function getSurface(): typeof surface {
  if (surface !== undefined) return surface;
  surface = null;
  if (typeof document === 'undefined' || (typeof navigator !== 'undefined' && navigator.userAgent.includes('jsdom'))) return surface;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (ctx) surface = { canvas, ctx };
  return surface;
}

// `day` : jour quantifié (tone ne lit que `daylight`) ; `sx` : sens (1 ou −1) — le canvas est déjà retourné pour −1 : les
// décalages vers la lumière et le reflet des vitres sont inversés pour que la lumière reste en haut à gauche à l'écran.
function run(ctx: CanvasRenderingContext2D, ops: readonly Op[], day: number, night: boolean, sx: number): void {
  const t = (c: string): string => tone(c, { daylight: day } as Sky);
  const ink = t(INK);
  const piece = (P: Path2D, color: string, withInk: boolean, ox: number, oy: number): void => {
    ctx.save();
    const c = t(color);
    ctx.fillStyle = shade(c);
    ctx.fill(P);
    if (withInk) {
      ctx.lineWidth = 1.1;
      ctx.strokeStyle = ink;
      ctx.stroke(P);
    }
    ctx.clip(P);
    ctx.translate(ox * sx, oy);
    ctx.fillStyle = c;
    ctx.fill(P);
    ctx.translate(-0.4 * sx, -0.6);
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = light(c);
    ctx.globalAlpha = 0.55;
    ctx.stroke(P);
    ctx.restore();
  };
  for (const op of ops) {
    switch (op.k) {
      case 'shadow': {
        ctx.save();
        ctx.globalAlpha = 0.3;
        ctx.fillStyle = '#3a2f5a';
        ctx.beginPath();
        ctx.ellipse((op.x0 + op.x1) / 2 + 1.5 * sx, 0.6, (op.x1 - op.x0) / 2 + 2, 2.2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        break;
      }
      case 'piece':
        piece(new Path2D(op.d), op.color, op.ink !== false, op.ox ?? -0.6, op.oy ?? -0.8);
        break;
      case 'clipPiece': {
        ctx.save();
        ctx.clip(new Path2D(op.clip));
        piece(new Path2D(op.d), op.color, false, -0.2, -0.3);
        ctx.restore();
        break;
      }
      case 'fill': {
        const P = new Path2D(op.d);
        ctx.save();
        if (op.alpha !== undefined) ctx.globalAlpha = op.alpha;
        ctx.fillStyle = op.shade ? shade(t(op.color)) : t(op.color);
        ctx.fill(P);
        if (op.ink) {
          ctx.lineWidth = op.ink;
          ctx.strokeStyle = ink;
          ctx.stroke(P);
        }
        ctx.restore();
        break;
      }
      case 'line': {
        ctx.save();
        if (op.alpha !== undefined) ctx.globalAlpha = op.alpha;
        ctx.strokeStyle = t(op.color);
        ctx.lineWidth = op.w;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke(new Path2D(op.d));
        ctx.restore();
        break;
      }
      case 'hole': {
        ctx.save();
        ctx.globalCompositeOperation = 'destination-out';
        ctx.fillStyle = '#000';
        ctx.fill(new Path2D(op.d));
        ctx.restore();
        break;
      }
      case 'glass': {
        const P = new Path2D(op.d);
        ctx.save();
        ctx.fillStyle = night ? 'rgba(243,213,138,0.5)' : 'rgba(159,195,214,0.5)';
        ctx.fill(P);
        ctx.lineWidth = 0.9;
        ctx.strokeStyle = ink;
        ctx.stroke(P);
        if (!night) {
          // Reflet du ciel : bande claire en biais (montant vers la droite à l'écran), rognée à la vitre.
          ctx.clip(P);
          ctx.fillStyle = `rgba(255,255,255,${(0.5 * day).toFixed(3)})`;
          ctx.beginPath();
          ctx.moveTo(-200 * sx, 0);
          ctx.lineTo(200 * sx, -400);
          ctx.lineTo(206 * sx, -400);
          ctx.lineTo(-194 * sx, 0);
          ctx.fill();
        }
        ctx.restore();
        break;
      }
    }
  }
}

function paintOps(box: { x: number; y: number; w: number; h: number }, sx: number, draw: (ctx: CanvasRenderingContext2D) => void): string {
  const s = getSurface();
  if (!s) return BLANK_SPRITE;
  const { canvas, ctx } = s;
  const w = Math.ceil(box.w * CAR_PX);
  const h = Math.ceil(box.h * CAR_PX);
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.clearRect(0, 0, w, h);
  // Repère de la voiture (regard vers +x), retourné pour le sens −1.
  ctx.setTransform(CAR_PX * sx, 0, 0, CAR_PX, -box.x * CAR_PX, -box.y * CAR_PX);
  draw(ctx);
  return canvas.toDataURL('image/png');
}

export function paintLayer(art: CarArt, layer: CarLayer, lit: Lit): string {
  const ops = art[layer];
  if (ops.length === 0) return BLANK_SPRITE;
  return paintOps(layerBox(art, lit.dir), lit.dir, (ctx) => run(ctx, ops, lit.day, lit.night, lit.dir));
}
export function paintWheel(rim: Rim, rimColor: string, r: number, day: number): string {
  return paintOps(wheelBox(r), 1, (ctx) => run(ctx, wheelOps(rim, rimColor, r), day, false, 1));
}

// ---------- Registre ----------
export class CarRegistry {
  private readonly sprites = new Map<string, string>();
  private readonly queue = new Map<string, { paint: () => string; at: number }>();
  private frame = 0;
  private readonly max: number;
  private readonly perFrame: number;
  constructor(
    readonly label: string,
    opts: { max?: number; perFrame?: number } = {},
  ) {
    this.max = opts.max ?? 600;
    this.perFrame = opts.perFrame ?? 6;
  }
  size(): number {
    return this.sprites.size;
  }
  private hit(k: string): string | null {
    const url = this.sprites.get(k);
    if (url === undefined) return null;
    this.sprites.delete(k);
    this.sprites.set(k, url);
    return url;
  }
  // Sprite tout de suite (peint hors budget au besoin) : première apparition d'une voiture.
  ensure(k: string, paint: () => string): string {
    const found = this.hit(k);
    if (found !== null) return found;
    this.queue.delete(k);
    const url = paint();
    this.sprites.set(k, url);
    return url;
  }
  // Sprite s'il existe (rang rafraîchi), sinon mis en file (peint par flush) et null.
  request(k: string, paint: () => string): string | null {
    const found = this.hit(k);
    if (found === null) this.queue.set(k, { paint, at: this.frame });
    return found;
  }
  flush(): void {
    for (const [k, q] of this.queue) if (this.frame - q.at > 2) this.queue.delete(k);
    this.frame++;
    let made = 0;
    for (const [k, q] of [...this.queue]) {
      if (made >= this.perFrame) break;
      this.queue.delete(k);
      this.sprites.set(k, q.paint());
      made++;
    }
    while (this.sprites.size > this.max) this.sprites.delete(this.sprites.keys().next().value as string);
  }
}

let shared: CarRegistry | null = null;
export const CarContext = createContext<CarRegistry | null>(null);
// Registre de l'affichage (pièce, panorama) ; repli : registre partagé (tests, rendu isolé).
export function useCarRegistry(): CarRegistry {
  const r = useContext(CarContext);
  if (r) return r;
  shared ??= new CarRegistry('wmt-car');
  return shared;
}
