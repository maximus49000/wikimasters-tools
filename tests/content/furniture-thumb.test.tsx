// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { FURNITURE_KINDS, STEAMPUNK_ONLY } from '../../src/core/library/furniture-catalog';
import { STANDING_KINDS } from '../../src/core/library/library-types';
import { FurnitureThumb } from '../../src/content/furniture-thumb';

const styleFor = (kind: string) => ((STEAMPUNK_ONLY as readonly string[]).includes(kind) ? 'steampunk' : 'scandinave');

describe('FurnitureThumb', () => {
  it.each(FURNITURE_KINDS)('dessine %s', (kind) => {
    const html = renderToStaticMarkup(<FurnitureThumb kind={kind} style={styleFor(kind)} />);
    expect(html).toContain(`data-thumb="${kind}"`);
    // Un vrai dessin, pas une boîte vide : au moins une forme.
    expect(html).toMatch(/<(path|rect|ellipse|circle|polygon|line)/);
  });

  it.each(STANDING_KINDS)('%s : la vignette est le modèle 3D de face', (kind) => {
    const html = renderToStaticMarkup(<FurnitureThumb kind={kind} style={styleFor(kind)} />);
    expect(html).toContain('data-model3d');
  });

  it('cadre le dessin sur la taille du meuble', () => {
    // Canapé : 10 × 6 cases ; 10 × 30 + 2 × 6 = 312 ; 6 × 510 / 18 + 2 × 6 = 182.
    const html = renderToStaticMarkup(<FurnitureThumb kind="sofa" style="scandinave" />);
    expect(html).toContain('viewBox="-6 -6 312 182"');
  });

  it('prend le dessin Steampunk du bureau dans une pièce Steampunk', () => {
    const plain = renderToStaticMarkup(<FurnitureThumb kind="desk" style="scandinave" />);
    const steam = renderToStaticMarkup(<FurnitureThumb kind="desk" style="steampunk" />);
    expect(steam).not.toBe(plain);
  });

  it.each([['computer', 'monitor'], ['small-plant', 'small-plant'], ['small-lamp', 'small-lamp']] as const)('%s : la vignette est le modèle 3D de l’objet', (kind, shape) => {
    const html = renderToStaticMarkup(<FurnitureThumb kind={kind} style="scandinave" />);
    expect(html).toContain(`data-item3d="${shape}"`);
  });

  it('l’ordinateur d’une pièce Steampunk est la machine analytique', () => {
    expect(renderToStaticMarkup(<FurnitureThumb kind="computer" style="steampunk" />)).not.toBe(renderToStaticMarkup(<FurnitureThumb kind="computer" style="scandinave" />));
  });
});
