// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSearchStarter } from '../../src/content/market-search-flow';
import { takePendingSearch, type PendingStorage } from '../../src/content/pending-search';
import { getReturnTarget } from '../../src/content/return-target';

const CONTROLS =
  '<input placeholder="Rechercher une carte…" type="search" value="">' +
  '<button type="button">Rechercher</button>';

function memory(): PendingStorage {
  const data = new Map<string, string>();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  };
}

function setup(pathname: string) {
  const storage = memory();
  const navigate = vi.fn();
  const start = createSearchStarter({
    root: document,
    pathname: () => pathname,
    fullPath: () => pathname + '?tri=rarete',
    navigate,
    storage,
    now: () => 1_000,
    timeoutMs: 80,
  });
  return { start, storage, navigate };
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('createSearchStarter', () => {
  it('lance la recherche sur place quand les contrôles sont déjà là', async () => {
    document.body.innerHTML = `<div>${CONTROLS}</div>`;
    const clicked = vi.fn();
    document.querySelector('button')!.addEventListener('click', clicked);
    const { start, navigate } = setup('/cards/x');

    expect(await start('Théorème_de_Ptolémée')).toBe('started');
    expect(document.querySelector('input')!.value).toBe('Théorème de Ptolémée');
    expect(clicked).toHaveBeenCalledTimes(1);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('va sur la page Marché en gardant la recherche en attente quand les contrôles manquent', async () => {
    const { start, storage, navigate } = setup('/cards/x');
    expect(await start('Ted_Lasso')).toBe('navigating');
    expect(navigate).toHaveBeenCalledWith('/marketplace');
    expect(takePendingSearch(storage, 1_000)).toBe('Ted_Lasso');
  });

  it('mémorise la page d’origine pour pouvoir y revenir', async () => {
    const { start, storage } = setup('/collection');
    await start('Ted_Lasso');
    expect(getReturnTarget(storage, 1_000)).toEqual({
      slug: 'Ted_Lasso',
      path: '/collection?tri=rarete',
    });
  });

  it('ne mémorise aucun retour quand la recherche se lance sur place', async () => {
    document.body.innerHTML = `<div>${CONTROLS}</div>`;
    const { start, storage } = setup('/collection');
    await start('Ted_Lasso');
    expect(getReturnTarget(storage, 1_000)).toBeNull();
  });

  it('attend les contrôles sans naviguer quand on est déjà sur la page Marché', async () => {
    setTimeout(() => (document.body.innerHTML = `<div>${CONTROLS}</div>`), 30);
    const { start, navigate } = setup('/marketplace');
    expect(await start('Ted_Lasso')).toBe('started');
    expect(navigate).not.toHaveBeenCalled();
  });

  it('signale no-controls si la page Marché n’a pas de champ de recherche', async () => {
    const { start, navigate } = setup('/marketplace');
    expect(await start('Ted_Lasso')).toBe('no-controls');
    expect(navigate).not.toHaveBeenCalled();
  });
});
