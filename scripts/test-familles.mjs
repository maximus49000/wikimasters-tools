// Joue seulement les familles de tests demandées (tests/familles.ts), plus le contrôle des familles.
//   npm run test:famille -- fiche toile         deux familles
//   npm run test:famille -- scene-commerces     une sous-famille de la scène
//   npm run test:famille -- "scene-*"           toute la scène
// Sans nom : liste les familles. La suite entière (TNR global) reste `npm test`.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const noms = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const options = process.argv.slice(2).filter((a) => a.startsWith('-'));
if (noms.length === 0) {
  const source = readFileSync(new URL('../tests/familles.ts', import.meta.url), 'utf8');
  console.log('Familles :', [...source.matchAll(/nom: '([^']+)'/g)].map((m) => m[1]).join(', '));
  console.log('Exemple : npm run test:famille -- fiche scene-commerces');
  process.exit(0);
}
const args = ['vitest', 'run', '--project=familles', ...noms.map((n) => `--project=${n}`), ...options];
const r = spawnSync('npx', args, { stdio: 'inherit', shell: process.platform === 'win32' });
process.exit(r.status ?? 1);
