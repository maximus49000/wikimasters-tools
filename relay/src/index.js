// Relais Wikimasters Tools : squelette. La recherche de documentaires s'y ajoutera (voir docs/superpowers/specs).
const HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'access-control-allow-origin': '*',
  'cache-control': 'no-store',
};

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: HEADERS });
    const { pathname } = new URL(request.url);
    if (pathname === '/' || pathname === '/ping') {
      return new Response(JSON.stringify({ ok: true, service: 'wikimasters-tools' }), { headers: HEADERS });
    }
    return new Response(JSON.stringify({ ok: false, error: 'Route inconnue' }), { status: 404, headers: HEADERS });
  },
};
