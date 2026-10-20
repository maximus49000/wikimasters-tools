// Assemble src/*.js dans maquette.html (page autonome, sans réseau).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const dir = path.dirname(fileURLToPath(import.meta.url));
const src = path.join(dir, 'src');
const parts = fs.readdirSync(src).filter((f) => f.endsWith('.js')).sort();
const js = parts.map((f) => `// ═══════════ ${f} ═══════════\n` + fs.readFileSync(path.join(src, f), 'utf8')).join('\n');
const html = `<!doctype html>
<html lang="fr">
<meta charset="utf-8">
<title>Maquette — Halloween : décors des habitants et de la mairie</title>
<style>
  body { background: #1c1a22; color: #eee; font: 13px/1.4 system-ui, sans-serif; margin: 0; padding: 12px; }
  h2 { font-weight: 500; margin: 18px 0 6px; color: #d9d2c0; }
  canvas { display: block; background: #000; max-width: 100%; height: auto; border: 1px solid #333; }
  p.help { color: #aaa; max-width: 900px; }
</style>
<body>
<p class="help">Galerie des captures (sans paramètre) ou mode animé : <code>?h=15&amp;speed=20&amp;date=2026-10-24</code> (+ <code>zoom=1</code>). Débogage : <code>?T=15.05&amp;date=2026-10-24&amp;view=x0,y0,w,h,scale</code>. Toute la scène est une fonction pure de la date et de l'heure.</p>
<div id="gallery"></div>
<script>window.onerror=(m,s,l,c)=>{window.__err=(window.__err||"")+m+" @"+l+":"+c+"\\n"};</script>
<script>
${js}
</script>
</body>
</html>
`;
fs.writeFileSync(path.join(dir, 'maquette.html'), html);
console.log('maquette.html', html.length, 'octets,', parts.length, 'parties');
