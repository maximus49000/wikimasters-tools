// Types minimaux des modules Node utilisés par le test du script anti-fuite (le projet n'embarque pas `@types/node`).
declare module 'node:child_process' {
  export function spawnSync(command: string, args: string[], options: { cwd: string; encoding: 'utf8'; env: Record<string, string | undefined> }): { status: number | null; stdout: string; stderr: string };
}
declare module 'node:fs' {
  export function mkdirSync(path: string): void;
  export function mkdtempSync(prefix: string): string;
  export function rmSync(path: string, options: { recursive: boolean; force: boolean }): void;
  export function writeFileSync(path: string, data: string): void;
}
declare module 'node:os' {
  export function tmpdir(): string;
}
declare module 'node:url' {
  export function fileURLToPath(url: URL): string;
}
declare const process: { execPath: string; env: Record<string, string | undefined> };
