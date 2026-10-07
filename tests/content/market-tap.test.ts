import { describe, expect, it } from 'vitest';
import { COLLECTION_FILTER_MESSAGE, HELLO_MESSAGE, MARKET_MESSAGE, MARKET_WRITE_MESSAGE, MINE_MESSAGE, MOVEMENT_MESSAGE } from '../../src/content/market-messages';
import { asOwnRequest, installMarketTap, type TapWindow } from '../../src/content/market-tap';

function json(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' }, ...init });
}

function setup(respond: (url: string) => Response | Promise<Response>) {
  const posted: unknown[] = [];
  let listener: ((event: { source: unknown; data: unknown }) => void) | undefined;
  const win = {
    location: { href: 'https://www.wiki-masters.com/marketplace', origin: 'https://www.wiki-masters.com' },
    fetch: async (input: string | URL | Request) =>
      respond(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url),
    postMessage: (message: unknown) => {
      posted.push(message);
    },
    addEventListener: (_type: 'message', handler: typeof listener) => {
      listener = handler;
    },
  } as unknown as TapWindow;
  installMarketTap(win);
  return { win, posted, hello: () => listener?.({ source: win, data: { type: HELLO_MESSAGE } }) };
}

const PAGE = { auctions: [{ id: 'a1' }], hasMore: true };

describe('installMarketTap', () => {
  it('laisse la réponse intacte et relaie les enchères du marché', async () => {
    const { win, posted } = setup(() => json(PAGE));
    const response = await win.fetch('/api/marketplace?page=1&limit=50');
    expect(await response.json()).toEqual(PAGE);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(posted).toEqual([{ type: MARKET_MESSAGE, auctions: PAGE.auctions }]);
  });

  it('relaie aussi la variante mine=1 (elle contient les enchères du marché)', async () => {
    const { win, posted } = setup(() => json({ ...PAGE, selling: [] }));
    await win.fetch('/api/marketplace?page=1&limit=50&mine=1');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(posted[0]).toEqual({ type: MARKET_MESSAGE, auctions: PAGE.auctions });
    expect(posted[1]).toMatchObject({ type: MINE_MESSAGE, selling: [] });
  });

  it('ignore les autres routes, dont l’historique des ventes (fonction PRO)', async () => {
    const { win, posted } = setup(() => json(PAGE));
    await win.fetch('/api/marketplace/cards/abc/sales');
    await win.fetch('/api/marketplace/abc');
    await win.fetch('/api/wikibidous');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(posted).toEqual([]);
  });

  it('ne relaie rien pour une réponse en erreur ou illisible, sans casser la page', async () => {
    const { win, posted } = setup((url) =>
      url.includes('page=1')
        ? json({ error: 'x' }, { status: 500 })
        : new Response('<html>', { status: 200 }),
    );
    expect((await win.fetch('/api/marketplace?page=1')).status).toBe(500);
    expect((await win.fetch('/api/marketplace?page=2')).status).toBe(200);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(posted).toEqual([]);
  });

  it('rejoue les dernières pages vues quand le script de contenu se signale', async () => {
    const { win, posted, hello } = setup(() => json(PAGE));
    await win.fetch('/api/marketplace?page=1');
    await new Promise((resolve) => setTimeout(resolve, 0));
    hello();
    expect(posted).toHaveLength(2);
  });
});

describe('installMarketTap — filtres de la Collection', () => {
  it('relaie les filtres (sans page, tri ni stats) une seule fois par sélection', async () => {
    const { win, posted } = setup(() => json({ collection: [] }));
    await win.fetch('/api/my-collection?sort=rarity&rarity=UR&tag_id=t1&page=0&stats=0');
    await win.fetch('/api/my-collection?sort=rarity&rarity=UR&tag_id=t1&page=1&stats=0');
    await win.fetch('/api/my-collection/stats?sort=rarity&rarity=UR&tag_id=t1');
    await win.fetch('/api/my-collection?sort=rarity&page=0&stats=0');
    expect(posted).toEqual([
      { type: COLLECTION_FILTER_MESSAGE, filter: 'rarity=UR&tag_id=t1' },
      { type: COLLECTION_FILTER_MESSAGE, filter: '' },
    ]);
  });

  it('ignore les requêtes de la surcouche elle-même (scan trié par date, lecture d’un filtre)', async () => {
    const { win, posted } = setup(() => json({ collection: [] }));
    await win.fetch('/api/my-collection?sort=rarity&rarity=SR&page=0&stats=0');
    await asOwnRequest(() => win.fetch('/api/my-collection?sort=added&page=3&stats=0'));
    await win.fetch('/api/my-collection?sort=rarity&rarity=SR&page=1&stats=0');
    expect(posted).toEqual([{ type: COLLECTION_FILTER_MESSAGE, filter: 'rarity=SR' }]);
  });

  it('rejoue le dernier filtre à la demande du script de contenu', async () => {
    const { win, posted, hello } = setup(() => json({ collection: [] }));
    await win.fetch('/api/my-collection?sort=rarity&rarity=SR&page=0&stats=0');
    posted.length = 0;
    hello();
    expect(posted).toEqual([{ type: COLLECTION_FILTER_MESSAGE, filter: 'rarity=SR' }]);
  });
});

describe('cartes obtenues', () => {
  it('relaie la réponse d’une ouverture de pack ou d’un achat (requête d’écriture)', async () => {
    const { win, posted } = setup(() => json({ cards: [{ wikipedia_title: 'Paris' }] }));
    await win.fetch('/api/packs/open', { method: 'POST' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(posted).toEqual([{ type: 'wmt:cards', payload: { cards: [{ wikipedia_title: 'Paris' }] } }]);
  });

  it('ignore les lectures et les autres routes', async () => {
    const { win, posted } = setup(() => json({ cards: [{ wikipedia_title: 'Paris' }] }));
    await win.fetch('/api/packs/open');
    await win.fetch('/api/wikibidous', { method: 'POST' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(posted).toEqual([]);
  });

  it('signale une écriture d’échange réussie, et pas une simple lecture', async () => {
    const { win, posted } = setup(() => json({ ok: true }));
    await win.fetch('/api/trades');
    await win.fetch('/api/trades/abc/accept', { method: 'POST' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(posted).toEqual([{ type: MOVEMENT_MESSAGE }]);
  });

  it('signale une écriture sur le marché (mise en vente), pas une lecture', async () => {
    const { win, posted } = setup(() => json({ ok: true }));
    await win.fetch('/api/marketplace?page=1&limit=1&mine=1');
    await win.fetch('/api/marketplace', { method: 'POST' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(posted.filter((m) => (m as { type: string }).type === MARKET_WRITE_MESSAGE)).toEqual([{ type: MARKET_WRITE_MESSAGE }]);
  });
});
