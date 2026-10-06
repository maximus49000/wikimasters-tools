export type Grid = {
  // Nombre de points des cases touchées par le rectangle (un majorant, calculé sans parcourir les points).
  count(x0: number, y0: number, x1: number, y1: number): number;
  // Les points du rectangle, exactement.
  forEach(x0: number, y0: number, x1: number, y1: number, visit: (i: number) => void): void;
  // Le point le plus proche de (x, y) à moins de `radius`, ou -1.
  nearest(x: number, y: number, radius: number): number;
};

const EMPTY_GRID: Grid = { count: () => 0, forEach: () => undefined, nearest: () => -1 };

// Range les points par case, dans un tableau plein qui couvre leur étendue (pas de Map : à 200 000 points, chercher les cases une à une
// coûtait plusieurs millisecondes par image). Les points sont triés case après case, ligne après ligne : ceux d'une ligne de cases
// se suivent en mémoire. Un tableau de sommes cumulées compte les points d'un rectangle de cases en quatre lectures.
// Les cases font au moins `cell` ; elles grandissent (par deux) si l'étendue en demanderait plus de quatre par point.
export function buildGrid(xs: Float32Array, ys: Float32Array, cell: number): Grid {
  const n = xs.length;
  if (n === 0) return EMPTY_GRID;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < n; i++) {
    if (xs[i]! < minX) minX = xs[i]!;
    if (xs[i]! > maxX) maxX = xs[i]!;
    if (ys[i]! < minY) minY = ys[i]!;
    if (ys[i]! > maxY) maxY = ys[i]!;
  }
  let side = cell;
  let width = Math.floor((maxX - minX) / side) + 1;
  let height = Math.floor((maxY - minY) / side) + 1;
  while (width * height > 4 * n + 1024) {
    side *= 2;
    width = Math.floor((maxX - minX) / side) + 1;
    height = Math.floor((maxY - minY) / side) + 1;
  }
  const cells = width * height;
  const cellOf = new Int32Array(n);
  const start = new Int32Array(cells + 1);
  for (let i = 0; i < n; i++) {
    const c = Math.floor((xs[i]! - minX) / side) + Math.floor((ys[i]! - minY) / side) * width;
    cellOf[i] = c;
    start[c + 1]! += 1;
  }
  // Sommes cumulées en deux dimensions : sums[(gy + 1) * (width + 1) + gx + 1] = points des cases [0..gx] × [0..gy].
  const sums = new Int32Array((width + 1) * (height + 1));
  for (let gy = 0; gy < height; gy++) {
    let row = 0;
    for (let gx = 0; gx < width; gx++) {
      row += start[gy * width + gx + 1]!;
      sums[(gy + 1) * (width + 1) + gx + 1] = sums[gy * (width + 1) + gx + 1]! + row;
    }
  }
  for (let c = 0; c < cells; c++) start[c + 1]! += start[c]!;
  const fill = start.slice(0, cells);
  const order = new Int32Array(n);
  for (let i = 0; i < n; i++) order[fill[cellOf[i]!]!++] = i;
  const px = new Float32Array(n);
  const py = new Float32Array(n);
  for (let t = 0; t < n; t++) {
    px[t] = xs[order[t]!]!;
    py[t] = ys[order[t]!]!;
  }

  // Les cases (bornées à l'étendue) que touche le rectangle, ou null s'il n'en touche aucune.
  const span = (x0: number, y0: number, x1: number, y1: number): [number, number, number, number] | null => {
    const gx0 = Math.max(0, Math.floor((x0 - minX) / side));
    const gx1 = Math.min(width - 1, Math.floor((x1 - minX) / side));
    const gy0 = Math.max(0, Math.floor((y0 - minY) / side));
    const gy1 = Math.min(height - 1, Math.floor((y1 - minY) / side));
    return gx0 > gx1 || gy0 > gy1 ? null : [gx0, gx1, gy0, gy1];
  };

  return {
    count(x0, y0, x1, y1) {
      const s = span(x0, y0, x1, y1);
      if (!s) return 0;
      const [gx0, gx1, gy0, gy1] = s;
      const w = width + 1;
      return sums[(gy1 + 1) * w + gx1 + 1]! - sums[gy0 * w + gx1 + 1]! - sums[(gy1 + 1) * w + gx0]! + sums[gy0 * w + gx0]!;
    },
    forEach(x0, y0, x1, y1, visit) {
      const s = span(x0, y0, x1, y1);
      if (!s) return;
      const [gx0, gx1, gy0, gy1] = s;
      for (let gy = gy0; gy <= gy1; gy++) {
        const to = start[gy * width + gx1 + 1]!;
        for (let t = start[gy * width + gx0]!; t < to; t++) {
          const x = px[t]!;
          const y = py[t]!;
          if (x >= x0 && x <= x1 && y >= y0 && y <= y1) visit(order[t]!);
        }
      }
    },
    nearest(x, y, radius) {
      let best = -1;
      let bestSquared = radius * radius;
      const s = span(x - radius, y - radius, x + radius, y + radius);
      if (!s) return -1;
      const [gx0, gx1, gy0, gy1] = s;
      for (let gy = gy0; gy <= gy1; gy++) {
        const to = start[gy * width + gx1 + 1]!;
        for (let t = start[gy * width + gx0]!; t < to; t++) {
          const dx = px[t]! - x;
          const dy = py[t]! - y;
          const squared = dx * dx + dy * dy;
          if (squared <= bestSquared) {
            bestSquared = squared;
            best = order[t]!;
          }
        }
      }
      return best;
    },
  };
}
