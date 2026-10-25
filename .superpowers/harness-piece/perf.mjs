// Perf : node perf.mjs <url> [secondes=10] — CPU ×4 (Emulation.setCPUThrottlingRate), viewport 1500×1000.
// Chronomètre : de `window.__t0` (premier want() du registre, posé par le BenchRegistry : la transformation des modules par Vite
// n'est pas comptée) à `window.doneAt` (plus aucun repli, file du registre vide).
// 1. Première visite (profil neuf : mémoire de l'appareil vide) : temps jusqu'à done, peinture par sprite, cache.
// 2. Régime établi : images par seconde, temps du fil principal.
// 3. Deuxième visite (rechargement, même profil : la mémoire IndexedDB est gardée) : temps jusqu'à done, sprites repeints.
// `CPU=<n>` change le ralentissement, `TIMEOUT=<ms>` l'attente maximale de done, `SECOND=0` saute la 2e visite, `PW_DIR` le dossier
// de playwright-core.
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
const require = createRequire(join(process.env.PW_DIR ?? join(tmpdir(), 'pw-g6'), '/'));
const { chromium } = require('playwright-core');
const [, , url, secs = '10'] = process.argv;
const N = Number(secs);
const rate = Number(process.env.CPU ?? 4);
const timeout = Number(process.env.TIMEOUT ?? 400000);
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

  const visit = async (label) => {
    await p.waitForFunction(() => window.done, null, { timeout });
    const r = await p.evaluate(async () => {
      const s = window.__spriteStats;
      return { t0: window.__t0, at: window.doneAt, n: s.count, mean: s.meanMs, max: s.maxMs, total: s.totalMs, maxEnc: s.maxEncMs, totalEnc: s.totalEncMs, cache: s.cacheSize, bytes: s.cacheBytes, store: await s.store() };
    });
    console.log(`${label} — CPU x${rate} : temps jusqu'à done = ${((r.at - r.t0) / 1000).toFixed(2)} s depuis le premier want() (${(r.at / 1000).toFixed(2)} s depuis le chargement)`);
    console.log(`  sprites peints ${r.n} | peinture par sprite : moyenne ${r.mean.toFixed(0)} ms, max ${r.max.toFixed(0)} ms, total ${(r.total / 1000).toFixed(2)} s (dont encodage : max ${r.maxEnc.toFixed(0)} ms, total ${(r.totalEnc / 1000).toFixed(2)} s)`);
    console.log(`  cache ${r.cache} images, ${(r.bytes / 1e6).toFixed(2)} Mo | mémoire de l'appareil ${r.store.count} images, ${(r.store.bytes / 1e6).toFixed(2)} Mo`);
  };
  const snap = async () => {
    const { metrics } = await cdp.send('Performance.getMetrics');
    return { m: Object.fromEntries(metrics.map((x) => [x.name, x.value])), raf: await p.evaluate(() => window.__raf) };
  };

  await p.goto(url);
  await visit('1re visite');
  await p.waitForTimeout(2000);
  const a = await snap();
  await p.waitForTimeout(N * 1000);
  const z = await snap();
  const d = (k) => ((z.m[k] - a.m[k]) * 1000) / N;
  console.log(`régime établi (${N} s) : tâches ${d('TaskDuration').toFixed(0)} ms/s | script ${d('ScriptDuration').toFixed(0)} | layout ${d('LayoutDuration').toFixed(0)} | style ${d('RecalcStyleDuration').toFixed(0)} | rAF ${((z.raf - a.raf) / N).toFixed(1)} img/s`);

  if (process.env.SECOND !== '0') {
    await p.reload();
    await visit('2e visite (rechargement)');
  }
} finally {
  await b.close();
}
