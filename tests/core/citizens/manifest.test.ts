import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ManifestSchema } from '../../../src/core/citizens/manifest';

const PERSOS = 'relay/public/persos';
const brut: unknown = JSON.parse(readFileSync(join(PERSOS, 'manifest.json'), 'utf8'));

describe('manifeste des modèles allégés', () => {
  const manifeste = ManifestSchema.parse(brut);

  it('décrit les 8 bases', () => {
    expect(Object.keys(manifeste.bases).sort()).toEqual(
      ['enfant', 'femme-forte', 'femme-frele', 'femme-grande', 'homme-fort', 'homme-maigre', 'mamie', 'papy'],
    );
  });

  it('donne la taille en mètres de chaque base', () => {
    const metres = Object.fromEntries(Object.entries(manifeste.bases).map(([nom, b]) => [nom, b.metres]));
    expect(metres).toEqual({
      'homme-fort': 1.7, 'homme-maigre': 1.82, 'femme-frele': 1.62, 'femme-forte': 1.65, 'femme-grande': 1.76, papy: 1.66, mamie: 1.54, enfant: 1.25,
    });
  });

  it('marque l\'enfant et les personnes âgées', () => {
    expect(manifeste.bases.enfant?.child).toBe(true);
    expect(manifeste.bases.papy?.aged && manifeste.bases.mamie?.aged).toBe(true);
    expect(manifeste.bases['homme-fort']?.aged).toBeUndefined();
  });

  it('référence un GLB et un PNG par base, nommés par l’empreinte de leur contenu (m/<nom>.<sha256 8>.<ext>)', () => {
    for (const [nom, b] of Object.entries(manifeste.bases)) {
      for (const [ext, chemin] of [['glb', b.glb], ['png', b.png]] as const) {
        const m = new RegExp(`^m/${nom}\\.([0-9a-f]{8})\\.${ext}$`).exec(chemin);
        expect(m, chemin).not.toBeNull();
        const octets = readFileSync(join(PERSOS, chemin));
        expect(createHash('sha256').update(octets).digest('hex').slice(0, 8)).toBe(m![1]);
      }
    }
  });

  it('aucun fichier hors du manifeste et de m/ (pas d’ancien nom sans empreinte), aucun orphelin dans m/', () => {
    expect(readdirSync(PERSOS).sort()).toEqual(['m', 'manifest.json']);
    const cites = Object.values(manifeste.bases).flatMap((b) => [b.glb, b.png]).sort();
    expect(readdirSync(join(PERSOS, 'm')).map((n) => `m/${n}`).sort()).toEqual(cites);
  });

  // En-têtes du relais (Cloudflare applique TOUTES les règles qui correspondent à un chemin) : le manifeste n'est couvert que
  // par sa règle sans cache, les modèles à empreinte par la règle immuable.
  describe('en-têtes (relay/public/_headers)', () => {
    type Regle = { motif: RegExp; entetes: string[] };
    const regles: Regle[] = [];
    for (const l of readFileSync('relay/public/_headers', 'utf8').split(/\r?\n/)) {
      if (l.trim() === '' || l.trimStart().startsWith('#')) continue;
      if (/^\s/.test(l)) regles[regles.length - 1]!.entetes.push(l.trim().toLowerCase());
      else regles.push({ motif: new RegExp('^' + l.trim().split('*').map((p) => p.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$'), entetes: [] });
    }
    const entetes = (chemin: string): string[] => regles.filter((r) => r.motif.test(chemin)).flatMap((r) => r.entetes);
    it('manifeste : no-cache, jamais immutable ni max-age, CORS ouvert', () => {
      const h = entetes('/persos/manifest.json');
      expect(h).toContain('cache-control: no-cache');
      expect(h.some((x) => x.includes('immutable') || x.includes('max-age'))).toBe(false);
      expect(h).toContain('access-control-allow-origin: *');
    });
    it('modèles à empreinte : immutable, CORS ouvert', () => {
      for (const b of Object.values(manifeste.bases)) {
        for (const chemin of [b.glb, b.png]) {
          const h = entetes(`/persos/${chemin}`);
          expect(h).toContain('cache-control: public, max-age=31536000, immutable');
          expect(h).toContain('access-control-allow-origin: *');
        }
      }
    });
  });
});
