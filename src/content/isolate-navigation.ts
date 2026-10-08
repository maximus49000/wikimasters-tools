// Vue Bibliothèque épurée : on ne garde que la navigation entre les vues et le panneau. Le titre et les filtres du site
// ne se reconnaissent pas à leurs classes CSS (elles changent) : on remonte donc depuis les éléments à garder jusqu'à la
// frontière et on masque, à chaque niveau, tout ce qui n'est pas un gardé ni un de ses ancêtres.
const NAV_HIDDEN_ATTRIBUTE = 'data-wmt-nav-hidden';
const GRID_HIDDEN_ATTRIBUTE = 'data-wmt-grid-hidden';
const NEVER_HIDDEN = new Set(['SCRIPT', 'STYLE', 'LINK', 'TEMPLATE']);

function onKeeperChain(element: Element, keepers: HTMLElement[]): boolean {
  return keepers.some((keeper) => element === keeper || element.contains(keeper));
}

// Idempotent : un élément déjà masqué (par nous ou par le masquage de la grille) n'est pas retouché.
export function isolateNavigation(keepers: HTMLElement[], boundary: HTMLElement): void {
  for (const keeper of keepers) {
    if (keeper === boundary || !boundary.contains(keeper)) continue;
    for (let node: HTMLElement = keeper; node !== boundary; ) {
      const parent: HTMLElement | null = node.parentElement;
      if (!parent) break;
      for (const sibling of parent.children) {
        if (!(sibling instanceof HTMLElement) || NEVER_HIDDEN.has(sibling.tagName) || onKeeperChain(sibling, keepers)) continue;
        if (sibling.hasAttribute(NAV_HIDDEN_ATTRIBUTE) || sibling.hasAttribute(GRID_HIDDEN_ATTRIBUTE) || sibling.style.display === 'none') continue;
        sibling.setAttribute(NAV_HIDDEN_ATTRIBUTE, sibling.style.display);
        sibling.style.display = 'none';
      }
      node = parent;
    }
  }
}

export function restoreNavigation(root: ParentNode): void {
  for (const element of root.querySelectorAll<HTMLElement>(`[${NAV_HIDDEN_ATTRIBUTE}]`)) {
    element.style.display = element.getAttribute(NAV_HIDDEN_ATTRIBUTE) ?? '';
    element.removeAttribute(NAV_HIDDEN_ATTRIBUTE);
  }
}
