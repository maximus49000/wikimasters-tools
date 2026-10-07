// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setBookService } from '../../src/content/book-registry';
import type { BookService, BookView } from '../../src/content/book-service';
import { BookSection } from '../../src/content/BookSection';
import type { BookDetail } from '../../src/core/book/book-detail';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

const etranger: BookDetail = {
  id: 'OL1230613W',
  title: 'L’étranger',
  author: 'Albert Camus',
  year: 1942,
  publisher: 'Gallimard',
  pages: 186,
  genres: ['Roman philosophique'],
  synopsis: { text: 'Meursault enterre sa mère sans verser une larme.', url: 'https://fr.wikipedia.org/wiki/L%27%C3%89tranger', source: 'wikipedia' },
  coverUrl: 'https://covers.openlibrary.org/b/id/13151269-L.jpg',
  pageUrl: 'https://openlibrary.org/works/OL1230613W',
};

const dialogService = () => ({
  candidates: vi.fn(async () => ({ works: [] })),
  preview: vi.fn(async () => ({})),
  choose: vi.fn(async () => undefined),
  chooseNone: vi.fn(async () => undefined),
  reset: vi.fn(async () => undefined),
});

async function show(view: BookView, extra: Record<string, unknown> = {}) {
  const service = { view: vi.fn(async () => view), ...dialogService(), offers: vi.fn(async () => ({ shops: [] })), ...extra };
  setBookService(service as unknown as BookService);
  await act(async () => root.render(<BookSection slug="L'Étranger" title="L'Étranger" />));
  return service;
}
const dialog = (): ParentNode => Array.from(document.body.children).find((child) => child.shadowRoot)?.shadowRoot ?? document.createDocumentFragment();

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  setBookService(null);
});

describe('BookSection', () => {
  it('rien pour une carte qui n’est pas un livre, ni sans service', async () => {
    await show({ status: 'none' });
    expect(container.innerHTML).toBe('');
    setBookService(null);
    await act(async () => root.render(<BookSection slug="X" title="X" />));
    expect(container.innerHTML).toBe('');
  });

  it('un livre : titre de section, auteur, année · éditeur, pages, genres, synopsis agrandi, lien et sources', async () => {
    await show({ status: 'detail', detail: etranger });
    const text = container.textContent ?? '';
    expect(text).toContain('Livre');
    expect(text).toContain('Albert Camus');
    expect(text).toContain('1942 · Gallimard');
    expect(text).toContain('186 pages');
    expect(text).toContain('Roman philosophique');
    expect(text).toContain('Synopsis');
    expect(text).toContain('Meursault enterre sa mère sans verser une larme.');
    expect(text).toContain('Données : Open Library, Wikipédia, Wikidata, Google Books');
    const synopsis = [...container.querySelectorAll('p')].find((p) => p.textContent?.includes('Meursault')) as HTMLElement;
    expect(synopsis.style.fontSize).toBe('clamp(15px, 4vw, 16px)');
    expect(synopsis.style.maxHeight).toBe('300px');
    const links = [...container.querySelectorAll('a')].map((a) => [a.getAttribute('href'), a.getAttribute('target'), a.getAttribute('rel')]);
    expect(links).toContainEqual(['https://fr.wikipedia.org/wiki/L%27%C3%89tranger', '_blank', 'noopener noreferrer']);
    expect(links).toContainEqual(['https://openlibrary.org/works/OL1230613W', '_blank', 'noopener noreferrer']);
  });

  it('le synopsis d’Open Library est présenté comme tel, et un livre sans synopsis n’affiche pas ce bloc', async () => {
    await show({ status: 'detail', detail: { ...etranger, synopsis: { text: 'Un roman.', url: 'https://openlibrary.org/works/OL1230613W', source: 'openlibrary' } } });
    expect(container.textContent).toContain('Résumé Open Library');
    const { synopsis: _omitted, ...bare } = etranger;
    await show({ status: 'detail', detail: bare });
    expect(container.textContent).not.toContain('Synopsis');
  });

  it('une fiche vide et une erreur restent discrètes mais lisibles', async () => {
    await show({ status: 'empty' });
    expect(container.textContent).toContain('Livre');
    expect(container.textContent).toContain('Aucune fiche trouvée');
    await show({ status: 'error', message: 'Open Library est indisponible pour le moment.' });
    expect(container.querySelector('[role="status"]')?.textContent).toContain('indisponible');
  });

  it('l’hôte de la section porte l’attribut utilisé par la visite guidée', async () => {
    await show({ status: 'detail', detail: etranger });
    expect(container.querySelector('[data-wmt-book-card]')).not.toBeNull();
  });
});

const READ_AT = new Date(2026, 9, 7, 12).getTime();
const price = (amount: number, source: string) => ({ amount, currency: 'EUR', source, readAt: READ_AT });
const shop = (shop: string, label: string, kind: string, url: string, extra: object = {}) => ({ shop, label, kind, url, ...extra });
const withPrices = {
  shops: [
    shop('amazon', 'Amazon.fr', 'paper', 'https://www.amazon.fr/dp/2070360024', { price: price(7.6, 'Amazon.fr') }),
    shop('fnac', 'Fnac', 'paper', 'https://www.fnac.com/x'),
    shop('decitre', 'Decitre', 'paper', 'https://www.decitre.fr/x'),
    shop('libraire', 'Librairie indépendante', 'paper', 'https://www.placedeslibraires.fr/x'),
    shop('google-play', 'Google Play Livres', 'ebook', 'https://play.google.com/store/books/details?id=x', { price: price(7.49, 'Google Play Livres') }),
  ],
  paperPrice: price(7.6, 'Amazon.fr'),
};
const withIsbn = { ...etranger, isbn: '9782070360024' };

describe('BookSection — prix et achat', () => {
  it('affiche le prix de référence, une ligne par vendeur avec son prix ou « voir le prix », et la date de lecture', async () => {
    await show({ status: 'detail', detail: withIsbn }, { offers: vi.fn(async () => withPrices) });
    const block = container.querySelector('[data-wmt-book-prices]') as HTMLElement;
    expect(block).not.toBeNull();
    const text = block.textContent ?? '';
    expect(text).toContain('Prix en France');
    expect(text).toContain('7,60 €');
    expect(text).toContain('prix du livre est unique en France');
    expect(text).toContain('7,49 €');
    expect(text).toContain('Google Play Livres');
    expect(text).toContain('voir le prix');
    expect(text).toContain('chercher');
    expect(text).toContain('Prix lus le 07/10');
    const rows = [...block.querySelectorAll('a')];
    expect(rows.map((row) => row.getAttribute('href'))).toEqual(withPrices.shops.map((s) => s.url));
    for (const row of rows) {
      expect(row.getAttribute('target')).toBe('_blank');
      expect(row.getAttribute('rel')).toBe('noopener noreferrer');
      expect(parseInt((row as HTMLElement).style.minHeight, 10)).toBeGreaterThanOrEqual(44);
    }
  });

  it('les liens du papier s’affichent tout de suite, avant la réponse des prix, sans prix de référence', async () => {
    await show({ status: 'detail', detail: withIsbn }, { offers: vi.fn(() => new Promise(() => undefined)) });
    const block = container.querySelector('[data-wmt-book-prices]') as HTMLElement;
    const hrefs = [...block.querySelectorAll('a')].map((row) => row.getAttribute('href'));
    expect(hrefs[0]).toBe('https://www.amazon.fr/dp/2070360024');
    expect(hrefs).toHaveLength(4);
    expect(block.textContent).not.toContain('prix du livre est unique');
    expect(block.textContent).not.toContain('Prix lus le');
  });

  it('un échec de la lecture des prix laisse les liens, sans message d’erreur', async () => {
    await show({ status: 'detail', detail: withIsbn }, { offers: vi.fn(async () => Promise.reject(new Error('x'))) });
    const block = container.querySelector('[data-wmt-book-prices]') as HTMLElement;
    expect(block.querySelectorAll('a')).toHaveLength(4);
    expect(container.querySelector('[role="status"]')).toBeNull();
  });

  it('sans prix lu, la zone de référence est omise ; le pied cite les sources', async () => {
    await show({ status: 'detail', detail: withIsbn }, { offers: vi.fn(async () => ({ shops: withPrices.shops.map((s) => ({ ...s, price: undefined })).map(({ price: _p, ...rest }) => rest) })) });
    const block = container.querySelector('[data-wmt-book-prices]') as HTMLElement;
    expect(block.textContent).not.toContain('prix du livre est unique');
    expect(container.textContent).toContain('Données : Open Library, Wikipédia, Wikidata, Google Books');
  });

  it('pas de bloc de prix pour une fiche vide ou en erreur', async () => {
    await show({ status: 'empty' });
    expect(container.querySelector('[data-wmt-book-prices]')).toBeNull();
    await show({ status: 'error', message: 'x' });
    expect(container.querySelector('[data-wmt-book-prices]')).toBeNull();
  });

  it('interroge les offres avec le titre, l’auteur et l’ISBN du livre', async () => {
    const offers = vi.fn(async () => withPrices);
    await show({ status: 'detail', detail: withIsbn }, { offers });
    expect(offers).toHaveBeenCalledWith({ title: 'L’étranger', author: 'Albert Camus', isbn: '9782070360024' });
  });
});

describe('BookSection — changer de livre', () => {
  it('le glyphe ⇄ est dans l’en-tête, pour un livre, une fiche vide et une erreur, mais pas pour une carte qui n’est pas un livre', async () => {
    for (const view of [{ status: 'detail', detail: etranger }, { status: 'empty' }, { status: 'error', message: 'x' }] as BookView[]) {
      await show(view);
      const button = container.querySelector<HTMLButtonElement>('[aria-label="Changer de livre"]');
      expect(button, view.status).not.toBeNull();
      expect(button?.hasAttribute('data-wmt-book-switch')).toBe(true);
    }
    await show({ status: 'none' });
    expect(container.querySelector('[aria-label="Changer de livre"]')).toBeNull();
  });

  it('le bouton ouvre la fenêtre ; un changement recharge la fiche', async () => {
    const service = await show({ status: 'detail', detail: etranger });
    expect(service.view).toHaveBeenCalledTimes(1);
    await act(async () => container.querySelector<HTMLElement>('[aria-label="Changer de livre"]')!.click());
    const open = dialog().querySelector('[role="dialog"][aria-label="Changer de livre"]');
    expect(open).not.toBeNull();
    await act(async () => dialog().querySelector<HTMLElement>('[aria-label="Aucun livre"]')!.click());
    expect(service.chooseNone).toHaveBeenCalledWith("L'Étranger");
    expect(service.view).toHaveBeenCalledTimes(2);
    expect(dialog().querySelector('[role="dialog"]')).toBeNull();
  });

  it('« aucun livre » se lit autrement qu’un livre introuvable', async () => {
    await show({ status: 'empty', none: true });
    expect(container.textContent).toContain('Aucun livre pour cette carte.');
    await show({ status: 'empty' });
    expect(container.textContent).toContain('Aucune fiche trouvée pour ce livre.');
  });
});
