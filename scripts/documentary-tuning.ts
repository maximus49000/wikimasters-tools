// Réglage de la notation des documentaires : pour chaque carte, liste toutes les vidéos trouvées avec leur note et la raison des rejets.
// Usage (PowerShell, depuis la racine) :
//   $env:DEBUG_TOKEN = Read-Host "Collez le secret"      # le secret DEBUG_TOKEN du relais, jamais écrit dans un fichier
//   npx vite-node scripts/documentary-tuning.ts "Bataille de Verdun" "Napoléon Ier"
//   npx vite-node scripts/documentary-tuning.ts            # sans titre : lit scripts/documentary-cards.txt (un titre par ligne)
// Chaque carte coûte une recherche YouTube (101 unités sur les 9 000 du jour) : le mode réglage ne lit jamais le cache.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { historyKindOf } from '../src/core/documentary/history-kinds';
import { ACCEPTABLE, THRESHOLD, tierOf, type ScoreResult } from '../src/core/documentary/score';
import { fetchSubject } from '../src/core/documentary/subject';
import type { DocCandidate } from '../src/core/documentary/types';

const RELAY = process.env.RELAY_BASE ?? 'https://wikimasters-tools.maxime-protais-baumer.workers.dev';
const token = process.env.DEBUG_TOKEN;
if (!token) throw new Error('Définissez DEBUG_TOKEN dans l’environnement (secret du relais).');
const MAX_CARDS = Number(process.env.MAX_CARDS ?? 25);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Wikipédia et Wikidata limitent le débit (429) : on attend et on réessaie, au plus quatre fois.
async function get(url: string, init: RequestInit = {}): Promise<Response> {
  for (let attempt = 0; ; attempt += 1) {
    const response = await fetch(url, { ...init, headers: { 'User-Agent': 'WikimastersTuning/1.0', ...(init.headers ?? {}) } });
    if (response.status !== 429 || attempt >= 4) return response;
    await sleep((Number(response.headers.get('retry-after')) || 10) * 1000);
  }
}

async function natures(qid: string): Promise<string[]> {
  const json = (await (await get(`https://www.wikidata.org/w/api.php?action=wbgetentities&props=claims&ids=${qid}&format=json`)).json()) as { entities: Record<string, { claims?: Record<string, { mainsnak: { datavalue?: { value?: { id?: string } } } }[]> }> };
  return (json.entities[qid]?.claims?.P31 ?? []).map((claim) => claim.mainsnak.datavalue?.value?.id).filter((id): id is string => Boolean(id));
}

const args = process.argv.slice(2);
const file = new URL('./documentary-cards.txt', import.meta.url);
const titles = (args.length > 0 ? args : existsSync(file) ? readFileSync(file, 'utf8').split(/\r?\n/) : []).map((line) => line.trim()).filter((line) => line !== '' && !line.startsWith('#'));
if (titles.length === 0) throw new Error('Aucune carte : donnez des titres en arguments, ou remplissez scripts/documentary-cards.txt.');

const lines: string[] = [];
const say = (text = '') => {
  console.log(text);
  lines.push(text);
};
const label = (result: ScoreResult): string => (tierOf(result) === 'good' ? 'PROPOSÉE' : tierOf(result) === 'possible' ? 'possible' : 'rejetée');

say(`# Réglage du documentaire — ${new Date().toISOString().slice(0, 10)}`);
say(`Seuils : proposée ≥ ${THRESHOLD}, possible de ${ACCEPTABLE} à ${THRESHOLD - 1}. Cochez « bon » ou « mauvais » pour chaque vidéo proposée ou possible.`);

for (const title of titles.slice(0, MAX_CARDS)) {
  await sleep(1500);
  const slug = title.replace(/ /g, '_');
  const subject = await fetchSubject((url) => get(url), slug);
  if (!subject) {
    say(`\n## ${title}\n  pas d’élément Wikidata`);
    continue;
  }
  const kind = historyKindOf({ natures: await natures(subject.qid), occupations: [], genres: [] }, subject.death);
  if (!kind) {
    say(`\n## ${title} (${subject.qid})\n  hors périmètre (personne vivante ou morte depuis 1970, page d’homonymie, ou carte qui a déjà sa fiche : film, série, jeu, livre, morceau)`);
    continue;
  }
  const params = new URLSearchParams({ qid: subject.qid, kind, names: subject.names.slice(0, 6).join('|') });
  const start = kind === 'person' ? subject.birth : subject.start;
  const end = kind === 'person' ? subject.death : subject.end;
  if (start !== null) params.set('start', String(start));
  if (end !== null) params.set('end', String(end));
  const response = await get(`${RELAY}/search?${params.toString()}`, { headers: { 'x-debug': token } });
  const body = (await response.json()) as { ok: boolean; reason?: string; debug?: { candidate: DocCandidate; result: ScoreResult }[] };
  say(`\n## ${title} (${subject.qid}, ${kind}, ${start ?? '?'}–${end ?? '?'})`);
  say(`Noms cherchés : ${subject.names.join(' | ')}`);
  if (!body.ok || !body.debug) {
    say(`  indisponible : ${body.reason ?? `HTTP ${response.status}`}${body.debug ? '' : ' (le mode réglage est-il actif ? DEBUG_TOKEN)'}`);
    continue;
  }
  const sorted = [...body.debug].sort((a, b) => b.result.score - a.result.score);
  const kept = sorted.filter((entry) => tierOf(entry.result) !== null);
  for (const { candidate, result } of kept) {
    say(`- [ ] bon  [ ] mauvais   ${label(result).padEnd(8)} ${String(result.score).padStart(3)}  ${candidate.title.slice(0, 90)}  [${candidate.channel}] ${Math.round((candidate.durationSec ?? 0) / 60)} min  ${candidate.url}`);
  }
  if (kept.length === 0) say('  aucune vidéo proposée ni possible');
  const rejected = sorted.filter((entry) => tierOf(entry.result) === null);
  say(`  rejetées : ${rejected.length} (${[...new Set(rejected.map((entry) => entry.result.reason ?? `note ${entry.result.score}`))].join(', ') || 'aucune'})`);
}

mkdirSync(new URL('../.superpowers/tuning/', import.meta.url), { recursive: true });
const out = new URL(`../.superpowers/tuning/documentaire-${new Date().toISOString().slice(0, 10)}.md`, import.meta.url);
writeFileSync(out, lines.join('\n') + '\n');
console.log(`\nTableau enregistré : ${out.pathname.replace(/^\//, '')}`);
