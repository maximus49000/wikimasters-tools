// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  findSortSelect,
  setPendingAuctionSearch,
  showAuctionsEndingSoon,
  takePendingAuctionSearch,
} from '../../src/content/auction-search';

function memory() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  };
}

const LIST =
  '<input placeholder="Rechercher une carte…" type="search"><button type="button">Rechercher</button>' +
  '<select><option value="recent">Récemment listées</option><option value="ending_soon">Fin imminente</option></select>';

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('recherche en attente', () => {
  it('se lit une seule fois', () => {
    const storage = memory();
    setPendingAuctionSearch(storage, 'Élorn', 1_000);
    expect(takePendingAuctionSearch(storage, 1_500)).toBe('Élorn');
    expect(takePendingAuctionSearch(storage, 1_500)).toBeNull();
  });

  it('expire après une minute', () => {
    const storage = memory();
    setPendingAuctionSearch(storage, 'Élorn', 1_000);
    expect(takePendingAuctionSearch(storage, 100_000)).toBeNull();
  });
});

describe('showAuctionsEndingSoon', () => {
  it('trie par fin imminente puis lance la recherche du titre', async () => {
    document.body.innerHTML = `<div>${LIST}</div>`;
    const order: string[] = [];
    const select = findSortSelect(document)!;
    select.addEventListener('change', () => order.push(`tri:${select.value}`));
    document.querySelector('button')!.addEventListener('click', () => order.push('recherche'));

    expect(await showAuctionsEndingSoon(document, 'Élorn', 80)).toBe('started');
    expect(document.querySelector('input')!.value).toBe('Élorn');
    expect(order).toEqual(['tri:ending_soon', 'recherche']);
  });

  it('cherche quand même si le menu de tri est absent', async () => {
    document.body.innerHTML =
      '<input placeholder="Rechercher une carte…" type="search"><button type="button">Rechercher</button>';
    const clicked = vi.fn();
    document.querySelector('button')!.addEventListener('click', clicked);
    expect(await showAuctionsEndingSoon(document, 'Élorn', 50)).toBe('started');
    expect(clicked).toHaveBeenCalledTimes(1);
  });
});
