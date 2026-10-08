import { ISSUES_ENDPOINT } from './config';
import { NEW_ANOMALY_LABEL } from './labels';

export { NEW_ANOMALY_LABEL };

// États d'une anomalie = étiquettes de l'issue : Nouveau (posée à l'envoi), Analysée, Corrigé, « Livrée N » (posés à la main).
const TITLE_MAX = 80;
export const DESCRIPTION_MAX = 4000;

export type AnomalyInput = {
  description: string;
  // Nom du profil, seulement si l'utilisateur accepte qu'il soit publié.
  name: string | null;
  platform: string;
};

export type AnomalyResult = { ok: true; number: number; url: string } | { ok: false; error: string };

// Un « @pseudo » dans le texte notifierait un compte GitHub : on l'en empêche.
const defuse = (text: string): string => text.replace(/@/g, '@\u200b');

// Titre : première ligne non vide, espaces réduits, coupée à 80 caractères.
export function anomalyTitle(description: string): string {
  const line = description.split(/\r?\n/).map((part) => part.replace(/\s+/g, ' ').trim()).find((part) => part.length > 0) ?? '';
  const title = line.length > TITLE_MAX ? `${line.slice(0, TITLE_MAX - 1).trimEnd()}…` : line;
  return defuse(title);
}

// Limites du relais (relay/src/issues.ts) : au-delà, il refuserait le brouillon.
const ISSUE_TITLE_MAX = 200;
const ISSUE_BODY_MAX = 8000;
const clamp = (text: string, max: number): string => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

export function buildIssue(input: AnomalyInput): { title: string; body: string; labels: string[] } {
  const details = [`Plateforme : ${input.platform}`, `Signalée par : ${input.name ? defuse(input.name) : 'anonyme'}`];
  const body = `${defuse(input.description.trim())}\n\n---\n${details.map((line) => `- ${line}`).join('\n')}`;
  return { title: clamp(anomalyTitle(input.description), ISSUE_TITLE_MAX), body: clamp(body, ISSUE_BODY_MAX), labels: [NEW_ANOMALY_LABEL] };
}

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

export type IssueDraft = { title: string; body: string; labels: string[] };

// Envoie une issue au relais, qui la crée sur GitHub ; partagé par « Remonter une anomalie » et les propositions de documentaire.
// Corps JSON envoyé en texte simple : pas de préambule CORS.
export async function postIssue(doFetch: Fetch, draft: IssueDraft): Promise<AnomalyResult> {
  try {
    const response = await doFetch(ISSUES_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(draft) });
    if (response.status === 429) return { ok: false, error: 'Trop d’envois pour le moment, réessayez plus tard.' };
    if (!response.ok) return { ok: false, error: `L’envoi a été refusé (code ${response.status}).` };
    const created = (await response.json()) as { number?: unknown; url?: unknown };
    if (typeof created.number !== 'number') return { ok: false, error: 'Réponse inattendue du serveur.' };
    return { ok: true, number: created.number, url: typeof created.url === 'string' ? created.url : '' };
  } catch {
    return { ok: false, error: 'Envoi impossible : vérifiez la connexion.' };
  }
}

export function createAnomalyReporter({ fetch: doFetch }: { fetch: Fetch }) {
  return {
    async report(input: AnomalyInput): Promise<AnomalyResult> {
      if (input.description.trim().length === 0) return { ok: false, error: 'Décrivez l’anomalie avant d’envoyer.' };
      return postIssue(doFetch, buildIssue(input));
    },
  };
}
