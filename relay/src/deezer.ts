import { failure, forward, type Fetcher, type ProxyResult } from './proxy';

// Extrait Deezer de 30 s d'un morceau (spec notes au tempo) : le client en mesure le tempo. Le relais ne transmet JAMAIS d'audio,
// seulement l'URL de l'extrait (signée, expire en ~15 min : jamais mise en cache) et le BPM déclaré par Deezer.
const BASE = 'https://api.deezer.com';
const CACHE_MS = 30 * 86_400_000;
const CACHE_MAX = 500;
const FIELD_MAX = 200;

// Cache par « artiste|titre » normalisés : seul l'identifiant de piste Deezer (ou null = aucune correspondance) est gardé.
const cache = new Map<string, { at: number; id: number | null }>();
export const resetDeezerCacheForTests = (): void => cache.clear();

const fold = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const alnum = (s: string): string => s.replace(/[^a-z0-9]+/g, ' ').trim();

// Titre comparable : sans accents ni casse, sans parenthèses/crochets, sans suffixe après « - » (Remastered…) ni « feat. ».
function normTitle(raw: string): string {
  const base = fold(raw)
    .replace(/\([^)]*\)|\[[^\]]*\]/g, ' ')
    .replace(/\s+-\s.*$/, ' ')
    .replace(/\s(feat\.?|ft\.?|featuring)\s.*$/, ' ');
  return alnum(base) || alnum(fold(raw));
}
const normArtist = (raw: string): string => alnum(fold(raw).replace(/\s(feat\.?|ft\.?|featuring)\s.*$/, ' ')) || alnum(fold(raw));
const related = (a: string, b: string): boolean => a !== '' && b !== '' && (a.includes(b) || b.includes(a));

type Hit = { id: number; title: string; artist: string };
function toHit(raw: unknown): Hit | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as { id?: unknown; title?: unknown; artist?: { name?: unknown } | null };
  const name = r.artist?.name;
  if (typeof r.id !== 'number' || !Number.isFinite(r.id) || typeof r.title !== 'string' || typeof name !== 'string') return null;
  return { id: r.id, title: r.title, artist: name };
}

const json = (previewUrl: string | null, deezerBpm: number | null): ProxyResult => ({ status: 200, body: JSON.stringify({ previewUrl, deezerBpm }) });

export async function proxyDeezerPreview(url: URL, deps: { fetch: Fetcher; now: () => number }): Promise<ProxyResult> {
  const title = (url.searchParams.get('title') ?? '').trim();
  const artist = (url.searchParams.get('artist') ?? '').trim();
  if (title === '' || artist === '' || title.length > FIELD_MAX || artist.length > FIELD_MAX) return failure(400, 'bad-request');
  const wantTitle = normTitle(title);
  const wantArtist = normArtist(artist);
  const key = `${wantArtist}|${wantTitle}`;

  let id: number | null;
  const cached = cache.get(key);
  if (cached && deps.now() - cached.at < CACHE_MS) {
    id = cached.id;
  } else {
    const query = new URLSearchParams({ q: `${artist} ${title}`, limit: '5' });
    const found = await forward(deps.fetch, `${BASE}/search?${query.toString()}`);
    if (found.status !== 200) return found.status === 429 ? found : failure(502, 'upstream');
    let data: unknown;
    try {
      data = (JSON.parse(found.body) as { data?: unknown }).data ?? [];
    } catch {
      return failure(502, 'upstream');
    }
    if (!Array.isArray(data)) return failure(502, 'upstream');
    const match = data
      .map(toHit)
      .find((h): h is Hit => h !== null && related(normTitle(h.title), wantTitle) && related(normArtist(h.artist), wantArtist));
    id = match?.id ?? null;
    if (cache.size >= CACHE_MAX) cache.clear();
    cache.set(key, { at: deps.now(), id });
  }
  if (id === null) return json(null, null);

  // L'URL d'extrait expire vite : /track est rappelé à chaque demande, seul l'identifiant est mémorisé.
  const track = await forward(deps.fetch, `${BASE}/track/${id}`);
  if (track.status !== 200) return track.status === 429 ? track : failure(502, 'upstream');
  let body: { preview?: unknown; bpm?: unknown };
  try {
    body = JSON.parse(track.body) as { preview?: unknown; bpm?: unknown };
  } catch {
    return failure(502, 'upstream');
  }
  const previewUrl = typeof body.preview === 'string' && body.preview !== '' ? body.preview : null;
  const deezerBpm = typeof body.bpm === 'number' && Number.isFinite(body.bpm) && body.bpm > 0 ? body.bpm : null;
  return json(previewUrl, deezerBpm);
}
