export type Point = { x: number; y: number };

// Distance idéale entre deux nœuds reliés ; deux nœuds éloignés de plus de trois fois cette distance ne se repoussent plus
// (la repousse se calcule par cases, pas pour toutes les paires).
const SPRING = 46;
const CUTOFF = 3 * SPRING;
// Rappel vers le centre : garde ensemble les groupes sans lien.
const GRAVITY = 0.02;
const GOLDEN_ANGLE = 2.399963229728653;

const cellKey = (cx: number, cy: number): number => (cx + 4096) * 8192 + (cy + 4096);

// Placement « forces » (Fruchterman et Reingold), sans hasard : le même graphe donne toujours le même dessin.
// Les nœuds déjà placés (`previous`) repartent de leur position, pour que la toile se complète sans tout rebattre.
export function layoutWeb(
  nodes: { id: string }[],
  edges: readonly (readonly [string, string])[],
  previous: Record<string, Point> = {},
  iterations = 220,
): Record<string, Point> {
  const n = nodes.length;
  if (n === 0) return {};
  const index = new Map(nodes.map((node, i) => [node.id, i]));
  const xs = new Float64Array(n);
  const ys = new Float64Array(n);
  let seeded = false;
  nodes.forEach((node, i) => {
    const before = Object.prototype.hasOwnProperty.call(previous, node.id) ? previous[node.id] : undefined;
    if (before) {
      xs[i] = before.x;
      ys[i] = before.y;
      seeded = true;
    } else {
      // Spirale de tournesol : répartition régulière, sans superposition au départ.
      const radius = SPRING * 0.7 * Math.sqrt(i + 1);
      xs[i] = radius * Math.cos(i * GOLDEN_ANGLE);
      ys[i] = radius * Math.sin(i * GOLDEN_ANGLE);
    }
  });

  const from: number[] = [];
  const to: number[] = [];
  for (const [a, b] of edges) {
    const i = index.get(a);
    const j = index.get(b);
    if (i !== undefined && j !== undefined && i !== j) {
      from.push(i);
      to.push(j);
    }
  }

  const dx = new Float64Array(n);
  const dy = new Float64Array(n);
  const startTemperature = seeded ? SPRING * 0.8 : SPRING * 3;
  for (let step = 0; step < iterations; step++) {
    dx.fill(0);
    dy.fill(0);
    const temperature = startTemperature * (1 - step / iterations) + 0.5;

    const cells = new Map<number, number[]>();
    for (let i = 0; i < n; i++) {
      const key = cellKey(Math.floor(xs[i]! / CUTOFF), Math.floor(ys[i]! / CUTOFF));
      const list = cells.get(key);
      if (list) list.push(i);
      else cells.set(key, [i]);
    }
    for (let i = 0; i < n; i++) {
      const cx = Math.floor(xs[i]! / CUTOFF);
      const cy = Math.floor(ys[i]! / CUTOFF);
      for (let gx = cx - 1; gx <= cx + 1; gx++) {
        for (let gy = cy - 1; gy <= cy + 1; gy++) {
          const list = cells.get(cellKey(gx, gy));
          if (!list) continue;
          for (const j of list) {
            if (j <= i) continue;
            let ddx = xs[i]! - xs[j]!;
            let ddy = ys[i]! - ys[j]!;
            let squared = ddx * ddx + ddy * ddy;
            if (squared > CUTOFF * CUTOFF) continue;
            if (squared < 1e-6) {
              // Deux nœuds au même endroit : écart minuscule, mais toujours le même.
              ddx = 0.01 + ((i - j) % 7) * 0.001;
              ddy = 0.01;
              squared = ddx * ddx + ddy * ddy;
            }
            const distance = Math.sqrt(squared);
            const force = (SPRING * SPRING) / distance;
            const fx = (ddx / distance) * force;
            const fy = (ddy / distance) * force;
            dx[i]! += fx;
            dy[i]! += fy;
            dx[j]! -= fx;
            dy[j]! -= fy;
          }
        }
      }
    }
    for (let e = 0; e < from.length; e++) {
      const a = from[e]!;
      const b = to[e]!;
      const ddx = xs[a]! - xs[b]!;
      const ddy = ys[a]! - ys[b]!;
      const distance = Math.sqrt(ddx * ddx + ddy * ddy) || 0.01;
      const force = (distance * distance) / SPRING;
      const fx = (ddx / distance) * force;
      const fy = (ddy / distance) * force;
      dx[a]! -= fx;
      dy[a]! -= fy;
      dx[b]! += fx;
      dy[b]! += fy;
    }
    for (let i = 0; i < n; i++) {
      dx[i]! -= xs[i]! * GRAVITY;
      dy[i]! -= ys[i]! * GRAVITY;
      const length = Math.hypot(dx[i]!, dy[i]!);
      if (length > 0) {
        const scale = Math.min(length, temperature) / length;
        xs[i]! += dx[i]! * scale;
        ys[i]! += dy[i]! * scale;
      }
    }
  }

  const positions: Record<string, Point> = {};
  nodes.forEach((node, i) => {
    positions[node.id] = { x: xs[i]!, y: ys[i]! };
  });
  return positions;
}
