// Ce que MainActivity.java expose à la page : `WmtHttp.request(id, url, method, headersJson, body)` fait la requête côté Android
// (sans CORS) puis appelle `window.__wmtHttpDone(id, status, retryAfter, body)`.
export type NativeHttpWindow = {
  WmtHttp?: { request(id: string, url: string, method: string, headersJson: string, body: string): void };
  __wmtHttpDone?: (id: string, status: number, retryAfter: string, body: string) => void;
};

// Hôtes sans en-têtes CORS : seuls ceux-là passent par le pont (le reste garde le fetch de la page).
export const GAME_NATIVE_PREFIXES: readonly string[] = ['https://store.steampowered.com/', 'https://api.steampowered.com/', 'https://id.twitch.tv/oauth2/token', 'https://api.igdb.com/v4/'];

const NO_BODY = new Set([101, 204, 205, 304]);
const TIMEOUT_MS = 20_000;

export function createNativeFetch(win: NativeHttpWindow, fallback: typeof fetch): typeof fetch {
  const pending = new Map<string, (status: number, retryAfter: string, body: string) => void>();
  let counter = 0;
  const install = () => {
    win.__wmtHttpDone = (id, status, retryAfter, body) => pending.get(id)?.(status, retryAfter, body);
  };

  return (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const bridge = win.WmtHttp;
    if (!bridge || !GAME_NATIVE_PREFIXES.some((prefix) => url.startsWith(prefix))) return fallback(input, init);
    install();
    const id = `http-${(counter += 1)}`;
    const headers = (init?.headers ?? {}) as Record<string, string>;
    return new Promise<Response>((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new TypeError('pont HTTP : délai dépassé'));
      }, TIMEOUT_MS);
      pending.set(id, (status, retryAfter, body) => {
        clearTimeout(timer);
        pending.delete(id);
        if (status === 0) return reject(new TypeError('pont HTTP : réseau indisponible'));
        resolve(new Response(NO_BODY.has(status) ? null : body, { status, ...(retryAfter ? { headers: { 'Retry-After': retryAfter } } : {}) }));
      });
      try {
        bridge.request(id, url, init?.method ?? 'GET', JSON.stringify(headers), typeof init?.body === 'string' ? init.body : '');
      } catch (error) {
        clearTimeout(timer);
        pending.delete(id);
        reject(error);
      }
    });
  };
}
