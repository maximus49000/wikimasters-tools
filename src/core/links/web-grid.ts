export type Grid = {
  // Nombre de points des cases touchées par le rectangle (un majorant, calculé sans parcourir les points).
  count(x0: number, y0: number, x1: number, y1: number): number;
  // Les points du rectangle, exactement.
  forEach(x0: number, y0: number, x1: number, y1: number, visit: (i: number) => void): void;
  // Le point le plus proche de (x, y) à moins de `radius`, ou -1.
  nearest(x: number, y: number, radius: number): number;
};

const OFFSET = 32768;
const keyOf = (cx: number, cy: number): number => (cx + OFFSET) * 65536 + (cy + OFFSET);

// Range les points par case (listes chaînées) : retrouver ceux d'un rectangle ne parcourt que les cases concernées.
export function buildGrid(xs: Float32Array, ys: Float32Array, cell: number): Grid {
  const n = xs.length;
  const ids = new Map<number, number>();
  const head: number[] = [];
  const size: number[] = [];
  const cellX: number[] = [];
  const cellY: number[] = [];
  const next = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    const cx = Math.floor(xs[i]! / cell);
    const cy = Math.floor(ys[i]! / cell);
    const key = keyOf(cx, cy);
    let c = ids.get(key);
    if (c === undefined) {
      c = head.length;
      ids.set(key, c);
      head.push(-1);
      size.push(0);
      cellX.push(cx);
      cellY.push(cy);
    }
    next[i] = head[c]!;
    head[c] = i;
    size[c]! += 1;
  }

  // Les cases du rectangle ; si le rectangle en contient plus qu'il n'en existe, on parcourt les cases existantes.
  const eachCell = (x0: number, y0: number, x1: number, y1: number, visit: (c: number) => void) => {
    const gx0 = Math.floor(x0 / cell);
    const gx1 = Math.floor(x1 / cell);
    const gy0 = Math.floor(y0 / cell);
    const gy1 = Math.floor(y1 / cell);
    if ((gx1 - gx0 + 1) * (gy1 - gy0 + 1) <= head.length) {
      for (let gx = gx0; gx <= gx1; gx++) {
        for (let gy = gy0; gy <= gy1; gy++) {
          const c = ids.get(keyOf(gx, gy));
          if (c !== undefined) visit(c);
        }
      }
    } else {
      for (let c = 0; c < head.length; c++) {
        if (cellX[c]! >= gx0 && cellX[c]! <= gx1 && cellY[c]! >= gy0 && cellY[c]! <= gy1) visit(c);
      }
    }
  };

  return {
    count(x0, y0, x1, y1) {
      let total = 0;
      eachCell(x0, y0, x1, y1, (c) => (total += size[c]!));
      return total;
    },
    forEach(x0, y0, x1, y1, visit) {
      eachCell(x0, y0, x1, y1, (c) => {
        for (let i = head[c]!; i !== -1; i = next[i]!) {
          const x = xs[i]!;
          const y = ys[i]!;
          if (x >= x0 && x <= x1 && y >= y0 && y <= y1) visit(i);
        }
      });
    },
    nearest(x, y, radius) {
      let best = -1;
      let bestSquared = radius * radius;
      eachCell(x - radius, y - radius, x + radius, y + radius, (c) => {
        for (let i = head[c]!; i !== -1; i = next[i]!) {
          const dx = xs[i]! - x;
          const dy = ys[i]! - y;
          const squared = dx * dx + dy * dy;
          if (squared <= bestSquared) {
            bestSquared = squared;
            best = i;
          }
        }
      });
      return best;
    },
  };
}
