import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const [, , base, out, ...qs] = process.argv;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const p = await b.newPage({ viewport: { width: 6000, height: 1500 } });
p.on('pageerror', (e) => e.message !== 'vie' && console.error('ERR', e.message));
p.on('console', (m) => m.type() === 'error' && console.error('CONSOLE', m.text()));
for (const [i, s] of qs.entries()) {
  await p.goto(`${base}/?${s}`);
  await p.waitForFunction(() => window.done, null, { timeout: 30000 });
  await p.locator('#out').screenshot({ path: `${out}-${i}.png` });
}
await b.close();
