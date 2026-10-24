import { useCallback, useEffect, useSyncExternalStore, type ReactElement } from 'react';
import type { CityPaintPlan } from '../core/library/paint/city-plan';
import type { FondMoment } from '../core/library/paint/fond-time';
import { StreetTrees } from './street-trees';

// Place des arbres de la rue dans la profondeur de la scène : le calque `arbres-rue` est dessiné par le calque de la vie de la
// rue (city-life.tsx, juste avant les lampadaires ; scene-panorama.tsx sans population), donc AU-DESSUS de tout ce qui est
// sur les façades (vie aux fenêtres, toits, cages d'escalier, halls, devantures, chantiers, habitants et passants du trottoir) :
// on ne voit jamais une fenêtre à travers un houppier, seulement entre les rameaux nus. Mais il dépend de la ville peinte
// (plan, instant, étalonnage), que scene-city calcule : petit magasin de module, par ville (graine, largeur, hauteur).
// scene-city publie la scène des arbres (`shown` : la ville peinte est visible, avec son fondu) ; l'emplacement la lit et
// publie en retour si toutes les fosses ont leur image (scene-city attend ce signal pour montrer la ville peinte).
export type StreetTreesScene = {
  plan: CityPaintPlan;
  moment: FondMoment;
  daylight: number;
  twilight: number;
  gloom: boolean;
  dim: number;
  minutes: number;
  shown: boolean;
  fade: string;
};

export const treesSig = (seed: number, width: number, height: number): string => `${seed}|${width}|${height}`;
const scenes = new Map<string, StreetTreesScene>();
const ready = new Map<string, boolean>();
const listeners = new Set<() => void>();
const emit = (): void => {
  for (const l of [...listeners]) l();
};
const subscribe = (l: () => void): (() => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};
const same = (a: StreetTreesScene | undefined, b: StreetTreesScene): boolean =>
  !!a && (Object.keys(b) as (keyof StreetTreesScene)[]).every((k) => a[k] === b[k]);

export function resetStreetTreesSlotForTests(): void {
  scenes.clear();
  ready.clear();
}

// Toutes les fosses de cette ville ont leur image (publié par l'emplacement).
export function useStreetTreesReady(sig: string): boolean {
  const read = useCallback(() => ready.get(sig) ?? false, [sig]);
  return useSyncExternalStore(subscribe, read, read);
}

// scene-city : publie la scène des arbres (null en graphisme classique : rien n'est dessiné).
export function useStreetTreesScene(sig: string, scene: StreetTreesScene | null): void {
  useEffect(() => {
    if (!scene) {
      if (scenes.delete(sig)) emit();
      return;
    }
    if (same(scenes.get(sig), scene)) return;
    scenes.set(sig, scene);
    emit();
  });
  useEffect(
    () => () => {
      if (scenes.delete(sig)) emit();
    },
    [sig],
  );
}

// Emplacement du calque dans la profondeur de la rue : rien tant que la ville peinte n'a pas publié sa scène.
export function StreetTreesSlot({ seed, width, height, still }: { seed: number; width: number; height: number; still?: boolean }): ReactElement | null {
  const sig = treesSig(seed, width, height);
  const read = useCallback(() => scenes.get(sig) ?? null, [sig]);
  const scene = useSyncExternalStore(subscribe, read, read);
  const onReady = useCallback(
    (r: boolean) => {
      if (ready.get(sig) === r) return;
      ready.set(sig, r);
      emit();
    },
    [sig],
  );
  useEffect(
    () => () => {
      if (ready.delete(sig)) emit();
    },
    [sig],
  );
  if (!scene) return null;
  return (
    <g data-arbres-rue-scene="" style={{ opacity: scene.shown ? 1 : 0, transition: scene.fade }}>
      <StreetTrees plan={scene.plan} moment={scene.moment} daylight={scene.daylight} twilight={scene.twilight} gloom={scene.gloom} dim={scene.dim} minutes={scene.minutes} still={still} onReady={onReady} />
    </g>
  );
}
