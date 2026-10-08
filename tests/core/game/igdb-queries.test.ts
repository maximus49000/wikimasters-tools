import { describe, expect, it } from 'vitest';
import { detailQuery, searchQuery } from '../../../src/core/game/igdb-queries';

describe('requêtes IGDB', () => {
  it('construit la requête de détail par id et par slug', () => {
    expect(detailQuery({ id: 1000 })).toMatch(/^fields .+; where id = 1000; limit 1;$/);
    expect(detailQuery({ slug: 'super-metroid' })).toMatch(/where slug = "super-metroid"; limit 1;$/);
  });
  it('construit la recherche et neutralise guillemets, barres obliques inverses et points-virgules', () => {
    expect(searchQuery('Super "Metroid"; x\\y')).toMatch(/^search "Super  Metroid   x y"; fields .+; limit 10;$/);
  });
});
