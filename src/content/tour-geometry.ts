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
