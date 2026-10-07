import { z } from 'zod';

export const candidateSchema = z.object({
  source: z.enum(['selection', 'commons', 'youtube', 'proposal']),
  // Clé YouTube, ou titre du fichier sur Commons.
  id: z.string(),
  title: z.string(),
  // Chaîne YouTube ou auteur Commons.
  channel: z.string(),
  durationSec: z.number().nullable(),
  language: z.string().nullable(),
  description: z.string(),
  // Page d'origine (bouton ↗).
  url: z.string(),
  // Fichier vidéo direct (Commons).
  mediaUrl: z.string().optional(),
  thumbUrl: z.string().optional(),
  license: z.string().optional(),
});
export type DocCandidate = z.infer<typeof candidateSchema>;

// Le sujet de la carte : noms (libellés et alias fr/en) et période (naissance–décès pour une personne, début–fin pour un événement).
export type DocSubject = { qid: string; kind: 'event' | 'person'; names: string[]; startYear: number | null; endYear: number | null };
