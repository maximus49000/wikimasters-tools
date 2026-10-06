import type { z } from 'zod';
import { GameError } from './errors';
import type { GameFetch, GameRequestInit, GameSource } from './game-detail';

// Un appel JSON : les statuts d'erreur deviennent des `GameError`, un format inattendu lève.
export async function requestJson<S extends z.ZodType>(source: GameSource, fetchFn: GameFetch, url: string, schema: S, init?: GameRequestInit): Promise<z.infer<S>> {
  let response: Response;
  try {
    response = await fetchFn(url, init);
  } catch {
    throw new GameError(source, 'http', 'injoignable');
  }
  if (response.status === 401 || response.status === 403) throw new GameError(source, 'auth', 'accès refusé');
  if (response.status === 404) throw new GameError(source, 'not-found', 'introuvable');
  if (response.status === 429) throw new GameError(source, 'rate-limited', 'limite atteinte');
  if (!response.ok) throw new GameError(source, 'http', `HTTP ${response.status}`);
  let json: unknown;
  try {
    json = await response.json();
  } catch {
    throw new GameError(source, 'http', 'réponse illisible');
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) throw new GameError(source, 'http', 'réponse inattendue');
  return parsed.data;
}
