import { useEffect, useState } from 'react';
import { GeocodeError, searchPlaces, type PlaceHit } from '../core/library/geocode';

// Attente après la dernière frappe avant d'interroger le relais (spec lieu §4.1).
export const SEARCH_DELAY_MS = 350;
export type PlaceSearchStatus = 'short' | 'loading' | 'done' | 'offline' | 'failed';

// Recherche de ville partagée par la fenêtre de la pièce et Paramètres › Position : au moins 2 lettres, attente de 350 ms, requête
// précédente annulée (et sa réponse ignorée). Un seul minuteur, seulement pendant la frappe.
export function usePlaceSearch(): { query: string; setQuery: (q: string) => void; status: PlaceSearchStatus; hits: PlaceHit[] } {
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<{ q: string; status: PlaceSearchStatus; hits: PlaceHit[] }>({ q: '', status: 'short', hits: [] });
  const q = query.trim();
  useEffect(() => {
    if (q.length < 2) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      searchPlaces(q, controller.signal).then(
        (hits) => {
          if (!controller.signal.aborted) setResult({ q, status: 'done', hits });
        },
        (e: unknown) => {
          if (!controller.signal.aborted) setResult({ q, status: e instanceof GeocodeError ? e.kind : 'failed', hits: [] });
        },
      );
    }, SEARCH_DELAY_MS);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [q]);
  const status: PlaceSearchStatus = q.length < 2 ? 'short' : result.q === q ? result.status : 'loading';
  return { query, setQuery, status, hits: status === 'done' ? result.hits : [] };
}
