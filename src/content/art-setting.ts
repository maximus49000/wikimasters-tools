import { useSyncExternalStore } from 'react';

// Graphisme de la Bibliothèque (vague Ghibli) : réglage LOCAL de l'appareil, global à toutes les pièces.
export const ART_KEY = 'wmt:library-art';
export type ArtStyle = 'classic' | 'ghibli';
const listeners = new Set<() => void>();

// Décision du 2026-10-13 : le graphisme classique est le MOTEUR de référence de la ville (logique, repli tant qu'une image
// peinte n'est pas prête) et Ghibli son seul rendu affiché. Le choix n'est plus proposé : Ghibli partout, y compris pour qui
// avait gardé le classique. Seule la valeur interne ENGINE_VIEW (jamais écrite par l'interface : banc d'essai, mise au point)
// montre encore le rendu du moteur. Les tests gardent le classique par défaut (__WMT_ART_DEFAULT__, vitest.config.ts) ; un
// stockage inaccessible donne la valeur par défaut.
export const ENGINE_VIEW = 'classic-engine';
const DEFAULT_ART: ArtStyle = typeof __WMT_ART_DEFAULT__ === 'undefined' ? 'ghibli' : __WMT_ART_DEFAULT__;
export function readArt(): ArtStyle {
  try {
    const v = localStorage.getItem(ART_KEY);
    return v === 'ghibli' ? 'ghibli' : v === ENGINE_VIEW ? 'classic' : DEFAULT_ART;
  } catch {
    return DEFAULT_ART;
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
  const style = useSyncExternalStore(subscribeArt, readArt, () => DEFAULT_ART);
  return [style, writeArt];
}
