import { describe, expect, it } from 'vitest';
import worker from '../../relay/src/index';
import { ingest } from '../../relay/src/ingest';
import { validateBatch } from '../../src/core/telemetry/catalogue';
import { sqliteD1 } from './sqlite-d1';

const ID = '123e4567-e89b-42d3-a456-426614174000';
const header = { platform: 'extension', channel: 'prod', version: '0.1.0+482' };
const post = (body: string, env: Parameters<typeof worker.fetch>[1]) =>
  worker.fetch(new Request('https://relais.test/t', { method: 'POST', body, headers: { 'content-type': 'text/plain' } }), env);

describe('ingest', () => {
  it('écrit chaque événement avec l’en-tête du lot et l’heure du serveur', async () => {
    const db = sqliteD1();
    const batch = validateBatch({ ...header, events: [{ type: 'action', name: 'lecture-musique', detail: 'tidal', clientId: ID }, { type: 'error', name: 'api-429', detail: 'spotify' }] })!;
    expect(await ingest(db, batch, 1000)).toBe(2);
    const rows = (await db.prepare('SELECT ts, type, name, client_id, platform, version, channel, detail FROM events ORDER BY id').all()).results;
    expect(rows).toEqual([
      { ts: 1000, type: 'action', name: 'lecture-musique', client_id: ID, platform: 'extension', version: '0.1.0+482', channel: 'prod', detail: 'tidal' },
      { ts: 1000, type: 'error', name: 'api-429', client_id: null, platform: 'extension', version: '0.1.0+482', channel: 'prod', detail: 'spotify' },
    ]);
  });
  it('un lot vide n’écrit rien', async () => {
    const db = sqliteD1();
    expect(await ingest(db, validateBatch({ ...header, events: [] })!, 1)).toBe(0);
  });
});

describe('POST /t', () => {
  it('répond 204 et enregistre', async () => {
    const db = sqliteD1();
    const response = await post(JSON.stringify({ ...header, events: [{ type: 'action', name: 'plein-ecran', clientId: ID }] }), { USAGE_DB: db });
    expect(response.status).toBe(204);
    expect((await db.prepare('SELECT COUNT(*) AS n FROM events').all<{ n: number }>()).results[0]!.n).toBe(1);
  });
  it('503 sans base configurée', async () => {
    expect((await post('{}', {})).status).toBe(503);
  });
  it('400 sur un JSON invalide ou un lot invalide', async () => {
    const env = { USAGE_DB: sqliteD1() };
    expect((await post('pas du json', env)).status).toBe(400);
    expect((await post(JSON.stringify({ ...header, platform: 'ios', events: [] }), env)).status).toBe(400);
  });
  it('413 au-delà de 16 000 caractères', async () => {
    expect((await post('x'.repeat(16001), { USAGE_DB: sqliteD1() })).status).toBe(413);
  });
  it('les autres méthodes sur /t ne passent pas', async () => {
    const response = await worker.fetch(new Request('https://relais.test/t'), { USAGE_DB: sqliteD1() });
    expect(response.status).toBe(404);
  });
});
