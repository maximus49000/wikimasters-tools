// relay/src/indexer.ts
import { normalize } from '../../src/core/documentary/score';
import type { DocCandidate } from '../../src/core/documentary/types';
import { INDEX_PAGE_COST, reserveUnits } from './budget';
import { CHANNELS, uploadsPlaylist, type ChannelDef } from './channels';
import type { KvLike } from './kv';
import { fetchUploadsPage, type FetchLike } from './youtube';

// Les 3 000 vidéos les plus récentes de chaque chaîne (60 pages, 120 unités par chaîne la première fois), remises à jour chaque semaine.
export const MAX_PER_CHANNEL = 3000;
export const REFRESH_MS = 7 * 86_400_000;
// 20 pages = 40 appels à YouTube : sous la limite de 50 appels par passage de l'offre gratuite de Cloudflare.
export const MAX_PAGES_PER_RUN = 20;

type IndexState = { cursor: string | null; complete: boolean; refreshing: boolean; count: number; updatedAt: number };
const NEW_STATE: IndexState = { cursor: null, complete: false, refreshing: false, count: 0, updatedAt: 0 };
const stateKey = (id: string): string => `chan-state-v1-${id}`;
const blobKey = (id: string): string => `chan-v1-${id}`;

function readState(raw: string | null): IndexState {
  if (raw === null) return NEW_STATE;
  try {
    return { ...NEW_STATE, ...(JSON.parse(raw) as Partial<IndexState>) };
  } catch {
    return NEW_STATE;
  }
}

// Une vidéo = une ligne : « clé ⇥ durée ⇥ titre normalisé entre espaces ⇥ titre d'origine ». Le titre normalisé permet de chercher un nom
// en mots entiers par simple recherche de texte, sans analyser le fichier (le temps de calcul d'un passage est limité à 10 ms).
export function toLine(video: { id: string; title: string; durationSec: number | null }): string {
  const clean = video.title.replace(/\s+/g, ' ').trim();
  return `${video.id}\t${video.durationSec ?? ''}\t ${normalize(clean)} \t${clean}`;
}

// Les vidéos indexées dont le titre contient un des noms (mots entiers, sans accents ni casse).
export async function lookupIndex(kv: KvLike, names: string[], channels: ChannelDef[] = CHANNELS, limit = 30): Promise<DocCandidate[]> {
  const phrases = names.map((name) => ` ${normalize(name)} `).filter((phrase) => phrase.trim().length >= 4);
  const found = new Map<string, DocCandidate>();
  for (const channel of channels) {
    const blob = await kv.get(blobKey(channel.id));
    if (!blob) continue;
    for (const phrase of phrases) {
      let from = 0;
      for (;;) {
        const hit = blob.indexOf(phrase, from);
        if (hit === -1) break;
        const start = blob.lastIndexOf('\n', hit) + 1;
        const end = blob.indexOf('\n', hit);
        from = end === -1 ? blob.length : end + 1;
        const [id, duration, , title] = blob.slice(start, end === -1 ? blob.length : end).split('\t');
        if (!id || title === undefined || found.has(id)) continue;
        found.set(id, {
          source: 'youtube',
          id,
          title,
          channel: channel.name,
          durationSec: duration ? Number(duration) : null,
          language: channel.language,
          description: '',
          url: `https://www.youtube.com/watch?v=${id}`,
          thumbUrl: `https://img.youtube.com/vi/${id}/hqdefault.jpg`,
        });
        if (found.size >= limit) return [...found.values()];
      }
    }
  }
  return [...found.values()];
}

const isKnown = (blob: string, id: string): boolean => blob.startsWith(`${id}\t`) || blob.includes(`\n${id}\t`);
const join = (...parts: string[]): string => parts.filter((part) => part !== '').join('\n');

export type IndexDeps = { fetch: FetchLike; kv: KvLike; apiKey: string; now: () => Date; channels?: ChannelDef[]; maxPages?: number };

// Un passage planifié : avance l'index des chaînes (première lecture, puis mise à jour hebdomadaire) dans la limite de `maxPages` pages
// et du budget du jour. Chaque chaîne est écrite une fois par passage ; une panne de YouTube garde ce qui a été lu.
export async function indexStep(deps: IndexDeps): Promise<{ pages: number }> {
  const maxPages = deps.maxPages ?? MAX_PAGES_PER_RUN;
  const channels = deps.channels ?? CHANNELS;
  const due: { channel: ChannelDef; state: IndexState }[] = [];
  for (const channel of channels) {
    const state = readState(await deps.kv.get(stateKey(channel.id)));
    if (!state.complete || deps.now().getTime() - state.updatedAt >= REFRESH_MS) due.push({ channel, state });
  }
  if (due.length === 0 || !(await reserveUnits(deps.kv, deps.now(), maxPages * INDEX_PAGE_COST))) return { pages: 0 };

  let pages = 0;
  for (const { channel, state: initial } of due) {
    if (pages >= maxPages) break;
    const refreshing = initial.complete || initial.refreshing;
    let state: IndexState = initial.complete ? { ...initial, complete: false, refreshing: true, cursor: null } : initial;
    const blob = (await deps.kv.get(blobKey(channel.id))) ?? '';
    const added: string[] = [];
    try {
      while (pages < maxPages && !state.complete) {
        const page = await fetchUploadsPage(deps.fetch, deps.apiKey, uploadsPlaylist(channel.id), state.cursor ?? undefined);
        pages += 1;
        let reachedKnown = false;
        for (const video of page.videos) {
          if (refreshing && isKnown(blob, video.id)) {
            reachedKnown = true;
            break;
          }
          added.push(toLine(video));
        }
        const count = refreshing ? state.count + (reachedKnown ? 0 : page.videos.length) : state.count + page.videos.length;
        const finished = page.next === null || (refreshing ? reachedKnown : count >= MAX_PER_CHANNEL);
        state = finished ? { cursor: null, complete: true, refreshing: false, count, updatedAt: deps.now().getTime() } : { ...state, cursor: page.next, count };
      }
    } catch {
      // Quota ou réseau : on garde ce qui a été lu et on reprendra au prochain passage.
    }
    if (added.length > 0) await deps.kv.put(blobKey(channel.id), refreshing ? join(added.join('\n'), blob) : join(blob, added.join('\n')));
    await deps.kv.put(stateKey(channel.id), JSON.stringify(state));
  }
  return { pages };
}

// Avancement de l'index, pour la route de contrôle.
export async function indexStatus(kv: KvLike, channels: ChannelDef[] = CHANNELS): Promise<{ name: string; count: number; complete: boolean; updatedAt: number }[]> {
  const result = [];
  for (const channel of channels) {
    const state = readState(await kv.get(stateKey(channel.id)));
    result.push({ name: channel.name, count: state.count, complete: state.complete, updatedAt: state.updatedAt });
  }
  return result;
}
