// Captures Windows : node shot-win.mjs <baseUrl> <outPrefix> <query1> <query2> ...
// Une page par requête ; capture de #out (app.html) ou du canvas (index.html).
import { createRequire } from 'node:module';
const require = createRequire('C:/Users/maxim/AppData/Local/Temp/claude/C--Users-maxim--claude-spares-spare-eNgyZU/569c15e4-dc51-477f-8dbe-1f15c272858a/scratchpad/pw/');
const { chromium } = require('playwright-core');
const [, , base, out, ...qs] = process.argv;
const b = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const p = await b.newPage({ viewport: { width: 6000, height: 1500 } });
p.on('pageerror', (e) => e.message !== 'vie' && console.error('ERR', e.message));
p.on('console', (m) => m.type() === 'error' && console.error('CONSOLE', m.text()));
for (const [i, s] of qs.entries()) {
  // `s` peut être « app.html?w=1440 » (page + requête) ou une simple requête.
  const url = s.includes('.html') ? `${base}/${s}` : `${base}/?${s}`;
  await p.goto(url);
  await p.waitForFunction(() => window.done, null, { timeout: 30000 });
  // Laisse cuire les calques en temps mort (arbres de rue) : WAIT ms (défaut 6000).
  await p.waitForTimeout(Number(process.env.WAIT ?? 6000));
  const sel = (await p.locator('#out').count()) ? '#out' : 'canvas';
  await p.locator(sel).first().screenshot({ path: `${out}-${i}.png` });
}
await b.close();
