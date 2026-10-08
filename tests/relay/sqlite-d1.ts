// tests/relay/sqlite-d1.ts
import { readFileSync } from 'node:fs';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import type { D1Like, D1Statement } from '../../relay/src/usage-db';

// Faux D1 : une base SQLite en mémoire avec la vraie migration, pour tester le SQL réel.
export function sqliteD1(): D1Like & { exec(sql: string): void } {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../../relay/migrations/0001_events.sql', import.meta.url), 'utf8'));
  const statement = (sql: string, values: unknown[] = []): D1Statement => ({
    bind: (...next) => statement(sql, next),
    run: async () => db.prepare(sql).run(...(values as SQLInputValue[])),
    all: async <T>() => ({ results: db.prepare(sql).all(...(values as SQLInputValue[])) as T[] }),
  });
  return {
    exec: (sql) => db.exec(sql),
    prepare: (sql) => statement(sql),
    batch: async (statements) => {
      db.exec('BEGIN');
      try {
        const done: unknown[] = [];
        for (const item of statements) done.push(await item.run());
        db.exec('COMMIT');
        return done;
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
  };
}
