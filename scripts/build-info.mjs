// Informations de build injectées dans le bundle : les corrections récentes, lues dans les commits `fix:`.
import { spawnSync } from 'node:child_process';

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
