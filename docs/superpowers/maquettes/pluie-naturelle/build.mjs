// Assemble src/*.js dans maquette.html (page autonome, sans réseau).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const dir = path.dirname(fileURLToPath(import.meta.url));
const src = path.join(dir, 'src');
const parts = fs.readdirSync(src).filter((f) => f.endsWith('.js')).sort();
const js = parts.map((f) => `// ═══════════ ${f} ═══════════\n` + fs.readFileSync(path.join(src, f), 'utf8')).join('\n');
const gallery = ['piece-jour-bruine', 'piece-nuit-averse', 'rue-nuit-averse', 'rue-jour-bruine', 'rue-nuit-orage'];
const html = `<!doctype html>
<html lang="fr">
<meta charset="utf-8">
<title>Maquette — pluie naturelle (vitre et rue, cellulo Ghibli)</title>
<style>
  body { background: #1c1a22; color: #eee; font: 13px/1.4 system-ui, sans-serif; margin: 0; padding: 12px; }
  h2 { font-weight: 500; margin: 18px 0 6px; color: #d9d2c0; }
  canvas { display: block; background: #000; max-width: 100%; height: auto; border: 1px solid #333; }
  #bar { display: flex; flex-wrap: wrap; gap: 14px; align-items: center; margin: 0 0 10px; }
  #bar label { display: inline-flex; gap: 6px; align-items: center; color: #cfc8b8; }
  #bar input[type=range] { width: 120px; }
  #bar button { background: #2c2a33; color: #eee; border: 1px solid #555; border-radius: 4px; padding: 3px 8px; cursor: pointer; }
  #hud { color: #8a8; font-family: ui-monospace, monospace; font-size: 12px; }
  p.help { color: #aaa; max-width: 960px; }
  .gal { display: grid; grid-template-columns: repeat(auto-fill, minmax(460px, 1fr)); gap: 10px; }
  .gal img { width: 100%; border: 1px solid #333; display: block; } .gal figcaption { color: #bbb; margin: 4px 0 0; }
</style>
<body>
<div id="bar">
  <label>Vue <select id="view"><option value="rue">rue plein écran (dehors)</option><option value="piece">pièce (derrière la vitre)</option></select></label>
  <label>Intensité (precip) <input id="precip" type="range" min="0" max="1" step="0.01"></label>
  <label>Vent <input id="wind" type="range" min="0" max="1" step="0.01"></label>
  <label>Jour ↔ nuit <input id="daylight" type="range" min="0" max="1" step="0.01"></label>
  <label><input id="storm" type="checkbox"> orage</label>
  <button id="pause">❚❚</button>
  ${gallery.map((g) => `<button data-preset="${g}">${g}</button>`).join(' ')}
  <span id="hud"></span>
</div>
<canvas id="scene"></canvas>
<p class="help">Intensité = le <code>precip</code> 0-1 de la météo réelle du lieu (dans l'app, pas de réglage à part : densité des gouttes, gouttes sur la vitre, éclaboussures, anneaux, ruissellement en découlent tous). Capture déterministe : <code>?preset=rue-nuit-averse&amp;t=20&amp;scale=2</code> (+ <code>flash=1</code> pour figer un éclair).</p>
<h2>Galerie (captures ×2)</h2>
<div class="gal">${gallery.map((g) => `<figure><img src="${g}.png" alt="${g}"><figcaption>${g}</figcaption></figure>`).join('')}</div>
<script>window.onerror=(m,s,l,c)=>{window.__err=(window.__err||"")+m+" @"+l+":"+c+"\\n"};</script>
<script>
${js}
</script>
</body>
</html>
`;
fs.writeFileSync(path.join(dir, 'maquette.html'), html);
console.log('maquette.html', html.length, 'octets,', parts.length, 'parties');
