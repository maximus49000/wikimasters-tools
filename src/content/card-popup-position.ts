export type Rect = { left: number; right: number; top: number; bottom: number };
export type Size = { width: number; height: number };
export type Placement = { left: number; top: number; scale: number };

const GAP = 8;

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(value, max));

// Place l'aperçu contre son ancre en le gardant entièrement dans la fenêtre : au-dessus, sinon en dessous,
// sinon sur le côté (à droite, puis à gauche). Trop grand pour la fenêtre, il est réduit plutôt que coupé.
export function placePopup(anchor: Rect, size: Size, viewport: Size): Placement {
  const scale = Math.min(1, (viewport.height - 2 * GAP) / size.height, (viewport.width - 2 * GAP) / size.width);
  const width = size.width * scale;
  const height = size.height * scale;
  const maxLeft = viewport.width - GAP - width;
  const maxTop = viewport.height - GAP - height;
  const centered = clamp((anchor.left + anchor.right) / 2 - width / 2, GAP, maxLeft);

  if (anchor.top - GAP - height >= GAP) return { left: centered, top: anchor.top - GAP - height, scale };
  if (anchor.bottom + GAP + height <= viewport.height - GAP) return { left: centered, top: anchor.bottom + GAP, scale };

  const right = anchor.right + GAP;
  const left = right <= maxLeft ? right : Math.max(GAP, anchor.left - GAP - width);
  return { left: clamp(left, GAP, maxLeft), top: clamp(anchor.top, GAP, maxTop), scale };
}
