// Rendu des planches : node capture.mjs [dossier de playwright-core] → planche-*.png (Chrome du poste, sans tête).
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const dir = path.dirname(fileURLToPath(import.meta.url));
const pwDir = process.argv[2] || process.env.PW_DIR;
const { chromium } = createRequire(path.join(pwDir, 'x.js'))('playwright-core');
const browser = await chromium.launch({ executablePath: process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--allow-file-access-from-files'] });
const page = await browser.newPage({ viewport: { width: 2400, height: 1200 }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.log('ERREUR', e.message));
for (const p of ['mardi', 'samedi', 'semaine', 'porte']) {
  await page.goto(pathToFileURL(path.join(dir, 'maquette.html')).href + '?planche=' + p);
  await page.waitForFunction(() => window.__done === true);
  await page.locator('#planche').screenshot({ path: path.join(dir, `planche-${p}.png`) });
  console.log('planche-' + p + '.png');
}
await browser.close();
