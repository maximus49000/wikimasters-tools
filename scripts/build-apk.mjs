// Construit l'APK Android : bundle de la surcouche (Vite), puis assemblage Gradle.
// versionCode = nombre de commits (il ne fait qu'augmenter), condition pour qu'Android accepte la mise à jour automatique.
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const run = (cmd, args, options = {}) => {
  const result = spawnSync(cmd, args, { stdio: 'inherit', cwd: root, shell: process.platform === 'win32', ...options });
  if (result.status !== 0) process.exit(result.status ?? 1);
};

const versionName = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
const commits = spawnSync('git', ['rev-list', '--count', 'HEAD'], { cwd: root, encoding: 'utf8' });
const versionCode = Number.parseInt(commits.stdout, 10);
if (commits.status !== 0 || !Number.isInteger(versionCode)) {
  console.error('Impossible de calculer le versionCode (git rev-list --count HEAD).');
  process.exit(1);
}

run(process.execPath, ['node_modules/vite/bin/vite.js', 'build', '-c', 'vite.android.config.ts'], { shell: false });

// Gradle 9 / AGP 9 exigent un JDK 17+ : le JDK d'Android Studio est utilisé s'il est présent.
const studioJdk = 'C:/Program Files/Android/Android Studio/jbr';
const env = { ...process.env };
if (existsSync(studioJdk)) env.JAVA_HOME = studioJdk;
const gradlew = process.platform === 'win32' ? '.\\gradlew.bat' : './gradlew';
run(gradlew, ['assembleRelease', `-PversionCode=${versionCode}`, `-PversionName=${versionName}`], { cwd: join(root, 'android'), env });

mkdirSync(join(root, 'livrables'), { recursive: true });
const apk = join(root, 'android/app/build/outputs/apk/release/app-release.apk');
const target = `livrables/wikimasters-tools-${versionName}-android.apk`;
copyFileSync(apk, join(root, target));
console.log(`APK : ${target} (versionCode ${versionCode})`);
// Lu par scripts/promote.mjs.
console.log(`WMT_VERSION_CODE=${versionCode}`);
