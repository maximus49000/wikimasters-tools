import type { RecordingCtx } from './recording-ctx';

// Chemins tracés (points moveTo/lineTo entre deux beginPath).
export function paths(ctx: RecordingCtx): [number, number][][] {
  const out: [number, number][][] = [];
  for (const op of ctx.ops) {
    if (op.op === 'beginPath') out.push([]);
    else if ((op.op === 'moveTo' || op.op === 'lineTo') && out.length > 0) out[out.length - 1]!.push([op.args[0]!, op.args[1]!]);
  }
  return out.filter((p) => p.length > 0);
}
