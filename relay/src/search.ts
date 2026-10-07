// relay/src/search.ts
import { passes, scoreCandidate, YOUTUBE_RULES, type ScoreResult } from '../../src/core/documentary/score';
import type { DocCandidate, DocSubject } from '../../src/core/documentary/types';
import { reserveUnits, SEARCH_COST } from './budget';
import { CHANNELS, type ChannelDef } from './channels';
import { lookupIndex } from './indexer';
import type { KvLike } from './kv';
import { searchYoutube, type FetchLike } from './youtube';

export type SearchRequest = { qid: string; kind: 'event' | 'person'; names: string[]; startYear: number | null; endYear: number | null; debug?: boolean };
export type SearchResponse =
  | { ok: true; candidates: DocCandidate[]; cached: boolean; debug?: { candidate: DocCandidate; result: ScoreResult }[] }
  | { ok: false; reason: 'budget' | 'upstream' };
export type SearchDeps = { fetch: FetchLike; kv: KvLike; apiKey: string; now: () => Date; channels?: ChannelDef[] };

const DAY = 86_400;

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
const best = (scored: Scored[]): DocCandidate[] =>
  scored
    .filter((entry) => passes(entry.result))
    .sort((a, b) => b.result.score - a.result.score)
    .slice(0, 3)
    .map((entry) => entry.candidate);

export async function searchDocumentaries(deps: SearchDeps, request: SearchRequest): Promise<SearchResponse> {
  const cacheKey = `doc-v1-${request.qid}`;
  if (!request.debug) {
    const hit = await deps.kv.get(cacheKey);
    if (hit !== null) return { ok: true, candidates: JSON.parse(hit) as DocCandidate[], cached: true };
  }
  const subject: DocSubject = { qid: request.qid, kind: request.kind, names: request.names, startYear: request.startYear, endYear: request.endYear };
  const score = (candidate: DocCandidate): Scored => ({ candidate, result: scoreCandidate(subject, candidate, YOUTUBE_RULES) });

  // 1. L'index des chaînes de confiance : gratuit. Mémorisé 7 jours seulement (l'index grossit).
  const indexed = (await lookupIndex(deps.kv, request.names, deps.channels ?? CHANNELS)).map(score);
  if (!request.debug) {
    const fromIndex = best(indexed);
    if (fromIndex.length > 0) {
      await deps.kv.put(cacheKey, JSON.stringify(fromIndex), { expirationTtl: 7 * DAY });
      return { ok: true, candidates: fromIndex, cached: false };
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
  if (request.debug) return { ok: true, candidates: [], cached: false, debug: [...indexed, ...searched] };

  const candidates = best(searched);
  // Succès : 30 jours ; « rien de pertinent » : 7 jours (un nouveau documentaire peut sortir).
  await deps.kv.put(cacheKey, JSON.stringify(candidates), { expirationTtl: (candidates.length > 0 ? 30 : 7) * DAY });
  return { ok: true, candidates, cached: false };
}
