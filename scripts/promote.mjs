// Passe la pré-production (main) en production : branche `production` + release GitHub avec l'APK.
// L'application Android ne cherche ses mises à jour que dans la dernière release : la pré-production n'en publie jamais.
// À lancer uniquement sur ordre explicite du propriétaire du dépôt.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const sh = (cmd, args, options = {}) =>
  spawnSync(cmd, args, { cwd: root, encoding: 'utf8', shell: cmd === 'npm' && process.platform === 'win32', ...options });
const must = (cmd, args, options = {}) => {
  const result = sh(cmd, args, { stdio: 'inherit', ...options });
  if (result.status !== 0) fail(`Échec : ${cmd} ${args.join(' ')}`);
};
const out = (cmd, args) => {
  const result = sh(cmd, args);
  if (result.status !== 0) fail(`Échec : ${cmd} ${args.join(' ')}\n${result.stderr}`);
  return result.stdout.trim();
};
const fail = (message) => {
  console.error(message);
  process.exit(1);
};

if (out('git', ['branch', '--show-current']) !== 'main') fail('Lancer depuis la branche main.');
if (out('git', ['status', '--porcelain'])) fail('Arbre de travail non propre : valider ou écarter les changements.');
must('git', ['fetch', 'origin', 'main', 'production'], { stdio: 'ignore' });
const head = out('git', ['rev-parse', 'HEAD']);
if (head !== out('git', ['rev-parse', 'origin/main'])) fail('main local différent de origin/main : synchroniser d’abord.');

// Une production déjà en avance sur main (ou divergente) n'est pas écrasée.
const prod = sh('git', ['rev-parse', '--verify', '--quiet', 'origin/production']);
if (prod.status === 0 && sh('git', ['merge-base', '--is-ancestor', 'origin/production', 'HEAD']).status !== 0) {
  fail('origin/production n’est pas un ancêtre de main : avance rapide impossible, vérifier à la main.');
}
if (prod.status === 0 && prod.stdout.trim() === head) fail('La production est déjà identique à main : rien à promouvoir.');

must('npm', ['run', 'typecheck']);
must('npm', ['test']);
must('npm', ['run', 'build']);

const build = sh(process.execPath, ['scripts/build-apk.mjs'], { shell: false });
process.stdout.write(build.stdout);
process.stderr.write(build.stderr);
if (build.status !== 0) fail('Construction de l’APK échouée : production inchangée.');
const versionCode = /WMT_VERSION_CODE=(\d+)/.exec(build.stdout)?.[1];
if (!versionCode) fail('versionCode introuvable dans la sortie du build.');

const versionName = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
const apk = `livrables/wikimasters-tools-${versionName}-android.apk`;
const tag = `android-${versionCode}`;

// Avance rapide uniquement (pas de --force) ; crée la branche au premier passage.
must('git', ['push', 'origin', 'main:production']);
must('gh', [
  'release', 'create', tag, apk,
  '--target', 'production',
  '--title', `${versionName} (${versionCode})`,
  '--notes', `Production : ${out('git', ['rev-parse', '--short', 'HEAD'])}. Les téléphones se mettent à jour d’eux-mêmes.`,
  '--latest',
]);
console.log(`Production à jour : release ${tag}.`);
