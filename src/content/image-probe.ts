import { useSyncExternalStore } from 'react';
import { getCoverCache } from './cover-cache';

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
  // Pochette gardée sur l'appareil : son téléchargement (une seule fois) tient lieu d'essai.
  const covers = getCoverCache();
  if (covers?.handles(url)) {
    covers.want(url);
    return !covers.failed(url);
  }
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

// Taille réelle d'une image (null : introuvable ou illisible).
export function measureImage(url: string): Promise<{ w: number; h: number } | null> {
  if (typeof Image === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    img.referrerPolicy = 'no-referrer';
    img.onload = () => resolve(img.naturalWidth > 0 && img.naturalHeight > 0 ? { w: img.naturalWidth, h: img.naturalHeight } : null);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

// Tests : oublie les essais.
export function resetImageProbes(): void {
  probes.clear();
  version = 0;
}
