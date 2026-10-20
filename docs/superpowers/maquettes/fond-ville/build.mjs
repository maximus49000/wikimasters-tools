// Assemble maquette.html (page autonome, sans réseau) : deux bundles du VRAI code de l'appli (vite, lib iife) + src/*.js.
//   AVANT : décor actuel complet (cityPaintPlan + paintCityTile tels quels).
//   RUE   : même code, hill-painter.ts remplacé par un stub → premier plan seul sur fond transparent.
// Le fond corrigé et la vie du fond sont dans src/*.js (JS lisible, à porter dans hill-painter.ts / city-plan.ts).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
const dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(dir, '../../../..');
const out = path.join(dir, '.bundles');
async function bundle(name, aliasStub) {
  await build({
    root,
    configFile: false,
    logLevel: 'warn',
    plugins: aliasStub
      ? [{
          name: 'maquette-fond',
          enforce: 'pre',
          resolveId(source, importer) {
            if (source === './hill-painter') return path.join(dir, 'stub-hill-painter.ts');
            if (source === './cel' && importer && importer.endsWith('facade-painter.ts')) return path.join(dir, 'cel-sans-ombre.ts');
            return null;
          },
        }]
      : [],
    build: {
      outDir: out,
      emptyOutDir: false,
      minify: false,
      sourcemap: false,
      lib: { entry: path.join(dir, 'entree-appli.ts'), name, formats: ['iife'], fileName: () => `${name}.js` },
    },
  });
  return fs.readFileSync(path.join(out, `${name}.js`), 'utf8');
}
fs.rmSync(out, { recursive: true, force: true });
const AVANT = await bundle('AVANT', false);
const RUE = await bundle('RUE', true);
fs.rmSync(out, { recursive: true, force: true });
const src = path.join(dir, 'src');
const parts = fs.readdirSync(src).filter((f) => f.endsWith('.js')).sort();
const js = parts.map((f) => `// ═══════════ ${f} ═══════════\n` + fs.readFileSync(path.join(src, f), 'utf8')).join('\n');
const html = `<!doctype html>
<html lang="fr">
<meta charset="utf-8">
<title>Maquette — le fond vivant de la Ville (cellulo Ghibli)</title>
<style>
  body { background: #1c1a22; color: #eee; font: 13px/1.4 system-ui, sans-serif; margin: 0; padding: 12px; }
  h2 { font-weight: 500; margin: 18px 0 6px; color: #d9d2c0; }
  canvas { display: block; background: #000; max-width: 100%; height: auto; border: 1px solid #333; }
  p.help { color: #aaa; max-width: 1000px; }
  code { color: #f0d090; }
</style>
<body>
<p class="help">Galerie des captures (sans paramètre) ou mode animé : <code>?h=18.5&amp;speed=20&amp;seed=7</code>
(+ <code>date=2026-10-20</code>, <code>meteo=soleil|nuages|pluie|brouillard|neige</code>, <code>zoom=colline|funi|tour|ruelle</code>, <code>scale=2</code>).
Espace : pause · ← → : ±10 min · + − : vitesse. Tout le fond est une fonction pure de (graine, date, heure, météo).
Débogage : <code>?T=18.5&amp;seed=7&amp;view=x0,y0,w,h,scale</code>.</p>
<div id="gallery"></div>
<script>window.onerror=(m,s,l,c)=>{window.__err=(window.__err||"")+m+" @"+l+":"+c+"\\n"};</script>
<script>
${AVANT}
</script>
<script>
${RUE}
</script>
<script>
${js}
</script>
</body>
</html>
`;
fs.writeFileSync(path.join(dir, 'maquette.html'), html);
console.log('maquette.html', html.length, 'octets,', parts.length, 'parties, bundles', AVANT.length, RUE.length);
