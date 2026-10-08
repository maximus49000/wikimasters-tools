// Informations de build injectées dans le bundle : les corrections récentes, lues dans les commits `fix:`.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const MAX_LENGTH = 160;

// Une ligne « hash<TAB>sujet » → { id: hash, title } si le sujet est un `fix:`, sinon null.
export function parseFix(line) {
  const [id, ...rest] = line.split('\t');
  const match = /^fix(?:\([^)]*\))?!?:\s*(.+)$/.exec(rest.join('\t').trim());
  if (!id || !match) return null;
  const text = match[1].replace(/\s*Co-Authored-By:.*$/i, '').trim();
  const shown = text.length > MAX_LENGTH ? `${text.slice(0, MAX_LENGTH - 1).trimEnd()}…` : text;
  return { id, title: `${shown.charAt(0).toUpperCase()}${shown.slice(1)}` };
}

// Les `limit` corrections les plus récentes (plus récente d'abord) ; vide si git est indisponible (archive de sources).
export function recentFixes(cwd, limit = 60) {
  const result = spawnSync('git', ['log', '--no-merges', '-n', '400', '--format=%h%x09%s'], { cwd, encoding: 'utf8' });
  if (result.status !== 0) return [];
  return result.stdout
    .split(/\r?\n/)
    .map(parseFix)
    .filter(Boolean)
    .slice(0, limit);
}

// Identifiant de build injecté dans le bundle : « version du paquet + nombre de commits » (le nombre de commits est aussi le versionCode Android).
// La version du paquet ne change pas, le nombre de commits distingue donc deux livraisons ; « +0 » si git est indisponible (archive de sources).
export function buildId(cwd) {
  let version = '0.0.0';
  try {
    version = JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf8')).version ?? version;
  } catch {
    // package.json illisible : on garde 0.0.0
  }
  const result = spawnSync('git', ['rev-list', '--count', 'HEAD'], { cwd, encoding: 'utf8' });
  const commits = result.status === 0 ? Number.parseInt(result.stdout, 10) : 0;
  return `${version}+${Number.isInteger(commits) ? commits : 0}`;
}
