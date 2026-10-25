// Captures : node shot.mjs <url-de-base> <dossier-de-sortie> <requête>...
// Une requête = une capture (ex. "style=scandinave&h=10"). Attend window.done (30 s). Nom du PNG = la requête nettoyée.
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
const require = createRequire(join(process.env.PW_DIR ?? join(tmpdir(), 'pw-g6'), '/'));
const { chromium } = require('playwright-core');
const [, , base, out, ...qs] = process.argv;
if (!base || !out || qs.length === 0) {
  console.error('usage : node shot.mjs <url-de-base> <dossier> <requête>...');
  process.exit(2);
}
mkdirSync(out, { recursive: true });
const b = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
try {
  const p = await b.newPage({ viewport: { width: 1500, height: 1000 } });
  p.on('pageerror', (e) => console.error('ERR', e.message));
  p.on('console', (m) => m.type() === 'error' && console.error('CONSOLE', m.text()));
  for (const s of qs) {
    const t0 = Date.now();
    await p.goto(`${base}?${s}`);
    await p.waitForFunction(() => window.done, null, { timeout: Number(process.env.TIMEOUT ?? 30000) });
    const file = join(out, `${s.replace(/[^a-z0-9.=]+/gi, '_').replace(/=/g, '-')}.png`);
    await p.locator('#out').screenshot({ path: file });
    console.log(`${file} (${Date.now() - t0} ms)`);
  }
} finally {
  await b.close();
}
