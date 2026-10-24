// Perf : node perf3.mjs <url> [secondes=10] — CPU ralenti x4, viewport 1440x600.
import { createRequire } from 'node:module';
const require = createRequire('C:/Users/maxim/AppData/Local/Temp/claude/C--Users-maxim--claude-spares-spare-eNgyZU/569c15e4-dc51-477f-8dbe-1f15c272858a/scratchpad/pw/');
const { chromium } = require('playwright-core');
const [, , url, secs = '10'] = process.argv;
const N = Number(secs);
const b = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const p = await b.newPage({ viewport: { width: 1440, height: 600 } });
p.on('pageerror', (e) => e.message !== 'vie' && console.error('ERR', e.message));
await p.addInitScript(() => {
  window.__raf = 0;
  const r = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb) => r((t) => { window.__raf++; cb(t); });
});
const cdp = await p.context().newCDPSession(p);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
await cdp.send('Performance.enable');
await p.goto(url);
await p.waitForFunction(() => window.done, null, { timeout: 60000 });
// Laisse finir les cuissons en temps mort (arbres de rue) avant de mesurer.
await p.waitForTimeout(Number(process.env.WARM ?? 15000));
const snap = async () => {
  const { metrics } = await cdp.send('Performance.getMetrics');
  const m = Object.fromEntries(metrics.map((x) => [x.name, x.value]));
  return { m, raf: await p.evaluate(() => window.__raf) };
};
const a = await snap();
await p.waitForTimeout(N * 1000);
const z = await snap();
const d = (k) => ((z.m[k] - a.m[k]) * 1000) / N;
console.log(`CPU x4, ${N}s : tâches ${d('TaskDuration').toFixed(0)} ms/s | script ${d('ScriptDuration').toFixed(0)} | layout ${d('LayoutDuration').toFixed(0)} | style ${d('RecalcStyleDuration').toFixed(0)} | rAF ${((z.raf - a.raf) / N).toFixed(1)} img/s`);
await b.close();
