import { describe, expect, it } from 'vitest';
import { COMMONS_RULES, normalize, passes, scoreCandidate, subjectNames, tierOf, YOUTUBE_RULES } from '../../../src/core/documentary/score';
import type { DocCandidate, DocSubject } from '../../../src/core/documentary/types';

const verdun: DocSubject = { qid: 'Q2280', kind: 'event', names: ['Bataille de Verdun', 'Verdun'], startYear: 1916, endYear: 1916 };
const base: DocCandidate = { source: 'youtube', id: 'abc123', title: '', channel: 'Une chaîne', durationSec: 3120, language: 'fr', description: '', url: 'https://www.youtube.com/watch?v=abc123' };
const make = (change: Partial<DocCandidate>): DocCandidate => ({ ...base, ...change });

describe('normalize', () => {
  it('retire accents, casse et ponctuation', () => {
    expect(normalize("L'Été d'Éloïse !")).toBe('l ete d eloise');
  });
});

describe('subjectNames', () => {
  it('retire les parenthèses, les doublons et les noms trop courts', () => {
    expect(subjectNames(['Napoléon Ier', 'Napoleon', 'Bataille de Verdun (1916)', 'Ab', 'napoléon ier'])).toEqual(['Napoléon Ier', 'Napoleon', 'Bataille de Verdun']);
  });
});

describe('scoreCandidate', () => {
  it('retient un documentaire dont le titre porte le nom et le genre', () => {
    const result = scoreCandidate(verdun, make({ title: "Verdun, la bataille de l'impossible - documentaire" }), YOUTUBE_RULES);
    expect(result.score).toBe(75);
    expect(passes(result)).toBe(true);
  });

  it('rejette un titre sans le nom du sujet', () => {
    const result = scoreCandidate(verdun, make({ title: 'Les grandes batailles - documentaire' }), YOUTUBE_RULES);
    expect(result.reason).toBe('titre sans le nom du sujet');
    expect(passes(result)).toBe(false);
  });

  it('rejette un extrait trop court et un film trop long', () => {
    expect(scoreCandidate(verdun, make({ title: 'Verdun documentaire', durationSec: 120 }), YOUTUBE_RULES).reason).toBe('trop court');
    expect(scoreCandidate(verdun, make({ title: 'Verdun documentaire', durationSec: 9000 }), YOUTUBE_RULES).reason).toBe('trop long');
  });

  it('rejette une durée inconnue', () => {
    expect(scoreCandidate(verdun, make({ title: 'Verdun documentaire', durationSec: null }), YOUTUBE_RULES).reason).toBe('durée inconnue');
  });

  it('rejette les mots parasites', () => {
    expect(scoreCandidate(verdun, make({ title: 'Verdun documentaire REACTION' }), YOUTUBE_RULES).reason).toBe('mot parasite');
    expect(scoreCandidate(verdun, make({ title: 'Verdun - bande annonce' }), YOUTUBE_RULES).reason).toBe('mot parasite');
  });

  it('exige mieux qu’un titre nu : 55 points ne passent pas', () => {
    const result = scoreCandidate(verdun, make({ title: 'Verdun 1916', durationSec: 3000 }), YOUTUBE_RULES);
    expect(result.score).toBe(55);
    expect(passes(result)).toBe(false);
  });

  it('une chaîne reconnue suffit à passer', () => {
    const result = scoreCandidate(verdun, make({ title: 'Verdun 14-18', channel: 'ARTE', durationSec: 2600 }), YOUTUBE_RULES);
    expect(result.score).toBe(75);
    expect(passes(result)).toBe(true);
  });

  it('pénalise une année du titre éloignée de la période (homonyme)', () => {
    const result = scoreCandidate(verdun, make({ title: 'Verdun 1250 documentaire' }), YOUTUBE_RULES);
    expect(result.score).toBe(45);
    expect(passes(result)).toBe(false);
  });

  it('ne pénalise pas l’année de réalisation (après 1990)', () => {
    const result = scoreCandidate(verdun, make({ title: 'Verdun documentaire 2016' }), YOUTUBE_RULES);
    expect(passes(result)).toBe(true);
  });

  it('reconnaît un nom dont tous les mots sont dans le titre, dans un autre ordre', () => {
    const tenture: DocSubject = { qid: 'Q618856', kind: 'event', names: ['Tenture de l’Apocalypse'], startYear: 1377, endYear: null };
    expect(scoreCandidate(tenture, make({ title: 'Apocalypse, la Tenture du Château d’Angers' }), YOUTUBE_RULES).reason).toBeUndefined();
    expect(scoreCandidate(tenture, make({ title: 'Apocalypse : la guerre des mondes' }), YOUTUBE_RULES).reason).toBe('titre sans le nom du sujet');
    // Un nom d'un seul mot reste exigé en entier.
    expect(scoreCandidate(verdun, make({ title: 'Verdunois en fête documentaire' }), YOUTUBE_RULES).reason).toBe('titre sans le nom du sujet');
  });

  it('un titre d’émission d’histoire gagne 10 points', () => {
    const tenture: DocSubject = { qid: 'Q618856', kind: 'event', names: ['Tenture de l’Apocalypse'], startYear: 1377, endYear: null };
    const result = scoreCandidate(tenture, make({ title: 'Au cœur de l’Histoire : La tenture de l’Apocalypse', durationSec: 3180 }), YOUTUBE_RULES);
    expect(result.score).toBe(65);
    expect(tierOf(result)).toBe('good');
  });

  it('un contenu pour enfants reste proposé mais perd 15 points', () => {
    expect(scoreCandidate(verdun, make({ title: 'Verdun documentaire pour enfants' }), YOUTUBE_RULES).score).toBe(60);
    expect(scoreCandidate(verdun, make({ title: 'Verdun documentaire', channel: 'Univers Kids' }), YOUTUBE_RULES).score).toBe(60);
  });

  it('un titre complotiste perd 25 points et tombe sous le seuil des vidéos possibles', () => {
    const result = scoreCandidate(verdun, make({ title: 'Verdun : les mensonges de l’histoire officielle' }), YOUTUBE_RULES);
    expect(result.score).toBe(40);
    expect(tierOf(result)).toBeNull();
    expect(scoreCandidate(verdun, make({ title: 'Verdun : ce qu’on vous cache documentaire' }), YOUTUBE_RULES).score).toBe(50);
  });

  it('un titre racoleur perd 15 points', () => {
    expect(scoreCandidate(verdun, make({ title: 'Verdun documentaire : la vérité est terrifiante' }), YOUTUBE_RULES).score).toBe(60);
    expect(scoreCandidate(verdun, make({ title: 'Verdun : le mystère enfin résolu' }), YOUTUBE_RULES).score).toBe(40);
  });

  it('l’émission Secrets d’Histoire est une référence', () => {
    const result = scoreCandidate(verdun, make({ title: 'Verdun, au nom de la patrie - Secrets d’Histoire', channel: 'Secrets d’Histoire - France Télévisions', durationSec: 6660 }), YOUTUBE_RULES);
    expect(result.score).toBe(80);
  });

  it('accepte une archive libre de Commons plus courte', () => {
    const napoleon: DocSubject = { qid: 'Q517', kind: 'person', names: ['Napoléon Ier', 'Napoleon'], startYear: 1769, endYear: 1821 };
    const archive = make({ source: 'commons', title: 'La Révolution française et Napoléon - Planet Wissen', durationSec: 100, language: null });
    expect(passes(scoreCandidate(napoleon, archive, COMMONS_RULES))).toBe(true);
    expect(scoreCandidate(napoleon, { ...archive, durationSec: 30 }, COMMONS_RULES).reason).toBe('trop court');
  });
});

describe('tierOf', () => {
  it('sépare vidéos proposées, possibles et écartées', () => {
    expect(tierOf({ score: 75 })).toBe('good');
    expect(tierOf({ score: 60 })).toBe('good');
    expect(tierOf({ score: 59 })).toBe('possible');
    expect(tierOf({ score: 45 })).toBe('possible');
    expect(tierOf({ score: 44 })).toBeNull();
    expect(tierOf({ score: 0, reason: 'trop court' })).toBeNull();
  });
});
