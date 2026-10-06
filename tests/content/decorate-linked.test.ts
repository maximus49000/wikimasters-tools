// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { decorateLinked, findFicheClose, LINKED_HOST_ATTRIBUTE, type MountLinked } from '../../src/content/decorate-linked';

// Fiche réelle de la Collection : bouton « Fermer », colonne de droite, tuiles ATK / DEF puis le lien de l'article.
const FICHE = `
<div class="card-frame">
  <button type="button" aria-label="Fermer"><svg></svg></button>
  <div class="col">
    <div><h2>Ted Lasso</h2></div>
    <div class="grid"><div class="card-frame"><div>9 751</div><div>ATK</div></div><div class="card-frame"><div>7 972</div><div>DEF</div></div></div>
    <div>Q-Score : 68.54</div>
    <div><a href="https://fr.wikipedia.org/wiki/Ted_Lasso">Voir l'article sur Wikipédia →</a></div>
  </div>
</div>`;

function recordingMount() {
  const calls: { slug: string; title: string }[] = [];
  const mount: MountLinked = (tiles, slug, title) => {
    calls.push({ slug, title });
    const host = document.createElement('div');
    host.setAttribute(LINKED_HOST_ATTRIBUTE, '');
    tiles.insertAdjacentElement('beforebegin', host);
  };
  return { mount, calls };
}

describe('decorateLinked', () => {
  beforeEach(() => {
    document.body.innerHTML = FICHE;
  });

  it('pose le bloc juste avant la rangée ATK / DEF, avec le titre et le slug de la carte', () => {
    const { mount, calls } = recordingMount();
    expect(decorateLinked(document, mount)).toBe(1);
    expect(calls).toEqual([{ slug: 'Ted_Lasso', title: 'Ted Lasso' }]);
    expect(document.querySelector('.grid')?.previousElementSibling?.hasAttribute(LINKED_HOST_ATTRIBUTE)).toBe(true);
  });

  it('ne pose le bloc qu’une fois par fiche', () => {
    const { mount, calls } = recordingMount();
    decorateLinked(document, mount);
    expect(decorateLinked(document, mount)).toBe(0);
    expect(calls).toHaveLength(1);
  });

  it('ignore une page sans libellés ATK / DEF (grille, aperçu)', () => {
    document.body.innerHTML = '<div><h3>Paris</h3><span>9 751</span><span>7 972</span></div>';
    const { mount, calls } = recordingMount();
    expect(decorateLinked(document, mount)).toBe(0);
    expect(calls).toEqual([]);
  });
});

describe('findFicheClose', () => {
  it('trouve le bouton « Fermer » de la fiche qui contient l’élément', () => {
    document.body.innerHTML = FICHE;
    expect(findFicheClose(document.querySelector('.grid') as HTMLElement)).toBe(document.querySelector('button[aria-label="Fermer"]'));
  });

  it('rend null hors d’une fiche', () => {
    document.body.innerHTML = '<div><span id="x"></span></div>';
    expect(findFicheClose(document.getElementById('x') as HTMLElement)).toBeNull();
  });
});
