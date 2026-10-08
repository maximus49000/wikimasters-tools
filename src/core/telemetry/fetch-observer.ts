import type { Service } from './catalogue';
import { RELAY_BASE } from '../documentary/config';

const HOSTS: Record<string, Service> = {
  'www.wikidata.org': 'wikidata',
  'query.wikidata.org': 'wikidata',
  'commons.wikimedia.org': 'commons',
  'api.spotify.com': 'spotify',
  'accounts.spotify.com': 'spotify',
  'openapi.tidal.com': 'tidal',
  'api.themoviedb.org': 'tmdb',
  'store.steampowered.com': 'steam',
  'api.steampowered.com': 'steam',
  'api.igdb.com': 'igdb',
  'openlibrary.org': 'openlibrary',
  'www.googleapis.com': 'googlebooks',
  'api.github.com': 'github',
};
const RELAY_HOST = new URL(RELAY_BASE).host;

// Service concerné par une adresse (liste fermée) ; null pour tout le reste, y compris le site du jeu et l'envoi des statistiques.
export function serviceOf(url: string): Service | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.host === RELAY_HOST) return parsed.pathname === '/t' ? null : 'relais';
  if (parsed.host.endsWith('.wikipedia.org')) return 'wikipedia';
  return HOSTS[parsed.host] ?? null;
}

type Report = (name: 'api-429' | 'api-5xx' | 'api-reseau', service: Service) => void;

// Enveloppe transparente de `fetch` : la réponse (ou l'erreur) est rendue telle quelle, on note seulement 429, 5xx et pannes réseau.
export function observeFetch(base: typeof fetch, report: Report): typeof fetch {
  return async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const service = serviceOf(url);
    if (!service) return base(input, init);
    try {
      const response = await base(input, init);
      if (response.status === 429) report('api-429', service);
      else if (response.status >= 500) report('api-5xx', service);
      return response;
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) report('api-reseau', service);
      throw error;
    }
  };
}
