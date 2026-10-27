// Écriture d'attributs SVG par les boucles à 15 images/s (fond-life.tsx) : un attribut n'est écrit que s'il
// change ; la dernière valeur écrite est gardée en mémoire (pas de lecture du DOM à chaque image).
const WRITTEN = new WeakMap<Element, Map<string, string>>();
export function setIfChanged(el: Element, name: string, value: string): void {
  let w = WRITTEN.get(el);
  if (!w) WRITTEN.set(el, (w = new Map()));
  if (w.get(name) === value) return;
  w.set(name, value);
  if (el.getAttribute(name) !== value) el.setAttribute(name, value);
}

// Nœud SVG dont une boucle écrit l'opacité (sans transition CSS) : caché (display none) tant qu'elle vaut 0, montré dès
// qu'elle remonte. Un nœud à opacité 0 reste peint et passe par la mise en calques à chaque image (Layerize de la vue rue,
// mesure du 2026-10-26) ; caché, il ne coûte plus rien, et rien ne change à l'écran (il était invisible). Le DOM est relu
// (pas de mémoire comme setIfChanged) : le rendu React peut avoir réécrit `display` entre deux images.
export function hideAtZero(el: Element, opacity: string | number): void {
  const hide = Number(opacity) === 0;
  if (hide === (el.getAttribute('display') === 'none')) return;
  if (hide) el.setAttribute('display', 'none');
  else el.removeAttribute('display');
}

// Opacité écrite par une boucle (si elle change, DOM relu) et `display` en même temps (hideAtZero) : les deux ne peuvent pas
// être séparés par oubli.
export function setOpacity(el: Element | null, opacity: string): void {
  if (!el) return;
  if (el.getAttribute('opacity') !== opacity) el.setAttribute('opacity', opacity);
  hideAtZero(el, opacity);
}

// Même règle au rendu React (premier dessin d'un nœud que la boucle écrit ensuite) : `display` du nœud pour cette opacité.
export const zeroDisplay = (opacity: string | number): 'none' | undefined => (Number(opacity) === 0 ? 'none' : undefined);
