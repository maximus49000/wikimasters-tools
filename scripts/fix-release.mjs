// Publie un correctif en production SANS les évolutions de la pré-production : construit l'APK depuis la branche `production`
// (jamais depuis main) et crée la release GitHub. La branche `production` doit déjà contenir le correctif (PR fusionnée).
// L'application Android ne cherche ses mises à jour que dans la dernière release.
// À lancer uniquement sur ordre explicite du propriétaire du dépôt.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isNewerRelease, notesSince } from './release-notes.mjs';

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

// `fix/production` est la branche de travail des correctifs : elle est identique à `production` une fois le correctif fusionné.
const branch = out('git', ['branch', '--show-current']);
if (branch !== 'production' && branch !== 'fix/production') fail('Lancer depuis la branche production (ou fix/production, alignée dessus).');
if (out('git', ['status', '--porcelain'])) fail('Arbre de travail non propre : valider ou écarter les changements.');
must('git', ['fetch', '--prune', '--tags', 'origin'], { stdio: 'ignore' });
if (out('git', ['rev-parse', 'HEAD']) !== out('git', ['rev-parse', 'origin/production'])) {
  fail('La branche locale diffère de origin/production : fusionner le correctif dans production, puis se réaligner dessus.');
}

must('npm', ['run', 'typecheck']);
must('npm', ['test']);
must('npm', ['run', 'build']);

const build = sh(process.execPath, ['scripts/build-apk.mjs'], { shell: false });
process.stdout.write(build.stdout);
process.stderr.write(build.stderr);
if (build.status !== 0) fail('Construction de l’APK échouée : rien de publié.');
const versionCode = /WMT_VERSION_CODE=(\d+)/.exec(build.stdout)?.[1];
if (!versionCode) fail('versionCode introuvable dans la sortie du build.');

const tags = out('git', ['tag', '--list', 'android-*']).split(/\r?\n/);
if (!isNewerRelease(versionCode, tags, 'android-')) fail(`Le versionCode ${versionCode} n’est pas supérieur à la dernière release : rien de publié.`);

const versionName = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
const apk = `livrables/wikimasters-tools-${versionName}-android.apk`;
const tag = `android-${versionCode}`;
must('gh', [
  'release', 'create', tag, apk,
  '--target', 'production',
  '--title', `${versionName} (${versionCode})`,
  '--notes', notesSince(root, 'android-', 'Corrections diverses.'),
  '--latest',
]);
console.log(`Correctif publié : release ${tag}.`);

// Sans ce report, la prochaine promotion de main (avance rapide) serait refusée et le correctif disparaîtrait de la pré-production.
if (sh('git', ['merge-base', '--is-ancestor', 'origin/production', 'origin/main']).status !== 0) {
  console.warn('À FAIRE : fusionner production dans main (PR), pour que le correctif reste dans la pré-production.');
}
