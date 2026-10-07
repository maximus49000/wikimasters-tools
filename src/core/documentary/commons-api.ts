// src/core/documentary/commons-api.ts
import { z } from 'zod';
import { COMMONS_RULES, passes, scoreCandidate } from './score';
import type { DocCandidate, DocSubject } from './types';

const COMMONS = 'https://commons.wikimedia.org/w/api.php';
type FetchLike = (url: string) => Promise<Response>;

const metaValue = z.object({ value: z.string() }).optional();
const pagesSchema = z.object({
  query: z
    .object({
      pages: z.array(
        z.object({
          title: z.string(),
          videoinfo: z
            .array(
              z.object({
                url: z.string(),
                duration: z.number().optional(),
                thumburl: z.string().optional(),
                extmetadata: z.object({ LicenseShortName: metaValue, Artist: metaValue, ImageDescription: metaValue }).optional(),
              }),
            )
            .optional(),
        }),
      ),
    })
    .optional(),
});

// Les valeurs d'extmetadata contiennent du HTML ; l'interface les affiche en texte simple.
const plain = (html: string | undefined): string => (html ?? '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();

// Vidéos libres de Commons dont le titre porte un des noms du sujet, notées avec les mêmes règles que YouTube (plancher de durée plus bas, léger bonus).
export async function searchCommons(fetchFn: FetchLike, names: string[], subject: Pick<DocSubject, 'qid' | 'kind' | 'startYear' | 'endYear'>): Promise<DocCandidate[]> {
  const first = names[0];
  if (!first) return [];
  const params = new URLSearchParams({
    action: 'query', generator: 'search', gsrsearch: `${first} filetype:video`, gsrnamespace: '6', gsrlimit: '10',
    prop: 'videoinfo', viprop: 'url|size|mime|duration|extmetadata', viurlwidth: '640', format: 'json', formatversion: '2', origin: '*',
  });
  const response = await fetchFn(`${COMMONS}?${params.toString()}`);
  if (!response.ok) throw new Error(`Commons : HTTP ${response.status}`);
  const parsed = pagesSchema.parse(await response.json());
  const full: DocSubject = { ...subject, names };
  const scored: { candidate: DocCandidate; score: number }[] = [];
  for (const page of parsed.query?.pages ?? []) {
    const info = page.videoinfo?.[0];
    if (!info) continue;
    const candidate: DocCandidate = {
      source: 'commons',
      id: page.title,
      title: page.title.replace(/^File:/, '').replace(/\.[A-Za-z0-9]+$/, ''),
      channel: plain(info.extmetadata?.Artist?.value),
      durationSec: info.duration ?? null,
      language: null,
      description: plain(info.extmetadata?.ImageDescription?.value),
      url: `https://commons.wikimedia.org/wiki/${encodeURIComponent(page.title)}`,
      mediaUrl: info.url,
      ...(info.thumburl ? { thumbUrl: info.thumburl } : {}),
      ...(info.extmetadata?.LicenseShortName?.value ? { license: plain(info.extmetadata.LicenseShortName.value) } : {}),
    };
    const result = scoreCandidate(full, candidate, COMMONS_RULES);
    if (passes(result)) scored.push({ candidate, score: result.score });
  }
  return scored.sort((a, b) => b.score - a.score).map((entry) => entry.candidate);
}
