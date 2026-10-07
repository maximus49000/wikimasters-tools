const TEXT_PREFIX = 'text=';
const CLICKABLE = 'button, a, [role="button"]';

const clean = (text: string): string => text.replace(/\s+/g, ' ').trim().toLowerCase();

// Un bouton ou lien dont le libellé est exactement `text`, dans le document puis dans les shadow DOM ouverts.
export function findByText(text: string, root: ParentNode = document): Element | null {
  const wanted = clean(text);
  for (const element of root.querySelectorAll(CLICKABLE)) {
    if (clean(element.textContent ?? '') === wanted) return element;
  }
  for (const element of root.querySelectorAll('*')) {
    const shadow = element.shadowRoot;
    const found = shadow ? findByText(text, shadow) : null;
    if (found) return found;
  }
  return null;
}

// Cherche une cible dans le document puis dans les shadow DOM ouverts (les fiches du jeu y sont montées).
// `text=Libellé` vise un bouton ou un lien par son libellé exact (le menu « Plus » n'a pas d'attribut à lui).
export function findTarget(selector: string, root: ParentNode = document): Element | null {
  if (selector.startsWith(TEXT_PREFIX)) return findByText(selector.slice(TEXT_PREFIX.length), root);
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
