// src/core/documentary/selection.ts
import { z } from 'zod';
import type { DocCandidate } from './types';

// Format de `documentaires.json` : { "Q2280": [ { "id": "<clé YouTube>", "title": "…", "channel": "…", "durationSec": 3120 } ] }
const KEY = /^[\w-]{3,32}$/;
const fileSchema = z.record(z.string(), z.array(z.object({ id: z.string(), title: z.string(), channel: z.string(), durationSec: z.number().nullable() })));

export function parseSelection(json: unknown, qid: string): DocCandidate[] {
  const file = fileSchema.parse(json);
  return (file[qid] ?? [])
    .filter((entry) => KEY.test(entry.id))
    .map((entry) => ({
      source: 'selection' as const,
      id: entry.id,
      title: entry.title,
      channel: entry.channel,
      durationSec: entry.durationSec,
      language: null,
      description: '',
      url: `https://www.youtube.com/watch?v=${entry.id}`,
      thumbUrl: `https://img.youtube.com/vi/${entry.id}/hqdefault.jpg`,
    }));
}
