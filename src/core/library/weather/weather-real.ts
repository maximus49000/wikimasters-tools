import { RELAY_BASE } from '../../documentary/config';
import type { Weather } from './weather-types';

export const WEATHER_RELAY = `${RELAY_BASE}/weather`;

export type RealObservation = { code: number; tempC: number; cloud: number; precipMm: number; windKmh: number; visibilityM: number };

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
const between = (n: number, lo: number, hi: number): boolean => n >= lo && n <= hi;

// Code météo WMO d'Open-Meteo → mêmes valeurs continues que la météo simulée.
export function realToWeather(obs: RealObservation): Weather {
  const thunder = obs.code >= 95;
  const snowy = between(obs.code, 71, 77) || obs.code === 85 || obs.code === 86;
  const drizzly = between(obs.code, 51, 57);
  const rainy = between(obs.code, 61, 67) || between(obs.code, 80, 82) || thunder;
  const foggy = obs.code === 45 || obs.code === 48;
  const byCode = thunder ? 0.9 : snowy ? 0.5 : rainy ? (obs.code === 65 || obs.code === 82 ? 0.85 : 0.6) : drizzly ? 0.25 : 0;
  const precip = clamp01(Math.max(byCode, byCode > 0 ? clamp01(obs.precipMm / 4) : 0));
  const kind: Weather['kind'] = snowy ? 'snow' : 'rain';
  const wetting = !snowy && (rainy || drizzly);
  return {
    cloud: clamp01(Math.max(obs.cloud / 100, precip > 0 ? 0.8 : 0)),
    precip,
    kind,
    fog: foggy ? 0.85 : clamp01(((10000 - obs.visibilityM) / 10000) * 0.6),
    wind: clamp01(obs.windKmh / 50),
    lightning: thunder ? 1 : 0,
    wet: wetting ? clamp01(precip * 1.4 + 0.2) : 0,
    snowCover: snowy ? clamp01(precip * 1.6 + 0.2) : 0,
  };
}

type Deps = {
  fetch: (url: string) => Promise<Response>;
  now: () => number;
  storage: { get(key: string): string | null; set(key: string, value: string): void };
};
type Pos = { lat: number; lon: number };
type Saved = { at: number; cell: string; obs: RealObservation };

const KEY = 'wmt:weather-real';
const FRESH_MS = 15 * 60_000;
const BACKOFF_MS = [60_000, 120_000, 300_000];
const round1 = (v: number): number => Math.round(v * 10) / 10;
const cell = (p: Pos): string => `${round1(p.lat).toFixed(1)},${round1(p.lon).toFixed(1)}`;
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

// Réponse du relais ({ ok, code, temp, cloud, precip, wind, visibility }) → observation, ou null si mal formée.
function parseReply(raw: unknown): RealObservation | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (r.ok !== true || !isNum(r.code) || !isNum(r.temp)) return null;
  const n = (v: unknown, fallback: number): number => (isNum(v) ? v : fallback);
  return { code: r.code, tempC: r.temp, cloud: n(r.cloud, 0), precipMm: n(r.precip, 0), windKmh: n(r.wind, 0), visibilityM: n(r.visibility, 20000) };
}

function parseSaved(text: string | null): Saved | null {
  if (!text) return null;
  const s = JSON.parse(text) as { at?: unknown; cell?: unknown; obs?: Record<string, unknown> | null };
  const o = s.obs;
  if (!isNum(s.at) || typeof s.cell !== 'string' || !o) return null;
  if (![o.code, o.tempC, o.cloud, o.precipMm, o.windKmh, o.visibilityM].every(isNum)) return null;
  return { at: s.at, cell: s.cell, obs: o as unknown as RealObservation };
}

// Lit la vraie météo par le relais, avec cache de 15 min, un seul appel à la fois et réessais espacés. Ne lève jamais.
export function createRealWeather(deps: Deps): { latest(): RealObservation | null; refresh(pos: Pos): Promise<RealObservation | null> } {
  let saved: Saved | null = null;
  try {
    saved = parseSaved(deps.storage.get(KEY));
  } catch {
    // Cache illisible : on repart de zéro.
  }
  let failures = 0;
  let retryAt = 0;
  let inFlight: Promise<RealObservation | null> | null = null;

  const fetchOnce = async (pos: Pos): Promise<RealObservation | null> => {
    try {
      const response = await deps.fetch(`${WEATHER_RELAY}?lat=${round1(pos.lat).toFixed(1)}&lon=${round1(pos.lon).toFixed(1)}`);
      if (!response.ok) throw new Error('status');
      const obs = parseReply(await response.json());
      if (!obs) throw new Error('shape');
      failures = 0;
      saved = { at: deps.now(), cell: cell(pos), obs };
      try {
        deps.storage.set(KEY, JSON.stringify(saved));
      } catch {
        // Stockage plein ou refusé : le cache mémoire suffit.
      }
      return obs;
    } catch {
      retryAt = deps.now() + BACKOFF_MS[Math.min(failures, BACKOFF_MS.length - 1)]!;
      failures++;
      return saved?.obs ?? null;
    } finally {
      inFlight = null;
    }
  };

  return {
    latest: () => saved?.obs ?? null,
    refresh(pos) {
      if (saved && saved.cell === cell(pos) && deps.now() - saved.at < FRESH_MS) return Promise.resolve(saved.obs);
      if (deps.now() < retryAt) return Promise.resolve(saved?.obs ?? null);
      inFlight ??= fetchOnce(pos);
      return inFlight;
    },
  };
}
