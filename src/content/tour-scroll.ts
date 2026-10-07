// Le conteneur qui fait défiler l'élément : le plus proche ancêtre à défilement vertical (jusque par-dessus un shadow DOM),
// sinon la page entière. La mise en page du site peut faire défiler un bloc plutôt que la fenêtre.
export function scrollContainerOf(element: Element): Element {
  let node: Element = element;
  for (;;) {
    const parent: Element | null = node.parentElement ?? (node.getRootNode() as ShadowRoot).host ?? null;
    if (!parent) break;
    const overflowY = getComputedStyle(parent).overflowY;
    if ((overflowY === 'auto' || overflowY === 'scroll') && parent.scrollHeight > parent.clientHeight) return parent;
    node = parent;
  }
  return document.scrollingElement ?? document.documentElement;
}

// Fait défiler de `delta` pixels (positif = la page monte, l'élément remonte à l'écran). Doux, sauf pour un très grand saut.
export function scrollTargetBy(element: Element, delta: number): void {
  const container = scrollContainerOf(element);
  const behavior = Math.abs(delta) > window.innerHeight * 1.5 ? 'auto' : 'smooth';
  if (typeof container.scrollBy === 'function') container.scrollBy({ top: delta, behavior });
  else container.scrollTop += delta;
}
