import { useEffect, useState, useSyncExternalStore } from 'react';
import { parseShopNames, SHOPS_RELAY } from '../core/library/city/shops/names';
import type { NamePool } from '../core/library/city/shops/lifecycle';
import { currentPosition, isPositionKnown, subscribePosition } from './scene-position';

// Noms de commerces proches (relais /shops, position arrondie à 0,1°). La position n'est jamais enregistrée : les noms restent
// en mémoire de page (par case, un seul appel partagé) ; seule une date d'échec est écrite, et pendant 24 h on ne redemande pas.
// Sans nom (position inconnue, échec, pas de pièce Ville) : `{}`, les noms écrits à la main prennent le relais.

const TIMEOUT_MS = 20_000;
const FAIL_KEY = 'wmt:city-shops-fail';
const FAIL_PAUSE_MS = 24 * 3_600_000;
const EMPTY: NamePool = {};

// `+ 0` : -0 devient 0 (clé de case « -0.0 » évitée).
const rounded = (v: number): number => Math.round(v * 10) / 10 + 0;

// Case de 0,1° → réponse du relais (promesse partagée). null : échec.
const pools = new Map<string, Promise<NamePool | null>>();

// Remise à zéro du cache mémoire (tests uniquement).
export function resetShopNamesCacheForTests(): void {
  pools.clear();
}

function failedRecently(): boolean {
  try {
    const at = Number(window.localStorage.getItem(FAIL_KEY));
    return Number.isFinite(at) && at > 0 && Date.now() - at < FAIL_PAUSE_MS;
  } catch {
    return false;
  }
}

function rememberFailure(): void {
  try {
    window.localStorage.setItem(FAIL_KEY, String(Date.now()));
  } catch {
    // Stockage indisponible : l'échec reste seulement en mémoire de page.
  }
}

async function requestNames(lat: number, lon: number): Promise<NamePool | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`${SHOPS_RELAY}?lat=${lat.toFixed(1)}&lon=${lon.toFixed(1)}`, { signal: controller.signal });
    if (!response.ok) throw new Error('status');
    const parsed = parseShopNames(await response.json());
    if (!parsed) throw new Error('shape');
    return parsed;
  } catch {
    rememberFailure();
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function fetchNames(lat: number, lon: number): Promise<NamePool | null> {
  const cell = `${lat.toFixed(1)},${lon.toFixed(1)}`;
  let pending = pools.get(cell);
  if (!pending) {
    pending = failedRecently() ? Promise.resolve(null) : requestNames(lat, lon);
    pools.set(cell, pending);
  }
  return pending;
}

// `enabled` : au moins une pièce Ville ; sinon aucune requête.
export function useShopNames(enabled: boolean): NamePool {
  const position = useSyncExternalStore(subscribePosition, () => currentPosition(), () => currentPosition());
  const known = isPositionKnown();
  const lat = rounded(position.lat);
  const lon = rounded(position.lon);
  const cell = `${lat.toFixed(1)},${lon.toFixed(1)}`;
  const [found, setFound] = useState<{ cell: string; names: NamePool } | null>(null);
  useEffect(() => {
    if (!enabled || !known) return;
    let alive = true;
    void fetchNames(lat, lon).then((names) => {
      if (alive && names) setFound({ cell, names });
    });
    return () => {
      alive = false;
    };
  }, [enabled, known, lat, lon, cell]);
  return enabled && known && found?.cell === cell ? found.names : EMPTY;
}
