import { describe, expect, it, vi } from 'vitest';
import { proxyTgdbImage } from '../../relay/src/tgdb-img';

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
const setup = (status = 200, type = 'image/jpeg') => {
  const fetchFn = vi.fn(async (_url: string, _init?: RequestInit) => new Response(status === 200 ? JPEG : 'non', { status, headers: { 'content-type': type } }));
  const call = (path: string) => proxyTgdbImage(new URL(`https://relais.test${path}`), { fetch: fetchFn });
  return { fetchFn, call };
};

describe('proxyTgdbImage', () => {
  it('transmet l’image du CDN TheGamesDB, lisible par la page (CORS) et gardée un an', async () => {
    const { fetchFn, call } = setup();
    const response = await call('/tgdb-img/medium/boxart/front/3279-1.jpg');
    expect(fetchFn.mock.calls[0]?.[0]).toBe('https://cdn.thegamesdb.net/images/medium/boxart/front/3279-1.jpg');
    expect(response.status).toBe(200);
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
    expect(response.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
    expect(response.headers.get('content-type')).toBe('image/jpeg');
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(JPEG);
  });

  it('dos, captures et logos, tailles medium et original', async () => {
    const { fetchFn, call } = setup();
    for (const path of ['/tgdb-img/original/boxart/back/3279-1.jpg', '/tgdb-img/medium/screenshots/20-1.jpg', '/tgdb-img/original/clearlogo/20.png']) {
      expect((await call(path)).status).toBe(200);
    }
    expect(fetchFn).toHaveBeenCalledTimes(3);
  });

  it('refuse tout autre chemin (pas un relais ouvert) sans appeler le CDN', async () => {
    const { fetchFn, call } = setup();
    for (const path of ['/tgdb-img/large/boxart/front/1.jpg', '/tgdb-img/medium/../secret.jpg', '/tgdb-img/medium/boxart/front/1.php', '/tgdb-img/medium/autre/1.jpg', '/tgdb-img/medium/boxart/front/a%2F..%2Fb.jpg']) {
      expect((await call(path)).status).toBe(400);
    }
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('image absente : 404 transmis ; réponse qui n’est pas une image : 502', async () => {
    expect((await setup(404).call('/tgdb-img/medium/boxart/front/9.jpg')).status).toBe(404);
    expect((await setup(200, 'text/html').call('/tgdb-img/medium/boxart/front/9.jpg')).status).toBe(502);
  });
});
