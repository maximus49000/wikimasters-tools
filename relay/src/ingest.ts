// relay/src/ingest.ts
import type { ValidBatch } from '../../src/core/telemetry/catalogue';
import type { D1Like } from './usage-db';

const INSERT = 'INSERT INTO events (ts, type, name, client_id, platform, version, from_version, channel, detail) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)';

// Écrit un lot déjà validé (une seule transaction) ; rend le nombre d'événements écrits.
export async function ingest(db: D1Like, batch: ValidBatch, nowSec: number): Promise<number> {
  if (batch.events.length === 0) return 0;
  await db.batch(batch.events.map((e) => db.prepare(INSERT).bind(nowSec, e.type, e.name, e.clientId, batch.platform, batch.version, e.fromVersion, batch.channel, e.detail)));
  return batch.events.length;
}
