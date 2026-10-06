import { describe, expect, it, vi } from 'vitest';
import { createGameService } from '../../src/content/game-service';
import { createMemoryStore } from '../../src/core/cache/store';
import { createGameChoiceRepo } from '../../src/core/game/game-repo';
import type { GameCandidate, GameDetail } from '../../src/core/game/game-detail';
import { GameError } from '../../src/core/game/errors';

const steamDetail: GameDetail = { source: 'steam', id: 1245620, title: 'ELDEN RING', genres: [], platforms: [], developers: [], pageUrl: 'https://store.steampowered.com/app/1245620' };
const igdbDetail: GameDetail = { source: 'igdb', id: 1000, title: 'Super Metroid', genres: [], platforms: [], developers: [], pageUrl: 'https://www.igdb.com/games/super-metroid' };
const cand = (source: 'steam' | 'igdb', id: number, title: string, popularity = 0): GameCandidate => ({ source, id, title, platforms: [], popularity });

type Setup = { natures?: string[]; ids?: object; collection?: string[]; steamSearch?: GameCandidate[]; igdbSearch?: GameCandidate[]; igdb?: boolean; steamDetail?: GameDetail | null };

function setup(over: Setup = {}) {
  const steam = {
    detail: vi.fn(async (id: number) => (over.steamDetail === undefined ? { ...steamDetail, id } : over.steamDetail)),
    search: vi.fn(async () => over.steamSearch ?? []),
  };
  const igdb = {
    detail: vi.fn(async (by: { id: number } | { slug: string }) => ({ ...igdbDetail, id: 'id' in by ? by.id : igdbDetail.id })),
    search: vi.fn(async () => over.igdbSearch ?? []),
  };
  const choices = createGameChoiceRepo(createMemoryStore());
  const service = createGameService({
    collection: { list: async () => (over.collection ?? ['Jeu']).map((slug) => ({ slug, title: slug })) },
    kinds: { resolveMissing: vi.fn(async () => undefined), load: async () => ({ cards: { Jeu: { natures: over.natures ?? ['Q7889'], occupations: [], genres: [] } }, labels: {} }) },
    games: { resolve: async () => ({ Jeu: over.ids ?? {} }) },
    choices,
    steam,
    igdb: over.igdb === false ? null : igdb,
    steamCache: { getOrLoad: (_key, loader) => loader() },
    igdbCache: { getOrLoad: (_key, loader) => loader() },
  });
  return { service, steam, igdb, choices };
}

describe('createGameService.view', () => {
  it("rien quand la carte n'est pas dans la collection ou n'est pas un jeu", async () => {
    expect(await setup({ collection: [] }).service.view('Jeu', 'Jeu')).toEqual({ status: 'none' });
    expect(await setup({ natures: ['Q11424'] }).service.view('Jeu', 'Jeu')).toEqual({ status: 'none' });
  });

  it("une carte qui a un identifiant Steam est un jeu même sans la nature Q7889", async () => {
    const { service } = setup({ natures: ['Q123'], ids: { steamId: 5 } });
    expect(await service.view('Jeu', 'Jeu')).toMatchObject({ status: 'detail', detail: { source: 'steam', id: 5 } });
  });

  it("Steam d'abord : l'identifiant Wikidata prime sur IGDB", async () => {
    const { service, steam, igdb } = setup({ ids: { steamId: 1245620, igdbSlug: 'elden-ring' } });
    expect(await service.view('Jeu', 'Elden Ring')).toEqual({ status: 'detail', detail: { ...steamDetail } });
    expect(steam.detail).toHaveBeenCalledWith(1245620);
    expect(igdb.detail).not.toHaveBeenCalled();
  });

  it("repli IGDB par slug quand Steam n'a rien (ou ne connaît pas le jeu)", async () => {
    const { service, igdb } = setup({ ids: { steamId: 7, igdbSlug: 'super-metroid' }, steamDetail: null });
    expect(await service.view('Jeu', 'Super Metroid')).toMatchObject({ status: 'detail', detail: { source: 'igdb' } });
    expect(igdb.detail).toHaveBeenCalledWith({ slug: 'super-metroid' });
  });

  it('sans identifiant : recherche par titre nettoyé, titre égal exigé, Steam puis IGDB', async () => {
    const steamHit = setup({ steamSearch: [cand('steam', 2, 'Autre jeu'), cand('steam', 3, 'Elden Ring')] });
    expect(await steamHit.service.view('Jeu', 'Elden_Ring_(jeu_vidéo)')).toMatchObject({ detail: { source: 'steam', id: 3 } });
    expect(steamHit.steam.search).toHaveBeenCalledWith('Elden Ring');

    const igdbHit = setup({ steamSearch: [cand('steam', 2, 'Autre jeu')], igdbSearch: [cand('igdb', 8, 'Super Metroid Arcade', 9), cand('igdb', 9, 'Super Metroid', 5), cand('igdb', 10, 'Super Metroid', 50)] });
    expect(await igdbHit.service.view('Jeu', 'Super Metroid')).toMatchObject({ detail: { source: 'igdb', id: 10 } });
  });

  it('rien de sûr → section vide ; sans identifiants IGDB, Steam seul', async () => {
    expect(await setup({ igdbSearch: [cand('igdb', 8, 'Autre')] }).service.view('Jeu', 'Super Metroid')).toEqual({ status: 'empty' });
    const noIgdb = setup({ igdb: false, ids: { igdbSlug: 'super-metroid' } });
    expect(await noIgdb.service.view('Jeu', 'Super Metroid')).toEqual({ status: 'empty' });
    expect(noIgdb.service.igdbEnabled).toBe(false);
  });

  it('le choix mémorisé prime sur Wikidata ; « aucun jeu » vide la section ; reset revient à l’automatique', async () => {
    const { service, steam, igdb, choices } = setup({ ids: { steamId: 1245620 } });
    await service.choose('Jeu', { source: 'igdb', id: 42 });
    expect(await service.view('Jeu', 'Jeu')).toMatchObject({ detail: { source: 'igdb', id: 42 } });
    expect(igdb.detail).toHaveBeenCalledWith({ id: 42 });
    expect(steam.detail).not.toHaveBeenCalled();

    await service.chooseNone('Jeu');
    expect(await service.view('Jeu', 'Jeu')).toEqual({ status: 'empty' });
    expect(await choices.load()).toEqual({ Jeu: { none: true } });

    await service.reset('Jeu');
    expect(await service.view('Jeu', 'Jeu')).toMatchObject({ detail: { source: 'steam' } });
  });

  it('une erreur réseau devient un message', async () => {
    const { service, steam } = setup({ ids: { steamId: 1 } });
    steam.detail.mockRejectedValueOnce(new GameError('steam', 'rate-limited', 'x'));
    expect(await service.view('Jeu', 'Jeu')).toEqual({ status: 'error', message: 'Steam demande de patienter un instant. Réessaie dans quelques secondes.' });
  });
});

describe('createGameService : fenêtre « Changer de jeu »', () => {
  it('candidates : Steam et IGDB côte à côte, un message quand une source échoue', async () => {
    const { service, steam } = setup({ steamSearch: [cand('steam', 1, 'A')], igdbSearch: [cand('igdb', 2, 'B', 3)] });
    expect(await service.candidates('a')).toEqual({ steam: [cand('steam', 1, 'A')], igdb: [cand('igdb', 2, 'B', 3)] });
    steam.search.mockRejectedValueOnce(new GameError('steam', 'http', 'x'));
    expect(await service.candidates('a')).toMatchObject({ steam: [], message: 'Steam est indisponible pour le moment.' });
  });

  it('preview et fromLink : aperçu d’un jeu, message sinon', async () => {
    const { service } = setup();
    expect((await service.preview({ source: 'steam', id: 9 })).detail?.id).toBe(9);
    expect((await service.fromLink('https://store.steampowered.com/app/77/x')).detail?.id).toBe(77);
    expect((await service.fromLink('https://www.igdb.com/games/super-metroid')).detail?.source).toBe('igdb');
    expect(await service.fromLink('pas un lien')).toEqual({ message: 'Adresse non reconnue.' });
    expect(await setup({ steamDetail: null }).service.preview({ source: 'steam', id: 1 })).toEqual({ message: 'Ce jeu est introuvable.' });
  });
});
