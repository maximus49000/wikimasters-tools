import { describe, expect, it, vi } from 'vitest';
import { RELAY_BASE } from '../../../src/core/documentary/config';
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
  it('envoie l’issue au relais, sans jeton, et rend son numéro', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true, number: 7, url: 'https://github.com/o/r/issues/7' }), { status: 200 }));
    const result = await createAnomalyReporter({ fetch }).report(input);
    expect(result).toEqual({ ok: true, number: 7, url: 'https://github.com/o/r/issues/7' });
    const [url, init] = fetch.mock.calls[0] as [string, { method: string; headers: Record<string, string>; body: string }];
    expect(url).toBe(`${RELAY_BASE}/issues`);
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ 'Content-Type': 'text/plain' });
    expect(JSON.parse(init.body)).toMatchObject({ labels: ['Nouveau'] });
    expect(JSON.stringify(init)).not.toMatch(/Bearer|Authorization/);
  });
  it('refuse une description vide sans appel réseau', async () => {
    const fetch = vi.fn();
    expect((await createAnomalyReporter({ fetch }).report({ ...input, description: '  ' })).ok).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('signale un refus du relais avec son code', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('{}', { status: 429 }));
    expect(await createAnomalyReporter({ fetch }).report(input)).toEqual({ ok: false, error: expect.stringContaining('429') });
  });
  it('signale une panne réseau', async () => {
    const fetch = vi.fn().mockRejectedValue(new Error('offline'));
    expect((await createAnomalyReporter({ fetch }).report(input)).ok).toBe(false);
  });
});
