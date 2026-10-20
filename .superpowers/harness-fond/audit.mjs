import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const p = await b.newPage({ viewport: { width: 3000, height: 800 } });
p.on('pageerror', (e) => console.error('ERR', e.message));
for (const date of ['2026-07-07', '2027-02-10']) for (const seed of [1, 7, 42]) for (const w of [720, 1440, 2880]) {
  await p.goto(`http://localhost:5231/?seed=${seed}&w=${w}&h=340&scale=1&audit=vert&date=${date}&meteo=${date.startsWith('2027') ? 'nuages' : 'soleil'}`);
  await p.waitForFunction(() => window.done, null, { timeout: 60000 });
  console.log(date, seed, w, JSON.stringify(await p.evaluate(() => window.audit)));
}
await b.close();
