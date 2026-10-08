import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ACTIONS } from '../../../src/core/telemetry/catalogue';

const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? files(path) : /\.(ts|tsx)$/.test(path) ? [path] : [];
  });

describe('catalogue et points d’appel', () => {
  const source = files('src')
    .filter((f) => !f.includes('telemetry'))
    .map((f) => readFileSync(f, 'utf8'))
    .join('\n');
  it.each(Object.keys(ACTIONS))('l’action « %s » a au moins un point d’appel', (name) => {
    expect(source).toContain(`track('${name}'`);
  });
});
