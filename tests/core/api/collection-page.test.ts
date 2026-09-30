import { describe, expect, it } from 'vitest';
import fixture from '../../fixtures/collection-response.json';
import { collectionEndpoint, parseCollectionPage } from '../../../src/core/api/collection-schemas';
import { ApiFormatError } from '../../../src/core/api/errors';
import { createGameApi, type FetchLike } from '../../../src/core/api/game-api';

const ENDPOINT = '/api/my-collection?sort=rarity&page=0&stats=0';

describe('collectionEndpoint', () => {
  it("construit l'adresse paginée (page 0-indexée, tri obligatoire)", () => {
    expect(collectionEndpoint(0)).toBe(ENDPOINT);
    expect(collectionEndpoint(12)).toBe('/api/my-collection?sort=rarity&page=12&stats=0');
  });
});

describe('parseCollectionPage', () => {
  it("lit titre, slug et rareté de chaque carte, sans rien garder du joueur", () => {
    const page = parseCollectionPage(fixture, ENDPOINT);
    expect(page.entries).toBe(3);
    expect(page.skipped).toBe(0);
    expect(page.cards).toEqual([
      { slug: 'Ted_Lasso', title: 'Ted Lasso', rarity: 'L' },
      { slug: "Tenture_de_l'Apocalypse", title: "Tenture de l'Apocalypse", rarity: 'UR' },
      { slug: 'Paul_de_Grèce_(1967)', title: 'Paul de Grèce (1967)', rarity: 'SR' },
    ]);
  });

  it("garde l'adresse de l'image quand la carte en a une, et l'omet sinon", () => {
    const entry = fixture.collection[0]!;
    const withImage = { ...entry, card: { ...entry.card, image_url: 'https://exemple.test/a.jpg' } };
    const page = parseCollectionPage({ collection: [withImage, fixture.collection[1]] }, ENDPOINT);
    expect(page.cards[0]?.imageUrl).toBe('https://exemple.test/a.jpg');
    expect(page.cards[1]).not.toHaveProperty('imageUrl');
  });

  it('dédoublonne une carte présente en normal et en shiny, mais compte les deux entrées', () => {
    const entry = fixture.collection[0]!;
    const page = parseCollectionPage({ collection: [entry, { ...entry, id: 'shiny', is_shiny: true }] }, ENDPOINT);
    expect(page.entries).toBe(2);
    expect(page.cards).toHaveLength(1);
  });

  it('écarte une entrée invalide sans faire échouer les autres', () => {
    const page = parseCollectionPage({ collection: [fixture.collection[0], { id: 'x' }] }, ENDPOINT);
    expect(page.entries).toBe(2);
    expect(page.skipped).toBe(1);
    expect(page.cards).toHaveLength(1);
  });

  it('renvoie une page vide pour une collection vide (fin du parcours)', () => {
    expect(parseCollectionPage({ collection: [] }, ENDPOINT)).toEqual({ cards: [], entries: 0, skipped: 0 });
  });

  it('lève si « collection » est absente : ce n\'est pas une page vide', () => {
    expect(() => parseCollectionPage({ error: 'x' }, ENDPOINT)).toThrow(ApiFormatError);
    expect(() => parseCollectionPage(null, ENDPOINT)).toThrow(ApiFormatError);
  });
});

describe('createGameApi.getCollectionPage', () => {
  it("appelle l'endpoint de la page demandée et renvoie les cartes", async () => {
    const calls: string[] = [];
    const fetch: FetchLike = async (input) => {
      calls.push(input);
      return new Response(JSON.stringify(fixture), { status: 200 });
    };
    const api = createGameApi({ fetch, sleep: async () => undefined, now: () => 0, minIntervalMs: 0 });

    const page = await api.getCollectionPage(2);

    expect(calls).toEqual(['/api/my-collection?sort=rarity&page=2&stats=0']);
    expect(page.cards).toHaveLength(3);
  });
});
