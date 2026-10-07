// relay/src/search.ts
import { scoreCandidate, tierOf, YOUTUBE_RULES, type ScoreResult, type Tier } from '../../src/core/documentary/score';
import type { DocCandidate, DocSubject } from '../../src/core/documentary/types';
import { reserveUnits, SEARCH_COST } from './budget';
import { CHANNELS, type ChannelDef } from './channels';
import { lookupIndex } from './indexer';
import type { KvLike } from './kv';
import { searchYoutube, type FetchLike } from './youtube';

export type SearchRequest = { qid: string; kind: 'event' | 'person'; names: string[]; startYear: number | null; endYear: number | null; debug?: boolean };
export type SearchResponse =
  // `candidates` : vidéos proposées d'office (3 au plus, la mieux notée d'abord) ; `possible` : pertinence moins sûre, derrière un lien (5 au plus).
  | { ok: true; candidates: DocCandidate[]; possible: DocCandidate[]; cached: boolean; debug?: { candidate: DocCandidate; result: ScoreResult }[] }
  | { ok: false; reason: 'budget' | 'upstream' };
export type SearchDeps = { fetch: FetchLike; kv: KvLike; apiKey: string; now: () => Date; channels?: ChannelDef[] };

const DAY = 86_400;
const CACHE_VERSION = 'doc-v2';
const LIMITS: Record<Tier, number> = { good: 3, possible: 5 };
type Cached = { candidates: DocCandidate[]; possible: DocCandidate[] };

export function parseSearchRequest(params: URLSearchParams): SearchRequest | null {
  const qid = params.get('qid') ?? '';
  const kind = params.get('kind');
  const names = (params.get('names') ?? '').split('|').map((name) => name.trim()).filter((name) => name !== '').slice(0, 6);
  if (!/^Q\d{1,12}$/.test(qid) || (kind !== 'event' && kind !== 'person') || names.length === 0 || names.some((name) => name.length > 120)) return null;
  const year = (key: string): number | null => {
    const raw = params.get(key);
    if (raw === null || raw === '') return null;
    const value = Number(raw);
    return Number.isInteger(value) ? value : null;
  };
  return { qid, kind, names, startYear: year('start'), endYear: year('end') };
}

type Scored = { candidate: DocCandidate; result: ScoreResult };
// Sans doublon (une même vidéo peut venir de l'index et de la recherche), la mieux notée d'abord.
const pick = (scored: Scored[], tier: Tier): DocCandidate[] => {
  const seen = new Set<string>();
  return scored
    .filter((entry) => tierOf(entry.result) === tier)
    .sort((a, b) => b.result.score - a.result.score)
    .filter((entry) => !seen.has(entry.candidate.id) && seen.add(entry.candidate.id))
    .slice(0, LIMITS[tier])
    .map((entry) => entry.candidate);
};
const split = (scored: Scored[]): Cached => ({ candidates: pick(scored, 'good'), possible: pick(scored, 'possible') });

export async function searchDocumentaries(deps: SearchDeps, request: SearchRequest): Promise<SearchResponse> {
  const cacheKey = `${CACHE_VERSION}-${request.qid}`;
  if (!request.debug) {
    const hit = await deps.kv.get(cacheKey);
    if (hit !== null) return { ok: true, ...(JSON.parse(hit) as Cached), cached: true };
  }
  const subject: DocSubject = { qid: request.qid, kind: request.kind, names: request.names, startYear: request.startYear, endYear: request.endYear };
  const score = (candidate: DocCandidate): Scored => ({ candidate, result: scoreCandidate(subject, candidate, YOUTUBE_RULES) });

  // 1. L'index des chaînes de confiance : gratuit. Mémorisé 7 jours seulement (l'index grossit).
  const indexed = (await lookupIndex(deps.kv, request.names, deps.channels ?? CHANNELS)).map(score);
  if (!request.debug) {
    const fromIndex = split(indexed);
    if (fromIndex.candidates.length > 0) {
      await deps.kv.put(cacheKey, JSON.stringify(fromIndex), { expirationTtl: 7 * DAY });
      return { ok: true, ...fromIndex, cached: false };
    }
  }

  // 2. La recherche YouTube : 101 unités, dans la limite du jour.
  if (!(await reserveUnits(deps.kv, deps.now(), SEARCH_COST))) return { ok: false, reason: 'budget' };
  let found: DocCandidate[];
  try {
    found = await searchYoutube(deps.fetch, deps.apiKey, `${request.names[0] ?? ''} documentaire`);
  } catch {
    return { ok: false, reason: 'upstream' };
  }
  const searched = found.map(score);
  if (request.debug) return { ok: true, candidates: [], possible: [], cached: false, debug: [...indexed, ...searched] };

  const found2 = split([...indexed, ...searched]);
  // Succès : 30 jours ; seulement des vidéos possibles ou rien : 7 jours (un nouveau documentaire peut sortir).
  await deps.kv.put(cacheKey, JSON.stringify(found2), { expirationTtl: (found2.candidates.length > 0 ? 30 : 7) * DAY });
  return { ok: true, ...found2, cached: false };
}
