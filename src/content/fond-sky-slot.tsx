import { useCallback, useLayoutEffect, useRef, useSyncExternalStore, type ReactElement } from 'react';

// Grue et ailes des moulins DEVANT les nuages (capture de l'utilisateur du 2026-10-24 : la nuit sous la pluie, deux formes
// sombres découpées dans les nuages au-dessus des toits). La grue et les ailes dépassent la crête ; dessinées par le calque
// `vie-fond` (fond-life.tsx), sous le calque de la météo, elles étaient recouvertes par les nuages, qu'il fallait donc retirer
// d'une boîte autour d'elles (rectangle pour la grue, disque en escalier pour les ailes) : la nuit, grue et moulin presque
// invisibles, il restait des trous en forme de boîte. Les nuages sont derrière la colline : la grue et les ailes passent au-dessus
// d'eux, dans le groupe du ciel de la météo (scene-weather.tsx), juste après les nuages et sous les voiles, la pluie, le
// brouillard et la neige. Cet emplacement est un simple <g> monté là ; FondLife y dessine ses nœuds par un portail React (mêmes
// nœuds, même boucle : rien de plus à chaque image) dès qu'il existe pour sa ville (graine, largeur, hauteur). Sans calque météo
// (météo coupée, autres paysages, graphisme classique), pas d'emplacement : la grue et les ailes restent dans `vie-fond`.
//
// Le voile du ciel (`data-wx="tint"`, jusqu'à 92 % d'opacité sous la pluie) est dessiné AVANT les nuages : la grue, désormais
// au-dessus des nuages, n'est plus sous lui. La boucle de la météo publie ici sa couleur et son opacité (`veil`) ; FondLife mêle
// ce voile aux couleurs de la grue et des ailes (même calcul que le voile posé par-dessus : couleur × (1 − a) + voile × a, avec
// le dégradé vertical du voile), écrites seulement quand le voile change d'un cran.
export type FondVeil = { color: string; alpha: number };
export type FondSkyHost = { el: SVGGElement; veil: FondVeil; height: number };

// Couleur et opacité du voile à la hauteur `y` (dégradé du voile : opacité 1 en haut, 0,45 en bas, sur toute la hauteur).
export const veilAlphaAt = (veil: FondVeil, y: number, height: number): number => veil.alpha * (1 - 0.55 * Math.max(0, Math.min(1, y / height)));

export const fondSig = (seed: number, width: number, height: number): string => `${seed}|${width}|${height}`;
const hosts = new Map<string, FondSkyHost>();
const listeners = new Set<() => void>();
const emit = (): void => {
  for (const l of [...listeners]) l();
};
const subscribe = (l: () => void): (() => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};

export function resetFondSkySlotForTests(): void {
  hosts.clear();
}

// FondLife : l'emplacement de sa ville dans le calque de la météo (null : pas de météo, la grue reste dans vie-fond).
export function useFondSkyHost(sig: string | null): FondSkyHost | null {
  const read = useCallback(() => (sig ? (hosts.get(sig) ?? null) : null), [sig]);
  return useSyncExternalStore(subscribe, read, read);
}

// scene-weather : l'emplacement, monté juste après les nuages (Ghibli Ville).
export function FondSkySlot({ sig, veil, height }: { sig: string; veil: FondVeil; height: number }): ReactElement {
  const el = useRef<SVGGElement | null>(null);
  useLayoutEffect(() => {
    const g = el.current;
    if (!g) return;
    const host: FondSkyHost = { el: g, veil, height };
    hosts.set(sig, host);
    emit();
    return () => {
      if (hosts.get(sig) === host) {
        hosts.delete(sig);
        emit();
      }
    };
  }, [sig, veil, height]);
  return <g data-vie-ciel="" ref={el} />;
}
