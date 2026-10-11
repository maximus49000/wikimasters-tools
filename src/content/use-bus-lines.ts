import { useEffect, useState, useSyncExternalStore } from 'react';
import { BUS_LINES_RELAY, parseBusNetwork, type BusNetwork } from '../core/library/city/traffic/bus-lines';
import { currentPosition, isPositionKnown, subscribePosition } from './scene-position';

// Lignes de bus réelles proches (relais /buslines, spec véhicules §5), comme les noms de commerces (use-shop-names.ts) : la
// position arrondie à 0,1° part dans le CORPS d'un POST (jamais dans l'URL) ; les lignes restent en mémoire de page (par case,
// un seul appel partagé) ; seule une date d'échec est écrite, et pendant 24 h on ne redemande pas.
// Sans ligne (position inconnue, échec, pas de pièce Ville) : null, le moteur prend ses lignes de repli.

// Relais : jusqu’à trois serveurs Overpass essayés l’un après l’autre (65 s au plus en tout).
const TIMEOUT_MS = 70_000;
const FAIL_KEY = 'wmt:city-buslines-fail';
const FAIL_PAUSE_MS = 24 * 3_600_000;

const rounded = (v: number): number => Math.round(v * 10) / 10 + 0;
const networks = new Map<string, Promise<BusNetwork | null>>();

// Remise à zéro du cache mémoire (tests uniquement).
export function resetBusLinesCacheForTests(): void {
  networks.clear();
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

async function requestLines(lat: number, lon: number): Promise<BusNetwork | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(BUS_LINES_RELAY, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ lat: Number(lat.toFixed(1)), lon: Number(lon.toFixed(1)) }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error('status');
    const parsed = parseBusNetwork(await response.json());
    if (!parsed) throw new Error('shape');
    return parsed;
  } catch {
    rememberFailure();
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function fetchLines(lat: number, lon: number): Promise<BusNetwork | null> {
  const cell = `${lat.toFixed(1)},${lon.toFixed(1)}`;
  let pending = networks.get(cell);
  if (!pending) {
    pending = failedRecently() ? Promise.resolve(null) : requestLines(lat, lon);
    networks.set(cell, pending);
  }
  return pending;
}

// `enabled` : au moins une pièce Ville ; sinon aucune requête.
export function useBusLines(enabled: boolean): BusNetwork | null {
  const position = useSyncExternalStore(subscribePosition, () => currentPosition(), () => currentPosition());
  const known = isPositionKnown();
  const lat = rounded(position.lat);
  const lon = rounded(position.lon);
  const cell = `${lat.toFixed(1)},${lon.toFixed(1)}`;
  const [found, setFound] = useState<{ cell: string; network: BusNetwork } | null>(null);
  useEffect(() => {
    if (!enabled || !known) return;
    let alive = true;
    void fetchLines(lat, lon).then((network) => {
      if (alive && network) setFound({ cell, network });
    });
    return () => {
      alive = false;
    };
  }, [enabled, known, lat, lon, cell]);
  return enabled && known && found?.cell === cell ? found.network : null;
}
