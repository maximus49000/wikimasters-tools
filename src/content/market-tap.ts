import { CARDS_MESSAGE, COLLECTION_FILTER_MESSAGE, HELLO_MESSAGE, MARKET_MESSAGE } from './market-messages';

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
const COLLECTION_PATH = '/api/my-collection';
const REPLAY_LIMIT = 10;
// Actions du jeu qui donnent une carte (ouverture d'un pack, achat) : une requête d'écriture vers l'une de ces routes.
const OBTAIN_PATH = /^\/api\/.*(pack|booster|open|buy|purchase|claim|reveal|draw)/i;
// Paramètres de la requête qui ne sont pas des filtres.
const NON_FILTER_PARAMS = ['page', 'stats', 'sort'];

// Les filtres de la requête, triés pour qu'une même sélection donne toujours la même chaîne.
export function collectionFilterOf(url: URL): string {
  const params = new URLSearchParams(url.search);
  for (const name of NON_FILTER_PARAMS) params.delete(name);
  params.sort();
  return params.toString();
}

// Tri demandé par le site (« Nom », « Favoris »…) ; la rareté, tri par défaut, est omise du message.
export function collectionSortOf(url: URL): string {
  const sort = url.searchParams.get('sort') ?? '';
  return sort === 'rarity' ? '' : sort;
}

// Dans l'appli Android, la surcouche et la page partagent le même `fetch` : les requêtes de la surcouche (scan trié par
// date, lecture d'un filtre) ne doivent pas passer pour un choix de l'utilisateur. Le marqueur est posé le temps de
// l'appel synchrone, celui pendant lequel le relais lit l'URL.
let ownRequest = false;
export function asOwnRequest<T>(send: () => T): T {
  ownRequest = true;
  try {
    return send();
  } finally {
    ownRequest = false;
  }
}

const filterMessage =(filter: string, sort: string) => ({ type: COLLECTION_FILTER_MESSAGE, filter, ...(sort ? { sort } : {}) });

function requestUrl(input: string | URL | Request): string {
  if (typeof input === 'string') return input;
  return input instanceof URL ? input.href : input.url;
}

// Observation passive : on relaie ce que le site charge déjà pour lui-même.
// Aucune requête n'est émise, modifiée ni retardée ; toute erreur est absorbée.
export function installMarketTap(win: TapWindow): void {
  const original = win.fetch.bind(win);
  const recent: unknown[] = [];
  let lastFilter: string | null = null;
  let lastSort = '';

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

  // La réponse d'un pack ouvert ou d'un achat décrit déjà la carte : on la relaie pour éviter de la relire.
  async function inspectObtained(
    input: string | URL | Request,
    init: RequestInit | undefined,
    response: Response,
  ): Promise<void> {
    try {
      if (!response.ok) return;
      const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
      if (method === 'GET' || method === 'HEAD') return;
      if (!OBTAIN_PATH.test(new URL(requestUrl(input), win.location.href).pathname)) return;
      win.postMessage({ type: CARDS_MESSAGE, payload: await response.clone().json() }, win.location.origin);
    } catch {
      // réponse illisible : la page ne doit jamais en pâtir
    }
  }

  // Le filtre de la Collection se lit sur la requête elle-même, dès son émission.
  function watchFilter(input: string | URL | Request): void {
    if (ownRequest) return;
    try {
      const url = new URL(requestUrl(input), win.location.href);
      if (url.pathname !== COLLECTION_PATH) return;
      const filter = collectionFilterOf(url);
      const sort = collectionSortOf(url);
      if (filter === lastFilter && sort === lastSort) return;
      lastFilter = filter;
      lastSort = sort;
      win.postMessage(filterMessage(filter, sort), win.location.origin);
    } catch {
      // URL illisible : la page ne doit jamais en pâtir
    }
  }

  win.fetch = async (input, init) => {
    watchFilter(input);
    const response = await original(input, init);
    void inspect(input, response);
    void inspectObtained(input, init, response);
    return response;
  };

  // Le script de contenu se charge après les premières requêtes de la page : il demande un rejeu.
  win.addEventListener('message', (event) => {
    if (event.source !== win) return;
    if ((event.data as { type?: unknown } | null)?.type !== HELLO_MESSAGE) return;
    for (const message of recent) win.postMessage(message, win.location.origin);
    if (lastFilter !== null) {
      win.postMessage(filterMessage(lastFilter, lastSort), win.location.origin);
    }
  });
}
