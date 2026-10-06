// Publie la pré-production (main) : APK « pré-prod » en pre-release GitHub, que seuls les APK de pré-production suivent.
// Les pre-releases n'entrent jamais dans /releases/latest : l'APK de production ne les voit pas.
// À lancer après chaque fusion dans main.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const sh = (cmd, args, options = {}) =>
  spawnSync(cmd, args, { cwd: root, encoding: 'utf8', shell: cmd === 'npm' && process.platform === 'win32', ...options });
const fail = (message) => {
  console.error(message);
  process.exit(1);
};
const out = (cmd, args) => {
  const result = sh(cmd, args);
  if (result.status !== 0) fail(`Échec : ${cmd} ${args.join(' ')}\n${result.stderr}`);
  return result.stdout.trim();
};

if (out('git', ['branch', '--show-current']) !== 'main') fail('Lancer depuis la branche main.');
if (out('git', ['status', '--porcelain'])) fail('Arbre de travail non propre : valider ou écarter les changements.');
if (sh('git', ['fetch', '--prune', 'origin'], { stdio: 'ignore' }).status !== 0) fail('git fetch a échoué.');
if (out('git', ['rev-parse', 'HEAD']) !== out('git', ['rev-parse', 'origin/main'])) fail('main local différent de origin/main : synchroniser d’abord.');

const build = sh(process.execPath, ['scripts/build-apk.mjs', '--channel=preprod'], { shell: false });
process.stdout.write(build.stdout);
process.stderr.write(build.stderr);
if (build.status !== 0) fail('Construction de l’APK échouée : rien publié.');
const versionCode = /WMT_VERSION_CODE=(\d+)/.exec(build.stdout)?.[1];
if (!versionCode) fail('versionCode introuvable dans la sortie du build.');

const versionName = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
const tag = `preprod-${versionCode}`;
const created = sh('gh', [
  'release', 'create', tag, `livrables/wikimasters-tools-preprod-${versionName}-android.apk`,
  '--target', 'main',
  '--prerelease',
  '--latest=false',
  '--title', `Pré-production ${versionName} (${versionCode})`,
  '--notes', `Pré-production : ${out('git', ['rev-parse', '--short', 'HEAD'])}. Réservée aux testeurs.`,
], { stdio: 'inherit' });
if (created.status !== 0) fail('Création de la pre-release échouée.');

// On ne garde que les 3 dernières pre-releases de pré-production (la production n'est jamais touchée).
const tags = out('gh', ['release', 'list', '--limit', '100', '--json', 'tagName,isPrerelease', '--jq', '.[] | select(.isPrerelease) | .tagName'])
  .split(/\r?\n/)
  .filter((name) => /^preprod-\d+$/.test(name))
  .sort((a, b) => Number(b.slice(8)) - Number(a.slice(8)));
for (const old of tags.slice(3)) sh('gh', ['release', 'delete', old, '--yes', '--cleanup-tag'], { stdio: 'inherit' });
console.log(`Pré-production à jour : pre-release ${tag}.`);
