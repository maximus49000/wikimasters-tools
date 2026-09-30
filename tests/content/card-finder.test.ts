// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { findCardMounts } from '../../src/content/card-finder';

function page(html: string): HTMLElement {
  document.body.innerHTML = html;
  return document.body;
}

describe('findCardMounts', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it("renvoie le conteneur de chaque carte dont le titre est connu", () => {
    const root = page(`
      <main>
        <h1>Collection</h1>
        <div class="grid">
          <div class="card" id="a"><img alt="x"><button>Ajouter aux favoris</button><h3>Mad Max</h3><span>film</span></div>
          <div class="card" id="b"><img alt="y"><h3>Ovide</h3></div>
        </div>
      </main>`);
    const mounts = findCardMounts(root, (t) => t === 'Mad Max');
    expect(mounts).toHaveLength(1);
    expect(mounts[0]?.title).toBe('Mad Max');
    expect(mounts[0]?.container.id).toBe('a');
  });

  it("monte jusqu'au plus grand ancêtre qui ne contient qu'un seul titre", () => {
    const root = page(`
      <main>
        <h1>Collection</h1>
        <div class="grid">
          <div class="card" id="a"><div><img alt="x"></div><div><h3>Mad Max</h3></div></div>
          <div class="card" id="b"><div><img alt="y"></div><div><h3>Ovide</h3></div></div>
        </div>
      </main>`);
    const mounts = findCardMounts(root, (t) => t === 'Mad Max');
    expect(mounts[0]?.container.id).toBe('a');
  });

  it("ignore un titre sans image dans sa carte", () => {
    const root = page(`
      <main>
        <h1>Collection</h1>
        <div class="grid">
          <div class="card"><h3>Mad Max</h3></div>
          <div class="card"><img alt="y"><h3>Ovide</h3></div>
        </div>
      </main>`);
    expect(findCardMounts(root, (t) => t === 'Mad Max')).toHaveLength(0);
  });

  it("ignore un titre directement voisin d'autres titres (pas de carte englobante)", () => {
    const root = page(`
      <main>
        <h1>Collection</h1>
        <img alt="x">
        <h3>Mad Max</h3>
        <h3>Ovide</h3>
      </main>`);
    expect(findCardMounts(root, (t) => t === 'Mad Max')).toHaveLength(0);
  });

  it("ne monte pas au-delà de <main>", () => {
    const root = page(`
      <main>
        <div class="grid"><div class="card" id="a"><img alt="x"><h3>Mad Max</h3></div></div>
      </main>`);
    const mounts = findCardMounts(root, () => true);
    expect(mounts[0]?.container.tagName).not.toBe('MAIN');
    expect(mounts[0]?.container.contains(mounts[0]?.container.querySelector('h3'))).toBe(true);
  });
});
