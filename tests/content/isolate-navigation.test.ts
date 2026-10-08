// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { isolateNavigation, restoreNavigation } from '../../src/content/isolate-navigation';
import { setGridHidden } from '../../src/content/collection-dom';

let main: HTMLElement;
const q = (selector: string) => document.querySelector<HTMLElement>(selector)!;
const hidden = (selector: string) => q(selector).style.display === 'none';

beforeEach(() => {
  document.body.innerHTML = `
    <nav id="top">Menu du site</nav>
    <main>
      <h1 id="title">Collection</h1>
      <section id="tools">
        <div id="row">
          <button id="rare">L</button><button id="rare2">UR</button>
          <button id="select">Sélectionner</button>
          <div id="switch" data-wmt-view-switch><button>Vue</button></div>
        </div>
        <div id="kinds">Nature</div>
      </section>
      <div id="panel" data-wmt-world-panel>Bibliothèque</div>
      <div id="grid"><div class="card">Carte</div></div>
      <div id="pagination">Page 1 / 3</div>
    </main>`;
  main = q('main');
});

const keepers = () => [q('#switch'), q('#panel')];

describe('isolateNavigation', () => {
  it('masque tout ce qui n’est pas sur la chaîne des éléments gardés', () => {
    isolateNavigation(keepers(), main);
    for (const id of ['#title', '#rare', '#rare2', '#select', '#kinds', '#grid', '#pagination']) expect(hidden(id), id).toBe(true);
  });

  it('garde les gardés et leurs ancêtres visibles', () => {
    isolateNavigation(keepers(), main);
    for (const id of ['#switch', '#panel', '#row', '#tools']) expect(hidden(id), id).toBe(false);
    expect(main.style.display).toBe('');
  });

  it('ne masque jamais hors de la frontière', () => {
    isolateNavigation(keepers(), main);
    expect(q('#top').style.display).toBe('');
    expect(document.body.style.display).toBe('');
  });

  it('est idempotent', () => {
    isolateNavigation(keepers(), main);
    const once = document.body.innerHTML;
    isolateNavigation(keepers(), main);
    expect(document.body.innerHTML).toBe(once);
    restoreNavigation(document);
    expect(q('#title').style.display).toBe('');
  });

  it('restaure tout, y compris l’affichage d’origine', () => {
    q('#title').style.display = 'flex';
    isolateNavigation(keepers(), main);
    expect(hidden('#title')).toBe(true);
    restoreNavigation(document);
    expect(q('#title').style.display).toBe('flex');
    expect(document.querySelector('[data-wmt-nav-hidden]')).toBeNull();
    expect(q('#select').style.display).toBe('');
  });

  it('laisse tel quel un élément déjà masqué, par le site ou par la grille', () => {
    q('#kinds').style.display = 'none';
    setGridHidden(q('#grid'), true);
    isolateNavigation(keepers(), main);
    restoreNavigation(document);
    expect(hidden('#kinds')).toBe(true);
    expect(hidden('#grid')).toBe(true);
    setGridHidden(q('#grid'), false);
    expect(hidden('#grid')).toBe(false);
  });

  it('ignore un gardé hors de la frontière', () => {
    const outside = q('#top');
    isolateNavigation([outside], main);
    expect(document.querySelector('[data-wmt-nav-hidden]')).toBeNull();
  });
});
