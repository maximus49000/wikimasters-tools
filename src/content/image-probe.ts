import { useSyncExternalStore } from 'react';

// Images de la pièce qui ne se chargent pas (adresse introuvable, 404…) : chaque adresse est essayée une fois en arrière-plan ;
// une adresse en échec est ensuite sautée (image suivante, ou couverture titrée) au lieu de dessiner l'icône d'image cassée.
type Probe = 'loading' | 'ok' | 'broken';
const probes = new Map<string, Probe>();
const listeners = new Set<() => void>();
let version = 0;

function probe(url: string): void {
  if (typeof Image === 'undefined') return;
  probes.set(url, 'loading');
  const img = new Image();
  img.referrerPolicy = 'no-referrer';
  img.onload = () => probes.set(url, 'ok');
  img.onerror = () => {
    probes.set(url, 'broken');
    version += 1;
    listeners.forEach((listener) => listener());
  };
  img.src = url;
}

// Vrai tant que l'adresse n'a pas échoué (le premier appel lance l'essai).
export function usableImage(url: string): boolean {
  const known = probes.get(url);
  if (known === undefined) probe(url);
  return known !== 'broken';
}

// Redessine le composant quand une image essayée vient d'échouer.
export function useImageProbe(): number {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    () => version,
  );
}

// Tests : oublie les essais.
export function resetImageProbes(): void {
  probes.clear();
  version = 0;
}
