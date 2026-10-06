// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { KnownCard } from '../../src/core/collection/collection-book';
import { LinkedCards, LinkedCardsWindow } from '../../src/content/LinkedCards';
import { setLinkedService } from '../../src/content/linked-registry';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const cards = (count: number): KnownCard[] =>
  Array.from({ length: count }, (_, i) => ({ slug: `C${i}`, title: `Carte ${i}`, rarity: 'SR', pageviews: (count - i) * 1000 }));

let container: HTMLDivElement;
let root: Root;
const open = vi.fn();
const ensure = vi.fn();

function serve(list: KnownCard[]) {
  setLinkedService({ source: { subscribe: () => () => undefined, linked: () => list, ensure }, open });
}
const render = (element: React.ReactElement) =>
  act(async () => {
    root.render(element);
  });
const rows = () => [...container.querySelectorAll<HTMLButtonElement>('button.wmt-linked-row')];

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  open.mockReset();
  ensure.mockReset();
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  setLinkedService(null);
});

describe('LinkedCards', () => {
  it('n’affiche rien sans carte liée', async () => {
    serve([]);
    await render(<LinkedCards slug="Paris" onSeeAll={vi.fn()} onOpenCard={vi.fn()} />);
    expect(container.textContent).toBe('');
  });

  it('demande la lecture des liens de la carte', async () => {
    serve(cards(2));
    await render(<LinkedCards slug="Paris" onSeeAll={vi.fn()} onOpenCard={vi.fn()} />);
    expect(ensure).toHaveBeenCalledWith('Paris');
  });

  it('affiche jusqu’à six cartes avec leurs consultations, sans lien « Voir » quand il y en a six ou moins', async () => {
    serve(cards(6));
    await render(<LinkedCards slug="Paris" onSeeAll={vi.fn()} onOpenCard={vi.fn()} />);
    expect(rows().map((row) => row.textContent)).toEqual(['Carte 06 k', 'Carte 15 k', 'Carte 24 k', 'Carte 33 k', 'Carte 42 k', 'Carte 51 k']);
    expect(container.textContent).not.toContain('Voir les');
  });

  it('limite à six cartes et propose toutes les autres dans une fenêtre', async () => {
    serve(cards(9));
    const onSeeAll = vi.fn();
    await render(<LinkedCards slug="Paris" onSeeAll={onSeeAll} onOpenCard={vi.fn()} />);
    expect(rows()).toHaveLength(6);
    const more = [...container.querySelectorAll('button')].find((button) => button.textContent?.startsWith('Voir les 9 cartes liées'));
    await act(async () => more?.click());
    expect(onSeeAll).toHaveBeenCalledOnce();
  });

  it('ouvre la fiche de la carte cliquée', async () => {
    serve(cards(3));
    const onOpenCard = vi.fn();
    await render(<LinkedCards slug="Paris" onSeeAll={vi.fn()} onOpenCard={onOpenCard} />);
    await act(async () => rows()[1]?.click());
    expect(onOpenCard).toHaveBeenCalledWith('C1');
  });
});

describe('LinkedCardsWindow', () => {
  it('liste toutes les cartes liées dans l’ordre, avec leur rang, et ouvre celle qu’on clique', async () => {
    serve(cards(9));
    const onPick = vi.fn();
    await render(<LinkedCardsWindow slug="Paris" title="Paris" onPick={onPick} onClose={vi.fn()} />);
    expect(rows()).toHaveLength(9);
    expect(rows()[0]?.textContent).toBe('1Carte 09 k');
    expect(container.textContent).toContain('9 cartes');
    await act(async () => rows()[8]?.click());
    expect(onPick).toHaveBeenCalledWith('C8');
  });

  it('se ferme avec le bouton « Fermer » ou en cliquant à côté', async () => {
    serve(cards(7));
    const onClose = vi.fn();
    await render(<LinkedCardsWindow slug="Paris" title="Paris" onPick={vi.fn()} onClose={onClose} />);
    await act(async () => (container.querySelector('button[aria-label="Fermer"]') as HTMLElement).click());
    await act(async () => (container.firstElementChild as HTMLElement).click());
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
