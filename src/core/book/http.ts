import type { z } from 'zod';
import type { BookFetch } from './book-detail';
import { BookError } from './errors';

// Un appel JSON : les statuts d'erreur deviennent des `BookError`, un format inattendu lève.
export async function requestJson<S extends z.ZodType>(fetchFn: BookFetch, url: string, schema: S): Promise<z.infer<S>> {
  let response: Response;
  try {
    response = await fetchFn(url);
  } catch {
    throw new BookError('http', 'injoignable');
  }
  if (response.status === 404) throw new BookError('not-found', 'introuvable');
  if (response.status === 429) throw new BookError('rate-limited', 'limite atteinte');
  if (!response.ok) throw new BookError('http', `HTTP ${response.status}`);
  let json: unknown;
  try {
    json = await response.json();
  } catch {
    throw new BookError('http', 'réponse illisible');
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) throw new BookError('http', 'réponse inattendue');
  return parsed.data;
}
