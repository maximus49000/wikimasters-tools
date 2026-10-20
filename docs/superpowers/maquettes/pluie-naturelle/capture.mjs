// Captures ×2 de la maquette : node capture.mjs [preset…] (défaut : les 5 de la galerie). Chrome headless + CDP, PNG, file://.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const dir = path.dirname(fileURLToPath(import.meta.url));
const CH = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const ALL = { 'piece-jour-bruine': 't=24', 'piece-nuit-averse': 't=24', 'rue-nuit-averse': 't=20', 'rue-jour-bruine': 't=20', 'rue-nuit-orage': 't=20&flash=1' };
const names = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(ALL);
const W = 1040, H = 760, PORT = 9377;
const proc = spawn(CH, ['--headless=new', `--remote-debugging-port=${PORT}`, '--user-data-dir=' + process.env.TEMP + '/capprof-pluie', `--window-size=${W},${H}`, '--hide-scrollbars', '--allow-file-access-from-files', 'about:blank'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 2500));
const tabs = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
const ws = new WebSocket(tabs.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const pend = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (x) => (await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true })).result?.result?.value;
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 2, mobile: false });
const url = pathToFileURL(path.join(dir, 'maquette.html')).href;
for (const name of names) {
  const [base, extra] = name.split('?'); const q = (ALL[base] ?? 't=20') + `&preset=${base}&scale=2` + (extra ? '&' + extra : '');
  await send('Page.navigate', { url: url + '?' + q });
  for (let i = 0; i < 60 && !(await ev('window.__ready === true')); i++) await new Promise((r) => setTimeout(r, 250));
  const err = await ev('window.__err || ""'); if (err) console.log('ERREUR', name, err);
  const r = JSON.parse(await ev(`(()=>{const r=document.getElementById('scene').getBoundingClientRect();return JSON.stringify({x:r.x,y:r.y,w:r.width,h:r.height})})()`));
  const s = await send('Page.captureScreenshot', { format: 'png', clip: { x: r.x, y: r.y, width: r.w, height: r.h, scale: 1 } });
  const out = path.join(dir, name.replace(/[?&=]/g, '_') + '.png');
  fs.writeFileSync(out, Buffer.from(s.result.data, 'base64')); console.log('écrit', out);
}
ws.close(); proc.kill(); process.exit(0);
