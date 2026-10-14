// Lieu de la scène (spec 2026-10-14-lieu-scene §3.1) : géolocalisation de l'appareil, ville choisie ou désactivé.
export type SceneCity = { name: string; admin?: string; country: string; lat: number; lon: number; tz: string };
export type SceneLocation = { mode: 'geo' } | { mode: 'city'; city: SceneCity } | { mode: 'off' };

// Valeurs partagées : la même lecture rend le même objet (snapshot stable pour useSyncExternalStore).
export const GEO: SceneLocation = { mode: 'geo' };
export const OFF: SceneLocation = { mode: 'off' };

// Fuseau IANA connu du moteur JS de l'appareil (Intl lève une erreur sinon).
export function isValidTimeZone(tz: string): boolean {
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const isText = (v: unknown): v is string => typeof v === 'string';
const inRange = (v: unknown, max: number): v is number => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= max;

export function isSceneCity(v: unknown): v is SceneCity {
  if (typeof v !== 'object' || v === null) return false;
  const c = v as Record<string, unknown>;
  return isText(c.name) && c.name.trim() !== '' && isText(c.country) && (c.admin === undefined || isText(c.admin))
    && inRange(c.lat, 90) && inRange(c.lon, 180) && isText(c.tz) && isValidTimeZone(c.tz);
}

// Seuls les champs du réglage sont gardés : la population (homonymes) et tout champ inconnu sont écartés.
export const toSceneCity = (c: SceneCity & { population?: number }): SceneCity => ({
  name: c.name,
  ...(c.admin ? { admin: c.admin } : {}),
  country: c.country,
  lat: c.lat,
  lon: c.lon,
  tz: c.tz,
});

// Lecture tolérante : `raw` = clé wmt:scene-location ; tant qu'elle manque, `legacy` (ancien réglage wmt:positionEnabled) décide.
// Toute valeur illisible donne la géolocalisation (défaut), sans erreur.
export function parseLocation(raw: string | null, legacy: string | null): SceneLocation {
  if (raw === null) return legacy === 'off' ? OFF : GEO;
  try {
    const v = JSON.parse(raw) as { mode?: unknown; city?: unknown } | null;
    if (v?.mode === 'geo') return GEO;
    if (v?.mode === 'off') return OFF;
    if (v?.mode === 'city' && isSceneCity(v.city)) return { mode: 'city', city: toSceneCity(v.city) };
  } catch {
    // JSON cassé : défaut.
  }
  return GEO;
}
