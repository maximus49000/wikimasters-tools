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
    expect(collectionEndpoint(0, '', 'added')).toBe('/api/my-collection?sort=added&page=0&stats=0');
  });
});

describe('parseCollectionPage', () => {
  it("lit titre, slug et rareté de chaque carte, sans rien garder du joueur", () => {
    const page = parseCollectionPage(fixture, ENDPOINT);
    expect(page.entries).toBe(3);
    expect(page.skipped).toBe(0);
    const obtained = fixture.collection.map((entry) => Date.parse(entry.obtained_at));
    expect(page.cards).toEqual([
      { slug: 'Ted_Lasso', title: 'Ted Lasso', copies: 1, rarity: 'L', extract: 'série télévisée américaine', tags: [], starred: false, obtainedAt: obtained[0] },
      { slug: "Tenture_de_l'Apocalypse", title: "Tenture de l'Apocalypse", copies: 1, rarity: 'UR', tags: [], starred: false, obtainedAt: obtained[1] },
      { slug: 'Paul_de_Grèce_(1967)', title: 'Paul de Grèce (1967)', copies: 1, rarity: 'SR', extract: 'financier', tags: [], starred: false, obtainedAt: obtained[2] },
    ]);
  });

  it("garde l'adresse de l'image quand la carte en a une, et l'omet sinon", () => {
    const entry = fixture.collection[0]!;
    const withImage = { ...entry, card: { ...entry.card, image_url: 'https://exemple.test/a.jpg' } };
    const page = parseCollectionPage({ collection: [withImage, fixture.collection[1]] }, ENDPOINT);
    expect(page.cards[0]?.imageUrl).toBe('https://exemple.test/a.jpg');
    expect(page.cards[1]).not.toHaveProperty('imageUrl');
  });

  it("garde attaque et défense, et préfère l'extrait à la catégorie", () => {
    const entry = fixture.collection[0]!;
    const card = { ...entry.card, atk: 9751, def: 7972, extract: 'Un extrait.' };
    const page = parseCollectionPage({ collection: [{ ...entry, card }] }, ENDPOINT);
    expect(page.cards[0]).toMatchObject({ attack: 9751, defense: 7972, extract: 'Un extrait.' });
  });

  it('dédoublonne une carte présente en normal et en shiny, mais compte les deux entrées', () => {
    const entry = fixture.collection[0]!;
    const page = parseCollectionPage({ collection: [entry, { ...entry, id: 'shiny', is_shiny: true }] }, ENDPOINT);
    expect(page.entries).toBe(2);
    expect(page.cards).toHaveLength(1);
  });

  it("lit la date d'obtention de chaque entrée, et l'omet quand elle manque ou est illisible", () => {
    const entry = fixture.collection[0]!;
    const page = parseCollectionPage(
      {
        collection: [
          { ...entry, obtained_at: '2026-09-30T11:45:58.754742+00:00' },
          { ...entry, obtained_at: 'pas une date' },
          { ...entry, obtained_at: undefined },
        ],
      },
      ENDPOINT,
    );
    expect(page.obtained).toEqual([
      { slug: 'Ted_Lasso', at: Date.parse('2026-09-30T11:45:58.754742+00:00') },
      { slug: 'Ted_Lasso' },
      { slug: 'Ted_Lasso' },
    ]);
  });

  it("compte les exemplaires d'une même carte sur la page", () => {
    const entry = fixture.collection[0]!;
    const page = parseCollectionPage({ collection: [entry, entry, fixture.collection[1]] }, ENDPOINT);
    expect(page.cards.map((c) => c.copies)).toEqual([2, 1]);
  });

  it('écarte une entrée invalide sans faire échouer les autres', () => {
    const page = parseCollectionPage({ collection: [fixture.collection[0], { id: 'x' }] }, ENDPOINT);
    expect(page.entries).toBe(2);
    expect(page.skipped).toBe(1);
    expect(page.cards).toHaveLength(1);
  });

  it('renvoie une page vide pour une collection vide (fin du parcours)', () => {
    expect(parseCollectionPage({ collection: [] }, ENDPOINT)).toEqual({ cards: [], obtained: [], entries: 0, skipped: 0 });
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

describe('étiquettes', () => {
  it("garde identifiant, nom et couleur des étiquettes, sans l'identifiant du joueur", () => {
    const entry = { ...fixture.collection[0]!, tags: [{ id: 't1', name: '#CVIDEUH', color: '#818cf8', user_id: 'u' }, { id: 't2', name: '#SANS' }] };
    const page = parseCollectionPage({ collection: [entry] }, ENDPOINT);
    expect(page.cards[0]?.tags).toEqual([{ id: 't1', name: '#CVIDEUH', color: '#818cf8' }, { id: 't2', name: '#SANS' }]);
  });
});
