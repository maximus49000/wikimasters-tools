// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { FURNITURE_KINDS, STEAMPUNK_ONLY } from '../../src/core/library/furniture-catalog';
import { FurnitureThumb } from '../../src/content/furniture-thumb';

const styleFor = (kind: string) => ((STEAMPUNK_ONLY as readonly string[]).includes(kind) ? 'steampunk' : 'scandinave');

describe('FurnitureThumb', () => {
  it.each(FURNITURE_KINDS)('dessine %s', (kind) => {
    const html = renderToStaticMarkup(<FurnitureThumb kind={kind} style={styleFor(kind)} />);
    expect(html).toContain(`data-thumb="${kind}"`);
    // Un vrai dessin, pas une boîte vide : au moins une forme.
    expect(html).toMatch(/<(path|rect|ellipse|circle|polygon|line)/);
  });

  it('cadre le dessin sur la taille du meuble', () => {
    // Canapé : 6 × 3 cases ; 6 × 30 + 2 × 6 = 192 ; 3 × 510 / 18 + 2 × 6 = 97.
    const html = renderToStaticMarkup(<FurnitureThumb kind="sofa" style="scandinave" />);
    expect(html).toContain('viewBox="-6 -6 192 97"');
  });

  it('prend le dessin Steampunk du bureau dans une pièce Steampunk', () => {
    const plain = renderToStaticMarkup(<FurnitureThumb kind="desk" style="scandinave" />);
    const steam = renderToStaticMarkup(<FurnitureThumb kind="desk" style="steampunk" />);
    expect(steam).not.toBe(plain);
  });
});
