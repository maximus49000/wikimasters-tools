import type { PxRect } from '../core/library/room-grid';

// Rectangle englobant de plusieurs rectangles (null s'il n'y en a pas).
export function boundingRect(rects: readonly PxRect[]): PxRect | null {
  if (rects.length === 0) return null;
  const x0 = Math.min(...rects.map((r) => r.x));
  const y0 = Math.min(...rects.map((r) => r.y));
  const x1 = Math.max(...rects.map((r) => r.x + r.w));
  const y1 = Math.max(...rects.map((r) => r.y + r.h));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

// Ce qui reste du rectangle englobant des vitres une fois les vitres retirées, en rectangles alignés sur les axes :
// cellules formées par les bords distincts, celles que aucune vitre ne couvre, fusionnées horizontalement par rangée.
// Le décor est découpé par le seul rectangle englobant (un masque à plusieurs rectangles est très lent sur téléphone) ;
// ces trous redessinent le mur là où il n'y a pas de vitre.
export function gapRects(glasses: readonly PxRect[]): PxRect[] {
  const box = boundingRect(glasses);
  if (!box) return [];
  const xs = [...new Set(glasses.flatMap((g) => [g.x, g.x + g.w]))].sort((a, b) => a - b);
  const ys = [...new Set(glasses.flatMap((g) => [g.y, g.y + g.h]))].sort((a, b) => a - b);
  const out: PxRect[] = [];
  for (let j = 0; j < ys.length - 1; j++) {
    const y = ys[j]!;
    const h = ys[j + 1]! - y;
    let run: PxRect | null = null;
    for (let i = 0; i < xs.length - 1; i++) {
      const x = xs[i]!;
      const w = xs[i + 1]! - x;
      const covered = glasses.some((g) => g.x <= x && x + w <= g.x + g.w && g.y <= y && y + h <= g.y + g.h);
      if (covered) {
        if (run) out.push(run);
        run = null;
      } else if (run) run.w += w;
      else run = { x, y, w, h };
    }
    if (run) out.push(run);
  }
  return out;
}
