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
  const service = { view: vi.fn(async () => view), ...dialogService(), ...extra };
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
    expect(text).toContain('Données : Open Library, Wikipédia, Wikidata');
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
