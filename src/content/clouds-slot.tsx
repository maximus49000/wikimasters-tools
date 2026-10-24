import { useCallback, useLayoutEffect, useRef, useSyncExternalStore, type ReactElement } from 'react';

// Nuages peints DERRIÈRE la ville (Ghibli Ville). Avant, les cumulus étaient dessinés par la couche météo, PAR-DESSUS la scène,
// et découpés par la silhouette de la ville : une découpe en hauteur (le pixel opaque le plus haut de chaque colonne). Sous la
// couronne d'un arbre de la crête, la tranche peinte est transparente entre les troncs (on y voit le ciel), mais la découpe y
// retirait les nuages jusqu'au haut de la couronne : une boîte de ciel sans nuages, à bords verticaux, sous chaque groupe
// d'arbres, très visible la nuit (captures du téléphone du 2026-10-24). Les nuages sont maintenant dans la profondeur de la
// scène : ciel (dégradé, étoiles, soleil, lune) → nuages → ville peinte (tranches, vie du fond avec la grue et les ailes des
// moulins, fenêtres…) → acteurs → voiles de la météo, pluie, brouillard, neige, éclair (inchangés, toujours au-dessus).
// La scène (scene-panorama.tsx) monte cet emplacement, un simple <g>, entre le ciel et la ville ; la couche météo
// (scene-weather.tsx) y rend son groupe de nuages qui défile par un portail React et le retrouve ici pour sa boucle. Sans
// emplacement (autres paysages) ou sans couche météo, rien ne change.
export const cloudsSig = (seed: number, width: number, height: number): string => `${seed}|${width}|${height}`;
const hosts = new Map<string, SVGGElement>();
const listeners = new Set<() => void>();
const emit = (): void => {
  for (const l of [...listeners]) l();
};
const subscribe = (l: () => void): (() => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};

export function resetCloudsSlotForTests(): void {
  hosts.clear();
}

// Couche météo : l'emplacement des nuages de sa scène (null : pas d'emplacement, les nuages restent dans la couche météo).
export function useCloudsHost(sig: string | null): SVGGElement | null {
  const read = useCallback(() => (sig ? (hosts.get(sig) ?? null) : null), [sig]);
  return useSyncExternalStore(subscribe, read, read);
}

// Scène : l'emplacement, entre le ciel (soleil et lune compris) et la ville.
export function CloudsSlot({ sig }: { sig: string }): ReactElement {
  const el = useRef<SVGGElement | null>(null);
  useLayoutEffect(() => {
    const g = el.current;
    if (!g) return;
    hosts.set(sig, g);
    emit();
    return () => {
      if (hosts.get(sig) === g) {
        hosts.delete(sig);
        emit();
      }
    };
  }, [sig]);
  return <g data-clouds-slot="" ref={el} />;
}
