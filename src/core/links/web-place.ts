import { layoutWeb, type LayoutNode, type Point } from './web-layout';
import { cardId, hubId, type WebGraph } from './web-graph';
import type { BigModel } from './web-themes';

// Écart de la spirale entre deux cartes d'un même endroit, en unités du dessin : à fort zoom (64), cela fait plus de 40 px.
export const SPACING = 7;
// Aucune paire de cartes ne reste plus proche que cela après la dernière passe d'écartement.
export const MIN_DIST = 5;
const GOLDEN_ANGLE = 2.399963229728653;
const ANCHOR_CELL = 24;
const SEPARATE_PASSES = 12;
const OFFSET = 32768;

const keyOf = (cx: number, cy: number): number => (cx + OFFSET) * 65536 + (cy + OFFSET);

// Écarte à la main les points plus proches que `minDist` (comme la dernière passe du placement par forces) ; les points figés ne bougent pas.
// À chaque passe, les points sont triés par case (tri par comptage, ligne après ligne) : les voisins d'une case sont alors rangés côte à côte
// en mémoire, ce qui compte à 200 000 points. Seuls les points libres cherchent leurs voisins : relancé sur une toile déjà posée
// (tout est figé), le calcul ne coûte presque rien. Après la première passe, seuls les points qui ont bougé (et ceux qu'ils ont poussés)
// cherchent encore : les dernières passes ne coûtent presque plus rien, on peut en faire beaucoup.
export function separate(xs: Float64Array, ys: Float64Array, pinned: Uint8Array, minDist: number, passes: number): void {
  const n = xs.length;
  let free = 0;
  for (let i = 0; i < n; i++) if (!pinned[i]) free += 1;
  if (free === 0) return;
  const order = new Int32Array(n);
  const cellOf = new Int32Array(n);
  const px = new Float64Array(n);
  const py = new Float64Array(n);
  const pin = new Uint8Array(n);
  // Les points à revoir à cette passe (indices d'origine), et ceux de la passe suivante.
  let active = new Uint8Array(n).fill(1);
  let touched = new Uint8Array(n);
  const act = new Uint8Array(n);
  const min2 = minDist * minDist;
  for (let pass = 0; pass < passes; pass++) {
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
    // Des cases d'au moins `minDist` (deux points trop proches sont toujours dans des cases voisines), pas plus de 4 cases par point.
    let cell = minDist;
    let width = Math.floor((maxX - minX) / cell) + 1;
    let height = Math.floor((maxY - minY) / cell) + 1;
    while (width * height > 4 * n + 16) {
      cell *= 2;
      width = Math.floor((maxX - minX) / cell) + 1;
      height = Math.floor((maxY - minY) / cell) + 1;
    }
    const start = new Int32Array(width * height + 1);
    for (let i = 0; i < n; i++) {
      const c = Math.floor((xs[i]! - minX) / cell) + Math.floor((ys[i]! - minY) / cell) * width;
      cellOf[i] = c;
      start[c + 1]! += 1;
    }
    for (let c = 0; c < width * height; c++) start[c + 1]! += start[c]!;
    const fill = start.slice(0, width * height);
    for (let i = 0; i < n; i++) order[fill[cellOf[i]!]!++] = i;
    for (let s = 0; s < n; s++) {
      const i = order[s]!;
      px[s] = xs[i]!;
      py[s] = ys[i]!;
      pin[s] = pinned[i]!;
      act[s] = active[i]!;
    }
    touched.fill(0);

    let moved = false;
    for (let s = 0; s < n; s++) {
      if (pin[s] || !act[s]) continue;
      const c = cellOf[order[s]!]!;
      const cx = c % width;
      const cy = (c - cx) / width;
      const x0 = Math.max(0, cx - 1);
      const x1 = Math.min(width - 1, cx + 1);
      for (let gy = Math.max(0, cy - 1); gy <= Math.min(height - 1, cy + 1); gy++) {
        const to = start[gy * width + x1 + 1]!;
        for (let t = start[gy * width + x0]!; t < to; t++) {
          // Deux points libres à revoir ne se comparent qu'une fois (depuis le premier dans l'ordre).
          if (t === s || (!pin[t] && act[t] && t < s)) continue;
          let ddx = px[s]! - px[t]!;
          let ddy = py[s]! - py[t]!;
          let squared = ddx * ddx + ddy * ddy;
          if (squared >= min2) continue;
          if (squared < 1e-9) {
            ddx = 0.01 + ((s - t) % 7) * 0.001;
            ddy = 0.01;
            squared = ddx * ddx + ddy * ddy;
          }
          const distance = Math.sqrt(squared);
          const push = pin[t] ? minDist - distance + 0.01 : (minDist - distance) / 2 + 0.01;
          px[s]! += (ddx / distance) * push;
          py[s]! += (ddy / distance) * push;
          if (!pin[t]) {
            px[t]! -= (ddx / distance) * push;
            py[t]! -= (ddy / distance) * push;
          }
          moved = true;
          touched[order[s]!] = 1;
          if (!pin[t]) touched[order[t]!] = 1;
        }
      }
    }
    for (let s = 0; s < n; s++) {
      if (pin[s]) continue;
      xs[order[s]!] = px[s]!;
      ys[order[s]!] = py[s]!;
    }
    if (!moved) break;
    [active, touched] = [touched, active];
  }
}

// Les cartes autour de leurs articles : au milieu de leurs (deux premiers) articles, puis en spirale pour ne pas se superposer.
// Une carte déjà placée (`previous`) garde sa place ; les nouvelles prennent les places suivantes de la spirale.
export function placeCards(
  graph: WebGraph,
  hubs: Record<string, Point>,
  hubsOf: Map<string, string[]>,
  previous: Record<string, Point> = {},
): Record<string, Point> {
  const linked = new Map<string, string[]>();
  for (const [a, b] of graph.cardLinks) {
    (linked.get(a) ?? linked.set(a, []).get(a)!).push(b);
    (linked.get(b) ?? linked.set(b, []).get(b)!).push(a);
  }
  const n = graph.cards.length;
  const xs = new Float64Array(n);
  const ys = new Float64Array(n);
  const pinned = new Uint8Array(n);
  const crowd = new Map<number, number>();
  const placed = new Map<string, number>();
  // Les articles par nom (pas de clé `h:…` fabriquée pour chacune des 200 000 cartes).
  const hubAt = new Map<string, Point>();
  for (const hub of graph.hubs) {
    const at = hubs[hubId(hub.slug)];
    if (at) hubAt.set(hub.slug, at);
  }
  const before: (Point | undefined)[] = new Array(n);
  // L'identifiant `c:…` de chaque carte, fabriqué une seule fois (une chaîne neuve coûte à chaque recherche dans un objet de 200 000 clés).
  const ids: string[] = new Array(n);

  for (let i = 0; i < n; i++) {
    const card = graph.cards[i]!;
    let ax = 0;
    let ay = 0;
    let known = 0;
    const list = hubsOf.get(card.slug);
    if (list) {
      for (let h = 0; h < list.length && h < 2; h++) {
        const hub = hubAt.get(list[h]!);
        if (!hub) continue;
        ax += hub.x;
        ay += hub.y;
        known += 1;
      }
    }
    if (known === 0) {
      // Sans article : au milieu des cartes qu'elle cite et qui sont déjà posées.
      for (const other of linked.get(card.slug) ?? []) {
        const at = placed.get(other);
        if (at === undefined) continue;
        ax += xs[at]!;
        ay += ys[at]!;
        known += 1;
      }
    }
    if (known > 0) {
      ax /= known;
      ay /= known;
    }
    const key = keyOf(Math.floor(ax / ANCHOR_CELL), Math.floor(ay / ANCHOR_CELL));
    const slot = crowd.get(key) ?? 0;
    crowd.set(key, slot + 1);
    ids[i] = cardId(card.slug);
    const was = previous[ids[i]!];
    before[i] = was;
    if (was) {
      xs[i] = was.x;
      ys[i] = was.y;
      pinned[i] = 1;
    } else {
      const angle = slot * GOLDEN_ANGLE;
      const radius = SPACING * Math.sqrt(slot);
      xs[i] = ax + radius * Math.cos(angle);
      ys[i] = ay + radius * Math.sin(angle);
    }
    if (linked.size > 0) placed.set(card.slug, i);
  }

  separate(xs, ys, pinned, MIN_DIST, SEPARATE_PASSES);

  const out: Record<string, Point> = {};
  for (let i = 0; i < n; i++) out[ids[i]!] = before[i] ?? { x: xs[i]!, y: ys[i]! };
  return out;
}

// Un article a besoin de place pour son nuage de cartes : sa taille dans le placement croît avec la racine de son nombre de cartes.
// Sans plafond : un article de 40 000 cartes a un nuage de ~1 400 de rayon ; plafonnée à 300, sa place laissait les nuages voisins
// s'y empiler (des dizaines de milliers de cartes superposées à 200 000 cartes). Le facteur 0,75 laisse les nuages se toucher un peu
// (les cartes partagées vivent entre deux articles) sans tasser les cartes au-delà de ce que l'écartement sait défaire.
const hubRoom = (cards: number): number => 0.75 * SPACING * Math.sqrt(cards) + 8;

// Place du plus gros article dans le placement par forces (ordre de grandeur d'une Collection de quelques milliers de cartes).
const ROOM_REF = 100;

// Les articles de chaque placement rendu par layoutBig : relancé sur ce placement, on ne parcourt pas ses 200 000 cartes pour les retrouver.
// L'objet rendu par layoutBig ne doit donc jamais être modifié (ajout, retrait ou déplacement d'un article) : ses articles retenus ici
// ne correspondraient plus. Pour changer un placement, en faire une copie (la copie, inconnue de cette table, est relue entièrement).
const hubsOfLayout = new WeakMap<Record<string, Point>, Record<string, Point>>();

// Placement du mode grand : les articles par forces (≤ 300 nœuds : coût borné, quel que soit le nombre de cartes), les cartes autour.
export function layoutBig(graph: WebGraph, previous: Record<string, Point>, model: BigModel): Record<string, Point> {
  // Les places des articles sont ramenées à l'échelle d'une Collection moyenne (le plus gros article : au plus ROOM_REF) avant le placement
  // par forces, puis le résultat est agrandi d'autant. Sans cela, à 200 000 cartes, les places (des centaines d'unités) écrasent les
  // ressorts et la répulsion (réglés en dizaines d'unités) : le placement devient un empilement de billes et les thèmes se mélangent.
  // Échelle en puissance de deux : diviser puis multiplier est exact (une toile relancée retrouve ses articles au bit près), et elle ne
  // change que lorsque le plus gros article a quadruplé.
  let biggest = 0;
  for (const hub of graph.hubs) biggest = Math.max(biggest, hubRoom(hub.cards.length));
  const scale = 2 ** Math.max(0, Math.ceil(Math.log2(biggest / ROOM_REF)));
  const nodes: LayoutNode[] = graph.hubs.map((hub) => ({ id: hubId(hub.slug), radius: hubRoom(hub.cards.length) / scale }));
  const edges: [string, string][] = [
    ...model.edges.map((edge): [string, string] => [hubId(edge.a), hubId(edge.b)]),
    ...(graph.hubLinks ?? []).map(([a, b]): [string, string] => [hubId(a), hubId(b)]),
  ];
  // Tous les anciens articles, y compris ceux qui ont disparu : layoutWeb juge ainsi si la toile grandit ou change.
  let hubPrevious = hubsOfLayout.get(previous);
  if (!hubPrevious) {
    hubPrevious = {};
    for (const id in previous) if (id.startsWith('h:')) hubPrevious[id] = previous[id]!;
  }
  const scaledPrevious: Record<string, Point> = {};
  for (const id in hubPrevious) scaledPrevious[id] = { x: hubPrevious[id]!.x / scale, y: hubPrevious[id]!.y / scale };
  const hubs: Record<string, Point> = {};
  if (nodes.length > 0) {
    const placed = layoutWeb(nodes, edges, scaledPrevious);
    for (const id in placed) hubs[id] = { x: placed[id]!.x * scale, y: placed[id]!.y * scale };
  }
  // Si la toile des articles a redémarré de zéro (filtre, beaucoup d'articles en moins ou en plus), certains articles ont bougé :
  // les anciennes places des cartes ne valent plus rien, on les recalcule autour des nouveaux articles.
  const restarted = Object.entries(hubPrevious).some(([id, before]) => {
    const now = hubs[id];
    return now !== undefined && (now.x !== before.x || now.y !== before.y);
  });
  // Les articles s'ajoutent aux cartes, sans recopier les 200 000 cartes dans un nouvel objet.
  const out = placeCards(graph, hubs, model.hubsOf, restarted ? {} : previous);
  for (const id in hubs) out[id] = hubs[id]!;
  hubsOfLayout.set(out, hubs);
  return out;
}
