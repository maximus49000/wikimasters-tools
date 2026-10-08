// tests/core/documentary/documentary-repo.test.ts
import { describe, expect, it } from 'vitest';
import { createMemoryStore } from '../../../src/core/cache/store';
import { createDocumentaryRepo } from '../../../src/core/documentary/documentary-repo';

const proposal = { source: 'proposal' as const, id: 'AAA', title: 'T', channel: 'C', durationSec: null, language: null, description: '', url: 'https://www.youtube.com/watch?v=AAA' };

describe('createDocumentaryRepo', () => {
  it('mémorise les propositions de l’utilisateur sans doublon', async () => {
    const repo = createDocumentaryRepo(createMemoryStore());
    expect(await repo.proposals('Verdun')).toEqual([]);
    await repo.addProposal('Verdun', proposal);
    await repo.addProposal('Verdun', proposal);
    expect(await repo.proposals('Verdun')).toEqual([proposal]);
    expect(await repo.proposals('Autre')).toEqual([]);
  });
  it('mémorise les vidéos signalées « pas pertinent », par carte', async () => {
    const repo = createDocumentaryRepo(createMemoryStore());
    await repo.addFlag('Verdun', 'AAA');
    await repo.addFlag('Verdun', 'AAA');
    await repo.addFlag('Verdun', 'BBB');
    expect(await repo.flagged('Verdun')).toEqual(['AAA', 'BBB']);
    expect(await repo.flagged('Autre')).toEqual([]);
  });
});

describe('choix de la vidéo d’une carte', () => {
  it('mémorise la vidéo choisie pour une carte, la remplace et l’oublie', async () => {
    const repo = createDocumentaryRepo(createMemoryStore());
    expect(await repo.choice('Goya')).toBeNull();
    await repo.setChoice('Goya', proposal);
    expect(await repo.choice('Goya')).toEqual(proposal);
    expect(await repo.choice('Autre')).toBeNull();
    await repo.setChoice('Goya', { ...proposal, id: 'BBB', title: 'Autre vidéo' });
    expect((await repo.choice('Goya'))?.id).toBe('BBB');
    await repo.clearChoice('Goya');
    expect(await repo.choice('Goya')).toBeNull();
  });
  it('oublier le choix d’une carte garde ceux des autres', async () => {
    const repo = createDocumentaryRepo(createMemoryStore());
    await repo.setChoice('Goya', proposal);
    await repo.setChoice('Dali', { ...proposal, id: 'CCC' });
    await repo.clearChoice('Goya');
    expect((await repo.choice('Dali'))?.id).toBe('CCC');
  });
});
