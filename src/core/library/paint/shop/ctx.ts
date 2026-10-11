import { hexRgb, rgba } from '../color';
import type { PaintCtx } from '../paint-ctx';

// Contexte des peintres de commerces (vague Ghibli G4a) : le sous-ensemble du canvas 2D utilisé par la maquette validée
// (docs/superpowers/maquettes/g4-commerces/) : transformations, courbes de Bézier, rectangles arrondis, texte. Un vrai
// CanvasRenderingContext2D le satisfait ; les tests passent un faux contexte qui enregistre les appels.
export interface ShopPaintCtx extends PaintCtx {
  lineCap: string;
  lineJoin: string;
  font: string;
  textAlign: string;
  textBaseline: string;
  translate(x: number, y: number): void;
  rotate(a: number): void;
  scale(x: number, y: number): void;
  bezierCurveTo(c1x: number, c1y: number, c2x: number, c2y: number, x: number, y: number): void;
  roundRect(x: number, y: number, w: number, h: number, r: number): void;
  fillText(s: string, x: number, y: number): void;
  strokeText(s: string, x: number, y: number): void;
  measureText(s: string): { width: number };
}

// Teinte d'une couleur hexadécimale (#rrggbb → #rrggbb) : la lumière du moment (nuit, crépuscule).
export type Tint = (hex: string) => string;

// Couleur CSS (#rrggbb ou rgb[a](r,g,b[,a])) → canaux et alpha ; null si autre chose (dégradé, nom de couleur).
export function parseColor(c: string): { rgb: [number, number, number]; a: number } | null {
  if (/^#[0-9a-fA-F]{6}$/.test(c)) return { rgb: [...hexRgb(c)] as [number, number, number], a: 1 };
  const m = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/.exec(c);
  return m ? { rgb: [Number(m[1]), Number(m[2]), Number(m[3])], a: m[4] === undefined ? 1 : Number(m[4]) } : null;
}

// Couleur CSS teinte (alpha conservé).
export function tintCss(tint: Tint, c: string): string {
  const p = parseColor(c);
  if (!p) return c;
  const hex = c.startsWith('#') ? c : `#${p.rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`;
  const out = tint(hex);
  return p.a >= 1 ? out : rgba(hexRgb(out), p.a);
}

export type TintedCtx = ShopPaintCtx & { glowing(fn: () => void): void };

// Toute couleur affectée (fillStyle, strokeStyle) passe par `tint` ; `glowing(fn)` la suspend le temps de `fn` (néons,
// vitrine allumée, croix de pharmacie, lanternes : ils gardent leurs couleurs la nuit).
export function tintedCtx(ctx: ShopPaintCtx, tint: Tint): TintedCtx {
  let raw = false;
  const glowing = (fn: () => void): void => {
    const was = raw;
    raw = true;
    try {
      fn();
    } finally {
      raw = was;
    }
  };
  // `glowing` peut être remplacé (tests : compter les passages).
  let glowFn = glowing;
  return new Proxy(ctx, {
    get(target, key) {
      if (key === 'glowing') return glowFn;
      const v = Reflect.get(target, key) as unknown;
      return typeof v === 'function' ? (v as (...a: unknown[]) => unknown).bind(target) : v;
    },
    set(target, key, value) {
      if (key === 'glowing') {
        glowFn = value as typeof glowing;
        return true;
      }
      const color = (key === 'fillStyle' || key === 'strokeStyle') && typeof value === 'string' && !raw;
      return Reflect.set(target, key, color ? tintCss(tint, value as string) : value);
    },
  }) as TintedCtx;
}

export type Pass = 'back' | 'front';
const DRAWS = new Set(['fill', 'stroke', 'fillRect', 'strokeRect', 'fillText', 'strokeText']);

// Fond ou premier plan d'un intérieur : un seul tracé, coupé par `toFront()` (ce qui suit est devant le personnel). Les
// tracés de l'autre section sont ignorés ; état, chemins et transformations passent toujours (save/restore équilibrés).
export function passCtx<T extends ShopPaintCtx>(ctx: T, want: Pass): T & { toFront(): void } {
  let section: Pass = 'back';
  const toFront = (): void => {
    section = 'front';
  };
  return new Proxy(ctx, {
    get(target, key) {
      if (key === 'toFront') return toFront;
      const v = Reflect.get(target, key) as unknown;
      if (typeof v !== 'function') return v;
      if (typeof key === 'string' && DRAWS.has(key) && section !== want) return () => undefined;
      return (v as (...a: unknown[]) => unknown).bind(target);
    },
    set: (target, key, value) => Reflect.set(target, key, value),
  }) as T & { toFront(): void };
}
