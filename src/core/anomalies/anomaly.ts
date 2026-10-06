import { ANOMALY_API_PREFIX } from './config';

// États d'une anomalie = étiquettes de l'issue : Nouveau (posée à l'envoi), Analysée, Corrigé, « Livrée N » (posés à la main).
export const NEW_ANOMALY_LABEL = 'Nouveau';
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

export function buildIssue(input: AnomalyInput): { title: string; body: string; labels: string[] } {
  const details = [`Plateforme : ${input.platform}`, `Signalée par : ${input.name ? defuse(input.name) : 'anonyme'}`];
  const body = `${defuse(input.description.trim())}\n\n---\n${details.map((line) => `- ${line}`).join('\n')}`;
  return { title: anomalyTitle(input.description), body, labels: [NEW_ANOMALY_LABEL] };
}

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

export function createAnomalyReporter({ fetch: doFetch, token }: { fetch: Fetch; token: string }) {
  return {
    async report(input: AnomalyInput): Promise<AnomalyResult> {
      if (input.description.trim().length === 0) return { ok: false, error: 'Décrivez l’anomalie avant d’envoyer.' };
      try {
        const response = await doFetch(`${ANOMALY_API_PREFIX}issues`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github+json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(buildIssue(input)),
        });
        if (!response.ok) return { ok: false, error: `GitHub a refusé l’envoi (code ${response.status}).` };
        const created = (await response.json()) as { number?: unknown; html_url?: unknown };
        if (typeof created.number !== 'number') return { ok: false, error: 'Réponse inattendue de GitHub.' };
        return { ok: true, number: created.number, url: typeof created.html_url === 'string' ? created.html_url : '' };
      } catch {
        return { ok: false, error: 'Envoi impossible : vérifiez la connexion.' };
      }
    },
  };
}
