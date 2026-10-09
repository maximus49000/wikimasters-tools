import { failure, forward, type Fetcher, type ProxyResult } from './proxy';

// Noms de commerces réels autour de l'utilisateur (OpenStreetMap, par Overpass, sans clé), pour les enseignes de la scène Ville.
// Position arrondie à 0,1° (jamais enregistrée ailleurs que dans la clé de cache en mémoire), rayon de 25 km.
// Réponse réduite à « type du catalogue → noms » (≤ 30 par type, ≤ 24 caractères, dédoublonnés).
const OVERPASS = 'https://overpass-api.de/api/interpreter';
const RADIUS_M = 25_000;
export const SHOP_NAME_MAX = 30;
export const SHOP_NAME_LENGTH = 24;
const CACHE_MS = 30 * 86_400_000;
const CACHE_MAX = 300;
const COORD = /^-?\d{1,3}(\.\d+)?$/;
const cache = new Map<string, { at: number; body: string }>();
const rounded = (v: number): number => Math.round(v * 10) / 10 + 0;

const SHOP_TAGS: Record<string, string[]> = {
  bakery: ['bakery'], pastry: ['pastry'], confectionery: ['chocolatier'], chocolate: ['chocolatier'], butcher: ['butcher'],
  seafood: ['fishmonger'], cheese: ['cheese'], greengrocer: ['greengrocer'], wine: ['wine'], alcohol: ['wine'],
  convenience: ['grocery', 'minimarket'], supermarket: ['minimarket'], florist: ['florist'], books: ['bookshop'],
  music: ['records'], games: ['games'], toys: ['games'], hairdresser: ['hairdresser'], optician: ['optician'], tattoo: ['tattoo'],
  second_hand: ['thrift'], antiques: ['antiques'], pet: ['petshop'], bicycle: ['bikes'], laundry: ['laundry'], dry_cleaning: ['laundry'], tea: ['tearoom'],
};

// Étiquettes OSM d'un lieu → types du catalogue de l'extension (src/core/library/city/shops/catalog.ts).
export function typesOfTags(tags: Record<string, string>): string[] {
  const cuisine = (tags.cuisine ?? '').split(';');
  const amenity = tags.amenity;
  if (amenity === 'bar' || amenity === 'pub') return ['bar'];
  if (amenity === 'nightclub') return ['nightclub'];
  if (amenity === 'pharmacy') return ['pharmacy'];
  if (amenity === 'cafe') return cuisine.includes('tea') ? ['tearoom'] : ['cafe'];
  if (amenity === 'restaurant' || amenity === 'fast_food') {
    if (cuisine.includes('pizza')) return ['pizzeria'];
    if (cuisine.includes('kebab')) return ['kebab'];
    if (cuisine.includes('sushi')) return ['sushi'];
    return amenity === 'restaurant' ? ['restaurant'] : [];
  }
  if (tags.leisure === 'amusement_arcade') return ['arcade'];
  if (tags.shop === 'clothes') return tags.second_hand === 'only' || tags.second_hand === 'yes' ? ['thrift'] : [];
  return tags.shop ? (SHOP_TAGS[tags.shop] ?? []) : [];
}

const query = (lat: string, lon: string): string => {
  const around = `around:${RADIUS_M},${lat},${lon}`;
  const shops = Object.keys(SHOP_TAGS).concat('clothes').join('|');
  return `[out:json][timeout:20];(nwr["amenity"~"^(bar|pub|nightclub|pharmacy|cafe|restaurant|fast_food)$"]["name"](${around});nwr["shop"~"^(${shops})$"]["name"](${around});nwr["leisure"="amusement_arcade"]["name"](${around}););out tags 6000;`;
};

export async function proxyShops(url: URL, deps: { fetch: Fetcher; now: () => number }): Promise<ProxyResult> {
  const rawLat = url.searchParams.get('lat') ?? '';
  const rawLon = url.searchParams.get('lon') ?? '';
  const lat = Number(rawLat);
  const lon = Number(rawLon);
  if (!COORD.test(rawLat) || !COORD.test(rawLon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return failure(400, 'bad-request');
  const key = `${rounded(lat).toFixed(1)},${rounded(lon).toFixed(1)}`;
  const hit = cache.get(key);
  if (hit && deps.now() - hit.at < CACHE_MS) return { status: 200, body: hit.body };
  const result = await forward(deps.fetch, OVERPASS, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: `data=${encodeURIComponent(query(rounded(lat).toFixed(1), rounded(lon).toFixed(1)))}`,
  });
  if (result.status !== 200) return result.status === 429 ? result : failure(502, 'upstream');
  let parsed: unknown;
  try {
    parsed = JSON.parse(result.body);
  } catch {
    return failure(502, 'upstream');
  }
  const elements = (parsed as { elements?: unknown }).elements;
  if (!Array.isArray(elements)) return failure(502, 'upstream');
  const names: Record<string, string[]> = {};
  for (const el of elements) {
    const tags = (el as { tags?: Record<string, string> }).tags;
    const name = tags?.name?.trim();
    if (!tags || !name || name.length > SHOP_NAME_LENGTH) continue;
    for (const type of typesOfTags(tags)) {
      const list = (names[type] ??= []);
      if (list.length < SHOP_NAME_MAX && !list.includes(name)) list.push(name);
    }
  }
  const body = JSON.stringify({ ok: true, names });
  if (cache.size >= CACHE_MAX) cache.clear();
  cache.set(key, { at: deps.now(), body });
  return { status: 200, body };
}
