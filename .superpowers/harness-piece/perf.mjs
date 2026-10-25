// Perf : node perf.mjs <url> [secondes=10] — CPU ×4 (Emulation.setCPUThrottlingRate), viewport 1500×1000.
// Affiche : temps jusqu'à window.done, images par seconde, temps de peinture moyen/max par sprite, taille du cache.
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
const require = createRequire(join(process.env.PW_DIR ?? join(tmpdir(), 'pw-g6'), '/'));
const { chromium } = require('playwright-core');
const [, , url, secs = '10'] = process.argv;
const N = Number(secs);
const rate = Number(process.env.CPU ?? 4);
const b = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
try {
  const p = await b.newPage({ viewport: { width: 1500, height: 1000 } });
  p.on('pageerror', (e) => console.error('ERR', e.message));
  await p.addInitScript(() => {
    window.__raf = 0;
    const r = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (cb) => r((t) => { window.__raf++; cb(t); });
  });
  const cdp = await p.context().newCDPSession(p);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate });
  await cdp.send('Performance.enable');
  await p.goto(url);
  await p.waitForFunction(() => window.done, null, { timeout: Number(process.env.TIMEOUT ?? 400000) });
  const done = await p.evaluate(() => ({ at: window.doneAt, s: window.__spriteStats && { n: window.__spriteStats.count, mean: window.__spriteStats.meanMs, max: window.__spriteStats.maxMs, total: window.__spriteStats.totalMs, cache: window.__spriteStats.cacheSize, bytes: window.__spriteStats.cacheBytes } }));
  console.log(`CPU x${rate} : temps jusqu'à done = ${(done.at / 1000).toFixed(2)} s (depuis le chargement de la page)`);
  if (done.s) console.log(`sprites peints ${done.s.n} | peinture par sprite : moyenne ${done.s.mean.toFixed(0)} ms, max ${done.s.max.toFixed(0)} ms, total ${(done.s.total / 1000).toFixed(2)} s | cache ${done.s.cache} images, ${(done.s.bytes / 1e6).toFixed(2)} Mo`);
  const snap = async () => {
    const { metrics } = await cdp.send('Performance.getMetrics');
    return { m: Object.fromEntries(metrics.map((x) => [x.name, x.value])), raf: await p.evaluate(() => window.__raf) };
  };
  await p.waitForTimeout(2000);
  const a = await snap();
  await p.waitForTimeout(N * 1000);
  const z = await snap();
  const d = (k) => ((z.m[k] - a.m[k]) * 1000) / N;
  console.log(`régime établi (${N} s) : tâches ${d('TaskDuration').toFixed(0)} ms/s | script ${d('ScriptDuration').toFixed(0)} | layout ${d('LayoutDuration').toFixed(0)} | style ${d('RecalcStyleDuration').toFixed(0)} | rAF ${((z.raf - a.raf) / N).toFixed(1)} img/s`);
} finally {
  await b.close();
}
