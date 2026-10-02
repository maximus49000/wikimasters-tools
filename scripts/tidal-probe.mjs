// Sonde de développement : enregistre de vraies réponses de l'API Tidal (catalogue) pour écrire les analyseurs d'après elles.
// Usage : `node scripts/tidal-probe.mjs`. Lit TIDAL_CLIENT_ID et TIDAL_CLIENT_SECRET dans `.env.local` (ignoré par git, jamais
// injecté dans le build : pas de préfixe WXT_). Le secret et le jeton ne sont jamais affichés ni écrits.
// Les réponses vont dans `.superpowers/tidal-fixtures/` (ignoré par git).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const OUT = '.superpowers/tidal-fixtures';
const API = 'https://openapi.tidal.com/v2';
const COUNTRY = 'FR';

function readEnv() {
  const env = {};
  for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (match) env[match[1]] = match[2].replace(/^["']|["']$/g, '');
  }
  return env;
}

const { TIDAL_CLIENT_ID: id, TIDAL_CLIENT_SECRET: secret } = readEnv();
if (!id || !secret) {
  console.error('TIDAL_CLIENT_ID et TIDAL_CLIENT_SECRET manquent dans .env.local');
  process.exit(1);
}

mkdirSync(OUT, { recursive: true });

const tokenResponse = await fetch('https://auth.tidal.com/v1/oauth2/token', {
  method: 'POST',
  headers: { Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' },
  body: 'grant_type=client_credentials',
});
if (!tokenResponse.ok) {
  console.error('Jeton refusé : HTTP', tokenResponse.status);
  process.exit(1);
}
const { access_token: token, expires_in: expiresIn } = await tokenResponse.json();
console.log('jeton obtenu, expire dans', expiresIn, 's');

async function call(name, path, params = {}) {
  const url = `${API}${path}?${new URLSearchParams({ countryCode: COUNTRY, ...params })}`;
  const response = await fetch(url, { headers: { accept: 'application/vnd.api+json', Authorization: `Bearer ${token}` } });
  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  const headers = Object.fromEntries([...response.headers].filter(([key]) => /^(x-|retry|ratelimit|content-type)/i.test(key)));
  writeFileSync(`${OUT}/${name}.json`, JSON.stringify({ request: url, status: response.status, headers, body }, null, 2));
  console.log(String(response.status).padEnd(4), name, '←', path);
  return { status: response.status, body };
}

const firstId = (result, type) => result.body?.data?.find?.((item) => item.type === type)?.id ?? result.body?.included?.find?.((item) => item.type === type)?.id;

// Recherche de titres : `include` pour obtenir les titres ET leurs artistes sans appel de plus.
await call('search-tracks-a', '/searchResults', { 'filter[query]': 'Ghost Town The Specials', include: 'tracks' });
await call('search-tracks-b', '/searchResults', { 'filter[query]': 'Ghost Town The Specials', include: 'tracks,tracks.artists' });
const albums = await call('search-albums', '/searchResults', { 'filter[query]': 'Abbey Road The Beatles', include: 'albums,albums.artists' });
const artists = await call('search-artists', '/searchResults', { 'filter[query]': 'The Beatles', include: 'artists' });

const albumId = firstId(albums, 'albums');
if (albumId) {
  await call('album', `/albums/${albumId}`, { include: 'items,artists,coverArt' });
  await call('album-items', `/albums/${albumId}/relationships/items`, { include: 'items' });
} else console.log('aucun album trouvé dans la recherche');

const artistId = firstId(artists, 'artists');
if (artistId) {
  await call('artist', `/artists/${artistId}`);
  await call('artist-tracks', `/artists/${artistId}/relationships/tracks`, { collapseBy: 'FINGERPRINT', include: 'tracks' });
}

const trackId = firstId(await call('search-tracks-c', '/searchResults', { 'filter[query]': 'Come Together The Beatles', include: 'tracks' }), 'tracks');
if (trackId) await call('track', `/tracks/${trackId}`, { include: 'artists,albums' });

console.log(`réponses enregistrées dans ${OUT}/`);
