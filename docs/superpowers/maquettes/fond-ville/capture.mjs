// Captures de la galerie : node capture.mjs → captures/*.png (Chromium headless + CDP, chaque canvas exporté en PNG).
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const dir = path.dirname(fileURLToPath(import.meta.url));
const CH = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PORT = 9381, out = path.join(dir, 'captures');
fs.mkdirSync(out, { recursive: true });
const prof = fs.mkdtempSync(path.join(process.env.TMPDIR || '/tmp', 'fond-cap-'));
const proc = spawn(CH, ['--headless=new', '--no-sandbox', `--remote-debugging-port=${PORT}`, `--user-data-dir=${prof}`, '--allow-file-access-from-files', 'about:blank'], { stdio: 'ignore' });
let tabs = null;
for (let i = 0; i < 40 && !tabs; i++) { await new Promise((r) => setTimeout(r, 250)); try { tabs = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json(); } catch {} }
const ws = new WebSocket(tabs.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const pend = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (x) => (await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true })).result?.result?.value;
await send('Page.enable');
await send('Page.navigate', { url: pathToFileURL(path.join(dir, 'maquette.html')).href + (process.argv[2] ? '?' + process.argv[2] : '') });
for (let i = 0; i < 240 && !(await ev('window.__done === true || !!window.__err')); i++) await new Promise((r) => setTimeout(r, 250));
const err = await ev('window.__err || ""'); if (err) { console.log('ERREUR', err); }
const ids = (await ev('window.__ids')) || [];
for (const cid of ids) {
  const url = await ev(`document.getElementById(${JSON.stringify(cid)}).toDataURL('image/png')`);
  fs.writeFileSync(path.join(out, cid + '.png'), Buffer.from(url.split(',')[1], 'base64'));
}
console.log(ids.length, 'captures dans', out);
ws.close(); proc.kill(); process.exit(err ? 1 : 0);
