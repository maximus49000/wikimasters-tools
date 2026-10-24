// Écriture d'attributs SVG par les boucles à 15 images/s (fond-life.tsx, street-trees.tsx) : un attribut n'est écrit que s'il
// change ; la dernière valeur écrite est gardée en mémoire (pas de lecture du DOM à chaque image).
const WRITTEN = new WeakMap<Element, Map<string, string>>();
export function setIfChanged(el: Element, name: string, value: string): void {
  let w = WRITTEN.get(el);
  if (!w) WRITTEN.set(el, (w = new Map()));
  if (w.get(name) === value) return;
  w.set(name, value);
  if (el.getAttribute(name) !== value) el.setAttribute(name, value);
}
