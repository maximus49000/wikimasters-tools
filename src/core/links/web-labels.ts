import { CARD_SIZE, cardId, hubId, hubRadius, type WebGraph } from './web-graph';
import type { Point } from './web-layout';

const MAX_TITLE = 24;
export const shortTitle = (title: string): string => (title.length > MAX_TITLE ? `${title.slice(0, MAX_TITLE - 1)}…` : title);

// Les cartes ne sont nommées qu'à partir de ce zoom : plus petites, elles n'ont pas la place d'un nom.
export const CARD_LABEL_ZOOM = 1;

// Taille estimée d'un nom (police de 11 px) : de quoi éviter les chevauchements sans mesurer le texte.
const CHAR_WIDTH = 5.8;
const LABEL_HEIGHT = 14;
const LABEL_GAP = 3;
const MARGIN = 2;
const CELL = 96;

type Box = { left: number; right: number; top: number; bottom: number };

const cellKey = (gx: number, gy: number): number => (gx + 4096) * 8192 + (gy + 4096);
const overlaps = (a: Box, b: Box): boolean =>
  a.left < b.right + MARGIN && b.left < a.right + MARGIN && a.top < b.bottom + MARGIN && b.top < a.bottom + MARGIN;

// Les noms à afficher à ce zoom `k` : dans l'ordre d'importance (nœuds mis en avant, cartes, puis points du plus au moins partagé),
// chacun n'est gardé que s'il ne recouvre pas un nom déjà retenu. Zoomer écarte les nœuds : les noms écartés reviennent.
// Un point se nomme au-dessus de lui, une carte en dessous ; les nœuds gardent leur taille à l'écran jusqu'à `k = 1`, puis rétrécissent avec lui.
export function chooseLabels(
  graph: WebGraph,
  positions: Record<string, Point>,
  lit: ReadonlySet<string> | null,
  k: number,
): Set<string> {
  type Entry = { id: string; text: string; half: number; side: 1 | -1 };
  const cards: Entry[] = graph.cards.map((card) => ({ id: cardId(card.slug), text: shortTitle(card.title), half: CARD_SIZE / 2, side: 1 }));
  const hubs: Entry[] = graph.hubs.map((hub) => ({ id: hubId(hub.slug), text: shortTitle(hub.title), half: hubRadius(hub.cards.length), side: -1 }));
  const wanted = (entry: Entry) => lit?.has(entry.id) === true;
  const ordered = [
    ...cards.filter(wanted),
    ...hubs.filter(wanted),
    ...(k >= CARD_LABEL_ZOOM ? cards.filter((entry) => !wanted(entry)) : []),
    ...hubs.filter((entry) => !wanted(entry)),
  ];

  const shown = Math.min(k, 1);
  const chosen = new Set<string>();
  const grid = new Map<number, Box[]>();
  for (const { id, text, half, side } of ordered) {
    const point = positions[id];
    if (!point) continue;
    const width = text.length * CHAR_WIDTH + 4;
    const x = point.x * k;
    const y = point.y * k;
    const offset = half * shown + LABEL_GAP;
    const top = side === 1 ? y + offset : y - offset - LABEL_HEIGHT;
    const box: Box = { left: x - width / 2, right: x + width / 2, top, bottom: top + LABEL_HEIGHT };
    const keys: number[] = [];
    for (let gx = Math.floor(box.left / CELL); gx <= Math.floor(box.right / CELL); gx++) {
      for (let gy = Math.floor(box.top / CELL); gy <= Math.floor(box.bottom / CELL); gy++) keys.push(cellKey(gx, gy));
    }
    if (keys.some((key) => grid.get(key)?.some((other) => overlaps(box, other)))) continue;
    for (const key of keys) {
      const list = grid.get(key);
      if (list) list.push(box);
      else grid.set(key, [box]);
    }
    chosen.add(id);
  }
  return chosen;
}
