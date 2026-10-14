import { describe, expect, it } from 'vitest';
import { fitText } from '../../../src/core/library/text-fit';

// Police à chasse fixe : chaque caractère fait 0,5 × la taille.
const mono = (text: string, size: number) => text.length * size * 0.5;

describe('texte des panneaux', () => {
  it('garde une ligne courte en grand', () => {
    const r = fitText('Bonjour', { w: 100, h: 40 }, mono, 1.2);
    expect(r.lines).toEqual(['Bonjour']);
    expect(r.size).toBeGreaterThan(25);
  });
  it('passe à la ligne aux espaces et respecte les retours voulus', () => {
    const r = fitText('Menu du jour\nSoupe de potiron et tarte', { w: 60, h: 60 }, mono, 1.2);
    expect(r.lines[0]).toBe('Menu du jour');
    expect(r.lines.length).toBeGreaterThanOrEqual(3);
    for (const l of r.lines) expect(mono(l, r.size)).toBeLessThanOrEqual(60 + 1e-9);
    expect(r.lines.length * r.size * 1.2).toBeLessThanOrEqual(60 + 1e-9);
  });
  it('la taille diminue quand le texte s allonge et augmente quand le panneau grandit', () => {
    const short = fitText('Salut', { w: 80, h: 40 }, mono, 1.2).size;
    const long = fitText('Salut à toute la famille réunie', { w: 80, h: 40 }, mono, 1.2).size;
    const bigger = fitText('Salut à toute la famille réunie', { w: 160, h: 80 }, mono, 1.2).size;
    expect(long).toBeLessThan(short);
    expect(bigger).toBeGreaterThan(long);
  });
  it('un mot trop long reste seul sur sa ligne à la taille minimale', () => {
    const r = fitText('Anticonstitutionnellement', { w: 10, h: 10 }, mono, 1.2);
    expect(r.lines).toEqual(['Anticonstitutionnellement']);
    expect(r.size).toBe(1.5);
  });
  it('texte vide : aucune ligne', () => {
    expect(fitText('   ', { w: 50, h: 50 }, mono, 1.2).lines).toEqual([]);
  });
});
