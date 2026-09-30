import { HELLO_MESSAGE, MARKET_MESSAGE } from './market-messages';

export type TapWindow = {
  location: { href: string; origin: string };
  fetch: (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
  postMessage: (message: unknown, targetOrigin: string) => void;
  addEventListener: (
    type: 'message',
    handler: (event: { source: unknown; data: unknown }) => void,
  ) => void;
};

const MARKETPLACE_PATH = '/api/marketplace';
const REPLAY_LIMIT = 10;

function requestUrl(input: string | URL | Request): string {
  if (typeof input === 'string') return input;
  return input instanceof URL ? input.href : input.url;
}

// Observation passive : on relaie ce que le site charge déjà pour lui-même.
// Aucune requête n'est émise, modifiée ni retardée ; toute erreur est absorbée.
export function installMarketTap(win: TapWindow): void {
  const original = win.fetch.bind(win);
  const recent: unknown[] = [];

  function relay(auctions: unknown): void {
    const message = { type: MARKET_MESSAGE, auctions };
    recent.push(message);
    if (recent.length > REPLAY_LIMIT) recent.shift();
    win.postMessage(message, win.location.origin);
  }

  async function inspect(input: string | URL | Request, response: Response): Promise<void> {
    try {
      if (!response.ok) return;
      if (new URL(requestUrl(input), win.location.href).pathname !== MARKETPLACE_PATH) return;
      const body = (await response.clone().json()) as { auctions?: unknown } | null;
      if (Array.isArray(body?.auctions)) relay(body.auctions);
    } catch {
      // réponse illisible : on ne dit rien, la page ne doit jamais en pâtir
    }
  }

  win.fetch = async (input, init) => {
    const response = await original(input, init);
    void inspect(input, response);
    return response;
  };

  // Le script de contenu se charge après les premières requêtes de la page : il demande un rejeu.
  win.addEventListener('message', (event) => {
    if (event.source !== win) return;
    if ((event.data as { type?: unknown } | null)?.type !== HELLO_MESSAGE) return;
    for (const message of recent) win.postMessage(message, win.location.origin);
  });
}
