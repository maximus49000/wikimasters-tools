import { useLayoutEffect, useRef, useState, type RefObject } from 'react';

// Lumière à fondu des fenêtres de la ville (calque Ghibli, ville classique) : opacité allumée, 0 éteinte, fondu CSS de 4 s.
// Éteinte au repos, le nœud est en display none : un nœud SVG à opacité 0 reste peint et compte à chaque image (mesure au
// banc, 2026-10-26, vue rue 1440 px à 5 h 36 : ~550 lampes éteintes coûtaient ~20 ms de Layerize par image, 3 ms une fois
// cachées). Rien ne change à l'écran : à l'allumage, le nœud est d'abord montré à 0 (style relu) puis passe à son opacité
// (fondu complet, comme avant) ; à l'extinction il fond jusqu'à 0 et n'est caché qu'après le fondu. Allumé au montage :
// montré tout de suite à son opacité (sans fondu, comme avant).
export const FADE_S = 4;
// Marge après la fin du fondu avant de cacher le nœud (ms).
const HIDE_MARGIN_MS = 150;

export type FadeLight = { ref: RefObject<SVGElement | null>; display: 'none' | undefined; on: boolean };

export function useFadeLight(lit: boolean): FadeLight {
  const ref = useRef<SVGElement | null>(null);
  // shown : nœud montré (pas display none) ; on : opacité allumée appliquée.
  const [shown, setShown] = useState(lit);
  const [on, setOn] = useState(lit);
  useLayoutEffect(() => {
    if (lit) {
      // Caché : d'abord montré à opacité 0 (rendu suivant), pour que le fondu parte de 0.
      if (!shown) return setShown(true);
      if (!on) {
        // Style du nœud montré à 0 relu avant le passage à l'opacité allumée : la transition CSS part de là.
        if (ref.current) void getComputedStyle(ref.current).opacity;
        setOn(true);
      }
      return;
    }
    if (on) setOn(false);
    if (!shown) return;
    const id = setTimeout(() => setShown(false), FADE_S * 1000 + HIDE_MARGIN_MS);
    return () => clearTimeout(id);
  }, [lit, shown, on]);
  return { ref, display: shown ? undefined : 'none', on: on && lit };
}

// Même règle pour une lumière qu'une boucle bascule elle-même (halls, cages d'escalier : city-life.tsx), avec sa transition CSS
// (`transition` ; `offS` : durée du fondu d'extinction, 0 sans fondu). Allumage d'un nœud caché : montré à 0, style relu, puis
// opacité 1 (le fondu, ou son délai d'étage, part de 0, comme avant). Extinction : opacité 0, nœud caché à la fin du fondu (ou
// tout de suite s'il était déjà à 0 : premier placement). Rallumé pendant le fondu : jamais caché. La boucle n'écrit qu'aux
// bascules : la minuterie du fondu est un setTimeout, indépendant des images.
const hideTimers = new WeakMap<Element, ReturnType<typeof setTimeout>>();
export function writeFade(node: Element, on: boolean, transition: string, offS: number): void {
  const pending = hideTimers.get(node);
  if (on && pending !== undefined) {
    clearTimeout(pending);
    hideTimers.delete(node);
  }
  const was = node.getAttribute('opacity');
  (node as SVGElement).style.transition = transition;
  if (on) {
    if (node.getAttribute('display') === 'none') {
      node.removeAttribute('display');
      void getComputedStyle(node).opacity;
    }
    node.setAttribute('opacity', '1');
    return;
  }
  node.setAttribute('opacity', '0');
  if (node.getAttribute('display') === 'none' || pending !== undefined) return;
  // Déjà à 0 sans transition en cours (premier placement) : rien à fondre. Une transition vers 0 peut tourner si le rendu
  // React vient d'écrire l'opacité 0 (getAnimations ; absent, jsdom : considéré sans transition).
  const running = typeof (node as SVGElement).getAnimations === 'function' && (node as SVGElement).getAnimations().length > 0;
  if (offS <= 0 || (was !== null && Number(was) === 0 && !running)) {
    node.setAttribute('display', 'none');
    return;
  }
  hideTimers.set(
    node,
    setTimeout(() => {
      hideTimers.delete(node);
      if (Number(node.getAttribute('opacity')) === 0) node.setAttribute('display', 'none');
    }, offS * 1000 + HIDE_MARGIN_MS),
  );
}

// Nœud déjà dans l'état que writeFade donnerait (allumé : montré ; éteint : caché ou en fondu de sortie). Le rendu React peut
// réécrire l'opacité et `data-lit` d'une lumière que la boucle avait cachée (ou éteinte sans la cacher) : la boucle relit
// cet état pour ne pas la laisser cachée allumée.
export function fadeSettled(node: Element, on: boolean): boolean {
  const hidden = node.getAttribute('display') === 'none';
  return on ? !hidden : hidden || hideTimers.has(node);
}
