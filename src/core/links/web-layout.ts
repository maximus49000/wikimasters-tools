export type Point = { x: number; y: number };
// `radius` : demi-taille du nœud (en unités du dessin) ; deux nœuds ne se chevauchent jamais.
export type LayoutNode = { id: string; radius?: number };

export type Layout = {
  // Avance le calcul pendant `budgetMs` au plus (une itération n'est jamais coupée) ; vrai quand c'est fini.
  run(budgetMs: number): boolean;
  // Les positions du moment : utilisables avant la fin, elles se précisent au fil des appels à `run`.
  positions(): Record<string, Point>;
};

// Longueur d'un ressort au repos, en plus des rayons des deux nœuds.
const REST = 30;
// Au-delà de cette distance, deux nœuds ne se repoussent plus (la repousse se calcule par cases, pas pour toutes les paires).
const CUTOFF = 220;
// Rappel vers le centre : garde ensemble les groupes sans lien.
const GRAVITY = 0.01;
// Poussée supplémentaire, proportionnelle au chevauchement.
const COLLIDE = 6;
// Espace laissé entre deux nœuds.
const GAP = 8;
// La repousse croît avec le nombre de nœuds (CHARGE × n^1,7) : une petite Collection reste compacte, une grande ne se tasse pas
// au point de se chevaucher (réglé sur des Collections de 30 à 2000 cartes).
const CHARGE = 0.045;
const COLLISION_PASSES = 120;
const DEFAULT_RADIUS = 12;
const GOLDEN_ANGLE = 2.399963229728653;

const cellKey = (cx: number, cy: number): number => (cx + 4096) * 8192 + (cy + 4096);

// Placement « forces » sans hasard : le même graphe donne toujours le même dessin.
// - Les ressorts sont affaiblis par le degré (comme d3-force) : un article cité par cent cartes ne les écrase pas toutes au même endroit.
// - Les nœuds déjà placés (`previous`) repartent de leur position et les nouveaux naissent près de leurs voisins :
//   la toile se complète sans tout rebattre (la moitié des itérations suffit).
// - Une dernière passe écarte les nœuds qui se chevauchent encore.
export function createLayout(
  nodes: LayoutNode[],
  edges: readonly (readonly [string, string])[],
  previous: Record<string, Point> = {},
  iterations = 200,
): Layout {
  const n = nodes.length;
  const index = new Map(nodes.map((node, i) => [node.id, i]));
  const xs = new Float64Array(n);
  const ys = new Float64Array(n);
  const rs = new Float64Array(n);
  const known = new Uint8Array(n);
  let seeded = false;
  nodes.forEach((node, i) => {
    rs[i] = node.radius ?? DEFAULT_RADIUS;
    const before = Object.prototype.hasOwnProperty.call(previous, node.id) ? previous[node.id] : undefined;
    if (before) {
      xs[i] = before.x;
      ys[i] = before.y;
      known[i] = 1;
      seeded = true;
    }
  });

  const from: number[] = [];
  const to: number[] = [];
  const degree = new Float64Array(n);
  for (const [a, b] of edges) {
    const i = index.get(a);
    const j = index.get(b);
    if (i === undefined || j === undefined || i === j) continue;
    from.push(i);
    to.push(j);
    degree[i]! += 1;
    degree[j]! += 1;
  }
  const strength = new Float64Array(from.length);
  for (let e = 0; e < from.length; e++) strength[e] = 1 / Math.min(degree[from[e]!]!, degree[to[e]!]!);

  // Départ des nouveaux nœuds : autour de la moyenne de leurs voisins déjà placés, sinon sur une spirale de tournesol.
  const sumX = new Float64Array(n);
  const sumY = new Float64Array(n);
  const count = new Float64Array(n);
  for (let e = 0; e < from.length; e++) {
    const a = from[e]!;
    const b = to[e]!;
    if (known[a] && !known[b]) {
      sumX[b]! += xs[a]!;
      sumY[b]! += ys[a]!;
      count[b]! += 1;
    } else if (known[b] && !known[a]) {
      sumX[a]! += xs[b]!;
      sumY[a]! += ys[b]!;
      count[a]! += 1;
    }
  }
  for (let i = 0; i < n; i++) {
    if (known[i]) continue;
    const angle = i * GOLDEN_ANGLE;
    if (count[i]! > 0) {
      const spread = REST + rs[i]!;
      xs[i] = sumX[i]! / count[i]! + spread * Math.cos(angle);
      ys[i] = sumY[i]! / count[i]! + spread * Math.sin(angle);
    } else {
      const radius = REST * Math.sqrt(i + 1);
      xs[i] = radius * Math.cos(angle);
      ys[i] = radius * Math.sin(angle);
    }
  }

  const total = seeded ? Math.ceil(iterations / 2) : iterations;
  const startTemperature = REST * (seeded ? 1.5 : 3);
  const charge = CHARGE * Math.pow(Math.max(n, 1), 1.7);
  let maxRadius = 0;
  for (let i = 0; i < n; i++) maxRadius = Math.max(maxRadius, rs[i]!);
  const collisionCell = Math.max(2 * maxRadius + GAP, 16);

  const dx = new Float64Array(n);
  const dy = new Float64Array(n);
  const next = new Int32Array(n);
  const heads = new Map<number, number>();

  // Range les nœuds par case de la grille (listes chaînées) : seuls les voisins proches sont comparés.
  const fillGrid = (cell: number) => {
    heads.clear();
    for (let i = 0; i < n; i++) {
      const key = cellKey(Math.floor(xs[i]! / cell), Math.floor(ys[i]! / cell));
      next[i] = heads.get(key) ?? -1;
      heads.set(key, i);
    }
  };

  const applyForces = (step: number) => {
    dx.fill(0);
    dy.fill(0);
    const temperature = startTemperature * (1 - step / total) + 0.5;
    fillGrid(CUTOFF);
    const cutoff2 = CUTOFF * CUTOFF;
    for (let i = 0; i < n; i++) {
      const cx = Math.floor(xs[i]! / CUTOFF);
      const cy = Math.floor(ys[i]! / CUTOFF);
      for (let gx = cx - 1; gx <= cx + 1; gx++) {
        for (let gy = cy - 1; gy <= cy + 1; gy++) {
          for (let j = heads.get(cellKey(gx, gy)) ?? -1; j !== -1; j = next[j]!) {
            if (j <= i) continue;
            let ddx = xs[i]! - xs[j]!;
            let ddy = ys[i]! - ys[j]!;
            let squared = ddx * ddx + ddy * ddy;
            if (squared > cutoff2) continue;
            if (squared < 1e-6) {
              // Deux nœuds au même endroit : écart minuscule, mais toujours le même.
              ddx = 0.01 + ((i - j) % 7) * 0.001;
              ddy = 0.01;
              squared = ddx * ddx + ddy * ddy;
            }
            const distance = Math.sqrt(squared);
            let force = charge / distance;
            const minimum = rs[i]! + rs[j]! + GAP;
            if (distance < minimum) force += (minimum - distance) * COLLIDE;
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
      const force = strength[e]! * (distance - (REST + rs[a]! + rs[b]!));
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
  };

  // Écarte à la main deux nœuds qui se chevauchent ; vrai si au moins un a bougé.
  const resolveCollisions = (): boolean => {
    fillGrid(collisionCell);
    let moved = false;
    for (let i = 0; i < n; i++) {
      const cx = Math.floor(xs[i]! / collisionCell);
      const cy = Math.floor(ys[i]! / collisionCell);
      for (let gx = cx - 1; gx <= cx + 1; gx++) {
        for (let gy = cy - 1; gy <= cy + 1; gy++) {
          for (let j = heads.get(cellKey(gx, gy)) ?? -1; j !== -1; j = next[j]!) {
            if (j <= i) continue;
            let ddx = xs[i]! - xs[j]!;
            let ddy = ys[i]! - ys[j]!;
            let distance = Math.hypot(ddx, ddy);
            const minimum = rs[i]! + rs[j]! + GAP;
            if (distance >= minimum) continue;
            if (distance < 1e-6) {
              ddx = 1;
              ddy = 0.3;
              distance = Math.hypot(ddx, ddy);
            }
            const push = (minimum - distance) / 2 + 0.01;
            xs[i]! += (ddx / distance) * push;
            ys[i]! += (ddy / distance) * push;
            xs[j]! -= (ddx / distance) * push;
            ys[j]! -= (ddy / distance) * push;
            moved = true;
          }
        }
      }
    }
    return moved;
  };

  let step = 0;
  let pass = 0;
  return {
    run(budgetMs) {
      const deadline = performance.now() + budgetMs;
      while (step < total) {
        applyForces(step);
        step += 1;
        if (step < total && performance.now() >= deadline) return false;
      }
      // Sans itération, les positions fournies sont rendues telles quelles.
      while (total > 0 && pass < COLLISION_PASSES) {
        pass += 1;
        if (!resolveCollisions()) pass = COLLISION_PASSES;
        else if (pass < COLLISION_PASSES && performance.now() >= deadline) return false;
      }
      return true;
    },
    positions() {
      const positions: Record<string, Point> = {};
      nodes.forEach((node, i) => {
        positions[node.id] = { x: xs[i]!, y: ys[i]! };
      });
      return positions;
    },
  };
}

// Tout le calcul d'un coup.
export function layoutWeb(
  nodes: LayoutNode[],
  edges: readonly (readonly [string, string])[],
  previous: Record<string, Point> = {},
  iterations = 200,
): Record<string, Point> {
  if (nodes.length === 0) return {};
  const layout = createLayout(nodes, edges, previous, iterations);
  layout.run(Infinity);
  return layout.positions();
}
