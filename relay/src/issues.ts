// relay/src/issues.ts
import { NEW_ANOMALY_LABEL } from '../../src/core/anomalies/anomaly';
import { FLAG_LABEL, PROPOSAL_LABEL } from '../../src/core/documentary/proposal';
import { failure, type Fetcher, type ProxyResult } from './proxy';

const ISSUES_URL = 'https://api.github.com/repos/maximus49000/wikimasters-tools/issues';
const ALLOWED_LABELS = new Set([NEW_ANOMALY_LABEL, PROPOSAL_LABEL, FLAG_LABEL]);
const TITLE_MAX = 200;
const BODY_MAX = 8_000;
const LABELS_MAX = 3;

type Draft = { title: string; body: string; labels: string[] };

function parseDraft(raw: string): Draft | null {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof data !== 'object' || data === null) return null;
  const { title, body, labels } = data as Record<string, unknown>;
  if (typeof title !== 'string' || title.length < 1 || title.length > TITLE_MAX) return null;
  if (typeof body !== 'string' || body.length > BODY_MAX) return null;
  if (!Array.isArray(labels) || labels.length < 1 || labels.length > LABELS_MAX || !labels.every((label) => typeof label === 'string' && ALLOWED_LABELS.has(label))) return null;
  return { title, body, labels: labels as string[] };
}

// Crée une issue de ce dépôt avec le jeton du relais (jamais celui d'un client). Seuls title, body et labels sont transmis.
export async function createIssue(raw: string, deps: { fetch: Fetcher; token: string | undefined }): Promise<ProxyResult> {
  if (!deps.token) return failure(503, 'not-configured');
  const draft = parseDraft(raw);
  if (!draft) return failure(400, 'bad-request');
  let response: Response;
  try {
    response = await deps.fetch(ISSUES_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${deps.token}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json', 'User-Agent': 'wikimasters-tools-relay' },
      body: JSON.stringify({ title: draft.title, body: draft.body, labels: draft.labels }),
    });
  } catch {
    return failure(502, 'upstream');
  }
  if (!response.ok) return failure(502, 'upstream');
  const created = (await response.json()) as { number?: unknown; html_url?: unknown };
  if (typeof created.number !== 'number') return failure(502, 'upstream');
  return { status: 200, body: JSON.stringify({ ok: true, number: created.number, url: typeof created.html_url === 'string' ? created.html_url : '' }) };
}
