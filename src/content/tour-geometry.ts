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
