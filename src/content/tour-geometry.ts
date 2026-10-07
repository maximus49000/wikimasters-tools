export type Box = { left: number; top: number; width: number; height: number };

const PAD = 6;
const MARGIN = 12;

// Zone éclairée : le rectangle de la cible, élargi de quelques pixels.
export const spotlightBox = (r: Box): Box => ({ left: r.left - PAD, top: r.top - PAD, width: r.width + 2 * PAD, height: r.height + 2 * PAD });

// Position verticale de la bulle : sous la cible si elle tient, sinon au-dessus ; centrée sans cible ; jamais hors de l'écran par le haut.
export function bubbleTop(box: Box | null, viewportHeight: number, bubbleHeight: number): number {
  if (!box) return Math.max(MARGIN, (viewportHeight - bubbleHeight) / 2);
  const below = box.top + box.height + MARGIN;
  if (below + bubbleHeight <= viewportHeight - MARGIN) return below;
  return Math.max(MARGIN, box.top - MARGIN - bubbleHeight);
}

export type Size = { width: number; height: number };

// Garde la bulle entièrement dans l'écran (marge de 8 px) ; trop grande, elle se cale en haut à gauche.
export function clampBubble(pos: { left: number; top: number }, size: Size, screen: Size, margin = 8): { left: number; top: number } {
  return {
    left: Math.max(margin, Math.min(pos.left, screen.width - size.width - margin)),
    top: Math.max(margin, Math.min(pos.top, screen.height - size.height - margin)),
  };
}

// Échelle qui fait tenir un élément dans l'encart : on réduit, on n'agrandit jamais.
export function scaleToFit(width: number, height: number, maxWidth: number, maxHeight: number): number {
  if (width <= 0 || height <= 0) return 1;
  return Math.min(1, maxWidth / width, maxHeight / height);
}

export type Dock = 'top' | 'bottom';

// Position de la bulle calée contre le haut ou le bas de l'écran.
export const dockTop = (dock: Dock, bubbleHeight: number, viewportHeight: number, margin = MARGIN): number =>
  dock === 'top' ? margin : Math.max(margin, viewportHeight - bubbleHeight - margin);

// Cale la bulle en haut ou en bas, du côté qui demande le moins de défilement, et dit de combien faire défiler la page
// pour que la zone visée (bordure comprise) tienne entièrement dans l'espace laissé libre par la bulle.
// `scrollBy` positif : la page monte ; négatif : elle descend. Zone plus haute que l'espace libre : on garde son haut visible.
export function planLayout(box: Box, bubbleHeight: number, viewportHeight: number, margin = MARGIN): { dock: Dock; top: number; scrollBy: number } {
  const bottomEdge = viewportHeight - bubbleHeight - margin;
  const options = [
    { dock: 'bottom' as const, freeTop: margin, freeBottom: bottomEdge - margin },
    { dock: 'top' as const, freeTop: margin + bubbleHeight + margin, freeBottom: viewportHeight - margin },
  ];
  const needed = (o: (typeof options)[number]) => (box.top < o.freeTop ? box.top - o.freeTop : box.top + box.height > o.freeBottom ? box.top + box.height - o.freeBottom : 0);
  const fitting = options.filter((o) => o.freeBottom - o.freeTop >= box.height);
  const best = fitting.length > 0
    ? fitting.reduce((a, o) => (Math.abs(needed(o)) < Math.abs(needed(a)) ? o : a))
    : options.reduce((a, o) => (o.freeBottom - o.freeTop > a.freeBottom - a.freeTop ? o : a));
  const scrollBy = fitting.length > 0 ? needed(best) : box.top - best.freeTop;
  return { dock: best.dock, top: dockTop(best.dock, bubbleHeight, viewportHeight, margin), scrollBy };
}
