// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { BOOK_HOST_ATTRIBUTE, decorateBook, decorateGame, decorateListen, decorateScreen, GAME_HOST_ATTRIBUTE, LISTEN_HOST_ATTRIBUTE, SCREEN_HOST_ATTRIBUTE, type MountListen } from '../../src/content/decorate-listen';

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

describe('decorateScreen', () => {
  beforeEach(() => {
    document.body.innerHTML = SHEET;
  });

  function mountWith(attribute: string): { mount: MountListen; calls: { slug: string; title: string }[] } {
    const calls: { slug: string; title: string }[] = [];
    const mount: MountListen = (anchor, slug, title) => {
      calls.push({ slug, title });
      const host = document.createElement('div');
      host.setAttribute(attribute, '');
      anchor.insertAdjacentElement('afterend', host);
    };
    return { mount, calls };
  }
  const order = () => [...document.querySelector('.space-y-2')!.parentElement!.children].map((el) => (el.hasAttribute(LISTEN_HOST_ATTRIBUTE) ? 'listen' : el.hasAttribute(SCREEN_HOST_ATTRIBUTE) ? 'screen' : el.tagName));

  it('pose la section juste sous les étiquettes quand il n’y a pas de section « Écouter »', () => {
    const { mount, calls } = mountWith(SCREEN_HOST_ATTRIBUTE);
    expect(decorateScreen(document, mount)).toBe(1);
    expect(calls).toEqual([{ slug: 'Abbey_Road', title: 'Abbey Road' }]);
    expect(document.querySelector('.space-y-2')?.nextElementSibling?.hasAttribute(SCREEN_HOST_ATTRIBUTE)).toBe(true);
  });

  it('se place sous la section « Écouter », quel que soit l’ordre de pose, sans doublon', () => {
    const listen = mountWith(LISTEN_HOST_ATTRIBUTE).mount;
    const screen = mountWith(SCREEN_HOST_ATTRIBUTE).mount;
    decorateListen(document, listen);
    decorateScreen(document, screen);
    expect(order().slice(1, 4)).toEqual(['DIV', 'listen', 'screen']);
    expect(decorateListen(document, listen)).toBe(0);
    expect(decorateScreen(document, screen)).toBe(0);

    document.body.innerHTML = SHEET;
    decorateScreen(document, screen);
    decorateListen(document, listen);
    expect(order().slice(1, 4)).toEqual(['DIV', 'listen', 'screen']);
    expect(decorateListen(document, listen)).toBe(0);
    expect(decorateScreen(document, screen)).toBe(0);
  });

  it('ignore une page sans champ d’étiquette', () => {
    document.body.innerHTML = '<input placeholder="Rechercher" />';
    expect(decorateScreen(document, mountWith(SCREEN_HOST_ATTRIBUTE).mount)).toBe(0);
  });
});

describe('decorateGame', () => {
  beforeEach(() => {
    document.body.innerHTML = SHEET;
  });

  function mountWith(attribute: string): MountListen {
    return (anchor) => {
      const host = document.createElement('div');
      host.setAttribute(attribute, '');
      anchor.insertAdjacentElement('afterend', host);
    };
  }
  const order = () => [...document.querySelector('.space-y-2')!.parentElement!.children].map((el) => (el.hasAttribute(LISTEN_HOST_ATTRIBUTE) ? 'listen' : el.hasAttribute(SCREEN_HOST_ATTRIBUTE) ? 'screen' : el.hasAttribute(GAME_HOST_ATTRIBUTE) ? 'game' : el.tagName));

  it('se place après « Écouter » et film / série, une seule fois par fiche', () => {
    const listen = mountWith(LISTEN_HOST_ATTRIBUTE);
    const screen = mountWith(SCREEN_HOST_ATTRIBUTE);
    const game = mountWith(GAME_HOST_ATTRIBUTE);
    decorateListen(document, listen);
    decorateScreen(document, screen);
    decorateGame(document, game);
    expect(order().slice(1, 5)).toEqual(['DIV', 'listen', 'screen', 'game']);
    expect(decorateGame(document, game)).toBe(0);
    expect(document.querySelectorAll(`[${GAME_HOST_ATTRIBUTE}]`)).toHaveLength(1);
  });
});

describe('decorateBook', () => {
  beforeEach(() => {
    document.body.innerHTML = SHEET;
  });
  function mountWith(attribute: string): MountListen {
    return (anchor) => {
      const host = document.createElement('div');
      host.setAttribute(attribute, '');
      anchor.insertAdjacentElement('afterend', host);
    };
  }
  it('se place après « Écouter », film / série et jeu, une seule fois par fiche', () => {
    decorateListen(document, mountWith(LISTEN_HOST_ATTRIBUTE));
    decorateScreen(document, mountWith(SCREEN_HOST_ATTRIBUTE));
    decorateGame(document, mountWith(GAME_HOST_ATTRIBUTE));
    const book = mountWith(BOOK_HOST_ATTRIBUTE);
    decorateBook(document, book);
    const names = [...document.querySelector('.space-y-2')!.parentElement!.children].map((el) =>
      el.hasAttribute(LISTEN_HOST_ATTRIBUTE) ? 'listen' : el.hasAttribute(SCREEN_HOST_ATTRIBUTE) ? 'screen' : el.hasAttribute(GAME_HOST_ATTRIBUTE) ? 'game' : el.hasAttribute(BOOK_HOST_ATTRIBUTE) ? 'book' : el.tagName,
    );
    expect(names.slice(1, 6)).toEqual(['DIV', 'listen', 'screen', 'game', 'book']);
    expect(decorateBook(document, book)).toBe(0);
    expect(document.querySelectorAll(`[${BOOK_HOST_ATTRIBUTE}]`)).toHaveLength(1);
  });
});
