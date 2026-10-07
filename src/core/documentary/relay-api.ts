// src/core/documentary/relay-api.ts
import { z } from 'zod';
import { RELAY_BASE } from './config';
import { candidateSchema, type DocCandidate, type DocSubject } from './types';

// `candidates` : vidéos proposées d'office ; `possible` : pertinence moins sûre, derrière un lien.
export type RelayResult = { status: 'ok'; candidates: DocCandidate[]; possible: DocCandidate[] } | { status: 'busy' };
export type OembedResult = { ok: true; title: string; channel: string } | { ok: false; reason: 'not-found' | 'not-embeddable' | 'busy' };

const searchSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), candidates: z.array(candidateSchema), possible: z.array(candidateSchema).default([]) }),
  z.object({ ok: z.literal(false), reason: z.string() }),
]);
const oembedSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), title: z.string(), channel: z.string() }),
  z.object({ ok: z.literal(false), reason: z.string() }),
]);

type Options = { fetch: (url: string) => Promise<Response>; base?: string };

// Le relais ne reçoit que l'identifiant Wikidata, les noms et les années de la carte : rien du jeu ni du compte.
export function createRelayApi({ fetch: doFetch, base = RELAY_BASE }: Options) {
  return {
    async search(subject: DocSubject): Promise<RelayResult> {
      const params = new URLSearchParams({ qid: subject.qid, kind: subject.kind, names: subject.names.slice(0, 6).join('|') });
      if (subject.startYear !== null) params.set('start', String(subject.startYear));
      if (subject.endYear !== null) params.set('end', String(subject.endYear));
      const response = await doFetch(`${base}/search?${params.toString()}`);
      const body = searchSchema.parse(await response.json());
      if (body.ok) return { status: 'ok', candidates: body.candidates, possible: body.possible };
      // Plafond du jour atteint ou YouTube en panne : on réessaiera plus tard, ce n'est pas une absence de documentaire.
      if (body.reason === 'budget' || body.reason === 'upstream') return { status: 'busy' };
      throw new Error(`Relais : ${body.reason}`);
    },

    async oembed(key: string): Promise<OembedResult> {
      const response = await doFetch(`${base}/oembed?${new URLSearchParams({ id: key }).toString()}`);
      const body = oembedSchema.parse(await response.json());
      if (body.ok) return body;
      return { ok: false, reason: body.reason === 'not-found' || body.reason === 'not-embeddable' ? body.reason : 'busy' };
    },
  };
}
export type RelayApi = ReturnType<typeof createRelayApi>;
