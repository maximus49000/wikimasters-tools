import type { GradientLike, PaintCtx } from '../../../../src/core/library/paint/paint-ctx';

// Faux contexte : enregistre chaque appel, chaque point touché (boîte englobante pour ellipses et rectangles) et la couleur de
// chaque remplissage. Le moteur n'utilise aucune transformation : les points sont donc en coordonnées du monde.
export type Op = { op: string; args: number[] };
export type RecordingCtx = PaintCtx & { ops: Op[]; points: [number, number][]; fills: string[] };

export function recordingCtx(): RecordingCtx {
  const ops: Op[] = [];
  const points: [number, number][] = [];
  const fills: string[] = [];
  const log = (op: string, args: number[] = []): void => void ops.push({ op, args });
  const pt = (x: number, y: number): void => void points.push([x, y]);
  const ctx: RecordingCtx = {
    ops,
    points,
    fills,
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    save: () => log('save'),
    restore: () => log('restore'),
    beginPath: () => log('beginPath'),
    closePath: () => log('closePath'),
    moveTo: (x, y) => { log('moveTo', [x, y]); pt(x, y); },
    lineTo: (x, y) => { log('lineTo', [x, y]); pt(x, y); },
    quadraticCurveTo: (cx, cy, x, y) => { log('quadraticCurveTo', [cx, cy, x, y]); pt(cx, cy); pt(x, y); },
    ellipse: (x, y, rx, ry, rot, a0, a1) => { log('ellipse', [x, y, rx, ry, rot, a0, a1]); const m = Math.max(rx, ry); pt(x - m, y - m); pt(x + m, y + m); },
    rect: (x, y, w, h) => { log('rect', [x, y, w, h]); pt(x, y); pt(x + w, y + h); },
    fill: () => { log('fill'); fills.push(String(ctx.fillStyle)); },
    stroke: () => log('stroke'),
    clip: () => log('clip'),
    fillRect: (x, y, w, h) => { log('fillRect', [x, y, w, h]); pt(x, y); pt(x + w, y + h); fills.push(String(ctx.fillStyle)); },
    createLinearGradient: (x0, y0, x1, y1): GradientLike => { log('gradient', [x0, y0, x1, y1]); return { addColorStop: () => undefined }; },
  };
  return ctx;
}
