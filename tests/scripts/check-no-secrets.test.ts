import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const SCRIPT = resolve(__dirname, '../../scripts/check-no-secrets.mjs');
const SECRET = 'valeur-secrete-1234567890';
const dirs: string[] = [];

// Dossier temporaire avec un .env.local factice et un dossier de paquets factice.
function fixture(env: string | null, packageText: string) {
  const dir = mkdtempSync(join(tmpdir(), 'wmt-secrets-'));
  dirs.push(dir);
  if (env !== null) writeFileSync(join(dir, '.env.local'), env);
  mkdirSync(join(dir, 'paquets'));
  writeFileSync(join(dir, 'paquets', 'app.js'), packageText);
  return dir;
}
const run = (dir: string, extraEnv: Record<string, string> = {}) =>
  spawnSync(process.execPath, [SCRIPT, 'paquets'], { cwd: dir, encoding: 'utf8', env: { ...process.env, ALLOW_EMPTY: '', ...extraEnv } });

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('check-no-secrets', () => {
  it('signale une fuite (code 1) par le NOM de la variable, jamais par sa valeur', () => {
    const result = run(fixture(`WXT_CLE_TEST=${SECRET}\n`, `const k = "${SECRET}";`));
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('WXT_CLE_TEST');
    expect(result.stdout + result.stderr).not.toContain(SECRET);
  });
  it('rend 0 quand aucun paquet ne contient la valeur', () => {
    const result = run(fixture(`WXT_CLE_TEST=${SECRET}\n`, 'rien à voir'));
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('aucune fuite');
  });
  it('rend 2 avec un avis quand il n’y a rien à chercher, sauf ALLOW_EMPTY=1', () => {
    for (const env of [null, '', 'AUTRE=court\n']) {
      const dir = fixture(env, 'rien');
      const result = run(dir);
      expect(result.status).toBe(2);
      expect(result.stderr).toContain('rien n\'a été vérifié');
      expect(run(dir, { ALLOW_EMPTY: '1' }).status).toBe(0);
    }
  });
});
