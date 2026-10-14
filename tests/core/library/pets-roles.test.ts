import { describe, expect, it } from 'vitest';
import { hasRole } from '../../../src/core/library/pets/roles';

describe('rôles des meubles pour les animaux', () => {
  it('le chien monte sur les canapés et les poufs, pas sur les fauteuils', () => {
    for (const k of ['sofa', 'club-chair', 'loveseat', 'daybed', 'pouf', 'beanbag'] as const) expect(hasRole(k, 'dogCouch'), k).toBe(true);
    for (const k of ['armchair', 'chair', 'rocking-chair', 'egg-chair', 'peacock-chair', 'bench'] as const) expect(hasRole(k, 'dogCouch'), k).toBe(false);
  });
  it('le chat a ses assises, ses dessus, ses cachettes et son griffoir', () => {
    for (const k of ['chair', 'armchair', 'sofa', 'rocking-chair', 'club-chair', 'loveseat', 'daybed', 'egg-chair', 'peacock-chair', 'pouf', 'beanbag', 'bench'] as const) expect(hasRole(k, 'catSeat'), k).toBe(true);
    for (const k of ['shelf', 'desk', 'dresser', 'side-table', 'cat-tree'] as const) expect(hasRole(k, 'catTop'), k).toBe(true);
    expect((['sofa', 'loveseat'] as const).every((k) => hasRole(k, 'catHide'))).toBe(true);
    expect(hasRole('armchair', 'catScratch')).toBe(true);
    expect(hasRole('monstera', 'catSeat') || hasRole('monstera', 'catTop')).toBe(false);
  });
});
