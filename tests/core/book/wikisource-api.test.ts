import { describe, expect, it, vi } from 'vitest';
import { createWikisourceApi, pickText } from '../../../src/core/book/wikisource-api';
import { normalizeTitle } from '../../../src/core/book/book-format';

describe('pickText', () => {
  const wanted = normalizeTitle('Les Misérables');
  it('retient la page principale au titre égal, jamais une sous-page', () => {
    expect(pickText(['Les Misérables (1908)/Tome 2', 'Les Misérables', 'Misérables'], wanted)).toBe('Les Misérables');
    expect(pickText(['Les Misérables (1908)/Tome 2'], wanted)).toBeNull();
  });
  it('exige l’auteur quand la page précise une parenthèse', () => {
    const titles = ['Le Dormeur du val (Cros)', 'Le Dormeur du val (Rimbaud)'];
    expect(pickText(titles, normalizeTitle('Le Dormeur du val'), 'Arthur Rimbaud')).toBe('Le Dormeur du val (Rimbaud)');
    expect(pickText(titles, normalizeTitle('Le Dormeur du val'))).toBeNull();
    expect(pickText(titles, normalizeTitle('Le Dormeur du val'), 'Victor Hugo')).toBeNull();
  });
  it('préfère la page sans parenthèse', () => {
    expect(pickText(['Spleen (Baudelaire)', 'Spleen'], normalizeTitle('Spleen'), 'Charles Baudelaire')).toBe('Spleen');
  });
});

describe('createWikisourceApi', () => {
  it('interroge fr.wikisource.org et rend le titre retenu', async () => {
    const fetchFn = vi.fn(async (_url: string) => Response.json({ query: { search: [{ title: 'Les Misérables (1908)/Tome 2' }, { title: 'Les Misérables' }] } }));
    expect(await createWikisourceApi({ fetch: fetchFn }).find('Les Misérables')).toBe('Les Misérables');
    const url = new URL(fetchFn.mock.calls[0]![0]);
    expect(url.origin).toBe('https://fr.wikisource.org');
    expect(url.searchParams.get('srsearch')).toBe('Les Misérables');
  });
  it('rend null sans appel pour un titre vide, et lève sur un format inattendu', async () => {
    const fetchFn = vi.fn();
    expect(await createWikisourceApi({ fetch: fetchFn }).find('  ')).toBeNull();
    expect(fetchFn).not.toHaveBeenCalled();
    await expect(createWikisourceApi({ fetch: async () => Response.json({ pas: 'ça' }) }).find('x')).rejects.toThrow();
  });
});
