// tests/familles.test.ts — chaque fichier de test appartient à exactement une famille (tests/familles.ts).
import { describe, expect, it } from 'vitest';
import { FAMILLES, motifsDeTests } from './familles';

// Liste des fichiers de test sans les charger (glob paresseux de Vite) : « ./content/x.test.tsx » → « tests/content/x.test.tsx ».
const fichiers = Object.keys(import.meta.glob('./**/*.test.{ts,tsx}'))
  .map((f) => `tests/${f.slice(2)}`)
  .filter((f) => f !== 'tests/familles.test.ts');

// Motif glob (`*`, `**`, `{a,b}`) → expression rationnelle.
const enRegExp = (motif: string): RegExp => {
  let s = '';
  for (let i = 0; i < motif.length; i++) {
    const ch = motif.charAt(i);
    if (motif.startsWith('**/', i)) (s += '(?:.*/)?'), (i += 2);
    else if (motif.startsWith('**', i)) (s += '.*'), (i += 1);
    else if (ch === '*') s += '[^/]*';
    else if (ch === '{') s += '(?:';
    else if (ch === '}') s += ')';
    else if (ch === ',') s += '|';
    else s += ch.replace(/[.+?^$()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${s}$`);
};

const touches = FAMILLES.flatMap((f) =>
  motifsDeTests(f).map((motif) => {
    const re = enRegExp(motif);
    return { famille: f.nom, motif, fichiers: fichiers.filter((x) => re.test(x)) };
  }),
);
const familleDe = (fichier: string): string[] => [...new Set(touches.filter((t) => t.fichiers.includes(fichier)).map((t) => t.famille))];

describe('familles de tests', () => {
  it('le banc est utile : il trouve les tests et lit les motifs comme vitest', () => {
    expect(fichiers.length).toBeGreaterThan(400);
    expect(enRegExp('tests/core/{book,game}/**/*.test.{ts,tsx}').test('tests/core/game/steam/a.test.ts')).toBe(true);
    expect(enRegExp('tests/core/{book,game}/**/*.test.{ts,tsx}').test('tests/core/game.test.ts')).toBe(false);
    expect(enRegExp('tests/content/shop-*.test.{ts,tsx}').test('tests/content/shop/x.test.tsx')).toBe(false);
  });

  it('chaque test est rangé dans une famille (ajouter le nouveau fichier dans tests/familles.ts)', () => {
    expect(fichiers.filter((f) => familleDe(f).length === 0)).toEqual([]);
  });

  it('aucun test n’est dans deux familles (il serait joué deux fois)', () => {
    expect(fichiers.map((f) => [f, familleDe(f)] as const).filter(([, fs]) => fs.length > 1)).toEqual([]);
  });

  it('chaque motif désigne au moins un test (pas de motif mort)', () => {
    expect(touches.filter((t) => t.fichiers.length === 0).map((t) => `${t.famille} : ${t.motif}`)).toEqual([]);
  });

  it('noms uniques ; les sous-familles de la scène commencent par « scene- » et sont les seules lourdes', () => {
    const noms = FAMILLES.map((f) => f.nom);
    expect(new Set(noms).size).toBe(noms.length);
    for (const f of FAMILLES) expect(f.nom.startsWith('scene-'), f.nom).toBe(!!f.lourde);
  });
});
