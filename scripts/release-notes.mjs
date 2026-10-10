// Notes de version : les changements entre deux livrables, lus dans les commits (hors fusions) et mis en forme pour l'application.
import { spawnSync } from 'node:child_process';

const SECTIONS = [
  { type: 'feat', title: 'Nouveautés' },
  { type: 'fix', title: 'Corrections' },
];
const MAX_LENGTH = 160;

// Un sujet « feat: texte » devient une puce ; les autres types (test, docs, chore…) n'intéressent pas l'utilisateur.
export function formatNotes(subjects) {
  const lines = [];
  for (const { type, title } of SECTIONS) {
    const items = [];
    for (const subject of subjects) {
      const match = /^(\w+)(?:\([^)]*\))?!?:\s*(.+)$/.exec(subject.trim());
      if (!match || match[1] !== type) continue;
      const text = match[2].replace(/\s*Co-Authored-By:.*$/i, '').trim();
      const shown = text.length > MAX_LENGTH ? `${text.slice(0, MAX_LENGTH - 1).trimEnd()}…` : text;
      items.push(`• ${shown.charAt(0).toUpperCase()}${shown.slice(1)}`);
    }
    if (items.length) lines.push(title, ...items, '');
  }
  return lines.join('\n').trim();
}

// Les sujets des commits entre `from` (exclu, le livrable précédent) et `to` ; tout l'historique si `from` est absent.
export function subjectsBetween(cwd, from, to = 'HEAD') {
  const range = from ? `${from}..${to}` : to;
  const result = spawnSync('git', ['log', '--no-merges', '--reverse', '--format=%s', range], { cwd, encoding: 'utf8' });
  if (result.status !== 0) return [];
  return result.stdout.split(/\r?\n/).filter(Boolean);
}

// Le tag le plus récent `<préfixe><numéro>` parmi `tags` (le livrable précédent du canal), ou undefined.
export function latestTag(tags, tagPrefix) {
  const numbered = tags.filter((tag) => tag.startsWith(tagPrefix) && /^\d+$/.test(tag.slice(tagPrefix.length)));
  return numbered.sort((a, b) => Number(b.slice(tagPrefix.length)) - Number(a.slice(tagPrefix.length)))[0];
}

// Les notes du livrable à publier, par rapport au dernier livrable du même canal (tag `<préfixe><numéro>`).
export function notesSince(cwd, tagPrefix, fallback) {
  const tags = spawnSync('git', ['tag', '--list', `${tagPrefix}*`], { cwd, encoding: 'utf8' }).stdout.split(/\r?\n/);
  const notes = formatNotes(subjectsBetween(cwd, latestTag(tags, tagPrefix)));
  return notes || fallback;
}

// Un livrable doit avoir un numéro strictement supérieur au dernier du canal : l'application ne se met à jour que vers un versionCode plus grand.
export function isNewerRelease(versionCode, tags, tagPrefix) {
  const latest = latestTag(tags, tagPrefix);
  return latest === undefined || Number(versionCode) > Number(latest.slice(tagPrefix.length));
}
