// tests/core/documentary/proposal.test.ts
import { describe, expect, it } from 'vitest';
import { buildFlagIssue, buildProposalIssue, FLAG_LABEL, parseYoutubeKey, PROPOSAL_LABEL } from '../../../src/core/documentary/proposal';

describe('parseYoutubeKey', () => {
  it.each([
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://youtu.be/dQw4w9WgXcQ?t=10', 'dQw4w9WgXcQ'],
    ['https://www.youtube.com/embed/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://m.youtube.com/watch?v=dQw4w9WgXcQ&list=x', 'dQw4w9WgXcQ'],
    ['dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
  ])('lit %s', (input, key) => expect(parseYoutubeKey(input)).toBe(key));

  it('refuse ce qui n’est pas YouTube', () => {
    expect(parseYoutubeKey('https://exemple.com/watch?v=dQw4w9WgXcQ')).toBeNull();
    expect(parseYoutubeKey('pas un lien !')).toBeNull();
    expect(parseYoutubeKey('')).toBeNull();
  });
});

const input = { qid: 'Q2280', slug: 'Bataille_de_Verdun', cardTitle: 'Bataille de Verdun', key: 'dQw4w9WgXcQ', videoTitle: 'Verdun @pseudo', channel: 'ARTE', platform: 'extension du navigateur', name: 'Max' };

describe('issues', () => {
  it('une proposition porte l’étiquette, la carte, le lien et neutralise les @', () => {
    const issue = buildProposalIssue(input);
    expect(issue.labels).toEqual([PROPOSAL_LABEL]);
    expect(issue.title).toBe('Documentaire proposé : Bataille de Verdun');
    expect(issue.body).toContain('Q2280');
    expect(issue.body).toContain('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    expect(issue.body).toContain('@​pseudo');
    expect(issue.body).toContain('Max');
  });
  it('un signalement « pas pertinent » a son étiquette et reste anonyme sans nom', () => {
    const issue = buildFlagIssue({ ...input, name: null });
    expect(issue.labels).toEqual([FLAG_LABEL]);
    expect(issue.title).toBe('Documentaire non pertinent : Bataille de Verdun');
    expect(issue.body).toContain('anonyme');
  });
});
