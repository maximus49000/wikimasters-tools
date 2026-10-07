// tests/core/book/google-books-api.test.ts
import { describe, expect, it, vi } from 'vitest';
import { createGoogleBooksApi } from '../../../src/core/book/google-books-api';

const sale = (saleability: string, amount?: number, over: Record<string, unknown> = {}) => ({
  saleability,
  isEbook: amount !== undefined,
  ...(amount !== undefined ? { listPrice: { amount, currencyCode: 'EUR' }, retailPrice: { amount, currencyCode: 'EUR' }, buyLink: `https://play.google.com/store/books/details?id=${amount}` } : {}),
  ...over,
});
const volume = (title: string, authors: string[], saleInfo: unknown) => ({ volumeInfo: { title, authors }, saleInfo });

// Forme réelle de la réponse pour « Les misérables Victor Hugo » (extrait).
const MISERABLES = {
  items: [
    volume('Les misérables', ['Victor Hugo'], sale('FOR_SALE', 4.99)),
    volume('Les misérables', ['Victor Hugo'], sale('FOR_SALE', 2.99)),
    volume('Les Misérables de Victor Hugo (Texte abrégé)', ['Victor Hugo', 'Camille Page'], sale('FOR_SALE', 3.99)),
    volume('Les Miserables', ['Victor Hugo'], sale('NOT_FOR_SALE')),
    volume('Les misérables', ['Autre Auteur'], sale('FOR_SALE', 1.99)),
  ],
};

const json = (body: unknown, status = 200) => vi.fn(async (_url: string) => new Response(JSON.stringify(body), { status }));
const api = (fetchFn: ReturnType<typeof json>) => createGoogleBooksApi({ fetch: fetchFn, key: 'CLE-TEST' });

describe('createGoogleBooksApi', () => {
  it('retient, parmi les ebooks en vente au titre égal et de l’auteur, le moins cher, avec son lien d’achat', async () => {
    const fetchFn = json(MISERABLES);
    expect(await api(fetchFn).findEbook({ title: 'Les Misérables', author: 'Victor Hugo' })).toEqual({ amount: 2.99, url: 'https://play.google.com/store/books/details?id=2.99' });
  });

  it('cherche en simple « titre auteur », pour la France, avec la clé', async () => {
    const fetchFn = json(MISERABLES);
    await api(fetchFn).findEbook({ title: 'Les Misérables', author: 'Victor Hugo' });
    const url = new URL(fetchFn.mock.calls[0]![0]);
    expect(url.origin + url.pathname).toBe('https://www.googleapis.com/books/v1/volumes');
    expect(url.searchParams.get('q')).toBe('Les Misérables Victor Hugo');
    expect(url.searchParams.get('country')).toBe('FR');
    expect(url.searchParams.get('key')).toBe('CLE-TEST');
    expect(url.searchParams.get('q')).not.toContain('intitle');
  });

  it('sans auteur connu, ne filtre que sur le titre', async () => {
    expect((await api(json(MISERABLES)).findEbook({ title: 'Les misérables' }))?.amount).toBe(1.99);
  });

  it('ne lance aucune requête pour un titre sans caractère exploitable', async () => {
    const fetchFn = json(MISERABLES);
    expect(await api(fetchFn).findEbook({ title: '???' })).toBeNull();
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('rend null sans résultat, sans ebook en vente, ou pour un prix hors euros ou sans lien https', async () => {
    expect(await api(json({})).findEbook({ title: 'Inconnu' })).toBeNull();
    expect(await api(json({ items: [volume('Inconnu', [], sale('NOT_FOR_SALE'))] })).findEbook({ title: 'Inconnu' })).toBeNull();
    const dollars = volume('Inconnu', [], { saleability: 'FOR_SALE', isEbook: true, retailPrice: { amount: 5, currencyCode: 'USD' }, buyLink: 'https://x.test/a' });
    const http = volume('Inconnu', [], { saleability: 'FOR_SALE', isEbook: true, retailPrice: { amount: 5, currencyCode: 'EUR' }, buyLink: 'http://x.test/a' });
    expect(await api(json({ items: [dollars, http] })).findEbook({ title: 'Inconnu' })).toBeNull();
  });

  it('lève une BookError sur une réponse en erreur (503 de Google) ou au format inattendu', async () => {
    await expect(api(json({}, 503)).findEbook({ title: 'X' })).rejects.toMatchObject({ name: 'BookError', code: 'http' });
    await expect(api(json({}, 429)).findEbook({ title: 'X' })).rejects.toMatchObject({ code: 'rate-limited' });
    await expect(api(json({ items: 'pas une liste' })).findEbook({ title: 'X' })).rejects.toMatchObject({ code: 'http' });
  });
});
