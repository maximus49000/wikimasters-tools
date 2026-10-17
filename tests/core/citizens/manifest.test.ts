import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ManifestSchema } from '../../../src/core/citizens/manifest';

const brut: unknown = JSON.parse(readFileSync('relay/public/persos/manifest.json', 'utf8'));

describe('manifeste des modèles allégés', () => {
  const manifeste = ManifestSchema.parse(brut);

  it('décrit les 6 bases', () => {
    expect(Object.keys(manifeste.bases).sort()).toEqual(
      ['enfant', 'femme-frele', 'homme-fort', 'homme-maigre', 'mamie', 'papy'],
    );
  });

  it('donne la taille en mètres de chaque base', () => {
    const metres = Object.fromEntries(Object.entries(manifeste.bases).map(([nom, b]) => [nom, b.metres]));
    expect(metres).toEqual({
      'homme-fort': 1.7, 'homme-maigre': 1.82, 'femme-frele': 1.62, papy: 1.66, mamie: 1.54, enfant: 1.25,
    });
  });

  it('marque l\'enfant et les personnes âgées', () => {
    expect(manifeste.bases.enfant.child).toBe(true);
    expect(manifeste.bases.papy.aged && manifeste.bases.mamie.aged).toBe(true);
    expect(manifeste.bases['homme-fort'].aged).toBeUndefined();
  });

  it('référence un GLB et un PNG par base', () => {
    for (const [nom, b] of Object.entries(manifeste.bases)) {
      expect(b.glb).toBe(`${nom}.glb`);
      expect(b.png).toBe(`${nom}.png`);
    }
  });
});
