// tests/content/work-list.test.tsx
// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OwnedNotice, WorkBack, WorkList, type WorkItem } from '../../src/content/WorkList';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const items: WorkItem[] = [
  { key: 'movie-1', title: 'Les Petits Mouchoirs', year: 2010, rating: '7,0' },
  { key: 'movie-2', title: 'Inception', year: 2010, rating: '8,4', owned: { slug: 'Inception', title: 'Inception', rarity: 'L', copies: 1 } },
  { key: 'movie-3', title: 'La Môme', year: 2007, owned: { slug: 'La_Môme', title: 'La Môme', rarity: 'SR', copies: 3 } },
];
const onOpen = vi.fn();
const onOpenCard = vi.fn();
const show = (list: WorkItem[] = items, withCards = true) =>
  act(async () => root.render(<WorkList glyph="film" label="Filmographie" items={list} emptyText="Aucun titre connu." onOpen={onOpen} {...(withCards ? { onOpenCard } : {})} />));
const rows = () => [...container.querySelectorAll('li')];
const button = (label: string) => container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
const toggle = () => [...container.querySelectorAll('button')].find((b) => b.hasAttribute('aria-pressed'));

beforeEach(() => {
  onOpen.mockReset();
  onOpenCard.mockReset();
});

describe('WorkList', () => {
  it('une liste sans carte possédée est celle d’avant : ni résumé, ni interrupteur, ni bouton carte', async () => {
    await show(items.slice(0, 1));
    expect(container.textContent).toContain('Filmographie');
    expect(container.textContent).toContain('· 1');
    expect(container.textContent).not.toContain('dans ma collection');
    expect(toggle()).toBeUndefined();
    expect(container.querySelector('button[aria-label^="Voir ma carte"]')).toBeNull();
  });

  it('résume « 2 / 3 dans ma collection » et marque les lignes possédées (rareté, ×N)', async () => {
    await show();
    expect(container.textContent).toContain('2 / 3 dans ma collection');
    expect(rows()).toHaveLength(3);
    expect(rows()[1]?.textContent).toContain('Légendaire');
    expect(rows()[2]?.textContent).toContain('×3');
    expect(rows()[0]?.textContent).not.toContain('×');
  });

  it('un appui sur la ligne ouvre l’œuvre ; le bouton carte ouvre la carte', async () => {
    await show();
    await act(async () => button('Ouvrir Inception')?.click());
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ key: 'movie-2' }));
    await act(async () => button('Voir ma carte Inception')?.click());
    expect(onOpenCard).toHaveBeenCalledWith('Inception');
  });

  it('sans action de carte, pas de bouton carte', async () => {
    await show(items, false);
    expect(container.querySelector('button[aria-label^="Voir ma carte"]')).toBeNull();
  });

  it('« Seulement ma collection » ne garde que les cartes possédées, et se désactive d’un appui', async () => {
    await show();
    await act(async () => toggle()?.click());
    expect(toggle()?.getAttribute('aria-pressed')).toBe('true');
    expect(rows().map((r) => r.textContent)).toEqual([expect.stringContaining('Inception'), expect.stringContaining('La Môme')]);
    expect(container.textContent).toContain('2 sur 3');
    await act(async () => toggle()?.click());
    expect(rows()).toHaveLength(3);
  });

  it('l’interrupteur respecte la cible tactile de 44 px', async () => {
    await show();
    expect(toggle()?.style.minHeight).toBe('44px');
  });

  it('une liste vide affiche le texte prévu', async () => {
    await show([]);
    expect(container.textContent).toContain('Aucun titre connu.');
  });
});

describe('WorkBack et OwnedNotice', () => {
  it('la flèche de retour porte le libellé et rappelle le titre', async () => {
    const onBack = vi.fn();
    await act(async () => root.render(<WorkBack title="Inception" year={2010} label="Retour à la filmographie" onBack={onBack} />));
    expect(container.textContent).toContain('Inception');
    await act(async () => button('Retour à la filmographie')?.click());
    expect(onBack).toHaveBeenCalled();
  });

  it('le rappel « Tu possèdes cette carte » donne rareté et exemplaires, et ouvre la carte', async () => {
    await act(async () => root.render(<OwnedNotice card={{ slug: 'Inception', title: 'Inception', rarity: 'L', copies: 2 }} onOpenCard={onOpenCard} />));
    expect(container.textContent).toContain('Tu possèdes cette carte');
    expect(container.textContent).toContain('Légendaire');
    expect(container.textContent).toContain('×2');
    await act(async () => button('Ouvrir ma carte Inception')?.click());
    expect(onOpenCard).toHaveBeenCalledWith('Inception');
  });
});
