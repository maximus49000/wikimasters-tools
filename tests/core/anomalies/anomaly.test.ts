import { describe, expect, it, vi } from 'vitest';
import { anomalyTitle, buildIssue, createAnomalyReporter } from '../../../src/core/anomalies/anomaly';

describe('anomalyTitle', () => {
  it('prend la première ligne non vide', () => {
    expect(anomalyTitle('\n  Le  bouton   ne marche pas \nSuite')).toBe('Le bouton ne marche pas');
  });
  it('coupe à 80 caractères', () => {
    const title = anomalyTitle('a'.repeat(200));
    expect(title).toHaveLength(80);
    expect(title.endsWith('…')).toBe(true);
  });
  it('neutralise les mentions', () => {
    expect(anomalyTitle('merci @quelquun')).not.toContain('@q');
  });
});

describe('buildIssue', () => {
  it('pose l’étiquette Nouveau et le nom si fourni', () => {
    const issue = buildIssue({ description: 'Bug', name: 'maximus', platform: 'extension du navigateur' });
    expect(issue.labels).toEqual(['Nouveau']);
    expect(issue.body).toContain('Signalée par : maximus');
    expect(issue.body).toContain('Plateforme : extension du navigateur');
  });
  it('reste anonyme sans nom', () => {
    expect(buildIssue({ description: 'Bug', name: null, platform: 'x' }).body).toContain('Signalée par : anonyme');
  });
});

describe('createAnomalyReporter', () => {
  const input = { description: 'Bug', name: null, platform: 'x' };
  it('crée l’issue et rend son numéro', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ number: 7, html_url: 'https://github.com/o/r/issues/7' }), { status: 201 }));
    const result = await createAnomalyReporter({ fetch, token: 'tok' }).report(input);
    expect(result).toEqual({ ok: true, number: 7, url: 'https://github.com/o/r/issues/7' });
    const [url, init] = fetch.mock.calls[0] as [string, { method: string; headers: Record<string, string> }];
    expect(url).toBe('https://api.github.com/repos/maximus49000/wikimasters-tools/issues');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer tok');
  });
  it('refuse une description vide sans appel réseau', async () => {
    const fetch = vi.fn();
    expect((await createAnomalyReporter({ fetch, token: 't' }).report({ ...input, description: '  ' })).ok).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('signale un refus de GitHub', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('{}', { status: 401 }));
    const result = await createAnomalyReporter({ fetch, token: 't' }).report(input);
    expect(result).toEqual({ ok: false, error: expect.stringContaining('401') });
  });
  it('signale une panne réseau', async () => {
    const fetch = vi.fn().mockRejectedValue(new Error('offline'));
    expect((await createAnomalyReporter({ fetch, token: 't' }).report(input)).ok).toBe(false);
  });
});
