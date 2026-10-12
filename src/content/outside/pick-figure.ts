// Personnage visé par un appui dans la vue dehors : toutes les couches de la ville posent leurs acteurs dans des nœuds marqués.
export const FOLLOW_SELECTOR = '[data-life-id], [data-figure], [data-worker], [data-walker]';
const NEAR_PX = 24;

type Box = { left: number; top: number; right: number; bottom: number; width: number; height: number };

// Visible à l'écran : boîte non nulle, pas une figure Ghibli cachée (cf. hideFigure), aucun ancêtre (jusqu'à root) masqué.
export function isShown(el: Element, root: Element): boolean {
  const r = el.getBoundingClientRect();
  if (r.width <= 0 || r.height <= 0) return false;
  // Figure Ghibli rendue invisible par hideFigure : image sans source, clé retirée.
  if (el.hasAttribute('data-sig') && !el.hasAttribute('data-key')) return false;
  for (let n: Element | null = el; n && n !== root; n = n.parentElement) {
    const op = n.getAttribute('opacity');
    if (op !== null && Number(op) === 0) return false;
    if ((n as SVGElement).style?.display === 'none') return false;
  }
  return true;
}

const distance = (r: Box, x: number, y: number): number => Math.hypot(Math.max(r.left - x, 0, x - r.right), Math.max(r.top - y, 0, y - r.bottom));

// Dans l'ordre inverse du document : le dernier dessiné (le plus en avant) gagne à égalité.
export function pickFigure(root: Element, clientX: number, clientY: number): Element | null {
  const all = [...root.querySelectorAll(FOLLOW_SELECTOR)];
  let best: Element | null = null;
  let bestD = NEAR_PX;
  for (let i = all.length - 1; i >= 0; i--) {
    const el = all[i]!;
    if (!isShown(el, root)) continue;
    const d = distance(el.getBoundingClientRect(), clientX, clientY);
    if (d === 0) return el;
    if (d < bestD) {
      bestD = d;
      best = el;
    }
  }
  return best;
}
