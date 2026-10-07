// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setBookService } from '../../src/content/book-registry';
import type { BibliographyView, BookService, BookView } from '../../src/content/book-service';
import { WriterSection } from '../../src/content/WriterSection';
import type { BookDetail } from '../../src/core/book/book-detail';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

const misérables: BookDetail = { id: 'OL1063588W', title: 'Les Misérables', author: 'Victor Hugo', year: 1862, genres: [], synopsis: { text: 'Jean Valjean.', url: 'https://fr.wikipedia.org/wiki/Les_Mis%C3%A9rables', source: 'wikipedia' }, pageUrl: 'https://openlibrary.org/works/OL1063588W' };
const items = [
  { id: 'Q1', title: 'Les Misérables', year: 1862, slug: 'Les_Misérables', workId: 'OL1063588W', owned: { slug: 'Les_Misérables', title: 'Les Misérables', rarity: 'L', copies: 2 } },
  { id: 'Q2', title: 'Bug-Jargal', year: 1826 },
];

async function show(view: BibliographyView, extra: Record<string, unknown> = {}, onOpenCard?: (slug: string) => void) {
  const service = {
    bibliography: vi.fn(async () => view),
    workDetail: vi.fn(async (): Promise<BookView> => ({ status: 'detail', detail: misérables })),
    offers: vi.fn(async () => ({ shops: [] })),
    reading: vi.fn(async () => ({ links: [], complete: true })),
    ...extra,
  };
  setBookService(service as unknown as BookService);
  await act(async () => root.render(<WriterSection slug="Victor_Hugo" title="Victor Hugo" {...(onOpenCard ? { onOpenCard } : {})} />));
  return service;
}
const list = () => container.querySelector<HTMLElement>('[data-wmt-work-list]');

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

describe('WriterSection', () => {
  it('rien pour une carte qui n’est pas un écrivain', async () => {
    await show({ status: 'none' });
    expect(container.innerHTML).toBe('');
  });

  it('la liste des œuvres, la carte possédée repérée, « N / M dans ma collection »', async () => {
    await show({ status: 'list', items }, {}, vi.fn());
    expect(list()?.textContent).toContain('Bibliographie');
    expect(list()?.textContent).toContain('Bug-Jargal');
    expect(list()?.textContent).toContain('1 / 2 dans ma collection');
    expect(container.querySelector('button[aria-label="Voir ma carte Les Misérables"]')).not.toBeNull();
  });

  it('« Aucun livre connu. » quand la liste est vide', async () => {
    await show({ status: 'list', items: [] });
    expect(list()?.textContent).toContain('Aucun livre connu.');
  });

  it('un message discret en cas d’erreur', async () => {
    await show({ status: 'error', message: 'Wikidata est indisponible.' });
    expect(container.querySelector('[role="status"]')?.textContent).toBe('Wikidata est indisponible.');
  });

  it('ouvre un livre dans la section (liste masquée, pas retirée), puis ← revient', async () => {
    const service = await show({ status: 'list', items });
    await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="Ouvrir Les Misérables"]')!.click());
    expect(service.workDetail).toHaveBeenCalledWith(items[0], 'Victor Hugo');
    expect(list()?.style.display).toBe('none');
    expect(container.textContent).toContain('Jean Valjean.');
    expect(container.textContent).toContain('Tu possèdes cette carte');
    expect(service.reading).toHaveBeenCalledWith('Les_Misérables', { id: 'OL1063588W', title: 'Les Misérables', author: 'Victor Hugo' });
    await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="Retour à la bibliographie"]')!.click());
    expect(list()?.style.display).toBe('block');
    expect(container.textContent).not.toContain('Jean Valjean.');
  });

  it('un livre sans article : lecture sans carte ; fiche introuvable : message', async () => {
    const service = await show({ status: 'list', items }, { workDetail: vi.fn(async (): Promise<BookView> => ({ status: 'empty' })) });
    await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="Ouvrir Bug-Jargal"]')!.click());
    expect(container.textContent).toContain('Aucune fiche trouvée pour ce livre.');
    expect(service.reading).not.toHaveBeenCalled();
  });

  it('le bouton carte ouvre la carte possédée', async () => {
    const onOpenCard = vi.fn();
    await show({ status: 'list', items }, {}, onOpenCard);
    await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="Voir ma carte Les Misérables"]')!.click());
    expect(onOpenCard).toHaveBeenCalledWith('Les_Misérables');
  });
});
