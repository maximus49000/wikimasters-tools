import type { PendingStorage } from './pending-search';
import { clearSlot, readSlot, writeSlot } from './session-slot';

export type ReturnTarget = { slug: string; path: string };

const RETURN_KEY = 'wmt:returnTarget';
const REOPEN_KEY = 'wmt:pendingReopen';
const RETURN_MAX_AGE_MS = 3_600_000;
const REOPEN_MAX_AGE_MS = 60_000;

// Chemin relatif au site uniquement : jamais de sortie vers une autre adresse.
function isSitePath(path: string): boolean {
  return path.startsWith('/') && !path.startsWith('//');
}

// Page d'où l'on est parti chercher sur le marché, pour pouvoir y revenir.
export function setReturnTarget(storage: PendingStorage, target: ReturnTarget, now: number): void {
  if (!isSitePath(target.path)) return;
  writeSlot(storage, RETURN_KEY, { slug: target.slug, path: target.path }, now);
}

export function getReturnTarget(storage: PendingStorage, now: number): ReturnTarget | null {
  const value = readSlot<{ slug?: unknown; path?: unknown }>(storage, RETURN_KEY, RETURN_MAX_AGE_MS, now, false);
  if (typeof value?.slug !== 'string' || typeof value.path !== 'string') return null;
  return isSitePath(value.path) ? { slug: value.slug, path: value.path } : null;
}

export function clearReturnTarget(storage: PendingStorage): void {
  clearSlot(storage, RETURN_KEY);
}

// Carte à rouvrir au chargement de la page d'origine.
export function setPendingReopen(storage: PendingStorage, slug: string, now: number): void {
  writeSlot(storage, REOPEN_KEY, { slug }, now);
}

export function takePendingReopen(storage: PendingStorage, now: number): string | null {
  const value = readSlot<{ slug?: unknown }>(storage, REOPEN_KEY, REOPEN_MAX_AGE_MS, now, true);
  return typeof value?.slug === 'string' ? value.slug : null;
}
