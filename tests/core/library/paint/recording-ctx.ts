import type { GradientLike } from '../../../../src/core/library/paint/paint-ctx';
import type { ShopPaintCtx } from '../../../../src/core/library/paint/shop/ctx';

// Faux contexte (aussi celui des commerces, G4a : transformations et texte enregistrés) : enregistre chaque appel, chaque point touché (boîte englobante pour ellipses, arcs et rectangles) et la
// couleur de chaque remplissage. Le moteur n'utilise aucune transformation : les points sont donc en coordonnées du monde.
export type Op = { op: string; args: number[] };
export type RecordingCtx = ShopPaintCtx & { ops: Op[]; points: [number, number][]; fills: string[]; texts: string[] };

export function recordingCtx(): RecordingCtx {
  const ops: Op[] = [];
  const points: [number, number][] = [];
  const fills: string[] = [];
  const texts: string[] = [];
  const log = (op: string, args: number[] = []): void => void ops.push({ op, args });
  // Rognage : `clip()` borne les points suivants à la boîte du chemin en cours (ombres et rehauts de `cel` débordent la
  // forme et sont rognés par elle) ; save/restore empilent la boîte. Points du chemin en cours gardés pour la boîte.
  type Clip = [number, number, number, number] | null;
  let clip: Clip = null;
  const clips: Clip[] = [];
  let path: [number, number][] = [];
  const pt = (x: number, y: number): void => {
    path.push([x, y]);
    if (clip) [x, y] = [Math.min(clip[2], Math.max(clip[0], x)), Math.min(clip[3], Math.max(clip[1], y))];
    points.push([x, y]);
  };
  const ctx: RecordingCtx = {
    ops,
    points,
    fills,
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    save: () => { log('save'); clips.push(clip); },
    restore: () => { log('restore'); clip = clips.length ? clips.pop()! : null; },
    beginPath: () => { log('beginPath'); path = []; },
    closePath: () => log('closePath'),
    moveTo: (x, y) => { log('moveTo', [x, y]); pt(x, y); },
    lineTo: (x, y) => { log('lineTo', [x, y]); pt(x, y); },
    quadraticCurveTo: (cx, cy, x, y) => { log('quadraticCurveTo', [cx, cy, x, y]); pt(cx, cy); pt(x, y); },
    // Boîte exacte d'une ellipse droite ; tournée, le carré du grand rayon (englobant sûr).
    ellipse: (x, y, rx, ry, rot, a0, a1) => { log('ellipse', [x, y, rx, ry, rot, a0, a1]); const [mx, my] = rot ? [Math.max(rx, ry), Math.max(rx, ry)] : [rx, ry]; pt(x - mx, y - my); pt(x + mx, y + my); },
    arc: (x, y, r, a0, a1) => { log('arc', [x, y, r, a0, a1]); pt(x - r, y - r); pt(x + r, y + r); },
    rect: (x, y, w, h) => { log('rect', [x, y, w, h]); pt(x, y); pt(x + w, y + h); },
    fill: () => { log('fill'); fills.push(String(ctx.fillStyle)); },
    stroke: () => log('stroke'),
    clip: () => {
      log('clip');
      if (!path.length) return;
      const box: Clip = [Math.min(...path.map((p) => p[0])), Math.min(...path.map((p) => p[1])), Math.max(...path.map((p) => p[0])), Math.max(...path.map((p) => p[1]))];
      clip = clip ? [Math.max(clip[0], box[0]), Math.max(clip[1], box[1]), Math.min(clip[2], box[2]), Math.min(clip[3], box[3])] : box;
    },
    fillRect: (x, y, w, h) => { log('fillRect', [x, y, w, h]); pt(x, y); pt(x + w, y + h); fills.push(String(ctx.fillStyle)); },
    strokeRect: (x, y, w, h) => { log('strokeRect', [x, y, w, h]); pt(x, y); pt(x + w, y + h); },
    texts,
    lineCap: 'butt',
    lineJoin: 'miter',
    font: '10px sans-serif',
    textAlign: 'start',
    textBaseline: 'alphabetic',
    translate: (x, y) => log('translate', [x, y]),
    rotate: (a) => log('rotate', [a]),
    scale: (x, y) => log('scale', [x, y]),
    bezierCurveTo: (a, b, c, d, x, y) => { log('bezierCurveTo', [a, b, c, d, x, y]); pt(a, b); pt(c, d); pt(x, y); },
    roundRect: (x, y, w, h, r) => { log('roundRect', [x, y, w, h, r]); pt(x, y); pt(x + w, y + h); },
    fillText: (s, x, y) => { log('fillText', [x, y]); texts.push(s); fills.push(String(ctx.fillStyle)); },
    strokeText: (_s, x, y) => log('strokeText', [x, y]),
    // Largeur approchée : 0,55 em par caractère (taille lue dans `font`, 10 px par défaut).
    measureText: (s) => ({ width: s.length * 0.55 * Number(/(\d+(?:\.\d+)?)px/.exec(ctx.font)?.[1] ?? 10) }),
    createLinearGradient: (x0, y0, x1, y1): GradientLike => { log('gradient', [x0, y0, x1, y1]); return { addColorStop: () => undefined }; },
    createRadialGradient: (x0, y0, r0, x1, y1, r1): GradientLike => { log('gradient', [x0, y0, r0, x1, y1, r1]); return { addColorStop: () => undefined }; },
  };
  return ctx;
}
