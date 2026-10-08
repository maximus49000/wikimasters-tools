import { describe, expect, it } from 'vitest';
import { isAllowedQuery } from '../../../relay/src/igdb';
import { detailQuery, searchQuery } from '../../../src/core/game/igdb-queries';

describe('requêtes IGDB', () => {
  it('construit la requête de détail par id et par slug', () => {
    expect(detailQuery({ id: 1000 })).toMatch(/^fields .+; where id = 1000; limit 1;$/);
    expect(detailQuery({ slug: 'super-metroid' })).toMatch(/where slug = "super-metroid"; limit 1;$/);
  });
  it('construit la recherche et neutralise guillemets, barres obliques inverses et points-virgules', () => {
    expect(searchQuery('Super "Metroid"; x\\y')).toMatch(/^search "Super  Metroid   x y"; fields .+; limit 10;$/);
  });
  it('tronque le titre à 100 caractères : le relais accepte la requête, guillemets et points-virgules compris', () => {
    const long = searchQuery('a'.repeat(150));
    expect(long).toContain(`search "${'a'.repeat(100)}";`);
    expect(isAllowedQuery(long)).toBe(true);
    expect(isAllowedQuery(searchQuery(`${'a'.repeat(99)} ${'b'.repeat(50)}`))).toBe(true);
    const withBackslash = searchQuery('Super "Metroid"; x\\y');
    expect(withBackslash).not.toContain('\\');
    expect(withBackslash).toContain('search "Super  Metroid   x y";');
    expect(isAllowedQuery(withBackslash)).toBe(true);
  });
});
