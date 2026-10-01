// Construit l'APK Android : bundle de la surcouche (Vite), puis assemblage Gradle.
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const run = (cmd, args, options = {}) => {
  const result = spawnSync(cmd, args, { stdio: 'inherit', cwd: root, shell: process.platform === 'win32', ...options });
  if (result.status !== 0) process.exit(result.status ?? 1);
};

run(process.execPath, ['node_modules/vite/bin/vite.js', 'build', '-c', 'vite.android.config.ts'], { shell: false });

// Gradle 9 / AGP 9 exigent un JDK 17+ : le JDK d'Android Studio est utilisé s'il est présent.
const studioJdk = 'C:/Program Files/Android/Android Studio/jbr';
const env = { ...process.env };
if (existsSync(studioJdk)) env.JAVA_HOME = studioJdk;
const gradlew = process.platform === 'win32' ? '.\\gradlew.bat' : './gradlew';
run(gradlew, ['assembleRelease'], { cwd: join(root, 'android'), env });

mkdirSync(join(root, 'livrables'), { recursive: true });
const apk = join(root, 'android/app/build/outputs/apk/release/app-release.apk');
copyFileSync(apk, join(root, 'livrables/wikimasters-tools-0.1.0-android.apk'));
console.log('APK : livrables/wikimasters-tools-0.1.0-android.apk');
