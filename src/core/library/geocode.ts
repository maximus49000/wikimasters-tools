import { RELAY_BASE } from '../documentary/config';
import { isSceneCity, toSceneCity, type SceneCity } from './scene-location';

// Recherche de ville du réglage « Lieu de la scène » : relais `/geocode` (Open-Meteo). Seul le texte tapé part au relais.
export const GEOCODE_RELAY = `${RELAY_BASE}/geocode`;

// La population ne sert qu'à départager les homonymes à l'affichage : elle n'est jamais enregistrée.
export type PlaceHit = SceneCity & { population?: number };

export class GeocodeError extends Error {
  constructor(readonly kind: 'offline' | 'failed') {
    super(kind);
    this.name = 'GeocodeError';
  }
}

type DoFetch = (url: string, init?: RequestInit) => Promise<Response>;

// Villes trouvées pour `q`. Lève GeocodeError (`offline` : pas de réseau ; `failed` : relais en échec ou réponse illisible), ou l'erreur
// d'annulation telle quelle quand `signal` a été annulé. Un résultat dont le fuseau est inconnu de l'appareil est écarté.
export async function searchPlaces(q: string, signal?: AbortSignal, doFetch: DoFetch = (url, init) => fetch(url, init)): Promise<PlaceHit[]> {
  let response: Response;
  try {
    response = await doFetch(`${GEOCODE_RELAY}?q=${encodeURIComponent(q.trim())}`, { signal });
  } catch (e) {
    if (signal?.aborted) throw e;
    throw new GeocodeError('offline');
  }
  if (!response.ok) throw new GeocodeError('failed');
  let body: { ok?: unknown; cities?: unknown } | null;
  try {
    body = (await response.json()) as { ok?: unknown; cities?: unknown } | null;
  } catch {
    throw new GeocodeError('failed');
  }
  if (body?.ok !== true || !Array.isArray(body.cities)) throw new GeocodeError('failed');
  return body.cities.filter(isSceneCity).map((c) => {
    const population = (c as { population?: unknown }).population;
    return { ...toSceneCity(c), ...(typeof population === 'number' && population > 0 ? { population } : {}) };
  });
}
