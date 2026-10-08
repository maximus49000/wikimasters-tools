// Types minimaux des modules Node utilisés par le faux D1 des tests (le projet n'embarque pas `@types/node`).
declare module 'node:fs' {
  export function readFileSync(path: URL | string, encoding: 'utf8'): string;
}
declare module 'node:sqlite' {
  export type SQLInputValue = null | number | bigint | string | Uint8Array;
  export class DatabaseSync {
    constructor(path: string);
    exec(sql: string): void;
    prepare(sql: string): { run(...values: SQLInputValue[]): unknown; all(...values: SQLInputValue[]): unknown[] };
  }
}
declare module 'node:fs' {
  export function readdirSync(path: string): string[];
  export function statSync(path: string): { isDirectory(): boolean };
}
declare module 'node:path' {
  export function join(...parts: string[]): string;
}
