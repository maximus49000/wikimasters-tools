// relay/src/books.ts
import { failure, forward, type Fetcher, type ProxyResult } from './proxy';

const BOOKS_VOLUMES = 'https://www.googleapis.com/books/v1/volumes';

export async function proxyBooks(url: URL, deps: { fetch: Fetcher; apiKey: string | undefined }): Promise<ProxyResult> {
  if (url.pathname !== '/books/volumes') return failure(404, 'not-found');
  if (!deps.apiKey) return failure(503, 'not-configured');
  const q = url.searchParams.get('q') ?? '';
  const max = Number(url.searchParams.get('maxResults'));
  if (q.length < 1 || q.length > 200 || url.searchParams.get('country') !== 'FR' || !Number.isInteger(max) || max < 1 || max > 10) return failure(400, 'bad-request');
  const query = new URLSearchParams({ q, country: 'FR', maxResults: String(max), key: deps.apiKey });
  return forward(deps.fetch, `${BOOKS_VOLUMES}?${query.toString()}`);
}
