// relay/src/proxy.ts
export type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;
// Résultat d'une route de transmission : `index.ts` en fait la réponse HTTP (en-têtes CORS compris).
export type ProxyResult = { status: number; body: string; retryAfter?: string };

export const failure = (status: number, reason: string): ProxyResult => ({ status, body: JSON.stringify({ ok: false, reason }) });

// Transmet la réponse d'un service amont. Un refus de clé (401/403) ou une panne (5xx) devient un 502 neutre : le client ne doit ni
// croire que sa clé est en cause ni lire le détail de l'amont.
export async function forward(doFetch: Fetcher, url: string, init?: RequestInit): Promise<ProxyResult> {
  let response: Response;
  try {
    response = await doFetch(url, init);
  } catch {
    return failure(502, 'upstream');
  }
  if (response.status === 401 || response.status === 403 || response.status >= 500) return failure(502, 'upstream');
  const retryAfter = response.headers.get('retry-after');
  return { status: response.status, body: await response.text(), ...(retryAfter ? { retryAfter } : {}) };
}
