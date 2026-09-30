// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import {
  decorateMarketLinks,
  findWikipediaLinks,
  MARKET_HOST_ATTRIBUTE,
  type MountMarketLink,
} from '../../src/content/market-link';

const CARD_LINK =
  '<a href="https://fr.wikipedia.org/wiki/Ted_Lasso" target="_blank" rel="noopener noreferrer" ' +
  'class="inline-flex text-sm font-medium text-[var(--color-accent)]">Voir l\'article sur Wikipédia →</a>';

function recordingMount() {
  const calls: string[] = [];
  const mount: MountMarketLink = (anchor, slug) => {
    calls.push(slug);
    const host = document.createElement('div');
    host.setAttribute(MARKET_HOST_ATTRIBUTE, '');
    anchor.insertAdjacentElement('afterend', host);
  };
  return { mount, calls };
}

describe('findWikipediaLinks', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('repère le lien « Voir l’article sur Wikipédia » et en tire l’article', () => {
    document.body.innerHTML = `<div>${CARD_LINK}</div>`;
    const links = findWikipediaLinks(document);
    expect(links).toHaveLength(1);
    expect(links[0]?.slug).toBe('Ted_Lasso');
  });

  it('accepte l’apostrophe typographique et les accents encodés', () => {
    document.body.innerHTML =
      '<a href="https://fr.wikipedia.org/wiki/Th%C3%A9or%C3%A8me">Voir l’article sur Wikipédia →</a>';
    expect(findWikipediaLinks(document)[0]?.slug).toBe('Théorème');
  });

  it('ignore les autres liens vers Wikipédia', () => {
    document.body.innerHTML =
      '<a href="https://fr.wikipedia.org/wiki/Ted_Lasso">Wikipédia</a>' +
      '<a href="https://example.com/wiki/Ted_Lasso">Voir l’article sur Wikipédia →</a>';
    expect(findWikipediaLinks(document)).toEqual([]);
  });
});

describe('decorateMarketLinks', () => {
  beforeEach(() => {
    document.body.innerHTML = `<div id="card">${CARD_LINK}</div>`;
  });

  it('insère le lien du marché juste après celui de Wikipédia', () => {
    const { mount, calls } = recordingMount();
    expect(decorateMarketLinks(document, mount)).toBe(1);
    expect(calls).toEqual(['Ted_Lasso']);
    const anchor = document.querySelector('a');
    expect(anchor?.nextElementSibling?.hasAttribute(MARKET_HOST_ATTRIBUTE)).toBe(true);
  });

  it('est idempotent : un second passage ne duplique pas le lien', () => {
    const { mount, calls } = recordingMount();
    decorateMarketLinks(document, mount);
    expect(decorateMarketLinks(document, mount)).toBe(0);
    expect(calls).toHaveLength(1);
  });
});
