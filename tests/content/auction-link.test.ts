// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AUCTION_HOST_ATTRIBUTE, decorateAuctionLink, findAuctionBox } from '../../src/content/auction-link';

const PAGE =
  '<aside><h1>WikiMasters</h1></aside>' +
  '<main><div><h1>Élorn</h1><p>Mis en vente par X</p>' +
  '<div id="box"><div><span>Mise de départ</span><b>50</b></div><div><span>Temps restant</span><b>Se termine dans 2h</b></div></div>' +
  '<div id="form"><input type="number"><button>Miser</button></div></div></main>';

beforeEach(() => {
  document.body.innerHTML = PAGE;
});

describe('findAuctionBox', () => {
  it('trouve la boîte « Temps restant » et le titre de la carte', () => {
    const found = findAuctionBox(document);
    expect(found?.box.id).toBe('box');
    expect(found?.title).toBe('Élorn');
  });

  it('trouve la boîte quand le libellé porte une icône', () => {
    document.body.innerHTML = PAGE.replace('<span>Temps restant</span>', '<span><svg width="16"></svg>Temps restant</span>');
    expect(findAuctionBox(document)?.box.id).toBe('box');
  });

  it('ne trouve rien hors d’une fiche d’enchère', () => {
    document.body.innerHTML = '<main><h1>Marché</h1></main>';
    expect(findAuctionBox(document)).toBeNull();
  });
});

describe('decorateAuctionLink', () => {
  it('monte le lien une seule fois', () => {
    const mount = vi.fn((box: HTMLElement, _title: string) => {
      const host = document.createElement('div');
      host.setAttribute(AUCTION_HOST_ATTRIBUTE, '');
      box.insertAdjacentElement('afterend', host);
    });
    expect(decorateAuctionLink(document, mount)).toBe(true);
    expect(decorateAuctionLink(document, mount)).toBe(false);
    expect(mount).toHaveBeenCalledTimes(1);
    expect(mount.mock.calls[0]?.[1]).toBe('Élorn');
  });
});
