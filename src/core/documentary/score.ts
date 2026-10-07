import type { DocCandidate, DocSubject } from './types';

// Note minimale pour afficher une vidéo. Réglée à la Task 9.
export const THRESHOLD = 60;

export type ScoreRules = { minDurationSec: number; maxDurationSec: number; bonus: number };
export const YOUTUBE_RULES: ScoreRules = { minDurationSec: 480, maxDurationSec: 7200, bonus: 0 };
// Les archives libres sont courtes ; leur titre vient de contributeurs qui les ont classées : léger bonus.
export const COMMONS_RULES: ScoreRules = { minDurationSec: 45, maxDurationSec: 7200, bonus: 20 };

export type ScoreResult = { score: number; reason?: string };

const GENRE = ['documentaire', 'documentary', 'docu', 'reportage'];
const NOISE = ['reaction', 'react', 'clip', 'remix', 'gameplay', 'let s play', 'trailer', 'bande annonce', 'shorts', 'asmr', 'meme', 'parodie', 'karaoke', 'lyrics', 'amv', 'tiktok'];
// Chaînes d'histoire / de service public, comparées sur des mots entiers.
const TRUSTED = ['arte', 'ina', 'france tv', 'francetv', 'france 2', 'france 5', 'histoire tv', 'nota bene', 'herodote', 'lumni', 'public senat', 'bbc', 'national geographic'];

// Minuscules, sans accents ni ponctuation : « L'Été » → « l ete ».
export function normalize(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

// Le groupe de mots `phrase` apparaît en mots entiers dans `text` (tous deux déjà normalisés).
const hasPhrase = (text: string, phrase: string): boolean => ` ${text} `.includes(` ${phrase} `);

// Noms sous lesquels un sujet peut apparaître dans un titre : libellés et alias, sans parenthèses, sans doublon, 4 caractères au moins.
export function subjectNames(labels: string[]): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const label of labels) {
    const name = label.replace(/\s*\([^)]*\)\s*/g, ' ').replace(/\s+/g, ' ').trim();
    const key = normalize(name);
    if (key.length < 4 || seen.has(key)) continue;
    seen.add(key);
    names.push(name);
  }
  return names;
}

const reject = (reason: string): ScoreResult => ({ score: 0, reason });

// Années « historiques » (≤ 1990) citées dans le titre : une année de réalisation (après 1990) ne compte pas.
function historicalYears(title: string): number[] {
  return [...title.matchAll(/\b(\d{4})\b/g)].map((match) => Number(match[1])).filter((year) => year <= 1990);
}

export function scoreCandidate(subject: DocSubject, candidate: DocCandidate, rules: ScoreRules): ScoreResult {
  const title = normalize(candidate.title);
  if (!subject.names.some((name) => hasPhrase(title, normalize(name)))) return reject('titre sans le nom du sujet');
  if (NOISE.some((word) => hasPhrase(title, word))) return reject('mot parasite');
  const duration = candidate.durationSec;
  if (duration === null) return reject('durée inconnue');
  if (duration < rules.minDurationSec) return reject('trop court');
  if (duration > rules.maxDurationSec) return reject('trop long');

  let score = 40 + rules.bonus;
  if (GENRE.some((word) => hasPhrase(title, word))) score += 20;
  else if (GENRE.some((word) => hasPhrase(normalize(candidate.description.slice(0, 500)), word))) score += 10;
  score += duration >= 1200 && duration <= 5400 ? 10 : 5;
  if (TRUSTED.some((channel) => hasPhrase(normalize(candidate.channel), channel))) score += 20;
  const language = (candidate.language ?? '').toLowerCase();
  if (language.startsWith('fr')) score += 5;
  else if (language.startsWith('en')) score += 3;

  if (subject.startYear !== null) {
    const low = subject.startYear - 50;
    const high = (subject.endYear ?? subject.startYear) + 50;
    const years = historicalYears(candidate.title);
    if (years.length > 0 && years.every((year) => year < low || year > high)) score -= 30;
  }
  return { score: Math.max(0, Math.min(100, score)) };
}

export const passes = (result: ScoreResult): boolean => result.reason === undefined && result.score >= THRESHOLD;
