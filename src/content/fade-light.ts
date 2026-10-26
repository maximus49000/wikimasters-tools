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
