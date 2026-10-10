import { useSyncExternalStore } from 'react';

// Graphisme de la Bibliothèque (vague Ghibli) : réglage LOCAL de l'appareil, global à toutes les pièces.
export const ART_KEY = 'wmt:library-art';
export type ArtStyle = 'classic' | 'ghibli';
const listeners = new Set<() => void>();

// Désactivé par défaut : seule la valeur « ghibli » l'active ; un stockage inaccessible laisse le graphisme classique.
export function readArt(): ArtStyle {
  try {
    return localStorage.getItem(ART_KEY) === 'ghibli' ? 'ghibli' : 'classic';
  } catch {
    return 'classic';
  }
}

export function writeArt(style: ArtStyle): void {
  try {
    localStorage.setItem(ART_KEY, style);
  } catch {
    /* stockage indisponible : réglage non conservé */
  }
  for (const listener of listeners) listener();
}

export function subscribeArt(listener: () => void): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

export function useArtStyle(): [ArtStyle, (style: ArtStyle) => void] {
  const style = useSyncExternalStore(subscribeArt, readArt, () => 'classic' as const);
  return [style, writeArt];
}
