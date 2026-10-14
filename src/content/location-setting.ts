import { GEO, parseLocation, type SceneLocation } from '../core/library/scene-location';

const KEY = 'wmt:scene-location';
// Ancien réglage « Position » (Activé/Désactivé) : relu tant que la nouvelle clé manque, plus jamais écrit.
const LEGACY_KEY = 'wmt:positionEnabled';

const listeners = new Set<() => void>();
// Stockage refusé (fenêtre privée, quota) : le choix reste respecté pour la session.
let memory: SceneLocation | null = null;
// Une écriture a échoué : le stockage ne reflète plus le choix, la mémoire de session fait foi.
let writeFailed = false;
// Dernière lecture : mêmes textes stockés → même objet (snapshot stable pour useSyncExternalStore).
let last: { raw: string | null; legacy: string | null; value: SceneLocation } | null = null;

function read(): SceneLocation {
  if (writeFailed) return memory ?? GEO;
  let raw: string | null;
  let legacy: string | null;
  try {
    raw = window.localStorage.getItem(KEY);
    legacy = raw === null ? window.localStorage.getItem(LEGACY_KEY) : null;
  } catch {
    return memory ?? GEO;
  }
  if (last && last.raw === raw && last.legacy === legacy) return last.value;
  const value = parseLocation(raw, legacy);
  last = { raw, legacy, value };
  return value;
}

// Réglage « Lieu de la scène » : un seul lieu pour toute la Bibliothèque, gardé sur l'appareil ; relu à chaque appel.
export const locationSetting = {
  get: read,
  set(next: SceneLocation): void {
    if (JSON.stringify(next) === JSON.stringify(read())) return;
    memory = next;
    try {
      window.localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      // Stockage indisponible : la mémoire de session suffit.
      writeFailed = true;
    }
    for (const listener of listeners) listener();
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => void listeners.delete(listener);
  },
};

export function resetLocationForTests(): void {
  memory = null;
  writeFailed = false;
  last = null;
}
