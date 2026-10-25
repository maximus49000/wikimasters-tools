import { celJob, type CelView } from '../../core/library/cel/raster';
import type { CelPart } from '../../core/library/cel/mesh';

// Peinture d'un sprite cellulo (G6) : le moteur pur (cel/raster) rend l'image RGBA par tranches, posée ensuite sur un canvas hors écran
// partagé et gardée en data URL PNG (jamais `blob:` : la CSP du site les bloque). Seules des pièces cellulo (maillages et teintes)
// entrent ici : aucune image de site tiers ne passe dans ce canvas (sinon toDataURL lèverait SecurityError).

// Cadre en px de pièce, relatif au point d'ancrage (milieu avant de la trace au sol = milieu du bas du rectangle de dessin).
export type PaintedSprite = { url: string; box: { x: number; y: number; w: number; h: number } };

// PNG transparent de 1 px : image sans canvas (tests sous jsdom, navigateur sans canvas 2D) ; le cadre reste exact.
export const BLANK_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

// Canvas partagé, en mémoire (`willReadFrequently` : pas sur le GPU, toDataURL n'attend pas la relecture des pixels, comme les
// pantins). null sans canvas 2D ; sous jsdom, pas même d'appel (getContext y signale « Not implemented »).
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

// Tâche de peinture : `step` avance le rendu d'au plus `budgetMs` (vrai quand il est fini), `finish` le termine si besoin et rend
// l'image. `anchor` : vue du point d'ancrage (px de pièce, relatifs au pixel de l'origine des pièces, cf. spriteFrameOf).
export function spriteJob(parts: CelPart[], view: CelView, anchor: readonly [number, number] = [0, 0]): { step(budgetMs: number): boolean; finish(): PaintedSprite } {
  const job = celJob(parts, view);
  const s = getSurface();
  return {
    step: (budgetMs) => (s ? job.step(budgetMs) : true),
    finish() {
      const f = job.frame();
      const box = { x: -f.ox / view.px - anchor[0], y: -f.oy / view.px - anchor[1], w: f.w / view.px, h: f.h / view.px };
      if (!s) return { url: BLANK_PNG, box };
      const img = job.image();
      // Redimensionner efface le canvas.
      s.canvas.width = img.w;
      s.canvas.height = img.h;
      s.ctx.putImageData(new ImageData(img.rgba as Uint8ClampedArray<ArrayBuffer>, img.w, img.h), 0, 0);
      return { url: s.canvas.toDataURL('image/png'), box };
    },
  };
}
