// Vérifie qu'aucune valeur de `.env.local` (clés WXT_*) n'apparaît dans les paquets compilés. N'affiche que des NOMS de variables, jamais de valeur.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
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

let leaks = 0;
let scanned = 0;
for (const root of roots) {
  for (const file of walk(root)) {
    scanned += 1;
    const text = readFileSync(file, 'latin1');
    for (const [name, value] of secrets) {
      if (text.includes(value)) {
        console.error(`FUITE : ${name} dans ${file}`);
        leaks += 1;
      }
    }
  }
}
console.log(`${secrets.length} secret(s) cherché(s) dans ${scanned} fichier(s) : ${leaks === 0 ? 'aucune fuite' : `${leaks} fuite(s)`}.`);
process.exit(leaks === 0 ? 0 : 1);
