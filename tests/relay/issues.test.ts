import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { createIssue } from '../../relay/src/issues';

const draft = { title: 'Le bouton ne marche pas', body: 'Détails', labels: ['Nouveau'] };
const created = () => new Response(JSON.stringify({ number: 7, html_url: 'https://github.com/o/r/issues/7' }), { status: 201 });

describe('createIssue', () => {
  it('crée l’issue avec le jeton du relais et rend numéro et lien', async () => {
    const fetchFn = vi.fn(async (_url: string, _init?: RequestInit) => created());
    const result = await createIssue(JSON.stringify(draft), { fetch: fetchFn, token: 'SECRET-GH' });
    expect(result).toEqual({ status: 200, body: JSON.stringify({ ok: true, number: 7, url: 'https://github.com/o/r/issues/7' }) });
    const [url, init] = fetchFn.mock.calls[0] ?? [];
    expect(url).toBe('https://api.github.com/repos/maximus49000/wikimasters-tools/issues');
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer SECRET-GH');
    expect(JSON.parse(String(init?.body))).toEqual(draft);
  });
  it('accepte les étiquettes des propositions de documentaire', async () => {
    for (const label of ['Proposition documentaire', 'Documentaire non pertinent']) {
      const fetchFn = vi.fn(async () => created());
      expect((await createIssue(JSON.stringify({ ...draft, labels: [label] }), { fetch: fetchFn, token: 't' })).status).toBe(200);
    }
  });
  it('refuse sans appel GitHub : JSON invalide, champs absents, trop longs, étiquette inconnue', async () => {
    const bad = [
      'pas du json',
      JSON.stringify({ title: 'x' }),
      JSON.stringify({ ...draft, title: '' }),
      JSON.stringify({ ...draft, title: 'a'.repeat(201) }),
      JSON.stringify({ ...draft, body: 'a'.repeat(8_001) }),
      JSON.stringify({ ...draft, labels: ['bug', 'admin'] }),
      JSON.stringify({ ...draft, labels: [] }),
      JSON.stringify({ ...draft, labels: ['Nouveau', 'Nouveau', 'Nouveau', 'Nouveau'] }),
    ];
    for (const raw of bad) {
      const fetchFn = vi.fn();
      expect((await createIssue(raw, { fetch: fetchFn, token: 't' })).status).toBe(400);
      expect(fetchFn).not.toHaveBeenCalled();
    }
  });
  it('neutralise les @mentions du titre et du corps, sans doubler celles déjà neutralisées', async () => {
    const fetchFn = vi.fn(async (_url: string, _init?: RequestInit) => created());
    await createIssue(JSON.stringify({ ...draft, title: 'Merci @octocat', body: '@octocat et @​deja' }), { fetch: fetchFn, token: 't' });
    const sent = JSON.parse(String(fetchFn.mock.calls[0]?.[1]?.body));
    expect(sent.title).toBe('Merci @​octocat');
    expect(sent.body).toBe('@​octocat et @​deja');
  });
  it('ne transmet que title, body et labels', async () => {
    const fetchFn = vi.fn(async (_url: string, _init?: RequestInit) => created());
    await createIssue(JSON.stringify({ ...draft, assignees: ['x'], milestone: 1 }), { fetch: fetchFn, token: 't' });
    expect(Object.keys(JSON.parse(String(fetchFn.mock.calls[0]?.[1]?.body)))).toEqual(['title', 'body', 'labels']);
  });
  it('répond 503 sans jeton et 502 si GitHub refuse ou tombe, sans montrer le jeton', async () => {
    expect((await createIssue(JSON.stringify(draft), { fetch: vi.fn(), token: undefined })).status).toBe(503);
    const refused = await createIssue(JSON.stringify(draft), { fetch: async () => new Response('SECRET-GH', { status: 401 }), token: 'SECRET-GH' });
    expect(refused.status).toBe(502);
    expect(refused.body).not.toContain('SECRET-GH');
    expect((await createIssue(JSON.stringify(draft), { fetch: async () => Promise.reject(new Error('x')), token: 't' })).status).toBe(502);
  });
  it('répond 502 si GitHub répond 2xx sans JSON exploitable', async () => {
    for (const body of ['pas du json', 'null']) {
      const result = await createIssue(JSON.stringify(draft), { fetch: async () => new Response(body, { status: 201 }), token: 't' });
      expect(result.status).toBe(502);
    }
  });
  it('ne dépend d’aucun module qui lit import.meta.env (sûr dans le Worker)', () => {
    const source = readFileSync(new URL('../../relay/src/issues.ts', import.meta.url), 'utf8');
    expect(source).not.toContain('anomalies/anomaly');
    expect(source).not.toContain('anomalies/config');
  });
});
