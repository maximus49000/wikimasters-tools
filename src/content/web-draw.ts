import { shortTitle } from '../core/links/web-labels';
import type { Point } from '../core/links/web-layout';
import { CLUSTER_HUBS, DOTS_MAX, clusterCell, clustersFor, levelFor, type Level, type Scene } from '../core/links/web-scene';
import type { Transform } from '../core/links/web-view';

export type DrawOptions = {
  // Indice (dans `scene.hubs`) de l'article mis en avant, -1 s'il n'y en a pas.
  focusHub: number;
  // Indice de la carte touchée, -1 s'il n'y en a pas.
  pickedCard: number;
  // Le chemin cherché entre deux cartes : ses traits (positions du dessin).
  route: readonly (readonly [Point, Point])[];
  // Couleur du texte et du fond de la zone (le contour des noms reprend le fond).
  ink: string;
  paper: string;
  // L'image d'une carte (indice), ou null tant qu'elle n'est pas là.
  image: (card: number) => CanvasImageSource | null;
  // Les cartes mises en avant (voir litMask) : 1 = en plein, 0 = estompée. Absent ou null : d'après focusHub / pickedCard.
  lit?: Uint8Array | null;
};
export type DrawResult = { level: Level; visible: number };

// Au plus ce nombre de traits cartes → articles en même temps (sinon on n'en trace qu'un échantillon) ; une carte en a jusqu'à deux.
const EDGE_CAP = 5000;
// Traits des cartes mises en avant : tous jusqu'à ce nombre (un article de 7 500 cartes à l'écran), échantillonnés au-delà
// (20 000 cartes allumées à l'écran donneraient 40 000 traits : plus de 12 ms par image).
const LIT_EDGE_CAP = 15000;
const CARD_PX = 30;
// En dessous de ce rayon (px), un point est dessiné en carré.
const SQUARE_DOT = 2;
const FALLBACK = '#888780';
const ACCENT = '#34d399';
const DIMMED = 0.25;
const TAU = Math.PI * 2;

const hubRadius = (cards: number): number => Math.min(10, 3 + Math.log10(cards + 1) * 1.8);

type Box = { l: number; r: number; t: number; b: number };

export function drawScene(ctx: CanvasRenderingContext2D, scene: Scene, t: Transform, size: { width: number; height: number }, o: DrawOptions): DrawResult {
  const { width, height } = size;
  const k = t.k;
  ctx.clearRect(0, 0, width, height);
  const sx = (x: number) => t.x + x * k;
  const sy = (y: number) => t.y + y * k;
  const margin = 24 / k;
  const wx0 = -t.x / k - margin;
  const wx1 = (width - t.x) / k + margin;
  const wy0 = -t.y / k - margin;
  const wy1 = (height - t.y) / k + margin;

  // Le niveau dépend du nombre de cartes à l'écran : compté sans parcourir les cartes, puis exactement quand c'est raisonnable.
  const approx = scene.grid.count(wx0, wy0, wx1, wy1);
  const seen: number[] = [];
  let level: Level = 'clusters';
  if (approx <= DOTS_MAX * 1.5) {
    scene.grid.forEach(wx0, wy0, wx1, wy1, (i) => seen.push(i));
    level = levelFor(seen.length);
  }
  const visible = level === 'clusters' ? approx : seen.length;

  const { focusHub, pickedCard } = o;
  const mask = o.lit ?? null;
  const emphasis = focusHub >= 0 || pickedCard >= 0 || o.route.length > 0 || mask !== null;
  const lit = (i: number): boolean =>
    mask ? mask[i] === 1 : focusHub >= 0 ? scene.hub1[i] === focusHub || scene.hub2[i] === focusHub : pickedCard >= 0 && i === pickedCard;
  const none = scene.themes.length;
  const slotOf = (theme: number): number => (theme < 0 ? none : theme);
  const colorOf = (slot: number): string => scene.themes[slot]?.color ?? FALLBACK;

  // Une zone libre pour un nom : les noms déjà posés (les plus importants d'abord) ne sont jamais recouverts.
  const boxes: Box[] = [];
  const free = (x: number, y: number, w: number, h: number): boolean => {
    const box = { l: x - w / 2 - 2, r: x + w / 2 + 2, t: y - h / 2 - 1, b: y + h / 2 + 1 };
    for (const other of boxes) if (box.l < other.r && other.l < box.r && box.t < other.b && other.t < box.b) return false;
    boxes.push(box);
    return true;
  };
  const text = (value: string, x: number, y: number, px: number, color: string, bold = false) => {
    ctx.font = `${bold ? '500 ' : ''}${px}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 3;
    ctx.strokeStyle = o.paper;
    ctx.strokeText(value, x, y);
    ctx.fillStyle = color;
    ctx.fillText(value, x, y);
  };

  const litByTheme: number[][] = Array.from({ length: none + 1 }, () => []);
  const dimByTheme: number[][] = Array.from({ length: none + 1 }, () => []);
  if (level === 'clusters') {
    const { items, max } = clustersFor(scene, clusterCell(k));
    for (const item of items) {
      const x = sx(item.x);
      const y = sy(item.y);
      if (x < -30 || x > width + 30 || y < -30 || y > height + 30) continue;
      const weight = Math.sqrt(item.n / max);
      ctx.globalAlpha = (emphasis ? DIMMED : 1) * (0.2 + 0.5 * weight);
      ctx.fillStyle = colorOf(slotOf(item.theme));
      ctx.beginPath();
      ctx.arc(x, y, 5 + 16 * weight, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  } else {
    // Les cartes de l'écran, par thème, en deux groupes : mises en avant (ou toutes, sans mise en avant) et estompées.
    // Une seule répartition sert aux traits puis aux points.
    for (const i of seen) (emphasis && !lit(i) ? dimByTheme : litByTheme)[slotOf(scene.theme[i]!)]!.push(i);
    let dimCount = 0;
    for (const list of dimByTheme) dimCount += list.length;
    // Traits cartes → articles, un tracé par couleur et par opacité. Au niveau points, au plus EDGE_CAP traits (échantillon) pour
    // les cartes ordinaires ou estompées, et au plus LIT_EDGE_CAP pour celles mises en avant.
    const sampled = (count: number, cap = EDGE_CAP) => (level === 'dots' ? Math.max(1, Math.ceil((count * 2) / cap)) : 1);
    const strokeEdges = (groups: number[][], stride: number, alpha: number) => {
      ctx.lineWidth = 0.7;
      ctx.globalAlpha = alpha;
      groups.forEach((list, slot) => {
        if (list.length === 0) return;
        ctx.strokeStyle = colorOf(slot);
        ctx.beginPath();
        for (let n = 0; n < list.length; n += stride) {
          const i = list[n]!;
          for (const h of [scene.hub1[i]!, scene.hub2[i]!]) {
            if (h < 0) continue;
            const hub = scene.hubs[h]!;
            ctx.moveTo(sx(scene.xs[i]!), sy(scene.ys[i]!));
            ctx.lineTo(sx(hub.x), sy(hub.y));
          }
        }
        ctx.stroke();
      });
    };
    if (emphasis) {
      strokeEdges(dimByTheme, sampled(dimCount), 0.16 * DIMMED);
      strokeEdges(litByTheme, sampled(seen.length - dimCount, LIT_EDGE_CAP), 0.5);
    } else {
      strokeEdges(litByTheme, sampled(seen.length), 0.16);
    }
    ctx.globalAlpha = 1;
  }

  // Liens entre articles voisins.
  ctx.strokeStyle = o.ink;
  ctx.lineWidth = 1;
  ctx.globalAlpha = emphasis ? 0.08 : 0.3;
  ctx.beginPath();
  for (const [a, b] of scene.hubLinks) {
    const from = scene.hubs[a]!;
    const to = scene.hubs[b]!;
    ctx.moveTo(sx(from.x), sy(from.y));
    ctx.lineTo(sx(to.x), sy(to.y));
  }
  ctx.stroke();
  ctx.globalAlpha = 1;

  if (level === 'dots') {
    const radius = Math.max(1.3, Math.min(3, k * 0.45));
    // Petits points (moins de 4 px) : des carrés, quatre fois moins chers qu'un cercle pour le canvas (20 000 points : ~2,5 ms au lieu de ~10).
    const square = radius < SQUARE_DOT;
    // Les points estompés d'abord, puis ceux mis en avant par-dessus : un tracé par couleur et par opacité.
    const fillDots = (groups: number[][], alpha: number) => {
      ctx.globalAlpha = alpha;
      groups.forEach((list, slot) => {
        if (list.length === 0) return;
        ctx.fillStyle = colorOf(slot);
        ctx.beginPath();
        for (const i of list) {
          const x = sx(scene.xs[i]!);
          const y = sy(scene.ys[i]!);
          if (square) {
            ctx.rect(x - radius, y - radius, radius * 2, radius * 2);
          } else {
            ctx.moveTo(x + radius, y);
            ctx.arc(x, y, radius, 0, TAU);
          }
        }
        ctx.fill();
      });
    };
    fillDots(dimByTheme, DIMMED);
    fillDots(litByTheme, 1);
    ctx.globalAlpha = 1;
  } else if (level === 'cards') {
    const half = CARD_PX / 2;
    // Les cartes estompées d'abord (même dessin, en transparence), puis celles mises en avant par-dessus.
    const ordered = emphasis ? [...seen.filter((i) => !lit(i)), ...seen.filter((i) => lit(i))] : seen;
    for (const i of ordered) {
      const alpha = emphasis && !lit(i) ? DIMMED : 1;
      const x = sx(scene.xs[i]!);
      const y = sy(scene.ys[i]!);
      const color = colorOf(slotOf(scene.theme[i]!));
      ctx.globalAlpha = alpha;
      ctx.fillStyle = o.paper;
      ctx.fillRect(x - half, y - half, CARD_PX, CARD_PX);
      const art = o.image(i);
      if (art) {
        ctx.drawImage(art, x - half, y - half, CARD_PX, CARD_PX);
      } else {
        ctx.globalAlpha = 0.3 * alpha;
        ctx.fillStyle = color;
        ctx.fillRect(x - half, y - half, CARD_PX, CARD_PX);
        ctx.globalAlpha = alpha;
      }
      ctx.strokeStyle = color;
      ctx.lineWidth = i === pickedCard ? 3 : 2;
      ctx.strokeRect(x - half, y - half, CARD_PX, CARD_PX);
    }
    ctx.globalAlpha = 1;
  }

  // Le chemin cherché entre deux cartes, par-dessus tout.
  if (o.route.length > 0) {
    ctx.strokeStyle = ACCENT;
    ctx.fillStyle = ACCENT;
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (const [from, to] of o.route) {
      ctx.moveTo(sx(from.x), sy(from.y));
      ctx.lineTo(sx(to.x), sy(to.y));
    }
    ctx.stroke();
    for (const [from, to] of o.route) {
      for (const end of [from, to]) {
        ctx.beginPath();
        ctx.arc(sx(end.x), sy(end.y), 5, 0, TAU);
        ctx.fill();
      }
    }
  }

  // Noms : les thèmes d'abord (en vue d'ensemble), puis les articles du plus au moins gros, puis les cartes.
  // La place des noms de thèmes est retenue en premier, mais ils sont écrits en dernier : les pastilles des articles ne les cachent pas.
  const themeNames: { name: string; x: number; y: number; color: string }[] = [];
  if (level === 'clusters') {
    for (const centre of scene.themeCentres) {
      const x = sx(centre.x);
      const y = sy(centre.y);
      if (x < -60 || x > width + 60 || y < -20 || y > height + 20) continue;
      if (free(x, y, centre.name.length * 8.6, 18)) themeNames.push({ name: centre.name, x, y, color: centre.color });
    }
  }
  const hubPool = level === 'clusters' ? scene.hubOrder.slice(0, CLUSTER_HUBS) : scene.hubOrder;
  for (const index of hubPool) {
    const hub = scene.hubs[index]!;
    const x = sx(hub.x);
    const y = sy(hub.y);
    if (x < -20 || x > width + 20 || y < -20 || y > height + 20) continue;
    const radius = hubRadius(hub.cards);
    const dim = emphasis && index !== focusHub && !(pickedCard >= 0 && (scene.hub1[pickedCard] === index || scene.hub2[pickedCard] === index));
    ctx.globalAlpha = dim ? DIMMED : 1;
    ctx.fillStyle = o.paper;
    ctx.beginPath();
    ctx.arc(x, y, radius + 1.5, 0, TAU);
    ctx.fill();
    ctx.fillStyle = hub.added ? ACCENT : colorOf(slotOf(hub.theme));
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, TAU);
    ctx.fill();
    const name = shortTitle(hub.title);
    if (free(x, y - radius - 8, name.length * 6.4, 13)) text(name, x, y - radius - 8, 11, o.ink);
  }
  ctx.globalAlpha = 1;
  if (level === 'cards') {
    for (const i of seen) {
      if (emphasis && !lit(i)) continue;
      const x = sx(scene.xs[i]!);
      const y = sy(scene.ys[i]!) + CARD_PX / 2 + 9;
      const name = shortTitle(scene.titles[i]!);
      if (free(x, y, name.length * 6.4, 13)) text(name, x, y, 11, o.ink);
    }
  }

  // Sous une mise en avant, les noms de thèmes s'estompent comme le reste.
  ctx.globalAlpha = emphasis ? DIMMED : 1;
  for (const label of themeNames) text(label.name, label.x, label.y, 15, label.color, true);
  ctx.globalAlpha = 1;

  return { level, visible };
}
