// tests/content/documentary-service.test.ts
import { describe, expect, it, vi } from 'vitest';
import { createDocumentaryService, type DocumentaryServiceDeps } from '../../src/content/documentary-service';
import { createMemoryStore } from '../../src/core/cache/store';
import { createDocumentaryRepo } from '../../src/core/documentary/documentary-repo';
import type { DocCandidate } from '../../src/core/documentary/types';

const cand = (id: string, source: DocCandidate['source'] = 'youtube'): DocCandidate => ({ source, id, title: `Vidéo ${id}`, channel: 'C', durationSec: 3000, language: 'fr', description: '', url: `https://www.youtube.com/watch?v=${id}` });
const noCache = { getOrLoad: <T>(_key: string, loader: () => Promise<T>) => loader() };

function setup(overrides: Partial<DocumentaryServiceDeps> = {}, natures = ['Q178561']) {
  const kinds = { natures, occupations: [], genres: [] };
  const sent: unknown[] = [];
  const deps: DocumentaryServiceDeps = {
    collection: { list: async () => [{ slug: 'Bataille_de_Verdun', title: 'Bataille de Verdun' } as never] },
    kinds: { resolveMissing: async () => undefined, load: async () => ({ cards: { Bataille_de_Verdun: kinds }, labels: {} }) },
    subject: async () => ({ qid: 'Q2280', names: ['Bataille de Verdun'], birth: null, death: null, start: 1916, end: 1916 }),
    selection: { forQid: async () => [] },
    commons: { search: async () => [] },
    relay: { search: async () => ({ status: 'ok', candidates: [cand('REL')], possible: [] }), oembed: async () => ({ ok: true, title: 'Titre', channel: 'Chaîne' }) },
    repo: createDocumentaryRepo(createMemoryStore()),
    issues: { send: async (draft) => (sent.push(draft), { ok: true, number: 7, url: '' }) },
    cache: noCache,
    platform: () => 'extension du navigateur',
    profileName: () => null,
    ...overrides,
  };
  return { service: createDocumentaryService(deps), deps, sent };
}

describe('view', () => {
  it('rend les candidats du relais pour un événement historique', async () => {
    const { service } = setup();
    const view = await service.view('Bataille_de_Verdun', 'Bataille de Verdun');
    expect(view).toMatchObject({ status: 'detail', subject: { qid: 'Q2280', kind: 'event', startYear: 1916 } });
    expect(view.status === 'detail' && view.candidates.map((c) => c.id)).toEqual(['REL']);
  });

  it('ne dit rien d’une carte sans rapport, d’un film ou d’une carte hors collection', async () => {
    expect((await setup({}, ['Q4167410']).service.view('Bataille_de_Verdun', 'x')).status).toBe('none');
    expect((await setup({}, ['Q11424', 'Q178561']).service.view('Bataille_de_Verdun', 'x')).status).toBe('none');
    expect((await setup({ collection: { list: async () => [] } }).service.view('Bataille_de_Verdun', 'x')).status).toBe('none');
  });

  it('ne dit rien d’un humain vivant ou mort après 1950', async () => {
    const alive = setup({ subject: async () => ({ qid: 'Q1', names: ['Quelqu’un'], birth: 1970, death: null, start: null, end: null }) }, ['Q5']);
    expect((await alive.service.view('Bataille_de_Verdun', 'x')).status).toBe('none');
  });

  it('un humain mort avant 1950 a une période naissance–décès', async () => {
    const { service } = setup({ subject: async () => ({ qid: 'Q517', names: ['Napoléon Ier'], birth: 1769, death: 1821, start: null, end: null }) }, ['Q5']);
    const view = await service.view('Bataille_de_Verdun', 'Napoléon');
    expect(view).toMatchObject({ status: 'detail', subject: { kind: 'person', startYear: 1769, endYear: 1821 } });
  });

  it('les propositions de l’utilisateur et la sélection passent avant tout, et arrêtent la recherche', async () => {
    const relay = vi.fn(async () => ({ status: 'ok' as const, candidates: [cand('REL')], possible: [] }));
    const { service, deps } = setup({ selection: { forQid: async () => [cand('SEL', 'selection')] }, relay: { search: relay, oembed: async () => ({ ok: false, reason: 'busy' }) } });
    await deps.repo.addProposal('Bataille_de_Verdun', cand('MINE', 'proposal'));
    const view = await service.view('Bataille_de_Verdun', 'x');
    expect(view.status === 'detail' && view.candidates.map((c) => c.id)).toEqual(['MINE', 'SEL']);
    expect(relay).not.toHaveBeenCalled();
  });

  it('Commons passe avant le relais', async () => {
    const relay = vi.fn(async () => ({ status: 'ok' as const, candidates: [cand('REL')], possible: [] }));
    const { service } = setup({ commons: { search: async () => [cand('COM', 'commons')] }, relay: { search: relay, oembed: async () => ({ ok: false, reason: 'busy' }) } });
    const view = await service.view('Bataille_de_Verdun', 'x');
    expect(view.status === 'detail' && view.candidates.map((c) => c.id)).toEqual(['COM']);
    expect(relay).not.toHaveBeenCalled();
  });

  it('une panne de Commons n’empêche pas le relais', async () => {
    const { service } = setup({ commons: { search: async () => { throw new Error('HTTP 500'); } } });
    expect((await service.view('Bataille_de_Verdun', 'x')).status).toBe('detail');
  });

  it('retire les vidéos que l’utilisateur a jugées hors sujet', async () => {
    const { service, deps } = setup({ relay: { search: async () => ({ status: 'ok', candidates: [cand('REL'), cand('AUT')], possible: [] }), oembed: async () => ({ ok: false, reason: 'busy' }) } });
    await deps.repo.addFlag('Bataille_de_Verdun', 'REL');
    const view = await service.view('Bataille_de_Verdun', 'x');
    expect(view.status === 'detail' && view.candidates.map((c) => c.id)).toEqual(['AUT']);
  });

  it('rien de pertinent : fiche vide ; relais occupé : fiche vide « busy » ; panne : erreur', async () => {
    const none = setup({ relay: { search: async () => ({ status: 'ok', candidates: [], possible: [] }), oembed: async () => ({ ok: false, reason: 'busy' }) } });
    expect(await none.service.view('Bataille_de_Verdun', 'x')).toMatchObject({ status: 'empty', busy: false, possible: [] });
    const busy = setup({ relay: { search: async () => ({ status: 'busy' }), oembed: async () => ({ ok: false, reason: 'busy' }) } });
    expect(await busy.service.view('Bataille_de_Verdun', 'x')).toMatchObject({ status: 'empty', busy: true });
    const broken = setup({ subject: async () => { throw new Error('HTTP 429'); } });
    expect((await broken.service.view('Bataille_de_Verdun', 'x')).status).toBe('error');
  });
});

describe('propose', () => {
  const subject = { qid: 'Q2280', kind: 'event' as const, names: ['Bataille de Verdun'], startYear: 1916, endYear: 1916 };
  it('vérifie la vidéo, la garde pour l’utilisateur et crée l’issue', async () => {
    const { service, deps, sent } = setup();
    const result = await service.propose('Bataille_de_Verdun', subject, 'Bataille de Verdun', 'https://youtu.be/dQw4w9WgXcQ');
    expect(result).toEqual({ ok: true, sent: true });
    expect((await deps.repo.proposals('Bataille_de_Verdun'))[0]).toMatchObject({ source: 'proposal', id: 'dQw4w9WgXcQ', title: 'Titre', channel: 'Chaîne' });
    expect(sent).toHaveLength(1);
  });
  it('refuse un lien qui n’est pas YouTube et une vidéo non intégrable', async () => {
    const { service } = setup({ relay: { search: async () => ({ status: 'busy' }), oembed: async () => ({ ok: false, reason: 'not-embeddable' }) } });
    expect(await service.propose('Bataille_de_Verdun', subject, 'x', 'https://exemple.com')).toEqual({ ok: false, error: 'Ce lien n’est pas une vidéo YouTube.' });
    expect(await service.propose('Bataille_de_Verdun', subject, 'x', 'dQw4w9WgXcQ')).toEqual({ ok: false, error: 'Cette vidéo ne peut pas être intégrée ailleurs que sur YouTube.' });
  });
  it('garde la proposition même si l’envoi échoue ou n’est pas configuré', async () => {
    const failing = setup({ issues: { send: async () => ({ ok: false, error: 'GitHub a refusé' }) } });
    expect(await failing.service.propose('Bataille_de_Verdun', subject, 'x', 'dQw4w9WgXcQ')).toEqual({ ok: true, sent: false });
    const without = setup({ issues: null });
    expect(await without.service.propose('Bataille_de_Verdun', subject, 'x', 'dQw4w9WgXcQ')).toEqual({ ok: true, sent: false });
  });
});

describe('flag', () => {
  it('masque la vidéo chez l’utilisateur et crée l’issue', async () => {
    const { service, deps, sent } = setup();
    await service.flag('Bataille_de_Verdun', { qid: 'Q2280', kind: 'event', names: ['Bataille de Verdun'], startYear: 1916, endYear: 1916 }, 'Bataille de Verdun', cand('REL'));
    expect(await deps.repo.flagged('Bataille_de_Verdun')).toEqual(['REL']);
    expect(sent).toHaveLength(1);
  });
});

describe('view : périmètre large', () => {
  const subjectOf = (extra: Record<string, number | null> = {}) => ({ subject: async () => ({ qid: 'Q9', names: ['Un sujet'], birth: null, death: null, start: null, end: null, ...extra }) });
  it('une œuvre, un mausolée, un menhir (nature vide) ont leur section, datés ou non', async () => {
    expect((await setup(subjectOf({ start: 1377 }), ['Q18609875']).service.view('Bataille_de_Verdun', 'x')).status).toBe('detail');
    expect((await setup(subjectOf(), ['Q381885']).service.view('Bataille_de_Verdun', 'x')).status).toBe('detail');
    expect((await setup(subjectOf(), []).service.view('Bataille_de_Verdun', 'x')).status).toBe('detail');
  });
  it('un sujet récent ou un taxon sont aussi retenus (la notation juge les vidéos)', async () => {
    expect((await setup(subjectOf({ start: 1986 }), ['Q515']).service.view('Bataille_de_Verdun', 'x')).status).toBe('detail');
    expect((await setup(subjectOf(), ['Q16521']).service.view('Bataille_de_Verdun', 'x')).status).toBe('detail');
  });
  it('mais pas une page d’homonymie, ni une carte qui a sa propre fiche', async () => {
    expect((await setup(subjectOf(), ['Q4167410']).service.view('Bataille_de_Verdun', 'x')).status).toBe('none');
    expect((await setup(subjectOf(), ['Q8261']).service.view('Bataille_de_Verdun', 'x')).status).toBe('none');
  });
});

describe('view : vidéos possibles', () => {
  const withPossible = (candidates: DocCandidate[], possible: DocCandidate[]) => ({
    relay: { search: async () => ({ status: 'ok' as const, candidates, possible }), oembed: async () => ({ ok: false as const, reason: 'busy' as const }) },
  });
  it('rend les vidéos possibles à part des vidéos proposées', async () => {
    const { service } = setup(withPossible([cand('BON')], [cand('PEUT')]));
    expect(await service.view('Bataille_de_Verdun', 'x')).toMatchObject({ status: 'detail', candidates: [{ id: 'BON' }], possible: [{ id: 'PEUT' }] });
  });
  it('sans vidéo proposée mais avec des possibles : fiche vide, possibles gardées', async () => {
    const { service } = setup(withPossible([], [cand('PEUT')]));
    expect(await service.view('Bataille_de_Verdun', 'x')).toMatchObject({ status: 'empty', busy: false, possible: [{ id: 'PEUT' }] });
  });
  it('une vidéo possible signalée « pas pertinente » disparaît aussi', async () => {
    const { service, deps } = setup(withPossible([cand('BON')], [cand('PEUT')]));
    await deps.repo.addFlag('Bataille_de_Verdun', 'PEUT');
    const view = await service.view('Bataille_de_Verdun', 'x');
    expect(view.status === 'detail' && view.possible).toEqual([]);
  });
});
