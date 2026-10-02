import { describe, expect, it, vi } from 'vitest';
import { MAX_LEVELS, PER_ARTICLE, findPath, type PathSource } from '../../../src/core/links/web-path';

// Un petit monde : article → ce qu'il cite.
const world = (links: Record<string, string[]>): PathSource & { forward: ReturnType<typeof vi.fn>; backward: ReturnType<typeof vi.fn> } => {
  const forward = vi.fn(async (slugs: string[]) => Object.fromEntries(slugs.map((slug) => [slug, links[slug] ?? []])));
  const backward = vi.fn(async (slugs: string[]) =>
    Object.fromEntries(slugs.map((slug) => [slug, Object.keys(links).filter((from) => links[from]?.includes(slug))])),
  );
  return { forward, backward };
};

describe('findPath', () => {
  it('trouve le plus court chemin, en partant des deux côtés', async () => {
    const source = world({ A: ['X', 'Y'], X: ['Z'], Y: ['W'], Z: ['B'], W: ['V'], V: ['U'], U: ['B'] });
    const result = await findPath('A', 'B', source);
    expect(result).toMatchObject({ status: 'found', path: ['A', 'X', 'Z', 'B'] });
  });

  it('une carte reliée directement à l’autre', async () => {
    const result = await findPath('A', 'B', world({ A: ['B'] }));
    expect(result).toMatchObject({ status: 'found', path: ['A', 'B'] });
  });

  it('refuse de passer par un article générique', async () => {
    const result = await findPath('A', 'B', world({ A: ['International_Standard_Book_Number'], International_Standard_Book_Number: ['B'] }));
    expect(result).toMatchObject({ status: 'none', reason: 'exhausted' });
  });

  it('ne garde que les 100 premiers liens de chaque article', async () => {
    const many = Array.from({ length: PER_ARTICLE + 1 }, (_, i) => `L${i}`);
    const source = world({ A: many, [`L${PER_ARTICLE}`]: ['B'] });
    // B n’a aucun citeur connu : seule la lecture depuis A compte.
    source.backward.mockImplementation(async (slugs: string[]) => Object.fromEntries(slugs.map((slug) => [slug, []])));
    const result = await findPath('A', 'B', source);
    expect(result).toMatchObject({ status: 'none' });
  });

  it('s’arrête quand plus rien n’est à explorer', async () => {
    expect(await findPath('A', 'B', world({ A: ['X'] }))).toMatchObject({ status: 'none', reason: 'exhausted' });
  });

  it('s’arrête après dix niveaux', async () => {
    // Une chaîne infinie sans B.
    const forward = vi.fn(async (slugs: string[]) => Object.fromEntries(slugs.map((slug) => [slug, [`${slug}x`]])));
    const backward = vi.fn(async (slugs: string[]) => Object.fromEntries(slugs.map((slug) => [slug, [`${slug}y`]])));
    const result = await findPath('A', 'B', { forward, backward });
    expect(result).toMatchObject({ status: 'none', reason: 'levels', level: MAX_LEVELS });
  });

  it('s’arrête quand on l’annule', async () => {
    let stop = false;
    const source = world({ A: ['X'], X: ['B'] });
    source.forward.mockImplementation(async () => {
      stop = true;
      return {};
    });
    expect(await findPath('A', 'B', source, undefined, () => stop)).toMatchObject({ status: 'cancelled' });
  });

  it('rend A quand A et B sont la même carte', async () => {
    expect(await findPath('A', 'A', world({}))).toMatchObject({ status: 'found', path: ['A'] });
  });
});
