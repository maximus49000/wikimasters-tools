// Génère une clé publique Chrome (champ `key` du manifeste) et l'identifiant d'extension qui en découle.
// L'identifiant devient stable d'une installation à l'autre : l'adresse de retour Spotify (https://<id>.chromiumapp.org/) ne change plus.
// Usage : node scripts/chrome-extension-id.mjs            → génère une paire, affiche la clé et l'identifiant
//         node scripts/chrome-extension-id.mjs <clé>      → affiche l'identifiant d'une clé existante
import { createHash, generateKeyPairSync } from 'node:crypto';

const given = process.argv[2];
let key = given;
if (!key) {
  const { publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  key = publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
}
const digest = createHash('sha256').update(Buffer.from(key, 'base64')).digest('hex').slice(0, 32);
const id = [...digest].map((char) => String.fromCharCode('a'.charCodeAt(0) + parseInt(char, 16))).join('');
console.log(`key: ${key}`);
console.log(`id: ${id}`);
console.log(`redirect URI Spotify : https://${id}.chromiumapp.org/`);
