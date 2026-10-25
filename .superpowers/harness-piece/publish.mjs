// Publication : node publish.mjs <dossier-de-png> <sous-dossier>
// Copie les PNG dans <worktree des captures>/g6/<sous-dossier>/, met à jour g6/README.md (titre + images), commit, push, affiche le lien.
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
const [, , src, sub] = process.argv;
if (!src || !sub) {
  console.error('usage : node publish.mjs <dossier-de-png> <sous-dossier>');
  process.exit(2);
}
const REPO = process.env.CAPTURES_DIR ?? 'C:/Users/maxim/Downloads/Wikimasters-g6-captures';
const BRANCH = 'captures/g6-piece';
const LINK = 'https://github.com/maximus49000/wikimasters-tools/tree/captures/g6-piece/g6';
const git = (...a) => execFileSync('git', ['-C', REPO, ...a], { encoding: 'utf8' }).trim();
if (git('branch', '--show-current') !== BRANCH) throw new Error(`le dossier des captures n'est pas sur ${BRANCH}`);
const dest = join(REPO, 'g6', sub);
mkdirSync(dest, { recursive: true });
const pngs = readdirSync(src).filter((f) => f.toLowerCase().endsWith('.png'));
if (pngs.length === 0) throw new Error('aucun PNG dans ' + src);
for (const f of pngs) copyFileSync(join(src, f), join(dest, f));
// README : une section par sous-dossier (remplacée à chaque publication).
const readme = join(REPO, 'g6', 'README.md');
let text = existsSync(readme) ? readFileSync(readme, 'utf8') : '';
if (!text.trim()) text = '# G6 — captures de la pièce façon Ghibli\n';
const head = `## ${sub}`;
const section = `${head}\n\n${pngs.map((f) => `### ${f}\n\n![${f}](${sub}/${encodeURIComponent(f)})\n`).join('\n')}`;
const parts = text.split(/^(?=## )/m);
const kept = parts.filter((p) => !p.startsWith(head + '\n'));
writeFileSync(readme, kept.join('').replace(/\n*$/, '\n') + '\n' + section);
git('add', 'g6');
if (git('status', '--porcelain', 'g6')) git('commit', '-m', `captures G6 : ${sub}\n\nCo-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`);
git('push', '-u', 'origin', BRANCH);
console.log(`${LINK}/${sub}`);
