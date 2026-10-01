import { describe, expect, it, vi } from 'vitest';
import { parseCommonsImages, parsePageImage, parseSearchedPageImage, searchCardImages } from '../../../src/core/images/card-image-search';

const pageJson = (source?: string) => ({ query: { pages: [source ? { thumbnail: { source } } : {}] } });
const commonsJson = (pages: unknown[]) => ({ query: { pages } });
const file = (index: number, mime: string, thumburl = `https://upload.wikimedia.org/${index}.jpg`) => ({ index, imageinfo: [{ thumburl, mime }] });

const respond = (page: unknown, commons: unknown) =>
  vi.fn(async (url: string) => ({ ok: true, status: 200, json: async () => (url.includes('commons.wikimedia.org') ? commons : page) }) as Response);

describe('parsePageImage', () => {
  it('lit la miniature de l’article, ou null sans image', () => {
    expect(parsePageImage(pageJson('https://x/a.jpg'))).toBe('https://x/a.jpg');
    expect(parsePageImage(pageJson())).toBeNull();
  });
  it('lève sur un format inattendu', () => {
    expect(() => parsePageImage({ oops: true })).toThrow();
  });
});

describe('parseSearchedPageImage', () => {
  const found = { query: { pages: [{ title: 'Anne-Marie de Frise-Orientale', index: 2, thumbnail: { source: 'https://x/voisin.jpg' } }, { title: 'Marie de Frise orientale', index: 1, thumbnail: { source: 'https://x/ok.jpg' } }] } };
  it('retient l’article au titre identique à la casse près, pas un article voisin', () => {
    expect(parseSearchedPageImage(found, 'Marie de Frise Orientale')).toBe('https://x/ok.jpg');
    expect(parseSearchedPageImage(found, 'Marie')).toBeNull();
  });
});

describe('parseCommonsImages', () => {
  it('garde les photos dans l’ordre de pertinence et écarte SVG et PDF', () => {
    const urls = parseCommonsImages(commonsJson([file(2, 'image/png'), file(1, 'image/jpeg'), file(3, 'image/svg+xml'), file(4, 'application/pdf')]));
    expect(urls).toEqual(['https://upload.wikimedia.org/1.jpg', 'https://upload.wikimedia.org/2.jpg']);
  });
  it('renvoie une liste vide quand la recherche ne donne rien', () => {
    expect(parseCommonsImages({})).toEqual([]);
  });
});

describe('searchCardImages', () => {
  it('retrouve l’article quand le titre du jeu n’a pas la même casse que Wikipédia', async () => {
    const fetchFn = vi.fn(async (url: string) => {
      const body = url.includes('commons') ? commonsJson([]) : url.includes('generator=search') ? { query: { pages: [{ title: 'Marie de Frise orientale', thumbnail: { source: 'https://x/ok.jpg' } }] } } : { query: { pages: [{ title: 'Marie de Frise Orientale', missing: true }] } };
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    expect(await searchCardImages(fetchFn, 'Marie de Frise Orientale')).toEqual(['https://x/ok.jpg']);
  });
  it('met l’image de l’article en premier, puis Commons sans doublon', async () => {
    const fetchFn = respond(pageJson('https://upload.wikimedia.org/1.jpg'), commonsJson([file(1, 'image/jpeg'), file(2, 'image/jpeg')]));
    expect(await searchCardImages(fetchFn, 'Marie de Frise orientale')).toEqual(['https://upload.wikimedia.org/1.jpg', 'https://upload.wikimedia.org/2.jpg']);
  });
  it('se rabat sur Commons quand l’article n’a pas d’image', async () => {
    const fetchFn = respond(pageJson(), commonsJson([file(1, 'image/jpeg')]));
    expect(await searchCardImages(fetchFn, 'X')).toEqual(['https://upload.wikimedia.org/1.jpg']);
  });
  it('ne redemande pas l’article pour une nouvelle recherche (skip) et décale Commons', async () => {
    const fetchFn = respond(pageJson('https://x/a.jpg'), commonsJson([file(1, 'image/jpeg')]));
    await searchCardImages(fetchFn, 'X', 3);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(String(fetchFn.mock.calls[0]?.[0])).toContain('gsroffset=3');
  });
  it('lève sur une erreur HTTP : ce n’est pas « aucune image »', async () => {
    const fetchFn = vi.fn(async () => ({ ok: false, status: 429 }) as Response);
    await expect(searchCardImages(fetchFn, 'X')).rejects.toThrow('429');
  });
});
