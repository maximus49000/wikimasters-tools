// relay/src/usage-db.ts
// Partie de l'API Cloudflare D1 utilisée par le relais (le faux des tests s'appuie sur `node:sqlite`).
export type D1Statement = {
  bind(...values: unknown[]): D1Statement;
  run(): Promise<unknown>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
};
export type D1Like = { prepare(sql: string): D1Statement; batch(statements: D1Statement[]): Promise<unknown[]> };
