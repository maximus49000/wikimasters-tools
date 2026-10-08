// Vérifie qu'aucune valeur de `.env.local` (clés WXT_*) n'apparaît dans les paquets compilés. N'affiche que des NOMS de variables, jamais de valeur.
//
// Usage : npm run verifier-secrets [-- dossier…]   (par défaut : .output et android/app/src/main/assets)
// Codes de sortie : 0 = aucune fuite ; 1 = fuite trouvée ; 2 = rien à chercher (.env.local absent ou sans valeur WXT_*), donc RIEN n'a été vérifié.
// ALLOW_EMPTY=1 accepte ce dernier cas (code 0). Un dossier plus ancien que le dernier commit est signalé : il faut reconstruire avant de conclure.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const raw = existsSync('.env.local') ? readFileSync('.env.local', 'utf8') : '';
const secrets = raw
  .split(/\r?\n/)
  .map((line) => /^(WXT_[A-Z0-9_]+)=(.*)$/.exec(line))
  .filter(Boolean)
  .map((match) => [match[1], match[2].trim().replace(/^['"]|['"]$/g, '')])
  .filter(([, value]) => value.length >= 8);
const roots = process.argv.length > 2 ? process.argv.slice(2) : ['.output', 'android/app/src/main/assets'];

function* walk(path) {
  if (!existsSync(path)) return;
  if (statSync(path).isFile()) return yield path;
  for (const name of readdirSync(path)) yield* walk(join(path, name));
}

// Date du dernier commit (ms) ; null si git est absent ou le dossier n'est pas un dépôt.
function lastCommitTime() {
  try {
    const seconds = Number(execFileSync('git', ['log', '-1', '--format=%ct'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim());
    return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : null;
  } catch {
    return null;
  }
}
const commitTime = lastCommitTime();

let leaks = 0;
let scanned = 0;
const stale = [];
for (const root of roots) {
  let newest = 0;
  for (const file of walk(root)) {
    scanned += 1;
    newest = Math.max(newest, statSync(file).mtimeMs);
    const text = readFileSync(file, 'latin1');
    for (const [name, value] of secrets) {
      if (text.includes(value)) {
        console.error(`FUITE : ${name} dans ${file}`);
        leaks += 1;
      }
    }
  }
  if (commitTime !== null && newest > 0 && newest < commitTime) stale.push(root);
}
if (stale.length > 0) console.error(`AVIS : ${stale.join(', ')} plus ancien(s) que le dernier commit — reconstruire (npm run build / build:android) avant de conclure.`);
console.log(`${secrets.length} secret(s) cherché(s) dans ${scanned} fichier(s) : ${leaks === 0 ? 'aucune fuite' : `${leaks} fuite(s)`}.`);
if (secrets.length === 0) console.error("AVIS : aucun secret à chercher (.env.local absent ou sans valeur WXT_*), rien n'a été vérifié.");
if (leaks > 0) process.exit(1);
process.exit(secrets.length === 0 && process.env.ALLOW_EMPTY !== '1' ? 2 : 0);
