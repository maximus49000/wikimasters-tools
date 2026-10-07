// Cherche `selector` dans le document puis dans les shadow DOM ouverts (les fiches du jeu y sont montées).
export function findTarget(selector: string, root: ParentNode = document): Element | null {
  const direct = root.querySelector(selector);
  if (direct) return direct;
  for (const element of root.querySelectorAll('*')) {
    const shadow = element.shadowRoot;
    if (!shadow) continue;
    const found = findTarget(selector, shadow);
    if (found) return found;
  }
  return null;
}
