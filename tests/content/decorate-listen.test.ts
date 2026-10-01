// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { decorateListen, LISTEN_HOST_ATTRIBUTE, type MountListen } from '../../src/content/decorate-listen';

const SHEET = `
<div class="card-frame">
  <div class="col">
    <div><h2>Abbey Road</h2></div>
    <div class="space-y-2">
      <div>Étiquettes</div>
      <div><span>#VINYLE ×</span></div>
      <div class="relative"><input placeholder="Ajouter une étiquette..." /></div>
    </div>
    <div>9 751 ATK</div>
    <a href="https://fr.wikipedia.org/wiki/Abbey_Road">Voir l'article sur Wikipédia →</a>
  </div>
</div>`;

function recordingMount() {
  const calls: { slug: string; title: string }[] = [];
  const mount: MountListen = (anchor, slug, title) => {
    calls.push({ slug, title });
    const host = document.createElement('div');
    host.setAttribute(LISTEN_HOST_ATTRIBUTE, '');
    anchor.insertAdjacentElement('afterend', host);
  };
  return { mount, calls };
}

describe('decorateListen', () => {
  beforeEach(() => {
    document.body.innerHTML = SHEET;
  });

  it('pose la section juste sous le bloc des étiquettes, avec le titre de la carte', () => {
    const { mount, calls } = recordingMount();
    expect(decorateListen(document, mount)).toBe(1);
    expect(calls).toEqual([{ slug: 'Abbey_Road', title: 'Abbey Road' }]);
    const block = document.querySelector('.space-y-2');
    expect(block?.nextElementSibling?.hasAttribute(LISTEN_HOST_ATTRIBUTE)).toBe(true);
  });

  it('ne la pose qu’une fois', () => {
    const { mount } = recordingMount();
    decorateListen(document, mount);
    expect(decorateListen(document, mount)).toBe(0);
  });

  it('ignore une page sans champ d’étiquette', () => {
    document.body.innerHTML = '<input placeholder="Rechercher" />';
    expect(decorateListen(document, recordingMount().mount)).toBe(0);
  });
});
